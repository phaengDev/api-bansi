import moment from "moment";
import { Op, Transaction } from "sequelize";
import Company from "../../models/company";
import Holiday from "../../models/holiday";
import Attendance from "../../models/attendance";
import { BUSINESS_OFFSET } from "../bansi/journalHelpers";

/**
 * ກົດຂອງວັນເຮັດວຽກ ທີ່ການເຂົ້າ-ອອກວຽກ (attendanceController) ແລະ ເງິນເດືອນ (payrollController) ໃຊ້ຮ່ວມກັນ:
 * ເວລາເຂົ້າ-ອອກ + ວັນພັກປະຈຳອາທິດ ຈາກຂໍ້ມູນບໍລິສັດ, ວັນພັກລັດຖະການ (tbl_holiday), ໄລຍະການເຮັດວຽກຂອງພະນັກງານ
 * ແລະ ສະຖານະຂອງແຕ່ລະມື້. ເວລາທັງໝົດຄິດເປັນເວລາລາວ (+07:00)
 */

/** status ຂອງ tbl_attendance */
export const PRESENT = 1;
export const PAID_LEAVE = 2;
export const UNPAID_LEAVE = 3;
export const ATTENDANCE_STATUSES = [PRESENT, PAID_LEAVE, UNPAID_LEAVE];
/** source ຂອງ tbl_attendance */
export const BY_SCAN = 1;
export const BY_HR = 2;

/** work_status ຂອງພະນັກງານ */
export const WORKING = 1;
export const RESIGNED = 2;

/** ເດືອນ "YYYY-MM" */
export const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export type WorkRules = { start: string; end: string; daysOff: number[]; minutesPerDay: number };

export const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export const findCompany = (t?: Transaction) => Company.findOne({ order: [["_uuid", "ASC"]], transaction: t });

/** ເວລາເຮັດວຽກຂອງບໍລິສັດ — ຍັງບໍ່ໄດ້ຕັ້ງ = 08:00–17:00, ພັກ ເສົາ-ອາທິດ (ຄືຄ່າເລີ່ມຕົ້ນຂອງ tbl_company) */
export const workRulesOf = (company: Company | null): WorkRules => {
  const start = company?.work_start || "08:00";
  const end = company?.work_end || "17:00";
  const daysOff = company
    ? String(company.days_off ?? "").split(",").filter((d) => d !== "").map(Number)
    : [6, 0];
  return { start, end, daysOff, minutesPerDay: Math.max(1, minutesOf(end) - minutesOf(start)) };
};

export const nowLao = () => moment().utcOffset(BUSINESS_OFFSET);
export const todayLao = () => nowLao().format("YYYY-MM-DD");
export const currentPeriod = () => nowLao().format("YYYY-MM");

/** ເວລາ "HH:mm" (ລາວ) ຂອງ DATETIME */
export const clockOf = (value: Date | string | null | undefined) =>
  value ? moment(value).utcOffset(BUSINESS_OFFSET).format("HH:mm") : null;

/** ວັນທີ + "HH:mm" ເວລາລາວ → Date */
export const atLao = (date: string, hhmm: string) => moment(`${date}T${hhmm}:00${BUSINESS_OFFSET}`).toDate();

/** ມາຊ້າ / ອອກກ່ອນເວລາ (ນາທີ) — ຄິດສະເພາະມື້ເຮັດວຽກ */
export const lateEarlyOf = (rules: WorkRules, checkIn: Date | null, checkOut: Date | null, workday: boolean) => {
  if (!workday) return { late_minutes: 0, early_minutes: 0 };
  const inClock = clockOf(checkIn);
  const outClock = clockOf(checkOut);
  return {
    late_minutes: inClock ? Math.max(0, minutesOf(inClock) - minutesOf(rules.start)) : 0,
    early_minutes: outClock ? Math.max(0, minutesOf(rules.end) - minutesOf(outClock)) : 0,
  };
};

/** ໄລຍະຫ່າງ (ແມັດ) ລະຫວ່າງ 2 ພິກັດ — haversine */
export const distanceMeters = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const a = Math.sin(toRad(lat2 - lat1) / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lng2 - lng1) / 2) ** 2;
  return Math.round(2 * 6371000 * Math.asin(Math.sqrt(a)));
};

/** ວັນທຳອິດ / ສຸດທ້າຍ ແລະ ທຸກວັນທີຂອງເດືອນ */
export const monthOf = (period: string) => {
  const first = moment(`${period}-01`, "YYYY-MM-DD", true);
  const dates = Array.from({ length: first.daysInMonth() }, (_, i) => first.clone().add(i, "day").format("YYYY-MM-DD"));
  return { start: dates[0], end: dates[dates.length - 1], dates };
};

/** ວັນພັກລັດຖະການໃນຊ່ວງ → Map(ວັນທີ, ຊື່) */
export const holidaysBetween = async (start: string, end: string, t?: Transaction) => {
  const rows: any[] = await Holiday.findAll({
    where: { holiday_date: { [Op.between]: [start, end] } },
    attributes: ["holiday_date", "name"],
    raw: true,
    transaction: t,
  });
  return new Map(rows.map((r) => [String(r.holiday_date), String(r.name)]));
};

export const isWorkday = (date: string, rules: WorkRules, holidays: Map<string, string>) =>
  !rules.daysOff.includes(moment(date, "YYYY-MM-DD").day()) && !holidays.has(date);

type EmploymentRef = { start_date: string | null; end_date: string | null; work_status: number };

/** ເປັນພະນັກງານໃນວັນນັ້ນບໍ່ — ກ່ອນວັນເຂົ້າວຽກ ຫຼື ຫຼັງວັນລາອອກ ບໍ່ນັບ (ລາອອກແຕ່ບໍ່ມີວັນທີ = ບໍ່ນັບເລີຍ) */
export const employedOn = (emp: EmploymentRef, date: string) =>
  (!emp.start_date || String(emp.start_date) <= date)
  && (Number(emp.work_status) !== RESIGNED || (!!emp.end_date && String(emp.end_date) >= date));

/**
 * ສະຖານະຂອງມື້: present ມາວຽກ, late ມາຊ້າ (ເກີນນາທີຜ່ອນຜັນ), absent ຂາດວຽກ, leave ລາພັກ, unpaid ລາພັກບໍ່ໄດ້ເງິນ,
 * off ວັນພັກ, offwork ມາເຮັດວຽກວັນພັກ, pending ມື້ນີ້ຍັງບໍ່ສະແກນ, future ຍັງບໍ່ຮອດ, none ຍັງບໍ່ໄດ້ເຂົ້າວຽກ/ລາອອກແລ້ວ
 */
export type DayState = "present" | "late" | "absent" | "leave" | "unpaid" | "off" | "offwork" | "pending" | "future" | "none";

type DayRow = { status: number; late_minutes: number } | null | undefined;

export const dayStateOf = (date: string, workday: boolean, employed: boolean, row: DayRow, today: string, grace: number): DayState => {
  if (!employed) return "none";
  if (row) {
    const status = Number(row.status);
    if (status === PAID_LEAVE) return "leave";
    if (status === UNPAID_LEAVE) return "unpaid";
    if (!workday) return "offwork";
    return Number(row.late_minutes) > grace ? "late" : "present";
  }
  if (!workday) return "off";
  if (date > today) return "future";
  return date === today ? "pending" : "absent";
};

export type MonthStats = {
  /** ມື້ເຮັດວຽກທັງເດືອນ (ບໍ່ລວມວັນພັກ) */
  workdays: number;
  /** ມື້ເຮັດວຽກທີ່ເປັນພະນັກງານຢູ່ (ເຂົ້າວຽກກາງເດືອນ/ລາອອກ = ໜ້ອຍກວ່າ workdays) */
  employed_days: number;
  present_days: number;
  late_days: number;
  /** ນາທີມາຊ້າ / ອອກກ່ອນ ທີ່ເກີນນາທີຜ່ອນຜັນ (ມື້ທີ່ບໍ່ເກີນ ບໍ່ນັບ) */
  late_minutes: number;
  early_minutes: number;
  leave_days: number;
  unpaid_days: number;
  absent_days: number;
  offday_work_days: number;
  /** ມື້ເຮັດວຽກທີ່ຍັງບໍ່ຮອດ (ລວມມື້ນີ້ທີ່ຍັງບໍ່ສະແກນ) */
  pending_days: number;
};

/** ສະຖິຕິການເຂົ້າວຽກຂອງເດືອນ + ສະຖານະແຕ່ລະມື້ (ລຽງຕາມ dates) */
export const monthStatsOf = (
  emp: EmploymentRef,
  rows: Map<string, Attendance>,
  dates: string[],
  rules: WorkRules,
  holidays: Map<string, string>,
  today: string,
  grace: number
) => {
  const stats: MonthStats = {
    workdays: 0, employed_days: 0, present_days: 0, late_days: 0, late_minutes: 0, early_minutes: 0,
    leave_days: 0, unpaid_days: 0, absent_days: 0, offday_work_days: 0, pending_days: 0,
  };
  const states = dates.map((date) => {
    const workday = isWorkday(date, rules, holidays);
    const employed = employedOn(emp, date);
    if (workday) stats.workdays++;
    if (workday && employed) stats.employed_days++;
    const row = rows.get(date);
    const state = dayStateOf(date, workday, employed, row, today, grace);
    if (!employed) return state;
    if (state === "present" || state === "late") stats.present_days++;
    if (state === "late") stats.late_days++;
    if (state === "absent") stats.absent_days++;
    if (state === "offwork") stats.offday_work_days++;
    if (state === "pending" || state === "future") stats.pending_days++;
    if (workday && state === "leave") stats.leave_days++;
    if (workday && state === "unpaid") stats.unpaid_days++;
    if (workday && row && Number(row.status) === PRESENT) {
      const late = Number(row.late_minutes) || 0;
      const early = Number(row.early_minutes) || 0;
      if (late > grace) stats.late_minutes += late;
      if (early > grace) stats.early_minutes += early;
    }
    return state;
  });
  return { stats, states };
};

/** ແຖວການເຂົ້າວຽກຂອງຫຼາຍຄົນໃນຊ່ວງ → Map(employee_id, Map(ວັນທີ, ແຖວ)) */
export const attendanceByEmployee = async (employeeIds: number[], start: string, end: string, t?: Transaction) => {
  const result = new Map<number, Map<string, Attendance>>();
  if (!employeeIds.length) return result;
  const rows = await Attendance.findAll({
    where: { employee_id: { [Op.in]: employeeIds }, work_date: { [Op.between]: [start, end] } },
    transaction: t,
  });
  for (const row of rows) {
    const id = Number(row.employee_id);
    if (!result.has(id)) result.set(id, new Map());
    result.get(id)!.set(String(row.work_date), row);
  }
  return result;
};
