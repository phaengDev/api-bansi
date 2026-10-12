import { Request, Response } from "express";
import moment from "moment";
import { Op, col, fn } from "sequelize";
import AttendanceRequest from "../../models/attendanceRequest";
import Attendance from "../../models/attendance";
import Employee from "../../models/employee";
import Department from "../../models/department";
import Position from "../../models/position";
import Payroll from "../../models/payroll";
import { actorOf, decodeId, sendError, toDateOnly } from "../bansi/bansiHelpers";
import { profileUrl } from "./hrHelpers";
import { selfEmployee } from "./attendanceController";
import { notify } from "./notificationController";
import {
  BY_HR, HHMM, PRESENT, atLao, clockOf, employedOn, findCompany, holidaysBetween, isWorkday, lateEarlyOf, nowLao, todayLao, workRulesOf,
} from "./workCalendar";

/**
 * ຄຳຮ້ອງແຈ້ງລືມສະແກນ / ຂໍແກ້ເວລາເຂົ້າ-ອອກວຽກ:
 * - ພະນັກງານ (app ມືຖື): GET/POST /correction/me, PUT /correction/me/cancel/:id
 * - HR: POST /correction/fetch, PUT /correction/approve/:id (ບັນທຶກເວລາລົງ tbl_attendance ຄືກັບ HR ແກ້ເອງ), PUT /correction/reject/:id
 * ເດືອນທີ່ຈ່າຍເງິນເດືອນແລ້ວ ຂໍ/ອະນຸມັດບໍ່ໄດ້
 */

const PENDING = 1;
const APPROVED = 2;
const REJECTED = 3;
const CANCELLED = 4;
const STATUSES = [PENDING, APPROVED, REJECTED, CANCELLED];
/** status ຂອງ tbl_payroll — ຈ່າຍແລ້ວ */
const PAYROLL_PAID = 2;

const employeeInclude = {
  model: Employee,
  as: "employee",
  attributes: ["_uuid", "emp_code", "first_name", "last_name", "phone", "profile"],
  include: [
    { model: Department, as: "department", attributes: ["_uuid", "depart_name"] },
    { model: Position, as: "position", attributes: ["_uuid", "position_name"] },
  ],
};

const present = (row: AttendanceRequest, recorded?: Attendance | null) => {
  const { employee, ...r }: any = row.get({ plain: true });
  return {
    ...r,
    employee: employee ? { ...employee, profile_url: profileUrl(employee.profile) } : null,
    // ເວລາທີ່ບັນທຶກໄວ້ໃນມື້ນັ້ນ (ໃຫ້ HR ທຽບກັບເວລາທີ່ຂໍ)
    ...(recorded !== undefined ? { recorded_in: clockOf(recorded?.check_in), recorded_out: clockOf(recorded?.check_out) } : {}),
  };
};

const dayText = (date: string) => moment(date, "YYYY-MM-DD").format("DD/MM/YYYY");
const text = (value: unknown) => String(value ?? "").trim().slice(0, 255) || null;
const yearOf = (value: unknown) => (/^\d{4}$/.test(String(value ?? "")) ? String(value) : nowLao().format("YYYY"));
const inYear = (year: string) => ({ work_date: { [Op.between]: [`${year}-01-01`, `${year}-12-31`] } });

const paidPeriod = async (date: string) => (await Payroll.count({ where: { period: date.slice(0, 7), status: PAYROLL_PAID } })) > 0;
const lockedMessage = (date: string) => `ເດືອນ ${moment(date).format("MM/YYYY")} ຈ່າຍເງິນເດືອນແລ້ວ — ແກ້ການເຂົ້າວຽກບໍ່ໄດ້`;

/** "08:05 – 17:30" / "ເຂົ້າ 08:05" / "ອອກ 17:30" */
const timesText = (checkIn: string | null, checkOut: string | null) =>
  checkIn && checkOut ? `${checkIn} – ${checkOut}` : checkIn ? `ເຂົ້າ ${checkIn}` : `ອອກ ${checkOut}`;

// ================= ພະນັກງານ (app ມືຖື)

/** GET /correction/me?year=YYYY — ຄຳຮ້ອງຂອງຕົນເອງໃນປີ (ໃໝ່ສຸດກ່ອນ) + ຈຳນວນທີ່ລໍຖ້າ */
export const getMyCorrections = async (req: Request, res: Response) => {
  try {
    const self = await selfEmployee(req);
    if ("code" in self) {
      res.status(self.code).json({ message: self.message });
      return;
    }
    const year = yearOf(req.query.year);
    const rows = await AttendanceRequest.findAll({
      where: { employee_id: self.employee._uuid, ...inYear(year) },
      order: [["createdAt", "DESC"], ["_uuid", "DESC"]],
    });
    res.status(200).json({
      year,
      data: rows.map((r) => present(r)),
      summary: { pending: rows.filter((r) => Number(r.status) === PENDING).length },
    });
  } catch (error) {
    sendError(res, error, "Error getting my attendance requests");
  }
};

/** POST /correction/me { work_date, check_in?, check_out?, reason } — ແຈ້ງລືມສະແກນ (ຢ່າງໜ້ອຍ 1 ເວລາ) */
export const createMyCorrection = async (req: Request, res: Response) => {
  try {
    const self = await selfEmployee(req);
    if ("code" in self) {
      res.status(self.code).json({ message: self.message });
      return;
    }
    const me: any = self.employee;
    const body = req.body || {};
    const fail = (message: string) => res.status(400).json({ message });
    const date = toDateOnly(body.work_date);
    if (!date) return fail("ກະລຸນາເລືອກວັນທີ");
    if (date > todayLao()) return fail("ແຈ້ງລືມສະແກນລ່ວງໜ້າບໍ່ໄດ້");
    if (!employedOn(me, date)) return fail("ວັນທີນີ້ທ່ານຍັງບໍ່ໄດ້ເຂົ້າວຽກ");
    if (await paidPeriod(date)) return fail(lockedMessage(date));

    const checkIn = String(body.check_in ?? "").trim() || null;
    const checkOut = String(body.check_out ?? "").trim() || null;
    if (!checkIn && !checkOut) return fail("ກະລຸນາປ້ອນເວລາເຂົ້າ ຫຼື ເວລາອອກວຽກ");
    if (checkIn && !HHMM.test(checkIn)) return fail("ເວລາເຂົ້າວຽກບໍ່ຖືກຕ້ອງ (HH:mm)");
    if (checkOut && !HHMM.test(checkOut)) return fail("ເວລາອອກວຽກບໍ່ຖືກຕ້ອງ (HH:mm)");
    const reason = text(body.reason);
    if (!reason) return fail("ກະລຸນາປ້ອນເຫດຜົນ");

    // ເວລາທີ່ບໍ່ໄດ້ຂໍ = ໃຊ້ເວລາທີ່ສະແກນໄວ້ແລ້ວ — ຕ້ອງມີເວລາເຂົ້າວຽກ ແລະ ອອກຕ້ອງຫຼັງເຂົ້າ
    const recorded = await Attendance.findOne({ where: { employee_id: me._uuid, work_date: date } });
    const finalIn = checkIn ?? clockOf(recorded?.check_in);
    const finalOut = checkOut ?? clockOf(recorded?.check_out);
    if (!finalIn) return fail("ມື້ນີ້ຍັງບໍ່ມີເວລາເຂົ້າວຽກ — ກະລຸນາປ້ອນເວລາເຂົ້າວຽກນຳ");
    if (finalOut && finalOut <= finalIn) return fail("ເວລາອອກວຽກຕ້ອງຫຼັງເວລາເຂົ້າວຽກ");

    const pending = await AttendanceRequest.findOne({ where: { employee_id: me._uuid, work_date: date, status: PENDING } });
    if (pending) return fail(`ມີຄຳຮ້ອງຂອງວັນທີ ${dayText(date)} ລໍຖ້າອະນຸມັດຢູ່ແລ້ວ — ຍົກເລີກອັນເກົ່າກ່ອນ`);

    const row = await AttendanceRequest.create({
      employee_id: me._uuid, work_date: date, check_in: checkIn, check_out: checkOut, reason, status: PENDING,
    });
    res.status(200).json({ message: "ສົ່ງຄຳຮ້ອງແລ້ວ — ລໍຖ້າ HR ອະນຸມັດ", data: present(row) });
  } catch (error) {
    sendError(res, error, "Error creating attendance request");
  }
};

/** PUT /correction/me/cancel/:id — ຍົກເລີກຄຳຮ້ອງຂອງຕົນເອງ (ສະເພາະທີ່ລໍຖ້າ) */
export const cancelMyCorrection = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const self = await selfEmployee(req);
    if ("code" in self) {
      res.status(self.code).json({ message: self.message });
      return;
    }
    const id = Number(decodeId(req));
    const row = Number.isInteger(id) && id > 0 ? await AttendanceRequest.findOne({ where: { _uuid: id, employee_id: self.employee._uuid } }) : null;
    if (!row) {
      res.status(404).json({ message: "ບໍ່ພົບຄຳຮ້ອງ" });
      return;
    }
    if (Number(row.status) !== PENDING) {
      res.status(400).json({ message: "ຍົກເລີກໄດ້ສະເພາະຄຳຮ້ອງທີ່ລໍຖ້າອະນຸມັດ" });
      return;
    }
    await row.update({ status: CANCELLED, updatedAt: new Date() });
    res.status(200).json({ message: "ຍົກເລີກຄຳຮ້ອງແລ້ວ", data: present(row) });
  } catch (error) {
    sendError(res, error, "Error cancelling attendance request");
  }
};

// ================= HR

/** POST /correction/fetch { year?, status? } — ຄຳຮ້ອງທັງໝົດຂອງປີ (ລໍຖ້າກ່ອນ) + ເວລາທີ່ບັນທຶກໄວ້ໃນມື້ນັ້ນ + ສະຫຼຸບຕາມສະຖານະ */
export const getCorrections = async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const year = yearOf(body.year);
    const status = Number(body.status);
    const [rows, counts] = await Promise.all([
      AttendanceRequest.findAll({
        where: { ...inYear(year), ...(STATUSES.includes(status) ? { status } : {}) },
        include: [employeeInclude],
        order: [["status", "ASC"], ["work_date", "DESC"], ["_uuid", "DESC"]],
      }),
      AttendanceRequest.findAll({
        where: inYear(year),
        attributes: ["status", [fn("COUNT", col("_uuid")), "total"]],
        group: ["status"],
        raw: true,
      }) as Promise<any[]>,
    ]);
    const recorded = rows.length
      ? await Attendance.findAll({
          where: {
            employee_id: { [Op.in]: [...new Set(rows.map((r) => r.employee_id))] },
            work_date: { [Op.in]: [...new Set(rows.map((r) => String(r.work_date)))] },
          },
        })
      : [];
    const recordOf = (r: AttendanceRequest) =>
      recorded.find((a) => a.employee_id === r.employee_id && String(a.work_date) === String(r.work_date)) ?? null;
    const countOf = (s: number) => Number(counts.find((c) => Number(c.status) === s)?.total) || 0;
    res.status(200).json({
      year,
      data: rows.map((r) => present(r, recordOf(r))),
      summary: { pending: countOf(PENDING), approved: countOf(APPROVED), rejected: countOf(REJECTED), cancelled: countOf(CANCELLED) },
    });
  } catch (error) {
    sendError(res, error, "Error getting attendance requests");
  }
};

/**
 * PUT /correction/approve/:id { note? } — ອະນຸມັດ: ບັນທຶກເວລາທີ່ຂໍລົງ tbl_attendance (ມາວຽກ, ໂດຍ HR) — ເວລາທີ່ບໍ່ໄດ້ຂໍ ຄົງຕາມທີ່ສະແກນໄວ້;
 * ຄິດມາຊ້າ / ອອກກ່ອນ ໃໝ່ ຄືກັບ POST /attendance/save
 */
export const approveCorrection = async (req: Request<{ id: string }>, res: Response) => {
  const t = await AttendanceRequest.sequelize!.transaction();
  let done = false;
  const fail = async (code: number, message: string) => {
    await t.rollback();
    done = true;
    res.status(code).json({ message });
  };
  try {
    const row = await AttendanceRequest.findByPk(decodeId(req), { transaction: t, lock: t.LOCK.UPDATE });
    if (!row) return fail(404, "ບໍ່ພົບຄຳຮ້ອງ");
    if (Number(row.status) !== PENDING) return fail(400, "ຄຳຮ້ອງນີ້ບໍ່ໄດ້ລໍຖ້າອະນຸມັດແລ້ວ");
    const date = String(row.work_date);
    const employee: any = await Employee.findByPk(row.employee_id, { transaction: t });
    if (!employee) return fail(400, "ບໍ່ພົບພະນັກງານ");
    if (!employedOn(employee, date)) return fail(400, "ວັນທີນີ້ ພະນັກງານຍັງບໍ່ໄດ້ເຂົ້າວຽກ ຫຼື ລາອອກແລ້ວ");
    if (await paidPeriod(date)) return fail(400, lockedMessage(date));

    const current = await Attendance.findOne({ where: { employee_id: row.employee_id, work_date: date }, transaction: t, lock: t.LOCK.UPDATE });
    const inText = row.check_in ?? clockOf(current?.check_in);
    const outText = row.check_out ?? clockOf(current?.check_out);
    if (!inText) return fail(400, "ມື້ນີ້ບໍ່ມີເວລາເຂົ້າວຽກ — ອະນຸມັດບໍ່ໄດ້ (ໃຫ້ພະນັກງານສົ່ງໃໝ່ພ້ອມເວລາເຂົ້າ)");
    if (outText && outText <= inText) return fail(400, "ເວລາອອກວຽກຕ້ອງຫຼັງເວລາເຂົ້າວຽກ");

    const rules = workRulesOf(await findCompany(t));
    const workday = isWorkday(date, rules, await holidaysBetween(date, date, t));
    // ເວລາທີ່ບໍ່ໄດ້ຂໍ = ຮັກສາເວລາສະແກນຈິງ ແລະ ພິກັດໄວ້
    const keep = (existing: Date | null | undefined, wanted: string | null, prefix: "in" | "out") => {
      if (!wanted) return { [`check_${prefix}`]: null };
      if (existing && clockOf(existing) === wanted) return { [`check_${prefix}`]: existing };
      return {
        [`check_${prefix}`]: atLao(date, wanted),
        [`${prefix}_latitude`]: null, [`${prefix}_longitude`]: null, [`${prefix}_distance`]: null, [`${prefix}_accuracy`]: null,
      };
    };
    const times: Record<string, any> = { ...keep(current?.check_in, inText, "in"), ...keep(current?.check_out, outText, "out") };
    const actor = Number(actorOf(req)) || null;
    const values = {
      ...times,
      ...lateEarlyOf(rules, times.check_in, times.check_out, workday),
      status: PRESENT,
      source: BY_HR,
      note: `ແຈ້ງລືມສະແກນ: ${row.reason}`.slice(0, 255),
      updatedbyid: actor,
    };
    if (current) await current.update({ ...values, updatedAt: new Date() }, { transaction: t });
    else await Attendance.create({ employee_id: row.employee_id, work_date: date, ...values }, { transaction: t });

    const note = text(req.body?.note);
    await row.update({ status: APPROVED, review_note: note, reviewedbyid: actor, reviewedAt: new Date(), updatedAt: new Date() }, { transaction: t });
    await t.commit();
    done = true;
    await notify([{
      employee_id: Number(row.employee_id),
      type: "attendance",
      title: "ແຈ້ງລືມສະແກນໄດ້ຮັບການອະນຸມັດແລ້ວ ✅",
      body: [`${dayText(date)} · ${timesText(row.check_in, row.check_out)}`, note].filter(Boolean).join("\n"),
      ref: `correction:${row._uuid}`,
      createdbyid: actor,
    }]);

    const saved = await AttendanceRequest.findByPk(row._uuid, { include: [employeeInclude] });
    res.status(200).json({ message: "ອະນຸມັດ ແລະ ບັນທຶກເວລາແລ້ວ", data: saved && present(saved) });
  } catch (error) {
    if (!done) await t.rollback();
    sendError(res, error, "Error approving attendance request");
  }
};

/** PUT /correction/reject/:id { note? } — ປະຕິເສດ (ສະເພາະທີ່ລໍຖ້າ) */
export const rejectCorrection = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const row = await AttendanceRequest.findByPk(decodeId(req));
    if (!row) {
      res.status(404).json({ message: "ບໍ່ພົບຄຳຮ້ອງ" });
      return;
    }
    if (Number(row.status) !== PENDING) {
      res.status(400).json({ message: "ຄຳຮ້ອງນີ້ບໍ່ໄດ້ລໍຖ້າອະນຸມັດແລ້ວ" });
      return;
    }
    const actor = Number(actorOf(req)) || null;
    const note = text(req.body?.note);
    await row.update({ status: REJECTED, review_note: note, reviewedbyid: actor, reviewedAt: new Date(), updatedAt: new Date() });
    await notify([{
      employee_id: Number(row.employee_id),
      type: "attendance",
      title: "ແຈ້ງລືມສະແກນບໍ່ໄດ້ຮັບການອະນຸມັດ",
      body: [`${dayText(String(row.work_date))} · ${timesText(row.check_in, row.check_out)}`, note].filter(Boolean).join("\n"),
      ref: `correction:${row._uuid}`,
      createdbyid: actor,
    }]);
    const saved = await AttendanceRequest.findByPk(row._uuid, { include: [employeeInclude] });
    res.status(200).json({ message: "ປະຕິເສດຄຳຮ້ອງແລ້ວ", data: saved && present(saved) });
  } catch (error) {
    sendError(res, error, "Error rejecting attendance request");
  }
};
