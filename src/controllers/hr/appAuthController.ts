import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Op } from "sequelize";
import Employee from "../../models/employee";
import Department from "../../models/department";
import Position from "../../models/position";
import OTP from "../../models/otpModel";
import { adminJwtConfig } from "../../config/jwtConfig";
import { EMPLOYEE_TOKEN } from "../../middleware/auth";
import { generateOTP, generatePass } from "../../utils/helper";
import { SmsError, sendSms } from "../../utils/sms";
import { sendError } from "../bansi/bansiHelpers";
import { APP_PHONE, DEFAULT_APP_PASSWORD, phoneDigits, profileUrl } from "./hrHelpers";
import { WORKING, nowLao } from "./workCalendar";

/**
 * ບັນຊີ app ພະນັກງານ — ທຸກຄົນທີ່ເຮັດວຽກຢູ່ເຂົ້າໄດ້ດ້ວຍເບີໂທ (20XXXXXXXX) + ລະຫັດຜ່ານ (ສ້າງພະນັກງານ = "123"), ບໍ່ຕ້ອງມີ
 * ບັນຊີຜູ້ໃຊ້ລະບົບ. token (typ "employee") ໃຊ້ໄດ້ສະເພາະ route ຂໍ້ມູນຂອງຕົນເອງ (middleware/auth SELF_SERVICE).
 * ລືມລະຫັດຜ່ານ: ຂໍ OTP ທາງ SMS (POST /app/otp/request) → ຢືນຢັນ (POST /app/otp/verify) = ລະຫັດຜ່ານໃໝ່ສົ່ງທາງ SMS
 * ແລະ ສະແດງໃນ app; ຫຼື HR ຕັ້ງຄືນເປັນ "123" (PUT /employee/app-password/:id)
 */

/** ອາຍຸ token ຂອງ app — ບໍ່ໃຫ້ພະນັກງານຕ້ອງ login ທຸກມື້ */
const APP_TOKEN_TTL = "30d";
const MIN_PASSWORD = 6;

/**
 * POST /app/login { phone, password } (ບໍ່ຕ້ອງ token) — ເບີ 20 + 8 ຕົວເລກ; ຄືນ token + ຂໍ້ມູນພະນັກງານ +
 * must_change_password (true = ຍັງໃຊ້ລະຫັດເລີ່ມຕົ້ນ → app ຄວນໃຫ້ປ່ຽນ)
 */
export const appLogin = async (req: Request, res: Response) => {
  try {
    const phone = phoneDigits(req.body?.phone);
    const password = String(req.body?.password ?? "");
    if (!APP_PHONE.test(phone) || !password) {
      res.status(400).json({ message: "ກະລຸນາປ້ອນເບີໂທ (20XXXXXXXX) ແລະ ລະຫັດຜ່ານ" });
      return;
    }
    const employee = await Employee.scope("withPassword").findOne({
      where: {status: 1, phone },
      include: [
        { model: Department, as: "department", attributes: ["_uuid", "depart_name"] },
        { model: Position, as: "position", attributes: ["_uuid", "position_name"] },
      ],
    });
    const ok = !!employee && Number(employee.work_status) === WORKING && !!employee.app_password
      && (await bcrypt.compare(password, employee.app_password));
    if (!employee || !ok) {
      res.status(401).json({ message: "ເບີໂທ ຫຼື ລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ" });
      return;
    }
    const token = jwt.sign({ sub: String(employee._uuid), typ: EMPLOYEE_TOKEN }, adminJwtConfig.secret, {
      algorithm: "HS256",
      expiresIn: APP_TOKEN_TTL,
      issuer: adminJwtConfig.issuer,
    });
    const e: any = employee.get({ plain: true });
    res.status(200).json({
      message: "Login successful",
      token,
      must_change_password: Number(e.must_change_password) === 1,
      employee: {
        _uuid: e._uuid,
        emp_code: e.emp_code,
        first_name: e.first_name,
        last_name: e.last_name,
        phone: e.phone,
        profile_url: profileUrl(e.profile),
        department: e.department ?? null,
        position: e.position ?? null,
      },
    });
  } catch (error) {
    sendError(res, error, "Error logging in to app");
  }
};

/** PUT /app/password { current_password, new_password } — ພະນັກງານປ່ຽນລະຫັດຜ່ານ app ຂອງຕົນເອງ (token ຂອງ app ເທົ່ານັ້ນ) */
export const changeAppPassword = async (req: Request, res: Response) => {
  try {
    if (req.user?.typ !== EMPLOYEE_TOKEN) {
      res.status(403).json({ message: "ສະເພາະບັນຊີ app ພະນັກງານ" });
      return;
    }
    const employee = await Employee.scope("withPassword").findByPk(Number(req.user.sub));
    if (!employee || Number(employee.work_status) !== WORKING) {
      res.status(401).json({ message: "ພະນັກງານນີ້ບໍ່ໄດ້ເຮັດວຽກຢູ່ແລ້ວ" });
      return;
    }
    const current = String(req.body?.current_password ?? "");
    const next = String(req.body?.new_password ?? "");
    if (!employee.app_password || !(await bcrypt.compare(current, employee.app_password))) {
      res.status(400).json({ message: "ລະຫັດຜ່ານປັດຈຸບັນບໍ່ຖືກຕ້ອງ" });
      return;
    }
    if (next.length < MIN_PASSWORD) {
      res.status(400).json({ message: `ລະຫັດຜ່ານໃໝ່ຕ້ອງມີຢ່າງໜ້ອຍ ${MIN_PASSWORD} ຕົວ` });
      return;
    }
    if (next === DEFAULT_APP_PASSWORD || next === current) {
      res.status(400).json({ message: "ກະລຸນາຕັ້ງລະຫັດຜ່ານໃໝ່ທີ່ບໍ່ຊ້ຳກັບລະຫັດເກົ່າ" });
      return;
    }
    await employee.update({ app_password: await bcrypt.hash(next, 10), must_change_password: 0, updatedAt: new Date() });
    res.status(200).json({ message: "Successfully changed password" });
  } catch (error) {
    sendError(res, error, "Error changing app password");
  }
};

// ================= ລືມລະຫັດຜ່ານ (OTP ທາງ SMS)

/** types ຂອງ tbl_otp — 3 = ຕັ້ງລະຫັດຜ່ານໃໝ່; status: 1 ໃຊ້ໄດ້, 2 ໃຊ້ແລ້ວ, 3 ຍົກເລີກ/ໝົດອາຍຸ */
const OTP_RESET = 3;
const OTP_ACTIVE = 1;
const OTP_USED = 2;
const OTP_REVOKED = 3;
const OTP_EXPIRES_MIN = 5;
const OTP_RESEND_SEC = 60;
const OTP_DAILY_LIMIT = 5;
const OTP_MAX_ATTEMPTS = 5;

/** ພະນັກງານທີ່ເຮັດວຽກຢູ່ຂອງເບີນີ້ — ບໍ່ພົບ = null */
const workingEmployeeByPhone = async (phone: string) => {
  const employee = await Employee.scope("withPassword").findOne({ where: { status: 1, phone } });
  return employee && Number(employee.work_status) === WORKING ? employee : null;
};

/**
 * POST /app/otp/request { phone } (ບໍ່ຕ້ອງ token) — ສົ່ງ OTP 6 ຕົວທາງ SMS ໄປເບີຂອງພະນັກງານທີ່ເຮັດວຽກຢູ່:
 * ໝົດອາຍຸ 5 ນາທີ, ຂໍໃໝ່ໄດ້ຫຼັງ 60 ວິນາທີ, ບໍ່ເກີນ 5 ເທື່ອຕໍ່ມື້. OTP ເກັບເປັນ bcrypt, ຂໍໃໝ່ = OTP ເກົ່າໃຊ້ບໍ່ໄດ້
 */
export const requestAppOtp = async (req: Request, res: Response) => {
  try {
    const phone = phoneDigits(req.body?.phone);
    if (!APP_PHONE.test(phone)) {
      res.status(400).json({ message: "ກະລຸນາປ້ອນເບີໂທ 20 + 8 ຕົວເລກ" });
      return;
    }
    if (!(await workingEmployeeByPhone(phone))) {
      res.status(404).json({ message: "ບໍ່ພົບເບີໂທນີ້ໃນລາຍຊື່ພະນັກງານ — ຕິດຕໍ່ HR" });
      return;
    }
    const startOfDay = nowLao().startOf("day").toDate();
    const today = await OTP.count({ where: { phone, types: OTP_RESET, createdAt: { [Op.gte]: startOfDay } } });
    if (today >= OTP_DAILY_LIMIT) {
      res.status(429).json({ message: `ມື້ນີ້ຂໍ OTP ຄົບ ${OTP_DAILY_LIMIT} ເທື່ອແລ້ວ — ລອງໃໝ່ມື້ອື່ນ ຫຼື ຕິດຕໍ່ HR` });
      return;
    }
    const recent = await OTP.findOne({
      where: { phone, types: OTP_RESET, createdAt: { [Op.gt]: new Date(Date.now() - OTP_RESEND_SEC * 1000) } },
      order: [["createdAt", "DESC"]],
    });
    if (recent) {
      const wait = OTP_RESEND_SEC - Math.floor((Date.now() - recent.createdAt.getTime()) / 1000);
      res.status(429).json({ message: `ກະລຸນາລໍຖ້າ ${Math.max(1, wait)} ວິນາທີ ກ່ອນຂໍ OTP ໃໝ່`, wait: Math.max(1, wait) });
      return;
    }

    const code = generateOTP();
    const expiresAt = new Date(Date.now() + OTP_EXPIRES_MIN * 60 * 1000);
    await OTP.update({ status: OTP_REVOKED }, { where: { phone, types: OTP_RESET, status: OTP_ACTIVE } });
    const record = await OTP.create({ phone, otp: await bcrypt.hash(code, 10), types: OTP_RESET, expiresAt });
    try {
      await sendSms(phone, `OAC App: ລະຫັດ OTP ຂອງທ່ານແມ່ນ ${code} (ໝົດອາຍຸໃນ ${OTP_EXPIRES_MIN} ນາທີ). ຢ່າບອກລະຫັດນີ້ກັບໃຜ`);
    } catch (error) {
      await record.update({ status: OTP_REVOKED });
      throw error;
    }
    res.status(200).json({ message: "ສົ່ງລະຫັດ OTP ທາງ SMS ແລ້ວ", expires_at: expiresAt, resend_after: OTP_RESEND_SEC });
  } catch (error) {
    if (error instanceof SmsError) {
      res.status(502).json({ message: error.message });
      return;
    }
    sendError(res, error, "Error requesting app OTP");
  }
};

/**
 * POST /app/otp/verify { phone, otp } (ບໍ່ຕ້ອງ token) — OTP ຖືກ = ອອກລະຫັດຜ່ານໃໝ່ (8 ຕົວ) ໃຫ້ພະນັກງານ: ສົ່ງທາງ SMS
 * ແລະ ຄືນໃນ response (app ສະແດງ + ເຂົ້າລະບົບໃຫ້), must_change_password = 1. ປ້ອນຜິດເກີນ 5 ເທື່ອ = ຕ້ອງຂໍ OTP ໃໝ່
 */
export const verifyAppOtp = async (req: Request, res: Response) => {
  try {
    const phone = phoneDigits(req.body?.phone);
    const code = String(req.body?.otp ?? "").trim();
    if (!APP_PHONE.test(phone) || !/^\d{6}$/.test(code)) {
      res.status(400).json({ message: "ກະລຸນາປ້ອນລະຫັດ OTP 6 ຕົວເລກ" });
      return;
    }
    const record = await OTP.findOne({ where: { phone, types: OTP_RESET, status: OTP_ACTIVE }, order: [["createdAt", "DESC"]] });
    if (!record) {
      res.status(400).json({ message: "ບໍ່ມີ OTP ທີ່ໃຊ້ໄດ້ — ກະລຸນາຂໍ OTP ໃໝ່" });
      return;
    }
    if (record.expiresAt.getTime() <= Date.now()) {
      await record.update({ status: OTP_REVOKED });
      res.status(400).json({ message: "OTP ໝົດອາຍຸແລ້ວ — ກະລຸນາຂໍ OTP ໃໝ່" });
      return;
    }
    if (!(await bcrypt.compare(code, record.otp))) {
      const attempts = Number(record.attempts) + 1;
      const left = OTP_MAX_ATTEMPTS - attempts;
      await record.update({ attempts, ...(left <= 0 ? { status: OTP_REVOKED } : {}) });
      res.status(400).json({ message: left > 0 ? `OTP ບໍ່ຖືກຕ້ອງ — ເຫຼືອອີກ ${left} ເທື່ອ` : "ປ້ອນ OTP ຜິດຫຼາຍເທື່ອ — ກະລຸນາຂໍ OTP ໃໝ່" });
      return;
    }
    const employee = await workingEmployeeByPhone(phone);
    if (!employee) {
      await record.update({ status: OTP_REVOKED });
      res.status(404).json({ message: "ບໍ່ພົບເບີໂທນີ້ໃນລາຍຊື່ພະນັກງານ — ຕິດຕໍ່ HR" });
      return;
    }

    const password = generatePass(8);
    const t = await Employee.sequelize!.transaction();
    try {
      await record.update({ status: OTP_USED }, { transaction: t });
      await employee.update({ app_password: await bcrypt.hash(password, 10), must_change_password: 1, updatedAt: new Date() }, { transaction: t });
      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
    // ລະຫັດຖືກປ່ຽນແລ້ວ — SMS ບໍ່ສຳເລັດກໍ່ບໍ່ເປັນຫຍັງ ເພາະ app ສະແດງລະຫັດໃຫ້
    let smsSent = true;
    try {
      await sendSms(phone, `OAC App: ລະຫັດຜ່ານໃໝ່ຂອງທ່ານແມ່ນ ${password} — ເຂົ້າລະບົບແລ້ວຕັ້ງລະຫັດຂອງທ່ານເອງ`);
    } catch {
      smsSent = false;
    }
    res.status(200).json({
      message: smsSent ? "ຢືນຢັນສຳເລັດ — ສົ່ງລະຫັດຜ່ານໃໝ່ທາງ SMS ແລ້ວ" : "ຢືນຢັນສຳເລັດ — ສົ່ງ SMS ບໍ່ໄດ້ ກະລຸນາຈົດລະຫັດຜ່ານໃໝ່ໄວ້",
      password,
      sms_sent: smsSent,
    });
  } catch (error) {
    sendError(res, error, "Error verifying app OTP");
  }
};
