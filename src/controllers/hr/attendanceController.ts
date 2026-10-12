import { Request, Response } from "express";
import { timingSafeEqual } from "crypto";
import moment from "moment";
import { Op, UniqueConstraintError, col, fn } from "sequelize";
import Attendance from "../../models/attendance";
import Employee from "../../models/employee";
import Department from "../../models/department";
import Position from "../../models/position";
import Holiday from "../../models/holiday";
import Payroll from "../../models/payroll";
import Users from "../../models/userModel";
import { actorOf, decodeId, sendError, toDateOnly } from "../bansi/bansiHelpers";
import { profileUrl } from "./hrHelpers";
import { EMPLOYEE_TOKEN } from "../../middleware/auth";
import { QR_PREFIX } from "./companyController";
import { loadPayrollSettings } from "./payrollRules";
import { notifyAllWorking } from "./notificationController";
import {
  ATTENDANCE_STATUSES, BY_HR, BY_SCAN, HHMM, PERIOD, PRESENT, WORKING,
  atLao, attendanceByEmployee, clockOf, currentPeriod, dayStateOf, distanceMeters, employedOn, findCompany,
  holidaysBetween, isWorkday, lateEarlyOf, monthOf, monthStatsOf, nowLao, todayLao, workRulesOf,
  type DayState,
} from "./workCalendar";

/**
 * ການເຂົ້າ-ອອກວຽກ:
 * - ພະນັກງານ (app ມືຖື): POST /attendance/scan ດ້ວຍພິກັດ GPS — ຕ້ອງຢູ່ໃນໄລຍະສະແກນຂອງບໍລິສັດ, ບັນຊີຜູ້ໃຊ້ຕ້ອງຜູກກັບພະນັກງານ;
 *   GET /attendance/me = ປະຫວັດຂອງຕົນເອງ + ຂໍ້ມູນບໍລິສັດທີ່ app ຕ້ອງໃຊ້
 * - HR: ລາຍວັນ / ລາຍເດືອນ, ບັນທຶກ-ແກ້ໄຂແທນ (ລືມສະແກນ, ລາພັກ), ວັນພັກລັດຖະການ.
 * ເດືອນທີ່ຈ່າຍເງິນເດືອນແລ້ວ ແກ້ການເຂົ້າວຽກບໍ່ໄດ້ (ຍົກເລີກການຈ່າຍກ່ອນ)
 */

const PAID = 2;
/** ກົດສະແກນຊ້ຳພາຍໃນນີ້ (ວິນາທີ) ຫຼັງເຂົ້າວຽກ = ບໍ່ນັບເປັນອອກວຽກ (ກັນກົດສອງເທື່ອ) */
const MIN_GAP_SECONDS = 60;

const employeeInclude = [
  { model: Department, as: "department", attributes: ["_uuid", "depart_name"] },
  { model: Position, as: "position", attributes: ["_uuid", "position_name"] },
];

const employeeRef = (row: any) => {
  const e = row.get ? row.get({ plain: true }) : row;
  return {
    _uuid: e._uuid,
    emp_code: e.emp_code,
    first_name: e.first_name,
    last_name: e.last_name,
    phone: e.phone ?? null,
    profile_url: profileUrl(e.profile),
    department_id: e.department_id,
    department: e.department ?? null,
    position: e.position ?? null,
    start_date: e.start_date,
    end_date: e.end_date,
    work_status: e.work_status,
  };
};

const decimal = (value: unknown) => (value === null || value === undefined ? null : Number(value));

export const presentAttendance = (row: Attendance | null | undefined) => {
  if (!row) return null;
  const r: any = row.get({ plain: true });
  return {
    ...r,
    in_latitude: decimal(r.in_latitude),
    in_longitude: decimal(r.in_longitude),
    out_latitude: decimal(r.out_latitude),
    out_longitude: decimal(r.out_longitude),
    check_in_time: clockOf(r.check_in),
    check_out_time: clockOf(r.check_out),
  };
};

/** ເດືອນທີ່ຈ່າຍເງິນເດືອນແລ້ວ — ການເຂົ້າວຽກຂອງເດືອນນັ້ນລັອກ */
const paidPeriod = async (date: string) =>
  (await Payroll.count({ where: { period: date.slice(0, 7), status: PAID } })) > 0;

const lockedMessage = (date: string) =>
  `ເດືອນ ${moment(date).format("MM/YYYY")} ຈ່າຍເງິນເດືອນແລ້ວ — ແກ້ການເຂົ້າວຽກບໍ່ໄດ້ (ຍົກເລີກການຈ່າຍເງິນເດືອນກ່ອນ)`;

/**
 * ພະນັກງານເຈົ້າຂອງ token (route ຂໍ້ມູນຂອງຕົນເອງ /…/me ແລະ /attendance/scan): token ຂອງ app ພະນັກງານ (sub = ພະນັກງານ)
 * ຫຼື ຜູ້ໃຊ້ລະບົບທີ່ຜູກກັບພະນັກງານ — ບັນຊີປິດ / ບໍ່ຜູກ / ລາອອກ = error
 */
export const selfEmployee = async (req: Request): Promise<{ employee: Employee } | { code: number; message: string }> => {
  const id = Number(req.user?.sub);
  // token ຂອງ app ພະນັກງານ (POST /app/login) — sub = ລະຫັດພະນັກງານໂດຍກົງ
  if (req.user?.typ === EMPLOYEE_TOKEN) {
    const employee = Number.isInteger(id) && id > 0 ? await Employee.findByPk(id, { include: employeeInclude }) : null;
    if (!employee || Number(employee.work_status) !== WORKING) return { code: 401, message: "ພະນັກງານນີ້ບໍ່ໄດ້ເຮັດວຽກຢູ່ແລ້ວ" };
    return { employee };
  }
  // token ຂອງຜູ້ໃຊ້ລະບົບ — ຕ້ອງຜູກກັບພະນັກງານ
  const user: any = Number.isInteger(id) && id > 0
    ? await Users.findByPk(id, { attributes: ["user_uuid", "status", "employee_id"] })
    : null;
  if (!user || Number(user.status) !== 1) return { code: 401, message: "ບັນຊີຜູ້ໃຊ້ຖືກປິດໃຊ້ງານ" };
  if (!user.employee_id) return { code: 400, message: "ບັນຊີນີ້ບໍ່ໄດ້ຜູກກັບພະນັກງານ — ຕິດຕໍ່ HR" };
  const employee = await Employee.findByPk(user.employee_id, { include: employeeInclude });
  if (!employee || Number(employee.work_status) !== WORKING) return { code: 400, message: "ພະນັກງານນີ້ບໍ່ໄດ້ເຮັດວຽກຢູ່ແລ້ວ" };
  return { employee };
};

/** ປຽບທຽບລະຫັດລັບແບບເວລາຄົງທີ່ (ບໍ່ໃຫ້ເດົາທີລະຕົວຈາກເວລາຕອບ) */
const sameSecret = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

const coordinate = (value: unknown, limit: number) => {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) <= limit ? Math.round(n * 1e7) / 1e7 : null;
};

/**
 * POST /attendance/scan { latitude, longitude, accuracy?, type?: "in" | "out", qr? } — ສະແກນດ້ວຍ GPS ຂອງມືຖື
 * (+ ຂໍ້ຄວາມຈາກ QR ທີ່ຕິດໄວ້ບໍລິສັດ: ບັງຄັບເມື່ອ scan_require_qr = 1, ສົ່ງມາແລ້ວຕ້ອງຖືກຕ້ອງສະເໝີ).
 * ບໍ່ສົ່ງ type: ຍັງບໍ່ເຂົ້າວຽກ = ເຂົ້າວຽກ, ເຂົ້າແລ້ວ = ອອກວຽກ (ສະແກນອອກຊ້ຳ = ເວລາອອກລ່າສຸດ).
 * ນອກໄລຍະສະແກນ = 400 ພ້ອມ distance / radius
 */
export const scanAttendance = async (req: Request, res: Response) => {
  try {
    const self = await selfEmployee(req);
    if ("code" in self) {
      res.status(self.code).json({ message: self.message });
      return;
    }
    const { employee } = self;
    const company = await findCompany();
    const companyLat = decimal(company?.latitude);
    const companyLng = decimal(company?.longitude);
    if (!company || companyLat === null || companyLng === null) {
      res.status(400).json({ message: "ບໍລິສັດຍັງບໍ່ໄດ້ປັກໝຸດທີ່ຕັ້ງ — ສະແກນບໍ່ໄດ້ (ຕິດຕໍ່ HR)" });
      return;
    }

    const body = req.body || {};
    // QR ທີ່ຕິດໄວ້ບໍລິສັດ — ສົ່ງມາຕ້ອງຖືກຕ້ອງ; ບໍລິສັດບັງຄັບ QR = ຕ້ອງສົ່ງມາທຸກຄັ້ງ
    const qr = String(body.qr ?? "").trim();
    if (qr || Number(company.scan_require_qr) === 1) {
      if (!qr) {
        res.status(400).json({ message: "ກະລຸນາສະແກນ QR ທີ່ຕິດໄວ້ບໍລິສັດ" });
        return;
      }
      const token = qr.startsWith(QR_PREFIX) ? qr.slice(QR_PREFIX.length) : qr;
      if (!company.scan_token || !sameSecret(token, company.scan_token)) {
        res.status(400).json({ message: "QR ບໍ່ຖືກຕ້ອງ ຫຼື ຖືກປ່ຽນແລ້ວ — ສະແກນ QR ອັນໃໝ່ທີ່ບໍລິສັດ" });
        return;
      }
    }

    const lat = coordinate(body.latitude, 90);
    const lng = coordinate(body.longitude, 180);
    if (lat === null || lng === null) {
      res.status(400).json({ message: "ບໍ່ໄດ້ຮັບພິກັດ GPS — ເປີດ Location ແລ້ວລອງໃໝ່" });
      return;
    }
    const accuracy = Number.isFinite(Number(body.accuracy)) && Number(body.accuracy) >= 0 ? Math.round(Number(body.accuracy)) : null;
    const distance = distanceMeters(companyLat, companyLng, lat, lng);
    const radius = Number(company.scan_radius) || 0;
    if (distance > radius) {
      res.status(400).json({ message: `ທ່ານຢູ່ຫ່າງຈາກບໍລິສັດ ${distance} ແມັດ (ສະແກນໄດ້ພາຍໃນ ${radius} ແມັດ)`, distance, radius });
      return;
    }

    const type = body.type === "in" || body.type === "out" ? body.type : null;
    const now = nowLao();
    const date = now.format("YYYY-MM-DD");
    const rules = workRulesOf(company);
    const workday = isWorkday(date, rules, await holidaysBetween(date, date));
    const at = now.toDate();

    const t = await Attendance.sequelize!.transaction();
    try {
      const row = await Attendance.findOne({ where: { employee_id: employee._uuid, work_date: date }, transaction: t, lock: t.LOCK.UPDATE });
      const reject = async (message: string) => {
        await t.rollback();
        res.status(400).json({ message });
      };
      const checkIn = { in_latitude: lat, in_longitude: lng, in_distance: distance, in_accuracy: accuracy };
      let saved: Attendance;
      let kind: "in" | "out";

      if (!row || !row.check_in) {
        if (type === "out") return reject("ຍັງບໍ່ໄດ້ສະແກນເຂົ້າວຽກມື້ນີ້");
        kind = "in";
        const values = { check_in: at, ...checkIn, status: PRESENT, ...lateEarlyOf(rules, at, row?.check_out ?? null, workday) };
        saved = row
          ? await row.update({ ...values, updatedAt: new Date() }, { transaction: t })
          : await Attendance.create({ employee_id: employee._uuid, work_date: date, ...values, source: BY_SCAN }, { transaction: t });
      } else {
        if (type === "in") return reject(`ສະແກນເຂົ້າວຽກແລ້ວ ເວລາ ${clockOf(row.check_in)}`);
        if (!type && !row.check_out && now.diff(moment(row.check_in), "seconds") < MIN_GAP_SECONDS) {
          return reject(`ຫາກໍ່ສະແກນເຂົ້າວຽກ ເວລາ ${clockOf(row.check_in)} — ສະແກນອອກວຽກພາຍຫຼັງ`);
        }
        kind = "out";
        saved = await row.update({
          check_out: at, out_latitude: lat, out_longitude: lng, out_distance: distance, out_accuracy: accuracy,
          ...lateEarlyOf(rules, row.check_in, at, workday),
          updatedAt: new Date(),
        }, { transaction: t });
      }
      await t.commit();

      const record = presentAttendance(saved);
      res.status(200).json({
        message: kind === "in" ? "ສະແກນເຂົ້າວຽກສຳເລັດ" : "ສະແກນອອກວຽກສຳເລັດ",
        data: {
          type: kind,
          date,
          time: now.format("HH:mm"),
          distance,
          workday,
          late_minutes: record?.late_minutes ?? 0,
          early_minutes: record?.early_minutes ?? 0,
          record,
        },
      });
    } catch (error) {
      await t.rollback();
      throw error;
    }
  } catch (error) {
    // ກົດສອງເທື່ອພ້ອມກັນ (UNIQUE employee_id + work_date)
    if (error instanceof UniqueConstraintError) {
      res.status(409).json({ message: "ກຳລັງບັນທຶກການສະແກນ — ລອງໃໝ່ອີກຄັ້ງ" });
      return;
    }
    sendError(res, error, "Error scanning attendance");
  }
};

/**
 * GET /attendance/me?month=YYYY-MM — ການເຂົ້າວຽກຂອງຕົນເອງ (app): ພະນັກງານ, ບໍລິສັດ (ພິກັດ, ໄລຍະ, ເວລາ),
 * ມື້ນີ້, ແຖວຂອງເດືອນ, ສະຖານະແຕ່ລະມື້ ແລະ ສະຫຼຸບ
 */
export const getMyAttendance = async (req: Request, res: Response) => {
  try {
    const self = await selfEmployee(req);
    if ("code" in self) {
      res.status(self.code).json({ message: self.message });
      return;
    }
    const { employee } = self;
    const month = String(req.query.month ?? "");
    const period = PERIOD.test(month) ? month : currentPeriod();
    const { start, end, dates } = monthOf(period);
    const today = todayLao();
    const [company, settings, holidays, rowsById, todayRow] = await Promise.all([
      findCompany(),
      loadPayrollSettings(),
      holidaysBetween(start, end),
      attendanceByEmployee([employee._uuid], start, end),
      Attendance.findOne({ where: { employee_id: employee._uuid, work_date: today } }),
    ]);
    const rules = workRulesOf(company);
    const rows = rowsById.get(employee._uuid) ?? new Map();
    const { stats, states } = monthStatsOf(employee as any, rows, dates, rules, holidays, today, settings.late_grace_minutes);
    const todayHolidays = await holidaysBetween(today, today);

    res.status(200).json({
      employee: employeeRef(employee),
      company: company && {
        name_la: company.name_la,
        name_en: company.name_en,
        latitude: decimal(company.latitude),
        longitude: decimal(company.longitude),
        scan_radius: company.scan_radius,
        // ຕ້ອງສະແກນ QR ທີ່ຕິດໄວ້ບໍລິສັດນຳ (app ເປີດກ້ອງກ່ອນສົ່ງ /attendance/scan)
        require_qr: Number(company.scan_require_qr) === 1,
        work_start: rules.start,
        work_end: rules.end,
        days_off: rules.daysOff,
      },
      today: {
        date: today,
        workday: isWorkday(today, rules, todayHolidays),
        holiday: todayHolidays.get(today) ?? null,
        record: presentAttendance(todayRow),
      },
      period,
      days: dates.map((date, i) => ({
        date,
        workday: isWorkday(date, rules, holidays),
        holiday: holidays.get(date) ?? null,
        state: states[i],
        record: presentAttendance(rows.get(date)),
      })),
      summary: stats,
    });
  } catch (error) {
    sendError(res, error, "Error getting my attendance");
  }
};

const countStates = (states: DayState[]) =>
  states.reduce<Record<string, number>>((acc, state) => ({ ...acc, [state]: (acc[state] ?? 0) + 1 }), {});

/**
 * POST /attendance/daily { date? } — ທຸກຄົນທີ່ເປັນພະນັກງານໃນວັນນັ້ນ + ແຖວການເຂົ້າວຽກ + ສະຖານະ; ບໍ່ສົ່ງ = ມື້ນີ້
 */
export const getDailyAttendance = async (req: Request, res: Response) => {
  try {
    const date = toDateOnly(req.body?.date) ?? todayLao();
    const today = todayLao();
    const [company, settings, holidays, employees] = await Promise.all([
      findCompany(),
      loadPayrollSettings(),
      holidaysBetween(date, date),
      Employee.findAll({ include: employeeInclude, order: [["emp_code", "ASC"]] }),
    ]);
    const rules = workRulesOf(company);
    const workday = isWorkday(date, rules, holidays);
    const staff = employees.filter((e) => employedOn(e as any, date));
    const rows = await attendanceByEmployee(staff.map((e) => e._uuid), date, date);
    const data = staff.map((e) => {
      const row = rows.get(e._uuid)?.get(date);
      return {
        employee: employeeRef(e),
        record: presentAttendance(row),
        state: dayStateOf(date, workday, true, row, today, settings.late_grace_minutes),
      };
    });

    res.status(200).json({
      date,
      workday,
      holiday: holidays.get(date) ?? null,
      work_start: rules.start,
      work_end: rules.end,
      grace: settings.late_grace_minutes,
      locked: await paidPeriod(date),
      data,
      summary: { total: data.length, ...countStates(data.map((d) => d.state)) },
    });
  } catch (error) {
    sendError(res, error, "Error getting daily attendance");
  }
};

/**
 * POST /attendance/monthly { month? } — ຕາຕະລາງເດືອນ: ທຸກຄົນທີ່ເປັນພະນັກງານຢ່າງໜ້ອຍ 1 ມື້ໃນເດືອນ,
 * ສະຖິຕິ + ສະຖານະແຕ່ລະມື້ (states ລຽງຕາມ days)
 */
export const getMonthlyAttendance = async (req: Request, res: Response) => {
  try {
    const month = String(req.body?.month ?? "");
    const period = PERIOD.test(month) ? month : currentPeriod();
    const { start, end, dates } = monthOf(period);
    const today = todayLao();
    const [company, settings, holidays, employees, locked] = await Promise.all([
      findCompany(),
      loadPayrollSettings(),
      holidaysBetween(start, end),
      Employee.findAll({ include: employeeInclude, order: [["emp_code", "ASC"]] }),
      paidPeriod(start),
    ]);
    const rules = workRulesOf(company);
    const staff = employees.filter((e) => dates.some((d) => employedOn(e as any, d)));
    const rows = await attendanceByEmployee(staff.map((e) => e._uuid), start, end);
    const data = staff.map((e) => {
      const { stats, states } = monthStatsOf(e as any, rows.get(e._uuid) ?? new Map(), dates, rules, holidays, today, settings.late_grace_minutes);
      return { employee: employeeRef(e), stats, states };
    });

    res.status(200).json({
      period,
      today,
      work_start: rules.start,
      work_end: rules.end,
      grace: settings.late_grace_minutes,
      locked,
      days: dates.map((date) => ({ date, workday: isWorkday(date, rules, holidays), holiday: holidays.get(date) ?? null })),
      data,
    });
  } catch (error) {
    sendError(res, error, "Error getting monthly attendance");
  }
};

/**
 * POST /attendance/records { employee_id, month? } — ແຖວການເຂົ້າວຽກຂອງຄົນດຽວໃນເດືອນ (ລາຍລະອຽດ: ເວລາ, ໄລຍະຫ່າງ, ໝາຍເຫດ)
 */
export const getEmployeeAttendance = async (req: Request, res: Response) => {
  try {
    const employeeId = Number(req.body?.employee_id);
    const month = String(req.body?.month ?? "");
    const period = PERIOD.test(month) ? month : currentPeriod();
    const employee = Number.isInteger(employeeId) ? await Employee.findByPk(employeeId, { include: employeeInclude }) : null;
    if (!employee) {
      res.status(404).json({ message: "ບໍ່ພົບພະນັກງານ" });
      return;
    }
    const { start, end, dates } = monthOf(period);
    const today = todayLao();
    const [company, settings, holidays, rowsById, locked] = await Promise.all([
      findCompany(),
      loadPayrollSettings(),
      holidaysBetween(start, end),
      attendanceByEmployee([employeeId], start, end),
      paidPeriod(start),
    ]);
    const rules = workRulesOf(company);
    const rows = rowsById.get(employeeId) ?? new Map();
    const { stats, states } = monthStatsOf(employee as any, rows, dates, rules, holidays, today, settings.late_grace_minutes);

    res.status(200).json({
      period,
      locked,
      employee: employeeRef(employee),
      work_start: rules.start,
      work_end: rules.end,
      grace: settings.late_grace_minutes,
      days: dates.map((date, i) => ({
        date,
        workday: isWorkday(date, rules, holidays),
        holiday: holidays.get(date) ?? null,
        state: states[i],
        record: presentAttendance(rows.get(date)),
      })),
      summary: stats,
    });
  } catch (error) {
    sendError(res, error, "Error getting employee attendance");
  }
};

/**
 * POST /attendance/save { employee_id, work_date, status, check_in?, check_out?, note? } — HR ບັນທຶກ/ແກ້ໄຂແທນ
 * (1 ແຖວ ຕໍ່ ຄົນ ຕໍ່ ມື້). ມາວຽກ = ຕ້ອງມີເວລາເຂົ້າ "HH:mm" (ເວລາອອກບໍ່ບັງຄັບ ແຕ່ຕ້ອງຫຼັງເວລາເຂົ້າ); ລາພັກ = ບໍ່ມີເວລາ
 */
export const saveAttendance = async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const employeeId = Number(body.employee_id);
    const date = toDateOnly(body.work_date);
    const status = Number(body.status);
    const fail = (message: string) => res.status(400).json({ message });
    const employee: any = Number.isInteger(employeeId) ? await Employee.findByPk(employeeId) : null;
    if (!employee) return fail("ບໍ່ພົບພະນັກງານ");
    if (!date) return fail("ວັນທີບໍ່ຖືກຕ້ອງ");
    if (date > todayLao()) return fail("ວັນທີຕ້ອງບໍ່ເກີນມື້ນີ້");
    if (!employedOn(employee, date)) return fail("ວັນທີນີ້ ພະນັກງານຍັງບໍ່ໄດ້ເຂົ້າວຽກ ຫຼື ລາອອກແລ້ວ");
    if (!ATTENDANCE_STATUSES.includes(status)) return fail("ສະຖານະບໍ່ຖືກຕ້ອງ");
    if (await paidPeriod(date)) return fail(lockedMessage(date));

    const inText = String(body.check_in ?? "").trim();
    const outText = String(body.check_out ?? "").trim();
    if (status === PRESENT) {
      if (!HHMM.test(inText)) return fail("ກະລຸນາປ້ອນເວລາເຂົ້າວຽກ (HH:mm)");
      if (outText && !HHMM.test(outText)) return fail("ເວລາອອກວຽກບໍ່ຖືກຕ້ອງ (HH:mm)");
      if (outText && outText <= inText) return fail("ເວລາອອກວຽກຕ້ອງຫຼັງເວລາເຂົ້າວຽກ");
    }

    const company = await findCompany();
    const rules = workRulesOf(company);
    const workday = isWorkday(date, rules, await holidaysBetween(date, date));
    const row = await Attendance.findOne({ where: { employee_id: employeeId, work_date: date } });
    // ເວລາເທົ່າເດີມ = ຮັກສາເວລາຈິງຂອງການສະແກນ (ວິນາທີ) ແລະ ພິກັດໄວ້
    const keep = (current: Date | null | undefined, text: string, prefix: "in" | "out") => {
      if (!text) return { [`check_${prefix}`]: null, [`${prefix}_latitude`]: null, [`${prefix}_longitude`]: null, [`${prefix}_distance`]: null, [`${prefix}_accuracy`]: null };
      if (current && clockOf(current) === text) return { [`check_${prefix}`]: current };
      return { [`check_${prefix}`]: atLao(date, text), [`${prefix}_latitude`]: null, [`${prefix}_longitude`]: null, [`${prefix}_distance`]: null, [`${prefix}_accuracy`]: null };
    };
    const times: Record<string, any> = status === PRESENT
      ? { ...keep(row?.check_in, inText, "in"), ...keep(row?.check_out, outText, "out") }
      : { ...keep(null, "", "in"), ...keep(null, "", "out") };
    const values = {
      ...times,
      ...(status === PRESENT ? lateEarlyOf(rules, times.check_in, times.check_out, workday) : { late_minutes: 0, early_minutes: 0 }),
      status,
      source: BY_HR,
      note: String(body.note ?? "").trim().slice(0, 255) || null,
      updatedbyid: Number(actorOf(req)) || null,
    };
    const saved = row
      ? await row.update({ ...values, updatedAt: new Date() })
      : await Attendance.create({ employee_id: employeeId, work_date: date, ...values });
    res.status(200).json({ message: "Successfully saved attendance", data: presentAttendance(saved) });
  } catch (error) {
    sendError(res, error, "Error saving attendance");
  }
};

/** DELETE /attendance/:id — ລຶບແຖວ (ມື້ເຮັດວຽກທີ່ບໍ່ມີແຖວ = ຂາດວຽກ) */
export const deleteAttendance = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const row = await Attendance.findByPk(decodeId(req));
    if (!row) {
      res.status(404).json({ message: "ບໍ່ພົບຂໍ້ມູນການເຂົ້າວຽກ" });
      return;
    }
    if (await paidPeriod(String(row.work_date))) {
      res.status(400).json({ message: lockedMessage(String(row.work_date)) });
      return;
    }
    await row.destroy();
    res.status(200).json({ message: "Successfully deleted attendance" });
  } catch (error) {
    sendError(res, error, "Error deleting attendance");
  }
};

// ================= ວັນພັກລັດຖະການ

/** GET /holiday/fetch?year=YYYY — ບໍ່ສົ່ງ = ປີນີ້ */
export const getHolidays = async (req: Request, res: Response) => {
  try {
    const year = /^\d{4}$/.test(String(req.query.year ?? "")) ? String(req.query.year) : nowLao().format("YYYY");
    const data = await Holiday.findAll({
      where: { holiday_date: { [Op.between]: [`${year}-01-01`, `${year}-12-31`] } },
      order: [["holiday_date", "ASC"]],
    });
    res.status(200).json({ data, year });
  } catch (error) {
    sendError(res, error, "Error getting holidays");
  }
};

/**
 * GET /holiday/me?year=YYYY — ວັນພັກລັດຖະການສຳລັບ app ມືຖື: ວັນພັກຂອງປີ (workday = ກົງມື້ເຮັດວຽກ, ບໍ່ແມ່ນວັນພັກປະຈຳອາທິດ)
 * + ຈຳນວນວັນພັກຂອງແຕ່ລະປີທີ່ HR ບັນທຶກໄວ້
 */
export const getMyHolidays = async (req: Request, res: Response) => {
  try {
    const self = await selfEmployee(req);
    if ("code" in self) {
      res.status(self.code).json({ message: self.message });
      return;
    }
    const today = todayLao();
    const year = /^\d{4}$/.test(String(req.query.year ?? "")) ? String(req.query.year) : today.slice(0, 4);
    const yearOf = fn("YEAR", col("holiday_date"));
    const [rows, years, company] = await Promise.all([
      Holiday.findAll({
        where: { holiday_date: { [Op.between]: [`${year}-01-01`, `${year}-12-31`] } },
        attributes: ["_uuid", "holiday_date", "name", "kind"],
        order: [["holiday_date", "ASC"]],
        raw: true,
      }),
      Holiday.findAll({
        attributes: [[yearOf, "year"], [fn("COUNT", col("_uuid")), "total"]],
        group: [yearOf],
        order: [[yearOf, "DESC"]],
        raw: true,
      }),
      findCompany(),
    ]);
    const rules = workRulesOf(company);
    const data = (rows as any[]).map((r) => {
      const date = String(r.holiday_date);
      return {
        _uuid: r._uuid,
        holiday_date: date,
        name: r.name,
        kind: Number(r.kind) || 1, // 1 ທາງການ, 2 ບໍ່ເປັນທາງການ (ບໍລິສັດປະກາດພັກເອງ)
        workday: !rules.daysOff.includes(moment(date, "YYYY-MM-DD").day()),
      };
    });
    res.status(200).json({
      year,
      today,
      days_off: rules.daysOff,
      data,
      summary: {
        total: data.length,
        on_workdays: data.filter((d) => d.workday).length,
        upcoming: data.filter((d) => d.holiday_date >= today).length,
      },
      years: (years as any[]).map((y) => ({ year: Number(y.year), total: Number(y.total) || 0 })),
    });
  } catch (error) {
    sendError(res, error, "Error getting my holidays");
  }
};

/** ປະເພດວັນພັກ — 1 ທາງການ (ລັດຖະການ, ບັນທຶກມື້ລະລາຍການ), 2 ບໍ່ເປັນທາງການ (ບໍລິສັດປະກາດເອງ, ເລືອກເປັນຊ່ວງວັນທີ) */
const HOLIDAY_OFFICIAL = 1;
const HOLIDAY_COMPANY = 2;
const HOLIDAY_KINDS = [HOLIDAY_OFFICIAL, HOLIDAY_COMPANY];

/**
 * POST /holiday/create { items: [{ holiday_date, name, kind }] } — ບັນທຶກຫຼາຍວັນພ້ອມກັນ (ເຊັ່ນ ຄັດລອກວັນພັກຈາກປີກ່ອນ);
 * ວັນທີຕ້ອງບໍ່ຊ້ຳກັນ ແລະ ບໍ່ຊ້ຳກັບທີ່ມີແລ້ວ — ຜິດລາຍການດຽວ ບໍ່ບັນທຶກຈັກລາຍການ
 */
export const createHoliday = async (req: Request, res: Response) => {
  try {
    const raw: any[] = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!raw.length) {
      res.status(400).json({ message: "ກະລຸນາເພີ່ມວັນພັກຢ່າງໜ້ອຍ 1 ວັນ" });
      return;
    }
    if (raw.length > 100) {
      res.status(400).json({ message: "ບັນທຶກໄດ້ເທື່ອລະບໍ່ເກີນ 100 ວັນ" });
      return;
    }
    const items: { holiday_date: string; name: string; kind: number }[] = [];
    for (const item of raw) {
      const date = toDateOnly(item?.holiday_date);
      const name = String(item?.name ?? "").trim().slice(0, 150);
      const kind = Number(item?.kind ?? 1);
      if (!HOLIDAY_KINDS.includes(kind)) {
        res.status(400).json({ message: "ປະເພດວັນພັກບໍ່ຖືກຕ້ອງ" });
        return;
      }
      if (!date) {
        res.status(400).json({ message: "ວັນທີບໍ່ຖືກຕ້ອງ" });
        return;
      }
      if (!name) {
        res.status(400).json({ message: `ກະລຸນາປ້ອນຊື່ວັນພັກ ວັນທີ ${moment(date).format("DD/MM/YYYY")}` });
        return;
      }
      if (items.some((x) => x.holiday_date === date)) {
        res.status(400).json({ message: `ວັນທີ ${moment(date).format("DD/MM/YYYY")} ຊ້ຳກັນໃນລາຍການ` });
        return;
      }
      items.push({ holiday_date: date, name, kind });
    }
    const taken = await Holiday.findOne({ where: { holiday_date: items.map((x) => x.holiday_date) } });
    if (taken) {
      res.status(400).json({ message: `ວັນທີ ${moment(taken.holiday_date).format("DD/MM/YYYY")} ເປັນວັນພັກຢູ່ແລ້ວ` });
      return;
    }
    const createdbyid = Number(actorOf(req)) || null;
    const data = await Holiday.bulkCreate(items.map((x) => ({ ...x, createdbyid })));
    // ແຈ້ງພະນັກງານທຸກຄົນ — ສະເພາະວັນພັກທີ່ຍັງບໍ່ຮອດ
    const today = todayLao();
    const upcoming = items.filter((x) => x.holiday_date >= today).sort((a, b) => a.holiday_date.localeCompare(b.holiday_date));
    const dayText = (d: string) => moment(d).format("DD/MM/YYYY");
    // ທາງການ: ເພີ່ມຫຼາຍວັນພ້ອມກັນ (ເຊັ່ນ ທັງປີ) ແຈ້ງເທື່ອດຽວ
    const official = upcoming.filter((x) => x.kind === HOLIDAY_OFFICIAL);
    if (official.length) {
      await notifyAllWorking({
        type: "holiday",
        title: official.length === 1 ? `ວັນພັກ: ${official[0].name} 🏖️` : `ເພີ່ມວັນພັກໃໝ່ ${official.length} ວັນ 🏖️`,
        body: official.length === 1
          ? `ວັນທີ ${dayText(official[0].holiday_date)} ບໍລິສັດພັກວຽກ`
          : official.slice(0, 5).map((x) => `${dayText(x.holiday_date)} ${x.name}`).join("\n") + (official.length > 5 ? "\n…" : ""),
        ref: `holiday:${official[0].holiday_date.slice(0, 4)}`,
        createdbyid,
      });
    }
    // ບໍ່ເປັນທາງການ (ບໍລິສັດປະກາດເອງ): ແຈ້ງແຕ່ລະຊ່ວງ — ມື້ຕິດກັນ ຊື່ດຽວກັນ = ຊ່ວງດຽວ (ເຊັ່ນ ໄປທ່ຽວ 04–05/05)
    const runs: { name: string; start: string; end: string; days: number }[] = [];
    for (const x of upcoming.filter((h) => h.kind === HOLIDAY_COMPANY)) {
      const last = runs[runs.length - 1];
      if (last && last.name === x.name && moment(last.end).add(1, "day").format("YYYY-MM-DD") === x.holiday_date) {
        last.end = x.holiday_date;
        last.days++;
      } else {
        runs.push({ name: x.name, start: x.holiday_date, end: x.holiday_date, days: 1 });
      }
    }
    for (const run of runs) {
      await notifyAllWorking({
        type: "holiday",
        title: `ບໍລິສັດປະກາດພັກ: ${run.name} 🎉`,
        body: run.days === 1
          ? `ວັນທີ ${dayText(run.start)} ພະນັກງານທຸກຄົນພັກວຽກ`
          : `ວັນທີ ${dayText(run.start)} – ${dayText(run.end)} (${run.days} ມື້) ພະນັກງານທຸກຄົນພັກວຽກ`,
        ref: `holiday:${run.start}`,
        createdbyid,
      });
    }
    res.status(200).json({ message: "Successfully created holidays", data });
  } catch (error) {
    sendError(res, error, "Error creating holiday");
  }
};

/** DELETE /holiday/:id */
export const deleteHoliday = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const row = await Holiday.findByPk(decodeId(req));
    if (!row) {
      res.status(404).json({ message: "ບໍ່ພົບວັນພັກ" });
      return;
    }
    await row.destroy();
    res.status(200).json({ message: "Successfully deleted holiday" });
  } catch (error) {
    sendError(res, error, "Error deleting holiday");
  }
};
