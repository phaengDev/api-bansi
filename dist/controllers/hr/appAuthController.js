"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyAppOtp = exports.requestAppOtp = exports.changeAppPassword = exports.appLogin = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const sequelize_1 = require("sequelize");
const employee_1 = __importDefault(require("../../models/employee"));
const department_1 = __importDefault(require("../../models/department"));
const position_1 = __importDefault(require("../../models/position"));
const otpModel_1 = __importDefault(require("../../models/otpModel"));
const jwtConfig_1 = require("../../config/jwtConfig");
const auth_1 = require("../../middleware/auth");
const helper_1 = require("../../utils/helper");
const sms_1 = require("../../utils/sms");
const bansiHelpers_1 = require("../bansi/bansiHelpers");
const hrHelpers_1 = require("./hrHelpers");
const workCalendar_1 = require("./workCalendar");
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
const appLogin = async (req, res) => {
    try {
        const phone = (0, hrHelpers_1.phoneDigits)(req.body?.phone);
        const password = String(req.body?.password ?? "");
        if (!hrHelpers_1.APP_PHONE.test(phone) || !password) {
            res.status(400).json({ message: "ກະລຸນາປ້ອນເບີໂທ (20XXXXXXXX) ແລະ ລະຫັດຜ່ານ" });
            return;
        }
        const employee = await employee_1.default.scope("withPassword").findOne({
            where: { status: 1, phone },
            include: [
                { model: department_1.default, as: "department", attributes: ["_uuid", "depart_name"] },
                { model: position_1.default, as: "position", attributes: ["_uuid", "position_name"] },
            ],
        });
        const ok = !!employee && Number(employee.work_status) === workCalendar_1.WORKING && !!employee.app_password
            && (await bcryptjs_1.default.compare(password, employee.app_password));
        if (!employee || !ok) {
            res.status(401).json({ message: "ເບີໂທ ຫຼື ລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ" });
            return;
        }
        const token = jsonwebtoken_1.default.sign({ sub: String(employee._uuid), typ: auth_1.EMPLOYEE_TOKEN }, jwtConfig_1.adminJwtConfig.secret, {
            algorithm: "HS256",
            expiresIn: APP_TOKEN_TTL,
            issuer: jwtConfig_1.adminJwtConfig.issuer,
        });
        const e = employee.get({ plain: true });
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
                profile_url: (0, hrHelpers_1.profileUrl)(e.profile),
                department: e.department ?? null,
                position: e.position ?? null,
            },
        });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error logging in to app");
    }
};
exports.appLogin = appLogin;
/** PUT /app/password { current_password, new_password } — ພະນັກງານປ່ຽນລະຫັດຜ່ານ app ຂອງຕົນເອງ (token ຂອງ app ເທົ່ານັ້ນ) */
const changeAppPassword = async (req, res) => {
    try {
        if (req.user?.typ !== auth_1.EMPLOYEE_TOKEN) {
            res.status(403).json({ message: "ສະເພາະບັນຊີ app ພະນັກງານ" });
            return;
        }
        const employee = await employee_1.default.scope("withPassword").findByPk(Number(req.user.sub));
        if (!employee || Number(employee.work_status) !== workCalendar_1.WORKING) {
            res.status(401).json({ message: "ພະນັກງານນີ້ບໍ່ໄດ້ເຮັດວຽກຢູ່ແລ້ວ" });
            return;
        }
        const current = String(req.body?.current_password ?? "");
        const next = String(req.body?.new_password ?? "");
        if (!employee.app_password || !(await bcryptjs_1.default.compare(current, employee.app_password))) {
            res.status(400).json({ message: "ລະຫັດຜ່ານປັດຈຸບັນບໍ່ຖືກຕ້ອງ" });
            return;
        }
        if (next.length < MIN_PASSWORD) {
            res.status(400).json({ message: `ລະຫັດຜ່ານໃໝ່ຕ້ອງມີຢ່າງໜ້ອຍ ${MIN_PASSWORD} ຕົວ` });
            return;
        }
        if (next === hrHelpers_1.DEFAULT_APP_PASSWORD || next === current) {
            res.status(400).json({ message: "ກະລຸນາຕັ້ງລະຫັດຜ່ານໃໝ່ທີ່ບໍ່ຊ້ຳກັບລະຫັດເກົ່າ" });
            return;
        }
        await employee.update({ app_password: await bcryptjs_1.default.hash(next, 10), must_change_password: 0, updatedAt: new Date() });
        res.status(200).json({ message: "Successfully changed password" });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error changing app password");
    }
};
exports.changeAppPassword = changeAppPassword;
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
const workingEmployeeByPhone = async (phone) => {
    const employee = await employee_1.default.scope("withPassword").findOne({ where: { status: 1, phone } });
    return employee && Number(employee.work_status) === workCalendar_1.WORKING ? employee : null;
};
/**
 * POST /app/otp/request { phone } (ບໍ່ຕ້ອງ token) — ສົ່ງ OTP 6 ຕົວທາງ SMS ໄປເບີຂອງພະນັກງານທີ່ເຮັດວຽກຢູ່:
 * ໝົດອາຍຸ 5 ນາທີ, ຂໍໃໝ່ໄດ້ຫຼັງ 60 ວິນາທີ, ບໍ່ເກີນ 5 ເທື່ອຕໍ່ມື້. OTP ເກັບເປັນ bcrypt, ຂໍໃໝ່ = OTP ເກົ່າໃຊ້ບໍ່ໄດ້
 */
const requestAppOtp = async (req, res) => {
    try {
        const phone = (0, hrHelpers_1.phoneDigits)(req.body?.phone);
        if (!hrHelpers_1.APP_PHONE.test(phone)) {
            res.status(400).json({ message: "ກະລຸນາປ້ອນເບີໂທ 20 + 8 ຕົວເລກ" });
            return;
        }
        if (!(await workingEmployeeByPhone(phone))) {
            res.status(404).json({ message: "ບໍ່ພົບເບີໂທນີ້ໃນລາຍຊື່ພະນັກງານ — ຕິດຕໍ່ HR" });
            return;
        }
        const startOfDay = (0, workCalendar_1.nowLao)().startOf("day").toDate();
        const today = await otpModel_1.default.count({ where: { phone, types: OTP_RESET, createdAt: { [sequelize_1.Op.gte]: startOfDay } } });
        if (today >= OTP_DAILY_LIMIT) {
            res.status(429).json({ message: `ມື້ນີ້ຂໍ OTP ຄົບ ${OTP_DAILY_LIMIT} ເທື່ອແລ້ວ — ລອງໃໝ່ມື້ອື່ນ ຫຼື ຕິດຕໍ່ HR` });
            return;
        }
        const recent = await otpModel_1.default.findOne({
            where: { phone, types: OTP_RESET, createdAt: { [sequelize_1.Op.gt]: new Date(Date.now() - OTP_RESEND_SEC * 1000) } },
            order: [["createdAt", "DESC"]],
        });
        if (recent) {
            const wait = OTP_RESEND_SEC - Math.floor((Date.now() - recent.createdAt.getTime()) / 1000);
            res.status(429).json({ message: `ກະລຸນາລໍຖ້າ ${Math.max(1, wait)} ວິນາທີ ກ່ອນຂໍ OTP ໃໝ່`, wait: Math.max(1, wait) });
            return;
        }
        const code = (0, helper_1.generateOTP)();
        const expiresAt = new Date(Date.now() + OTP_EXPIRES_MIN * 60 * 1000);
        await otpModel_1.default.update({ status: OTP_REVOKED }, { where: { phone, types: OTP_RESET, status: OTP_ACTIVE } });
        const record = await otpModel_1.default.create({ phone, otp: await bcryptjs_1.default.hash(code, 10), types: OTP_RESET, expiresAt });
        try {
            await (0, sms_1.sendSms)(phone, `OAC App: ລະຫັດ OTP ຂອງທ່ານແມ່ນ ${code} (ໝົດອາຍຸໃນ ${OTP_EXPIRES_MIN} ນາທີ). ຢ່າບອກລະຫັດນີ້ກັບໃຜ`);
        }
        catch (error) {
            await record.update({ status: OTP_REVOKED });
            throw error;
        }
        res.status(200).json({ message: "ສົ່ງລະຫັດ OTP ທາງ SMS ແລ້ວ", expires_at: expiresAt, resend_after: OTP_RESEND_SEC });
    }
    catch (error) {
        if (error instanceof sms_1.SmsError) {
            res.status(502).json({ message: error.message });
            return;
        }
        (0, bansiHelpers_1.sendError)(res, error, "Error requesting app OTP");
    }
};
exports.requestAppOtp = requestAppOtp;
/**
 * POST /app/otp/verify { phone, otp } (ບໍ່ຕ້ອງ token) — OTP ຖືກ = ອອກລະຫັດຜ່ານໃໝ່ (8 ຕົວ) ໃຫ້ພະນັກງານ: ສົ່ງທາງ SMS
 * ແລະ ຄືນໃນ response (app ສະແດງ + ເຂົ້າລະບົບໃຫ້), must_change_password = 1. ປ້ອນຜິດເກີນ 5 ເທື່ອ = ຕ້ອງຂໍ OTP ໃໝ່
 */
const verifyAppOtp = async (req, res) => {
    try {
        const phone = (0, hrHelpers_1.phoneDigits)(req.body?.phone);
        const code = String(req.body?.otp ?? "").trim();
        if (!hrHelpers_1.APP_PHONE.test(phone) || !/^\d{6}$/.test(code)) {
            res.status(400).json({ message: "ກະລຸນາປ້ອນລະຫັດ OTP 6 ຕົວເລກ" });
            return;
        }
        const record = await otpModel_1.default.findOne({ where: { phone, types: OTP_RESET, status: OTP_ACTIVE }, order: [["createdAt", "DESC"]] });
        if (!record) {
            res.status(400).json({ message: "ບໍ່ມີ OTP ທີ່ໃຊ້ໄດ້ — ກະລຸນາຂໍ OTP ໃໝ່" });
            return;
        }
        if (record.expiresAt.getTime() <= Date.now()) {
            await record.update({ status: OTP_REVOKED });
            res.status(400).json({ message: "OTP ໝົດອາຍຸແລ້ວ — ກະລຸນາຂໍ OTP ໃໝ່" });
            return;
        }
        if (!(await bcryptjs_1.default.compare(code, record.otp))) {
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
        const password = (0, helper_1.generatePass)(8);
        const t = await employee_1.default.sequelize.transaction();
        try {
            await record.update({ status: OTP_USED }, { transaction: t });
            await employee.update({ app_password: await bcryptjs_1.default.hash(password, 10), must_change_password: 1, updatedAt: new Date() }, { transaction: t });
            await t.commit();
        }
        catch (error) {
            await t.rollback();
            throw error;
        }
        // ລະຫັດຖືກປ່ຽນແລ້ວ — SMS ບໍ່ສຳເລັດກໍ່ບໍ່ເປັນຫຍັງ ເພາະ app ສະແດງລະຫັດໃຫ້
        let smsSent = true;
        try {
            await (0, sms_1.sendSms)(phone, `OAC App: ລະຫັດຜ່ານໃໝ່ຂອງທ່ານແມ່ນ ${password} — ເຂົ້າລະບົບແລ້ວຕັ້ງລະຫັດຂອງທ່ານເອງ`);
        }
        catch {
            smsSent = false;
        }
        res.status(200).json({
            message: smsSent ? "ຢືນຢັນສຳເລັດ — ສົ່ງລະຫັດຜ່ານໃໝ່ທາງ SMS ແລ້ວ" : "ຢືນຢັນສຳເລັດ — ສົ່ງ SMS ບໍ່ໄດ້ ກະລຸນາຈົດລະຫັດຜ່ານໃໝ່ໄວ້",
            password,
            sms_sent: smsSent,
        });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error verifying app OTP");
    }
};
exports.verifyAppOtp = verifyAppOtp;
