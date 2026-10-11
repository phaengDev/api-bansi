import { Request, Response } from "express";
import moment from "moment";
import { Op, Transaction, UniqueConstraintError, col, fn } from "sequelize";
import LeaveRequest from "../../models/leaveRequest";
import Attendance from "../../models/attendance";
import Employee from "../../models/employee";
import Department from "../../models/department";
import Position from "../../models/position";
import Payroll from "../../models/payroll";
import { actorOf, decodeId, sendError, toDateOnly } from "../bansi/bansiHelpers";
import { profileUrl } from "./hrHelpers";
import { selfEmployee } from "./attendanceController";
import {
  BY_HR, PAID_LEAVE, PRESENT, UNPAID_LEAVE, employedOn, findCompany, holidaysBetween, isWorkday, nowLao, workRulesOf,
} from "./workCalendar";

/**
 * ຄຳຂໍລາພັກ:
 * - ພະນັກງານ (app ມືຖື): GET/POST /leave/me, PUT /leave/me/cancel/:id — ສະເພາະຄຳຂໍຂອງຕົນເອງ (ບັນຊີຕ້ອງຜູກກັບພະນັກງານ)
 * - HR: POST /leave/fetch, PUT /leave/approve/:id (ບັນທຶກລາພັກລົງ tbl_attendance ທຸກມື້ເຮັດວຽກໃນຊ່ວງ), PUT /leave/reject/:id
 * ເດືອນທີ່ຈ່າຍເງິນເດືອນແລ້ວ ຂໍ/ອະນຸມັດລາພັກບໍ່ໄດ້ (ຄືກັບການແກ້ການເຂົ້າວຽກ)
 */

const PENDING = 1;
const APPROVED = 2;
const REJECTED = 3;
const CANCELLED = 4;
const STATUSES = [PENDING, APPROVED, REJECTED, CANCELLED];
/** ປະເພດ = status ຂອງ tbl_attendance ທີ່ຈະບັນທຶກ */
const LEAVE_TYPES = [PAID_LEAVE, UNPAID_LEAVE];
/** ຂໍໄດ້ສູງສຸດຕໍ່ຄັ້ງ (ວັນປະຕິທິນ) */
const MAX_RANGE_DAYS = 60;
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

const present = (row: LeaveRequest) => {
  const { employee, ...r }: any = row.get({ plain: true });
  return { ...r, employee: employee ? { ...employee, profile_url: profileUrl(employee.profile) } : null };
};

const findWithEmployee = (id: number) => LeaveRequest.findByPk(id, { include: [employeeInclude] });

const dayText = (date: string) => moment(date, "YYYY-MM-DD").format("DD/MM/YYYY");
const text = (value: unknown) => String(value ?? "").trim().slice(0, 255) || null;

/** ປີ "YYYY" — ບໍ່ສົ່ງ / ຜິດ = ປີນີ້ */
const yearOf = (value: unknown) => (/^\d{4}$/.test(String(value ?? "")) ? String(value) : nowLao().format("YYYY"));

/** ຄຳຂໍທີ່ມີມື້ໃດໜຶ່ງຢູ່ໃນປີ */
const overlapsYear = (year: string) => ({
  start_date: { [Op.lte]: `${year}-12-31` },
  end_date: { [Op.gte]: `${year}-01-01` },
});

const datesBetween = (start: string, end: string) => {
  const dates: string[] = [];
  for (const d = moment(start, "YYYY-MM-DD"); d.format("YYYY-MM-DD") <= end; d.add(1, "day")) dates.push(d.format("YYYY-MM-DD"));
  return dates;
};

/** ມື້ເຮັດວຽກໃນຊ່ວງ (ບໍ່ລວມວັນພັກປະຈຳອາທິດ ແລະ ວັນພັກລັດຖະການ) */
const workdaysIn = async (start: string, end: string, t?: Transaction) => {
  const [company, holidays] = await Promise.all([findCompany(t), holidaysBetween(start, end, t)]);
  const rules = workRulesOf(company);
  return datesBetween(start, end).filter((d) => isWorkday(d, rules, holidays));
};

/** ເດືອນທຳອິດໃນຊ່ວງທີ່ຈ່າຍເງິນເດືອນແລ້ວ — ບໍ່ມີ = null */
const lockedPeriod = async (start: string, end: string, t?: Transaction) => {
  const months: string[] = [];
  for (const m = moment(start, "YYYY-MM-DD").startOf("month"); m.format("YYYY-MM") <= end.slice(0, 7); m.add(1, "month")) {
    months.push(m.format("YYYY-MM"));
  }
  const row = await Payroll.findOne({
    where: { period: { [Op.in]: months }, status: PAYROLL_PAID },
    attributes: ["period"],
    order: [["period", "ASC"]],
    transaction: t,
  });
  return row ? String(row.period) : null;
};

const lockedMessage = (period: string) =>
  `ເດືອນ ${moment(`${period}-01`).format("MM/YYYY")} ຈ່າຍເງິນເດືອນແລ້ວ — ຂໍ ຫຼື ອະນຸມັດລາພັກໃນເດືອນນີ້ບໍ່ໄດ້`;

/** ວັນທີເລີ່ມ / ສິ້ນສຸດ (ບໍ່ສົ່ງວັນສິ້ນສຸດ = ມື້ດຽວ) */
const parseRange = (body: any): { start: string; end: string } | { error: string } => {
  const start = toDateOnly(body.start_date);
  const end = toDateOnly(body.end_date) ?? start;
  if (!start || !end) return { error: "ວັນທີບໍ່ຖືກຕ້ອງ" };
  if (end < start) return { error: "ວັນທີສິ້ນສຸດຕ້ອງບໍ່ກ່ອນວັນທີເລີ່ມ" };
  if (moment(end).diff(moment(start), "days") + 1 > MAX_RANGE_DAYS) return { error: `ຂໍລາພັກໄດ້ບໍ່ເກີນ ${MAX_RANGE_DAYS} ວັນຕໍ່ຄັ້ງ` };
  return { start, end };
};

// ================= ພະນັກງານ (app ມືຖື)

/** GET /leave/me?year=YYYY — ຄຳຂໍຂອງຕົນເອງໃນປີ (ໃໝ່ສຸດກ່ອນ) + ສະຫຼຸບມື້ທີ່ອະນຸມັດແລ້ວ */
export const getMyLeaves = async (req: Request, res: Response) => {
  try {
    const self = await selfEmployee(req);
    if ("code" in self) {
      res.status(self.code).json({ message: self.message });
      return;
    }
    const year = yearOf(req.query.year);
    const rows = await LeaveRequest.findAll({
      where: { employee_id: self.employee._uuid, ...overlapsYear(year) },
      order: [["start_date", "DESC"], ["_uuid", "DESC"]],
    });
    const data = rows.map(present);
    const approvedDays = (type: number) => data
      .filter((r) => Number(r.status) === APPROVED && Number(r.leave_type) === type)
      .reduce((n, r) => n + (Number(r.days) || 0), 0);
    res.status(200).json({
      year,
      data,
      summary: {
        pending: data.filter((r) => Number(r.status) === PENDING).length,
        paid_days: approvedDays(PAID_LEAVE),
        unpaid_days: approvedDays(UNPAID_LEAVE),
      },
    });
  } catch (error) {
    sendError(res, error, "Error getting my leave requests");
  }
};

/** POST /leave/me { leave_type: 2 | 3, start_date, end_date?, reason } — ສົ່ງຄຳຂໍລາພັກ (ລໍຖ້າ HR ອະນຸມັດ) */
export const createMyLeave = async (req: Request, res: Response) => {
  try {
    const self = await selfEmployee(req);
    if ("code" in self) {
      res.status(self.code).json({ message: self.message });
      return;
    }
    const { employee } = self;
    const body = req.body || {};
    const fail = (message: string) => res.status(400).json({ message });

    const leaveType = Number(body.leave_type);
    if (!LEAVE_TYPES.includes(leaveType)) return fail("ກະລຸນາເລືອກປະເພດການລາພັກ");
    const range = parseRange(body);
    if ("error" in range) return fail(range.error);
    const reason = text(body.reason);
    if (!reason) return fail("ກະລຸນາປ້ອນເຫດຜົນການລາພັກ");
    if (employee.start_date && range.start < String(employee.start_date)) return fail("ວັນທີເລີ່ມຕ້ອງບໍ່ກ່ອນວັນເຂົ້າວຽກ");

    const locked = await lockedPeriod(range.start, range.end);
    if (locked) return fail(lockedMessage(locked));
    const workdays = await workdaysIn(range.start, range.end);
    if (!workdays.length) return fail("ຊ່ວງວັນທີນີ້ເປັນວັນພັກທັງໝົດ — ບໍ່ຕ້ອງຂໍລາພັກ");

    const overlap = await LeaveRequest.findOne({
      where: {
        employee_id: employee._uuid,
        status: { [Op.in]: [PENDING, APPROVED] },
        start_date: { [Op.lte]: range.end },
        end_date: { [Op.gte]: range.start },
      },
    });
    if (overlap) {
      return fail(`ຊ່ວງວັນທີນີ້ຊ້ຳກັບຄຳຂໍລາພັກ ${dayText(overlap.start_date)} – ${dayText(overlap.end_date)} ທີ່ມີຢູ່ແລ້ວ`);
    }

    const row = await LeaveRequest.create({
      employee_id: employee._uuid,
      leave_type: leaveType,
      start_date: range.start,
      end_date: range.end,
      days: workdays.length,
      reason,
      status: PENDING,
    });
    res.status(200).json({ message: "ສົ່ງຄຳຂໍລາພັກສຳເລັດ — ລໍຖ້າ HR ອະນຸມັດ", data: present(row) });
  } catch (error) {
    sendError(res, error, "Error creating leave request");
  }
};

/** PUT /leave/me/cancel/:id — ຍົກເລີກຄຳຂໍຂອງຕົນເອງ (ສະເພາະທີ່ຍັງລໍຖ້າ) */
export const cancelMyLeave = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const self = await selfEmployee(req);
    if ("code" in self) {
      res.status(self.code).json({ message: self.message });
      return;
    }
    const row = await LeaveRequest.findByPk(decodeId(req));
    if (!row || Number(row.employee_id) !== self.employee._uuid) {
      res.status(404).json({ message: "ບໍ່ພົບຄຳຂໍລາພັກ" });
      return;
    }
    if (Number(row.status) !== PENDING) {
      res.status(400).json({ message: "ຍົກເລີກໄດ້ສະເພາະຄຳຂໍທີ່ຍັງລໍຖ້າອະນຸມັດ" });
      return;
    }
    await row.update({ status: CANCELLED, updatedAt: new Date() });
    res.status(200).json({ message: "ຍົກເລີກຄຳຂໍລາພັກແລ້ວ", data: present(row) });
  } catch (error) {
    sendError(res, error, "Error cancelling leave request");
  }
};

// ================= HR

/** POST /leave/fetch { status?, year? } — ຄຳຂໍຂອງທຸກຄົນ (ລໍຖ້າກ່ອນ, ໃໝ່ສຸດກ່ອນ) + ຈຳນວນຕາມສະຖານະຂອງປີ */
export const getLeaves = async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const year = yearOf(body.year);
    const status = Number(body.status);
    const [rows, counts] = await Promise.all([
      LeaveRequest.findAll({
        where: { ...overlapsYear(year), ...(STATUSES.includes(status) ? { status } : {}) },
        include: [employeeInclude],
        order: [["status", "ASC"], ["start_date", "DESC"], ["_uuid", "DESC"]],
      }),
      LeaveRequest.findAll({
        where: overlapsYear(year),
        attributes: ["status", [fn("COUNT", col("_uuid")), "total"]],
        group: ["status"],
        raw: true,
      }) as Promise<any[]>,
    ]);
    const countOf = (s: number) => Number(counts.find((c) => Number(c.status) === s)?.total) || 0;
    res.status(200).json({
      year,
      data: rows.map(present),
      summary: { pending: countOf(PENDING), approved: countOf(APPROVED), rejected: countOf(REJECTED), cancelled: countOf(CANCELLED) },
    });
  } catch (error) {
    sendError(res, error, "Error getting leave requests");
  }
};

/**
 * PUT /leave/approve/:id { leave_type?, note? } — ອະນຸມັດ: ບັນທຶກ status ລາພັກ (HR ປ່ຽນປະເພດໄດ້) ລົງ tbl_attendance
 * ທຸກມື້ເຮັດວຽກໃນຊ່ວງທີ່ເປັນພະນັກງານຢູ່ (ລວມມື້ທີ່ຍັງບໍ່ຮອດ). ມື້ທີ່ສະແກນມາວຽກແລ້ວ ບໍ່ທັບ ແລະ ບໍ່ນັບ
 */
export const approveLeave = async (req: Request<{ id: string }>, res: Response) => {
  const t = await LeaveRequest.sequelize!.transaction();
  let done = false;
  const fail = async (code: number, message: string) => {
    await t.rollback();
    done = true;
    res.status(code).json({ message });
  };
  try {
    const row = await LeaveRequest.findByPk(decodeId(req), { transaction: t, lock: t.LOCK.UPDATE });
    if (!row) return fail(404, "ບໍ່ພົບຄຳຂໍລາພັກ");
    if (Number(row.status) !== PENDING) return fail(400, "ຄຳຂໍນີ້ບໍ່ໄດ້ລໍຖ້າອະນຸມັດແລ້ວ");
    const body = req.body || {};
    const leaveType = body.leave_type === undefined || body.leave_type === null ? Number(row.leave_type) : Number(body.leave_type);
    if (!LEAVE_TYPES.includes(leaveType)) return fail(400, "ປະເພດການລາພັກບໍ່ຖືກຕ້ອງ");
    const employee: any = await Employee.findByPk(row.employee_id, { transaction: t });
    if (!employee) return fail(400, "ບໍ່ພົບພະນັກງານ");

    const start = String(row.start_date);
    const end = String(row.end_date);
    const locked = await lockedPeriod(start, end, t);
    if (locked) return fail(400, lockedMessage(locked));
    const dates = (await workdaysIn(start, end, t)).filter((d) => employedOn(employee, d));
    if (!dates.length) return fail(400, "ບໍ່ມີມື້ເຮັດວຽກໃນຊ່ວງນີ້ໃຫ້ບັນທຶກລາພັກ");

    const existing = await Attendance.findAll({
      where: { employee_id: employee._uuid, work_date: { [Op.in]: dates } },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    const byDate = new Map(existing.map((a) => [String(a.work_date), a]));
    const actor = Number(actorOf(req)) || null;
    const values = {
      check_in: null, in_latitude: null, in_longitude: null, in_distance: null, in_accuracy: null,
      check_out: null, out_latitude: null, out_longitude: null, out_distance: null, out_accuracy: null,
      late_minutes: 0,
      early_minutes: 0,
      status: leaveType,
      source: BY_HR,
      note: `ລາພັກ: ${row.reason}`.slice(0, 255),
      updatedbyid: actor,
    };
    const worked: string[] = [];
    let applied = 0;
    for (const date of dates) {
      const current = byDate.get(date);
      if (current && Number(current.status) === PRESENT && current.check_in) {
        worked.push(date);
        continue;
      }
      if (current) await current.update({ ...values, updatedAt: new Date() }, { transaction: t });
      else await Attendance.create({ employee_id: employee._uuid, work_date: date, ...values }, { transaction: t });
      applied++;
    }
    if (!applied) return fail(400, "ທຸກມື້ໃນຊ່ວງນີ້ພະນັກງານມາວຽກແລ້ວ — ບໍ່ມີມື້ໃຫ້ບັນທຶກລາພັກ");

    await row.update({
      status: APPROVED,
      leave_type: leaveType,
      days: applied,
      review_note: text(body.note),
      reviewedbyid: actor,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    }, { transaction: t });
    await t.commit();
    done = true;

    const saved = await findWithEmployee(row._uuid);
    res.status(200).json({
      message: worked.length ? `ອະນຸມັດແລ້ວ ${applied} ມື້ (ບໍ່ນັບ ${worked.length} ມື້ທີ່ມາວຽກແລ້ວ)` : `ອະນຸມັດແລ້ວ ${applied} ມື້`,
      data: saved && present(saved),
      worked,
    });
  } catch (error) {
    if (!done) await t.rollback();
    // ພະນັກງານສະແກນມື້ດຽວກັນພ້ອມກັນ (UNIQUE employee_id + work_date)
    if (error instanceof UniqueConstraintError) {
      res.status(409).json({ message: "ມີການບັນທຶກການເຂົ້າວຽກພ້ອມກັນ — ລອງໃໝ່ອີກຄັ້ງ" });
      return;
    }
    sendError(res, error, "Error approving leave request");
  }
};

/** PUT /leave/reject/:id { note? } — ປະຕິເສດ (ສະເພາະທີ່ຍັງລໍຖ້າ) */
export const rejectLeave = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const row = await LeaveRequest.findByPk(decodeId(req));
    if (!row) {
      res.status(404).json({ message: "ບໍ່ພົບຄຳຂໍລາພັກ" });
      return;
    }
    if (Number(row.status) !== PENDING) {
      res.status(400).json({ message: "ຄຳຂໍນີ້ບໍ່ໄດ້ລໍຖ້າອະນຸມັດແລ້ວ" });
      return;
    }
    await row.update({
      status: REJECTED,
      review_note: text(req.body?.note),
      reviewedbyid: Number(actorOf(req)) || null,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    });
    const saved = await findWithEmployee(row._uuid);
    res.status(200).json({ message: "ປະຕິເສດຄຳຂໍລາພັກແລ້ວ", data: saved && present(saved) });
  } catch (error) {
    sendError(res, error, "Error rejecting leave request");
  }
};
