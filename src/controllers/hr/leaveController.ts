import { fullName, notifyApprovers } from "./approvers";
import { Request, Response } from "express";
import { createHmac } from "crypto";
import path from "path";
import fs from "fs";
import jwt from "jsonwebtoken";
import moment from "moment";
import { Op, Transaction, UniqueConstraintError, col, fn } from "sequelize";
import LeaveRequest from "../../models/leaveRequest";
import LeaveType from "../../models/leaveType";
import LeaveQuota from "../../models/leaveQuota";
import LeaveFile from "../../models/leaveFile";
import Attendance from "../../models/attendance";
import Employee from "../../models/employee";
import Department from "../../models/department";
import Position from "../../models/position";
import Payroll from "../../models/payroll";
import Users from "../../models/userModel";
import { adminJwtConfig } from "../../config/jwtConfig";
import { actorOf, decodeId, sendError, toDateOnly } from "../bansi/bansiHelpers";
import { LEAVE_FILE_DIR, originalNameOf, profileUrl, removeQuietly } from "./hrHelpers";
import { selfEmployee } from "./attendanceController";
import { notify } from "./notificationController";
import { syncDraftPayrollForDates } from "./payrollController";
import {
  BY_HR, PAID_LEAVE, PRESENT, UNPAID_LEAVE, employedOn, findCompany, holidaysBetween, isWorkday, nowLao, workRulesOf,
} from "./workCalendar";

/**
 * ຄຳຂໍລາພັກ:
 * - ພະນັກງານ (app ມືຖື): GET/POST /leave/me, PUT /leave/me/cancel/:id — ສະເພາະຄຳຂໍຂອງຕົນເອງ (ບັນຊີຕ້ອງຜູກກັບພະນັກງານ)
 * - HR: POST /leave/fetch, POST /leave/balance, PUT /leave/approve/:id (ບັນທຶກລາພັກລົງ tbl_attendance ທຸກມື້ເຮັດວຽກໃນຊ່ວງ),
 *   PUT /leave/reject/:id, PUT /leave/revoke/:id (ຖອນການອະນຸມັດ — ລຶບມື້ລາອອກຈາກການເຂົ້າວຽກ)
 * ເດືອນທີ່ຈ່າຍເງິນເດືອນແລ້ວ ຂໍ/ອະນຸມັດລາພັກບໍ່ໄດ້ (ຄືກັບການແກ້ການເຂົ້າວຽກ).
 * ປະເພດ (tbl_leave_type) ມີຂີດຈຳກັດມື້ເຮັດວຽກຕໍ່ປີ / ຕໍ່ຄັ້ງ (ນັບຄຳຂໍທີ່ລໍຖ້າ + ອະນຸມັດແລ້ວ) — ເກີນ = ຍັງຂໍໄດ້ ແລະ ແຈ້ງພະນັກງານ;
 * HR ຕັດສິນຕອນອະນຸມັດວ່າ ໄດ້ ຫຼື ບໍ່ໄດ້ເງິນເດືອນ (paid).
 * ສິດຕໍ່ປີ: HR ຕັ້ງສະເພາະຄົນໄດ້ (GET / PUT /leave/quota/:id → tbl_leave_quota), ບໍ່ຕັ້ງ = ຂອງປະເພດ;
 * ປີທີ່ເລີ່ມວຽກ ໄດ້ຕາມເດືອນທີ່ເຮັດວຽກ (limitsOf)
 * ໃບລາ (tbl_leave_file): ແນບຕອນ POST /leave/me (multipart field "files", ≤ 5) — ເປີດໄດ້ສະເພາະເຈົ້າຂອງ + ຜູ້ມີສິດອະນຸມັດລາພັກ
 * (GET /leave/me/file/:id, …/link → /leave/file/open/:token) ແລະ HR ໃນເວັບ (GET /leave/file/download/:id)
 */

const PENDING = 1;
const APPROVED = 2;
const REJECTED = 3;
const CANCELLED = 4;
const STATUSES = [PENDING, APPROVED, REJECTED, CANCELLED];
/** status ຂອງ tbl_attendance ທີ່ຈະບັນທຶກ (leave_type) — app ລຸ້ນເກົ່າສົ່ງຄ່ານີ້ແທນ leave_type_id */
const LEAVE_TYPES = [PAID_LEAVE, UNPAID_LEAVE];
const TYPE_ORDER: [string, string][] = [["sort", "ASC"], ["_uuid", "ASC"]];
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

const typeInclude = { model: LeaveType, as: "type", attributes: ["_uuid", "name", "paid", "max_per_year", "max_per_request"] };

const LEAVE_MIME: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".pdf": "application/pdf",
};

/** ໃບລາທີ່ແນບ (ບໍ່ສົ່ງຊື່ໄຟລ໌ໃນເຄື່ອງ) — ໃຊ້ທັງ app, ເວັບ ແລະ ໜ້າອະນຸມັດ */
export const leaveFileInclude: any = {
  model: LeaveFile,
  as: "files",
  separate: true,
  attributes: ["_uuid", "leave_id", "original_name", "mime_type", "file_size", "createdAt"],
  order: [["_uuid", "ASC"]],
};

const present = (row: LeaveRequest) => {
  const { employee, ...r }: any = row.get({ plain: true });
  return { ...r, files: r.files ?? [], employee: employee ? { ...employee, profile_url: profileUrl(employee.profile) } : null };
};

const findWithEmployee = (id: number) => LeaveRequest.findByPk(id, { include: [employeeInclude, typeInclude, leaveFileInclude] });

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

/**
 * ບັນທຶກລາພັກລົງ tbl_attendance ທຸກມື້ເຮັດວຽກໃນຊ່ວງທີ່ເປັນພະນັກງານຢູ່ (ລວມມື້ທີ່ຍັງບໍ່ຮອດ) — ມື້ທີ່ສະແກນມາວຽກແລ້ວ ບໍ່ທັບ ແລະ ບໍ່ນັບ
 */
const writeLeaveDays = async (
  employee: any, start: string, end: string, leaveType: number, reason: string, actor: number | null, t: Transaction,
): Promise<{ applied: string[]; worked: string[] } | { error: string }> => {
  const locked = await lockedPeriod(start, end, t);
  if (locked) return { error: lockedMessage(locked) };
  const dates = (await workdaysIn(start, end, t)).filter((d) => employedOn(employee, d));
  if (!dates.length) return { error: "ບໍ່ມີມື້ເຮັດວຽກໃນຊ່ວງນີ້ໃຫ້ບັນທຶກລາພັກ" };

  const existing = await Attendance.findAll({
    where: { employee_id: employee._uuid, work_date: { [Op.in]: dates } },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });
  const byDate = new Map(existing.map((a) => [String(a.work_date), a]));
  const values = {
    check_in: null, in_latitude: null, in_longitude: null, in_distance: null, in_accuracy: null,
    check_out: null, out_latitude: null, out_longitude: null, out_distance: null, out_accuracy: null,
    late_minutes: 0,
    early_minutes: 0,
    status: leaveType,
    source: BY_HR,
    note: `ລາພັກ: ${reason}`.slice(0, 255),
    updatedbyid: actor,
  };
  const worked: string[] = [];
  const applied: string[] = [];
  for (const date of dates) {
    const current = byDate.get(date);
    if (current && Number(current.status) === PRESENT && current.check_in) {
      worked.push(date);
      continue;
    }
    if (current) await current.update({ ...values, updatedAt: new Date() }, { transaction: t });
    else await Attendance.create({ employee_id: employee._uuid, work_date: date, ...values }, { transaction: t });
    applied.push(date);
  }
  if (!applied.length) return { error: "ທຸກມື້ໃນຊ່ວງນີ້ພະນັກງານມາວຽກແລ້ວ — ບໍ່ມີມື້ໃຫ້ບັນທຶກລາພັກ" };
  return { applied, worked };
};

const statusOfType = (type: LeaveType) => (Number(type.paid) === 1 ? PAID_LEAVE : UNPAID_LEAVE);

/** ປະເພດນີ້ພະນັກງານເພດນີ້ລາໄດ້ບໍ (gender 0 = ທຸກຄົນ; 1 ຊາຍ, 2 ຍິງ ຄື tbl_employee.gender) */
const fitsGender = (type: { gender?: unknown } | null | undefined, gender: unknown) =>
  !type || !Number(type.gender) || Number(type.gender) === Number(gender);
const onlyFor = (type: LeaveType) => `"${type.name}" ລາໄດ້ສະເພາະພະນັກງານ${Number(type.gender) === 2 ? "ຍິງ" : "ຊາຍ"}`;

/**
 * ປະເພດທີ່ພະນັກງານເລືອກ: leave_type_id (ຕ້ອງໃຊ້ງານຢູ່). app ລຸ້ນເກົ່າສົ່ງແຕ່ leave_type 2 | 3 → ປະເພດທຳອິດທີ່ paid ກົງກັນ;
 * ຍັງບໍ່ໄດ້ຕັ້ງປະເພດຈັກອັນ = ແບບເກົ່າ (ບໍ່ມີປະເພດ, ບໍ່ມີຂີດຈຳກັດ)
 */
const resolveType = async (body: any, gender: number): Promise<{ type: LeaveType | null; status: number } | { error: string }> => {
  if (body.leave_type_id !== undefined && body.leave_type_id !== null && body.leave_type_id !== "") {
    const type = await LeaveType.findOne({ where: { _uuid: Number(body.leave_type_id) || 0, status: 1 } });
    return type ? { type, status: statusOfType(type) } : { error: "ບໍ່ພົບປະເພດການລາພັກ ຫຼື ປະເພດນີ້ປິດໃຊ້ງານແລ້ວ" };
  }
  const legacy = Number(body.leave_type);
  if (!LEAVE_TYPES.includes(legacy)) return { error: "ກະລຸນາເລືອກປະເພດການລາພັກ" };
  const type = await LeaveType.findOne({ where: { status: 1, paid: legacy === PAID_LEAVE ? 1 : 0, gender: { [Op.in]: [0, gender] } }, order: TYPE_ORDER });
  if (type) return { type, status: legacy };
  if (await LeaveType.count({ where: { status: 1 } })) return { error: "ກະລຸນາອັບເດດ app ແລ້ວເລືອກປະເພດການລາພັກ" };
  return { type: null, status: legacy };
};

/** ມື້ເຮັດວຽກຂອງຄຳຂໍທີ່ຕົກໃນປີ — ຢູ່ໃນປີທັງໝົດ = days ທີ່ບັນທຶກໄວ້, ຂ້າມປີ = ນັບມື້ເຮັດວຽກສ່ວນທີ່ຢູ່ໃນປີນັ້ນ */
const daysInYear = async (row: LeaveRequest, year: string, t?: Transaction) => {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const start = String(row.start_date);
  const end = String(row.end_date);
  if (start >= from && end <= to) return Number(row.days) || 0;
  return (await workdaysIn(start > from ? start : from, end < to ? end : to, t)).length;
};

/** ມື້ຂອງປະເພດໃນປີ: used = ອະນຸມັດແລ້ວ, pending = ລໍຖ້າ — exceptId = ຄຳຂໍທີ່ກຳລັງກວດ (ບໍ່ນັບຕົວເອງ) */
const usageOf = async (employeeId: number, typeId: number, year: string, exceptId?: number, t?: Transaction) => {
  const rows = await LeaveRequest.findAll({
    where: {
      employee_id: employeeId,
      leave_type_id: typeId,
      status: { [Op.in]: [PENDING, APPROVED] },
      ...overlapsYear(year),
      ...(exceptId ? { _uuid: { [Op.ne]: exceptId } } : {}),
    },
    transaction: t,
  });
  let used = 0;
  let pending = 0;
  for (const row of rows) {
    const days = await daysInYear(row, year, t);
    if (Number(row.status) === APPROVED) used += days;
    else pending += days;
  }
  return { used, pending };
};

/**
 * ສິດຕໍ່ປີຂອງພະນັກງານສຳລັບແຕ່ລະປະເພດ: ຕັ້ງສະເພາະຄົນ (tbl_leave_quota) ກ່ອນ, ບໍ່ມີ = ຂອງປະເພດ (null / 0 = ບໍ່ຈຳກັດ).
 * ປີທີ່ເລີ່ມວຽກ = ຕາມເດືອນທີ່ເຫຼືອຂອງປີ (ນັບເດືອນທີ່ເລີ່ມ) ປັດເປັນມື້ເຕັມ — ເຊັ່ນ ເຕັມປີ 15 ມື້, ເລີ່ມເດືອນ 7 = 8 ມື້
 */
const limitsOf = async (employeeId: number, year: string, t?: Transaction) => {
  const [quotas, employee]: [any[], any] = await Promise.all([
    LeaveQuota.findAll({ where: { employee_id: employeeId }, attributes: ["leave_type_id", "days"], raw: true, transaction: t }),
    Employee.findByPk(employeeId, { attributes: ["start_date"], raw: true, transaction: t }),
  ]);
  const own = new Map(quotas.map((q) => [Number(q.leave_type_id), Number(q.days)]));
  const start = String(employee?.start_date ?? "");
  const months = start.slice(0, 4) === year ? 13 - Number(start.slice(5, 7)) : 12;
  return (type: LeaveType) => {
    const custom = own.has(type._uuid);
    const full: number | null = custom ? own.get(type._uuid)! : Number(type.max_per_year) || null;
    const limit = full === null || months >= 12 ? full : Math.round((full * Math.max(0, months)) / 12);
    return { full, limit, custom, prorated: limit !== full };
  };
};

/**
 * ກວດຂີດຈຳກັດຂອງປະເພດ — ຕໍ່ຄັ້ງ: ມື້ເຮັດວຽກທັງໝົດຂອງຄຳຂໍ; ຕໍ່ປີ: ອະນຸມັດ + ລໍຖ້າ + ຄຳຂໍນີ້ (ແຍກຕາມປີເມື່ອຂ້າມປີ).
 * ຜ່ານ = null, ບໍ່ຜ່ານ = ຂໍ້ຄວາມບອກມື້ທີ່ເຫຼືອ
 */
const quotaError = async (employeeId: number, type: LeaveType | null, dates: string[], exceptId?: number, t?: Transaction) => {
  if (!type) return null;
  const perRequest = Number(type.max_per_request) || 0;
  if (perRequest && dates.length > perRequest) {
    return `${type.name} ລາໄດ້ບໍ່ເກີນ ${perRequest} ມື້ຕໍ່ຄັ້ງ (ຄຳຂໍນີ້ ${dates.length} ມື້ເຮັດວຽກ)`;
  }
  const byYear = new Map<string, number>();
  dates.forEach((d) => byYear.set(d.slice(0, 4), (byYear.get(d.slice(0, 4)) ?? 0) + 1));
  for (const [year, count] of byYear) {
    const { limit } = (await limitsOf(employeeId, year, t))(type);
    if (limit === null) continue;
    const { used, pending } = await usageOf(employeeId, type._uuid, year, exceptId, t);
    const left = Math.max(0, limit - used - pending);
    if (count > left) {
      return `${type.name} ປີ ${year} ລາໄດ້ ${limit} ມື້ — ໃຊ້ແລ້ວ ${used} ມື້${pending ? `, ລໍຖ້າອະນຸມັດ ${pending} ມື້` : ""}, ເຫຼືອ ${left} ມື້ (ຄຳຂໍນີ້ ${count} ມື້)`;
    }
  }
  return null;
};

/**
 * ທຸກປະເພດທີ່ໃຊ້ງານ + ມື້ທີ່ໃຊ້/ລໍຖ້າ/ເຫຼືອ ຂອງພະນັກງານໃນປີ (remaining null = ບໍ່ຈຳກັດ).
 * max_per_year = ສິດຂອງຄົນນີ້ປີນີ້ (ຕັ້ງສະເພາະ / ຕາມເດືອນ — ຊື່ເກົ່າ ໃຫ້ app / ເວັບເດີມໃຊ້ໄດ້),
 * full_per_year = ສິດເຕັມປີ, default_per_year = ຂອງປະເພດ, custom = HR ຕັ້ງສະເພາະ, prorated = ປີເລີ່ມວຽກ (ຕາມເດືອນ)
 */
export const balancesOf = async (employeeId: number, year: string, exceptId?: number) => {
  const [all, limitOf, person] = await Promise.all([
    LeaveType.findAll({ where: { status: 1 }, order: TYPE_ORDER }),
    limitsOf(employeeId, year),
    Employee.findByPk(employeeId, { attributes: ["gender"], raw: true }) as Promise<any>,
  ]);
  // ສະເພາະປະເພດທີ່ເພດຂອງຄົນນີ້ລາໄດ້ (app, ຟອມອະນຸມັດ, ສິດວັນລາ)
  const types = all.filter((type) => fitsGender(type, person?.gender));
  return Promise.all(types.map(async (type) => {
    const { used, pending } = await usageOf(employeeId, type._uuid, year, exceptId);
    const { full, limit, custom, prorated } = limitOf(type);
    return {
      _uuid: type._uuid,
      name: type.name,
      paid: Number(type.paid),
      description: type.description,
      max_per_year: limit,
      full_per_year: full,
      default_per_year: type.max_per_year,
      custom,
      prorated,
      max_per_request: type.max_per_request,
      used,
      pending,
      remaining: limit === null ? null : Math.max(0, limit - used - pending),
    };
  }));
};

/** GET /leave/quota/:id?year= (:id = ພະນັກງານ) — ສິດແຕ່ລະປະເພດຂອງຄົນນີ້ (ຂອງປະເພດ / ຕັ້ງສະເພາະ / ຕາມເດືອນ) + ໃຊ້ / ລໍຖ້າ / ເຫຼືອ */
export const getLeaveQuota = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const id = Number(decodeId(req));
    const employee: any = await Employee.findByPk(id, { attributes: ["_uuid", "start_date"], raw: true });
    if (!employee) {
      res.status(404).json({ message: "ບໍ່ພົບພະນັກງານ" });
      return;
    }
    const year = yearOf(req.query.year);
    res.status(200).json({ year, start_date: employee.start_date, data: await balancesOf(id, year) });
  } catch (error) {
    sendError(res, error, "Error getting leave quota");
  }
};

/**
 * PUT /leave/quota/:id { quotas: [{ leave_type_id, days }] } — HR ຕັ້ງສິດສະເພາະຄົນ (ມື້ເຮັດວຽກຕໍ່ປີເຕັມ, 0–366);
 * days null / "" = ລຶບ (ກັບໄປໃຊ້ຂອງປະເພດ). ຄືນສິດຂອງປີນີ້ທັງໝົດ
 */
export const setLeaveQuota = async (req: Request<{ id: string }>, res: Response) => {
  const t = await LeaveQuota.sequelize!.transaction();
  const fail = async (code: number, message: string) => {
    await t.rollback();
    res.status(code).json({ message });
  };
  try {
    const id = Number(decodeId(req));
    if (!(await Employee.findByPk(id, { attributes: ["_uuid"], transaction: t }))) return fail(404, "ບໍ່ພົບພະນັກງານ");
    const list: any[] = Array.isArray(req.body?.quotas) ? req.body.quotas : [];
    const types = new Set((await LeaveType.findAll({ attributes: ["_uuid"], raw: true, transaction: t })).map((x: any) => Number(x._uuid)));
    const actor = Number(actorOf(req)) || null;
    for (const q of list) {
      const typeId = Number(q?.leave_type_id);
      if (!types.has(typeId)) return fail(400, "ບໍ່ພົບປະເພດການລາພັກ");
      const raw = q?.days;
      if (raw === null || raw === undefined || raw === "") {
        await LeaveQuota.destroy({ where: { employee_id: id, leave_type_id: typeId }, transaction: t });
        continue;
      }
      const days = Number(raw);
      if (!Number.isInteger(days) || days < 0 || days > 366) return fail(400, "ສິດວັນລາຕ້ອງເປັນຈຳນວນເຕັມ 0–366 ມື້");
      const row = await LeaveQuota.findOne({ where: { employee_id: id, leave_type_id: typeId }, transaction: t });
      if (row) await row.update({ days, updatedbyid: actor, updatedAt: new Date() }, { transaction: t });
      else await LeaveQuota.create({ employee_id: id, leave_type_id: typeId, days, createdbyid: actor, updatedbyid: actor }, { transaction: t });
    }
    await t.commit();
    const year = yearOf(req.query.year);
    res.status(200).json({ message: "ບັນທຶກສິດວັນລາແລ້ວ", year, data: await balancesOf(id, year) });
  } catch (error) {
    await t.rollback();
    sendError(res, error, "Error setting leave quota");
  }
};

/** ຄຳຂໍທີ່ລໍຖ້າ / ອະນຸມັດແລ້ວ ທີ່ຊ້ອນກັບຊ່ວງນີ້ */
const overlappingLeave = (employeeId: number, start: string, end: string, t?: Transaction) => LeaveRequest.findOne({
  where: {
    employee_id: employeeId,
    status: { [Op.in]: [PENDING, APPROVED] },
    start_date: { [Op.lte]: end },
    end_date: { [Op.gte]: start },
  },
  transaction: t,
});

/** ແຈ້ງເຕືອນພະນັກງານເລື່ອງການລາພັກ (ອະນຸມັດ / ປະຕິເສດ) */
const notifyLeave = (row: LeaveRequest, title: string, lines: (string | null)[], actor: number | null) => notify([{
  employee_id: Number(row.employee_id),
  type: "leave",
  title,
  body: lines.filter(Boolean).join("\n") || null,
  ref: `leave:${row._uuid}`,
  createdbyid: actor,
  push: true,
}]);

const overlapMessage = (row: LeaveRequest) =>
  `ຊ່ວງວັນທີນີ້ຊ້ຳກັບການລາພັກ ${dayText(row.start_date)} – ${dayText(row.end_date)} ທີ່ມີຢູ່ແລ້ວ`;

// ================= ພະນັກງານ (app ມືຖື)

/**
 * GET /leave/me?year=YYYY — ຄຳຂໍຂອງຕົນເອງໃນປີ (ໃໝ່ສຸດກ່ອນ) + ສະຫຼຸບມື້ທີ່ອະນຸມັດແລ້ວ
 * + types: ປະເພດທີ່ເລືອກໄດ້ ພ້ອມມື້ທີ່ເຫຼືອຂອງປີ (ສຳລັບຟອມຂໍລາໃນ app)
 */
export const getMyLeaves = async (req: Request, res: Response) => {
  try {
    const self = await selfEmployee(req);
    if ("code" in self) {
      res.status(self.code).json({ message: self.message });
      return;
    }
    const year = yearOf(req.query.year);
    const [rows, types] = await Promise.all([
      LeaveRequest.findAll({
        where: { employee_id: self.employee._uuid, ...overlapsYear(year) },
        include: [typeInclude, leaveFileInclude],
        order: [["start_date", "DESC"], ["_uuid", "DESC"]],
      }),
      balancesOf(self.employee._uuid, year),
    ]);
    const data = rows.map(present);
    const approvedDays = (type: number) => data
      .filter((r) => Number(r.status) === APPROVED && Number(r.leave_type) === type)
      .reduce((n, r) => n + (Number(r.days) || 0), 0);
    res.status(200).json({
      year,
      data,
      types,
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

/**
 * POST /leave/me { leave_type_id, start_date, end_date?, reason } — ສົ່ງຄຳຂໍລາພັກ (ລໍຖ້າ HR ອະນຸມັດ);
 * app ລຸ້ນເກົ່າສົ່ງ leave_type: 2 | 3 ແທນ leave_type_id ໄດ້ (ເບິ່ງ resolveType).
 * ແນບໃບລາ = multipart (ຟີວດຽວກັນ + files ≤ 5: ຮູບ / PDF) — ບໍ່ສຳເລັດ = ລຶບໄຟລ໌ທີ່ອັບໂຫຼດມາ
 */
export const createMyLeave = async (req: Request, res: Response) => {
  const uploads = (req.files as Express.Multer.File[] | undefined) ?? [];
  const discard = () => uploads.forEach((f) => removeQuietly(f.path));
  try {
    const self = await selfEmployee(req);
    if ("code" in self) {
      discard();
      res.status(self.code).json({ message: self.message });
      return;
    }
    const { employee } = self;
    const body = req.body || {};
    const fail = (message: string) => {
      discard();
      return res.status(400).json({ message });
    };

    const resolved = await resolveType(body, Number(employee.gender));
    if ("error" in resolved) return fail(resolved.error);
    if (!fitsGender(resolved.type, employee.gender)) return fail(onlyFor(resolved.type!));
    const range = parseRange(body);
    if ("error" in range) return fail(range.error);
    const reason = text(body.reason);
    if (!reason) return fail("ກະລຸນາປ້ອນເຫດຜົນການລາພັກ");
    if (employee.start_date && range.start < String(employee.start_date)) return fail("ວັນທີເລີ່ມຕ້ອງບໍ່ກ່ອນວັນເຂົ້າວຽກ");

    const locked = await lockedPeriod(range.start, range.end);
    if (locked) return fail(lockedMessage(locked));
    const workdays = await workdaysIn(range.start, range.end);
    if (!workdays.length) return fail("ຊ່ວງວັນທີນີ້ເປັນວັນພັກທັງໝົດ — ບໍ່ຕ້ອງຂໍລາພັກ");

    const overlap = await overlappingLeave(employee._uuid, range.start, range.end);
    if (overlap) return fail(overlapMessage(overlap));
    // ເກີນຂີດຈຳກັດຂອງປະເພດ = ຍັງຂໍໄດ້ (ແຈ້ງພະນັກງານ) — HR ຕັດສິນຕອນອະນຸມັດວ່າ ໄດ້ / ບໍ່ໄດ້ເງິນເດືອນ
    const overQuota = await quotaError(employee._uuid, resolved.type, workdays);

    const row = await LeaveRequest.sequelize!.transaction(async (t) => {
      const created = await LeaveRequest.create({
        employee_id: employee._uuid,
        leave_type_id: resolved.type?._uuid ?? null,
        leave_type: resolved.status,
        start_date: range.start,
        end_date: range.end,
        days: workdays.length,
        reason,
        status: PENDING,
      }, { transaction: t });
      if (uploads.length) {
        await LeaveFile.bulkCreate(uploads.map((f) => ({
          leave_id: created._uuid,
          file_name: f.filename,
          original_name: originalNameOf(f).slice(0, 255),
          // app ສົ່ງ application/octet-stream — ເອົາຕາມນາມສະກຸນ (multer ກວດນາມສະກຸນແລ້ວ)
          mime_type: LEAVE_MIME[path.extname(f.originalname).toLowerCase()] ?? f.mimetype?.slice(0, 100) ?? null,
          file_size: f.size,
          created_by_employee_id: employee._uuid,
        })), { transaction: t });
      }
      return created;
    });
    const saved = await LeaveRequest.findByPk(row._uuid, { include: [typeInclude, leaveFileInclude] });
    await notifyApprovers("leave", employee._uuid, row._uuid, `🗓️ ${fullName(employee)} ຂໍລາພັກ`, [
      [resolved.type?.name, `${dayText(range.start)} – ${dayText(range.end)} · ${workdays.length} ມື້`].filter(Boolean).join(" · "),
      overQuota ? "⚠️ ເກີນສິດລາຂອງປະເພດນີ້" : null,
      uploads.length ? `📎 ແນບໃບລາ ${uploads.length} ໄຟລ໌` : null,
      reason,
    ].filter(Boolean).join("\n"));
    res.status(200).json({
      message: overQuota
        ? `ສົ່ງຄຳຂໍລາພັກແລ້ວ — ${resolved.type?.name ?? "ປະເພດນີ້"} ລາຄົບສິດແລ້ວ, HR ຈະພິຈາລະນາວ່າໄດ້ ຫຼື ບໍ່ໄດ້ເງິນເດືອນ`
        : "ສົ່ງຄຳຂໍລາພັກສຳເລັດ — ລໍຖ້າ HR ອະນຸມັດ",
      over_quota: !!overQuota,
      data: present(saved ?? row),
    });
  } catch (error) {
    discard();
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

// ================= ໃບລາ (ໄຟລ໌ແນບ)

const FILE_LINK_TTL = "10m";
/** ກະແຈຂອງລິ້ງເປີດໃບລາ — ແຍກຈາກ login ແລະ ລິ້ງເອກະສານຂອງວຽກ */
const fileLinkSecret = () => createHmac("sha256", adminJwtConfig.secret).update("leave-file-link").digest("hex");

/** ເປີດໃນ browser / app ເລີຍ (inline) — ຊື່ເດີມພາສາລາວຜ່ານ filename* */
const sendLeaveFile = (res: Response, file: LeaveFile | null) => {
  const filePath = file && path.join(LEAVE_FILE_DIR, path.basename(file.file_name));
  if (!file || !filePath || !fs.existsSync(filePath)) {
    res.status(404).json({ message: "ບໍ່ພົບໄຟລ໌" });
    return;
  }
  res.setHeader("Cache-Control", "private, max-age=86400");
  res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(file.original_name)}`);
  res.sendFile(filePath);
};

/** ໃບລາທີ່ຄົນໃນ app ເປີດໄດ້: ຂອງຕົນເອງ ຫຼື ມີສິດອະນຸມັດລາພັກ (HR ຕິກໃນຟອມຜູ້ໃຊ້) — ບໍ່ມີສິດ = null (ຕອບ 404 ຄືບໍ່ມີ) */
const openableFile = async (req: Request<{ id: string }>): Promise<LeaveFile | { code: number; message: string } | null> => {
  const self = await selfEmployee(req);
  if ("code" in self) return { code: self.code, message: self.message };
  const file = await LeaveFile.findByPk(Number(decodeId(req)) || 0, {
    include: [{ model: LeaveRequest, as: "leave", attributes: ["employee_id"] }],
  });
  if (!file) return null;
  if (Number((file as any).leave?.employee_id) === Number(self.employee._uuid)) return file;
  const approver = await Users.findOne({ where: { employee_id: self.employee._uuid, status: 1, approve_leave: 1 }, attributes: ["user_uuid"] });
  return approver ? file : null;
};

/** GET /leave/me/file/:id — ໄຟລ໌ໃບລາ (app ສະແດງຮູບໃນແອັບ) */
export const getMyLeaveFile = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const file = await openableFile(req);
    if (file && "code" in file) {
      res.status(file.code).json({ message: file.message });
      return;
    }
    sendLeaveFile(res, file);
  } catch (error) {
    sendError(res, error, "Error getting leave file");
  }
};

/** GET /leave/me/file/:id/link — ລິ້ງຊົ່ວຄາວເປີດໃບລາໃນ browser ຂອງມືຖື (ເຊັ່ນ PDF) — path ຕໍ່ຈາກ /api */
export const getMyLeaveFileLink = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const file = await openableFile(req);
    if (file && "code" in file) {
      res.status(file.code).json({ message: file.message });
      return;
    }
    if (!file) {
      res.status(404).json({ message: "ບໍ່ພົບໄຟລ໌" });
      return;
    }
    const token = jwt.sign({ file: file._uuid }, fileLinkSecret(), { algorithm: "HS256", expiresIn: FILE_LINK_TTL });
    res.status(200).json({ url: `/leave/file/open/${token}` });
  } catch (error) {
    sendError(res, error, "Error creating leave file link");
  }
};

/** GET /leave/file/open/:token — public (ຢູ່ເທິງ verifyToken), ໃຊ້ໄດ້ພາຍໃນ FILE_LINK_TTL */
export const openLeaveFile = async (req: Request<{ token: string }>, res: Response) => {
  try {
    let fileId: number;
    try {
      fileId = Number((jwt.verify(req.params.token, fileLinkSecret(), { algorithms: ["HS256"] }) as jwt.JwtPayload).file);
    } catch {
      res.status(401).json({ message: "ລິ້ງໝົດອາຍຸແລ້ວ — ກົດເປີດໃບລາໃນແອັບອີກຄັ້ງ" });
      return;
    }
    sendLeaveFile(res, await LeaveFile.findByPk(fileId));
  } catch (error) {
    sendError(res, error, "Error opening leave file");
  }
};

/** GET /leave/file/download/:id — HR ໃນເວັບ (ສິດດຽວກັບໜ້າຄຳຂໍລາພັກ) */
export const downloadLeaveFile = async (req: Request<{ id: string }>, res: Response) => {
  try {
    sendLeaveFile(res, await LeaveFile.findByPk(Number(decodeId(req)) || 0));
  } catch (error) {
    sendError(res, error, "Error downloading leave file");
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
        include: [employeeInclude, typeInclude, leaveFileInclude],
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
 * POST /leave/balance { leave_id } (HR) — ມື້ທີ່ເຫຼືອຂອງແຕ່ລະປະເພດ ສຳລັບພະນັກງານຂອງຄຳຂໍ ໃນປີຂອງວັນທີເລີ່ມ
 * (ບໍ່ນັບຄຳຂໍນີ້ເອງ — ເບິ່ງວ່າອະນຸມັດໄດ້ຫຼືບໍ່)
 */
export const getLeaveBalance = async (req: Request, res: Response) => {
  try {
    const row = await LeaveRequest.findByPk(Number(req.body?.leave_id) || 0);
    if (!row) {
      res.status(404).json({ message: "ບໍ່ພົບຄຳຂໍລາພັກ" });
      return;
    }
    const year = String(row.start_date).slice(0, 4);
    res.status(200).json({ year, data: await balancesOf(Number(row.employee_id), year, row._uuid) });
  } catch (error) {
    sendError(res, error, "Error getting leave balance");
  }
};

/**
 * PUT /leave/approve/:id { leave_type_id?, paid?, note? } — ອະນຸມັດ: ບັນທຶກ status ລາພັກ (HR ປ່ຽນປະເພດໄດ້) ລົງ tbl_attendance
 * ທຸກມື້ເຮັດວຽກໃນຊ່ວງທີ່ເປັນພະນັກງານຢູ່ (ລວມມື້ທີ່ຍັງບໍ່ຮອດ). ມື້ທີ່ສະແກນມາວຽກແລ້ວ ບໍ່ທັບ ແລະ ບໍ່ນັບ.
 * paid (1 ໄດ້ເງິນເດືອນ / 0 ຕັດເງິນ) = HR ຕັດສິນເອງ — ບໍ່ສົ່ງ = ຕາມປະເພດ. ເກີນຂີດຈຳກັດຂອງປະເພດ ບໍ່ບລັອກ (HR ເຫັນຄຳເຕືອນໃນໜ້າເວັບ)
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
    // ປະເພດໃໝ່ທີ່ HR ເລືອກ (ຕ້ອງໃຊ້ງານຢູ່) ຫຼື ປະເພດເດີມຂອງຄຳຂໍ (ປິດໃຊ້ງານພາຍຫຼັງກໍ່ຍັງອະນຸມັດໄດ້); ຄຳຂໍເກົ່າບໍ່ມີປະເພດ = null
    const changed = body.leave_type_id !== undefined && body.leave_type_id !== null && body.leave_type_id !== "";
    const type = changed
      ? await LeaveType.findOne({ where: { _uuid: Number(body.leave_type_id) || 0, status: 1 }, transaction: t })
      : row.leave_type_id ? await LeaveType.findByPk(row.leave_type_id, { transaction: t }) : null;
    if (changed && !type) return fail(400, "ບໍ່ພົບປະເພດການລາພັກ ຫຼື ປະເພດນີ້ປິດໃຊ້ງານແລ້ວ");
    // HR ເລືອກ ໄດ້ / ບໍ່ໄດ້ເງິນເດືອນ ເອງ (ເຊັ່ນ ລາເກີນສິດ = ຕັດເງິນ) — ບໍ່ສົ່ງ = ຕາມປະເພດ
    const paidChoice = body.paid === undefined || body.paid === null || body.paid === ""
      ? null
      : Number(body.paid) === 1 || body.paid === true;
    const leaveType = paidChoice === null
      ? (type ? statusOfType(type) : Number(row.leave_type))
      : (paidChoice ? PAID_LEAVE : UNPAID_LEAVE);
    if (!LEAVE_TYPES.includes(leaveType)) return fail(400, "ປະເພດການລາພັກບໍ່ຖືກຕ້ອງ");
    const employee: any = await Employee.findByPk(row.employee_id, { transaction: t });
    if (!employee) return fail(400, "ບໍ່ພົບພະນັກງານ");
    if (changed && type && !fitsGender(type, employee.gender)) return fail(400, onlyFor(type));

    const actor = Number(actorOf(req)) || null;
    const result = await writeLeaveDays(employee, String(row.start_date), String(row.end_date), leaveType, row.reason, actor, t);
    if ("error" in result) return fail(400, result.error);
    const { applied, worked } = result;

    await row.update({
      status: APPROVED,
      leave_type_id: type?._uuid ?? null,
      leave_type: leaveType,
      days: applied.length,
      review_note: text(body.note),
      reviewedbyid: actor,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    }, { transaction: t });
    await t.commit();
    done = true;
    await syncDraftPayrollForDates(applied, [Number(row.employee_id)]);

    await notifyLeave(row, "ຄຳຂໍລາພັກໄດ້ຮັບການອະນຸມັດແລ້ວ ✅", [
      [type?.name, `${dayText(row.start_date)} – ${dayText(row.end_date)} · ${applied.length} ມື້`].filter(Boolean).join(" · "),
      leaveType === PAID_LEAVE ? "ໄດ້ເງິນເດືອນ" : "ບໍ່ໄດ້ເງິນເດືອນ (ຫັກເງິນເດືອນ)",
      text(body.note),
    ], actor);

    const saved = await findWithEmployee(row._uuid);
    res.status(200).json({
      message: worked.length ? `ອະນຸມັດແລ້ວ ${applied.length} ມື້ (ບໍ່ນັບ ${worked.length} ມື້ທີ່ມາວຽກແລ້ວ)` : `ອະນຸມັດແລ້ວ ${applied.length} ມື້`,
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

/**
 * PUT /leave/revoke/:id { note? } — ຖອນການອະນຸມັດ (ເຊັ່ນ ພະນັກງານຍົກເລີກການລາ / ອະນຸມັດຜິດ): ລຶບມື້ລາທີ່ບັນທຶກຕອນອະນຸມັດອອກຈາກ
 * tbl_attendance (ມື້ທີ່ບໍ່ມີແຖວ = ຂາດວຽກ ຖ້າຮອດມື້ແລ້ວ; HR ບັນທຶກການເຂົ້າວຽກແທນໄດ້), ຄືນໂຄຕາ ແລະ ແຈ້ງພະນັກງານ.
 * ເດືອນທີ່ຈ່າຍເງິນເດືອນແລ້ວ ຖອນບໍ່ໄດ້
 */
export const revokeLeave = async (req: Request<{ id: string }>, res: Response) => {
  const t = await LeaveRequest.sequelize!.transaction();
  const fail = async (code: number, message: string) => {
    await t.rollback();
    res.status(code).json({ message });
  };
  try {
    const row = await LeaveRequest.findByPk(decodeId(req), { transaction: t, lock: t.LOCK.UPDATE });
    if (!row) return fail(404, "ບໍ່ພົບຄຳຂໍລາພັກ");
    if (Number(row.status) !== APPROVED) return fail(400, "ຖອນໄດ້ສະເພາະຄຳຂໍທີ່ອະນຸມັດແລ້ວ");
    const start = String(row.start_date);
    const end = String(row.end_date);
    const locked = await lockedPeriod(start, end, t);
    if (locked) return fail(400, lockedMessage(locked));
    await Attendance.destroy({
      where: {
        employee_id: row.employee_id,
        work_date: { [Op.between]: [start, end] },
        status: { [Op.in]: LEAVE_TYPES },
        source: BY_HR,
        note: { [Op.like]: "ລາພັກ:%" },
      },
      transaction: t,
    });
    const actor = Number(actorOf(req)) || null;
    const note = text(req.body?.note);
    await row.update({ status: CANCELLED, review_note: note, reviewedbyid: actor, reviewedAt: new Date(), updatedAt: new Date() }, { transaction: t });
    await t.commit();
    await syncDraftPayrollForDates(datesBetween(start, end), [Number(row.employee_id)]);
    await notifyLeave(row, "HR ຖອນການອະນຸມັດລາພັກ", [`${dayText(start)} – ${dayText(end)}`, note], actor);
    const saved = await findWithEmployee(row._uuid);
    res.status(200).json({ message: "ຖອນການອະນຸມັດແລ້ວ", data: saved && present(saved) });
  } catch (error) {
    await t.rollback();
    sendError(res, error, "Error revoking leave request");
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
    await notifyLeave(row, "ຄຳຂໍລາພັກບໍ່ໄດ້ຮັບການອະນຸມັດ", [`${dayText(row.start_date)} – ${dayText(row.end_date)}`, text(req.body?.note)], Number(actorOf(req)) || null);
    const saved = await findWithEmployee(row._uuid);
    res.status(200).json({ message: "ປະຕິເສດຄຳຂໍລາພັກແລ້ວ", data: saved && present(saved) });
  } catch (error) {
    sendError(res, error, "Error rejecting leave request");
  }
};
