"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.attendanceByEmployee = exports.monthStatsOf = exports.dayStateOf = exports.employedOn = exports.isWorkday = exports.holidaysBetween = exports.monthOf = exports.distanceMeters = exports.lateEarlyOf = exports.atLao = exports.clockOf = exports.currentPeriod = exports.todayLao = exports.nowLao = exports.workRulesOf = exports.findCompany = exports.minutesOf = exports.HHMM = exports.PERIOD = exports.RESIGNED = exports.WORKING = exports.BY_HR = exports.BY_SCAN = exports.ATTENDANCE_STATUSES = exports.UNPAID_LEAVE = exports.PAID_LEAVE = exports.PRESENT = void 0;
const moment_1 = __importDefault(require("moment"));
const sequelize_1 = require("sequelize");
const company_1 = __importDefault(require("../../models/company"));
const holiday_1 = __importDefault(require("../../models/holiday"));
const attendance_1 = __importDefault(require("../../models/attendance"));
const journalHelpers_1 = require("../bansi/journalHelpers");
/**
 * ກົດຂອງວັນເຮັດວຽກ ທີ່ການເຂົ້າ-ອອກວຽກ (attendanceController) ແລະ ເງິນເດືອນ (payrollController) ໃຊ້ຮ່ວມກັນ:
 * ເວລາເຂົ້າ-ອອກ + ວັນພັກປະຈຳອາທິດ ຈາກຂໍ້ມູນບໍລິສັດ, ວັນພັກລັດຖະການ (tbl_holiday), ໄລຍະການເຮັດວຽກຂອງພະນັກງານ
 * ແລະ ສະຖານະຂອງແຕ່ລະມື້. ເວລາທັງໝົດຄິດເປັນເວລາລາວ (+07:00)
 */
/** status ຂອງ tbl_attendance */
exports.PRESENT = 1;
exports.PAID_LEAVE = 2;
exports.UNPAID_LEAVE = 3;
exports.ATTENDANCE_STATUSES = [exports.PRESENT, exports.PAID_LEAVE, exports.UNPAID_LEAVE];
/** source ຂອງ tbl_attendance */
exports.BY_SCAN = 1;
exports.BY_HR = 2;
/** work_status ຂອງພະນັກງານ */
exports.WORKING = 1;
exports.RESIGNED = 2;
/** ເດືອນ "YYYY-MM" */
exports.PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
exports.HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutesOf = (hhmm) => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
};
exports.minutesOf = minutesOf;
const findCompany = (t) => company_1.default.findOne({ order: [["_uuid", "ASC"]], transaction: t });
exports.findCompany = findCompany;
/** ເວລາເຮັດວຽກຂອງບໍລິສັດ — ຍັງບໍ່ໄດ້ຕັ້ງ = 08:00–17:00, ພັກ ເສົາ-ອາທິດ (ຄືຄ່າເລີ່ມຕົ້ນຂອງ tbl_company) */
const workRulesOf = (company) => {
    const start = company?.work_start || "08:00";
    const end = company?.work_end || "17:00";
    const daysOff = company
        ? String(company.days_off ?? "").split(",").filter((d) => d !== "").map(Number)
        : [6, 0];
    return { start, end, daysOff, minutesPerDay: Math.max(1, (0, exports.minutesOf)(end) - (0, exports.minutesOf)(start)) };
};
exports.workRulesOf = workRulesOf;
const nowLao = () => (0, moment_1.default)().utcOffset(journalHelpers_1.BUSINESS_OFFSET);
exports.nowLao = nowLao;
const todayLao = () => (0, exports.nowLao)().format("YYYY-MM-DD");
exports.todayLao = todayLao;
const currentPeriod = () => (0, exports.nowLao)().format("YYYY-MM");
exports.currentPeriod = currentPeriod;
/** ເວລາ "HH:mm" (ລາວ) ຂອງ DATETIME */
const clockOf = (value) => value ? (0, moment_1.default)(value).utcOffset(journalHelpers_1.BUSINESS_OFFSET).format("HH:mm") : null;
exports.clockOf = clockOf;
/** ວັນທີ + "HH:mm" ເວລາລາວ → Date */
const atLao = (date, hhmm) => (0, moment_1.default)(`${date}T${hhmm}:00${journalHelpers_1.BUSINESS_OFFSET}`).toDate();
exports.atLao = atLao;
/** ມາຊ້າ / ອອກກ່ອນເວລາ (ນາທີ) — ຄິດສະເພາະມື້ເຮັດວຽກ */
const lateEarlyOf = (rules, checkIn, checkOut, workday) => {
    if (!workday)
        return { late_minutes: 0, early_minutes: 0 };
    const inClock = (0, exports.clockOf)(checkIn);
    const outClock = (0, exports.clockOf)(checkOut);
    return {
        late_minutes: inClock ? Math.max(0, (0, exports.minutesOf)(inClock) - (0, exports.minutesOf)(rules.start)) : 0,
        early_minutes: outClock ? Math.max(0, (0, exports.minutesOf)(rules.end) - (0, exports.minutesOf)(outClock)) : 0,
    };
};
exports.lateEarlyOf = lateEarlyOf;
/** ໄລຍະຫ່າງ (ແມັດ) ລະຫວ່າງ 2 ພິກັດ — haversine */
const distanceMeters = (lat1, lng1, lat2, lng2) => {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const a = Math.sin(toRad(lat2 - lat1) / 2) ** 2
        + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lng2 - lng1) / 2) ** 2;
    return Math.round(2 * 6371000 * Math.asin(Math.sqrt(a)));
};
exports.distanceMeters = distanceMeters;
/** ວັນທຳອິດ / ສຸດທ້າຍ ແລະ ທຸກວັນທີຂອງເດືອນ */
const monthOf = (period) => {
    const first = (0, moment_1.default)(`${period}-01`, "YYYY-MM-DD", true);
    const dates = Array.from({ length: first.daysInMonth() }, (_, i) => first.clone().add(i, "day").format("YYYY-MM-DD"));
    return { start: dates[0], end: dates[dates.length - 1], dates };
};
exports.monthOf = monthOf;
/** ວັນພັກລັດຖະການໃນຊ່ວງ → Map(ວັນທີ, ຊື່) */
const holidaysBetween = async (start, end, t) => {
    const rows = await holiday_1.default.findAll({
        where: { holiday_date: { [sequelize_1.Op.between]: [start, end] } },
        attributes: ["holiday_date", "name"],
        raw: true,
        transaction: t,
    });
    return new Map(rows.map((r) => [String(r.holiday_date), String(r.name)]));
};
exports.holidaysBetween = holidaysBetween;
const isWorkday = (date, rules, holidays) => !rules.daysOff.includes((0, moment_1.default)(date, "YYYY-MM-DD").day()) && !holidays.has(date);
exports.isWorkday = isWorkday;
/** ເປັນພະນັກງານໃນວັນນັ້ນບໍ່ — ກ່ອນວັນເຂົ້າວຽກ ຫຼື ຫຼັງວັນລາອອກ ບໍ່ນັບ (ລາອອກແຕ່ບໍ່ມີວັນທີ = ບໍ່ນັບເລີຍ) */
const employedOn = (emp, date) => (!emp.start_date || String(emp.start_date) <= date)
    && (Number(emp.work_status) !== exports.RESIGNED || (!!emp.end_date && String(emp.end_date) >= date));
exports.employedOn = employedOn;
const dayStateOf = (date, workday, employed, row, today, grace) => {
    if (!employed)
        return "none";
    if (row) {
        const status = Number(row.status);
        if (status === exports.PAID_LEAVE)
            return "leave";
        if (status === exports.UNPAID_LEAVE)
            return "unpaid";
        if (!workday)
            return "offwork";
        return Number(row.late_minutes) > grace ? "late" : "present";
    }
    if (!workday)
        return "off";
    if (date > today)
        return "future";
    return date === today ? "pending" : "absent";
};
exports.dayStateOf = dayStateOf;
/** ສະຖິຕິການເຂົ້າວຽກຂອງເດືອນ + ສະຖານະແຕ່ລະມື້ (ລຽງຕາມ dates) */
const monthStatsOf = (emp, rows, dates, rules, holidays, today, grace) => {
    const stats = {
        workdays: 0, employed_days: 0, present_days: 0, late_days: 0, late_minutes: 0, early_minutes: 0,
        leave_days: 0, unpaid_days: 0, absent_days: 0, offday_work_days: 0, pending_days: 0,
    };
    const states = dates.map((date) => {
        const workday = (0, exports.isWorkday)(date, rules, holidays);
        const employed = (0, exports.employedOn)(emp, date);
        if (workday)
            stats.workdays++;
        if (workday && employed)
            stats.employed_days++;
        const row = rows.get(date);
        const state = (0, exports.dayStateOf)(date, workday, employed, row, today, grace);
        if (!employed)
            return state;
        if (state === "present" || state === "late")
            stats.present_days++;
        if (state === "late")
            stats.late_days++;
        if (state === "absent")
            stats.absent_days++;
        if (state === "offwork")
            stats.offday_work_days++;
        if (state === "pending" || state === "future")
            stats.pending_days++;
        if (workday && state === "leave")
            stats.leave_days++;
        if (workday && state === "unpaid")
            stats.unpaid_days++;
        if (workday && row && Number(row.status) === exports.PRESENT) {
            const late = Number(row.late_minutes) || 0;
            const early = Number(row.early_minutes) || 0;
            if (late > grace)
                stats.late_minutes += late;
            if (early > grace)
                stats.early_minutes += early;
        }
        return state;
    });
    return { stats, states };
};
exports.monthStatsOf = monthStatsOf;
/** ແຖວການເຂົ້າວຽກຂອງຫຼາຍຄົນໃນຊ່ວງ → Map(employee_id, Map(ວັນທີ, ແຖວ)) */
const attendanceByEmployee = async (employeeIds, start, end, t) => {
    const result = new Map();
    if (!employeeIds.length)
        return result;
    const rows = await attendance_1.default.findAll({
        where: { employee_id: { [sequelize_1.Op.in]: employeeIds }, work_date: { [sequelize_1.Op.between]: [start, end] } },
        transaction: t,
    });
    for (const row of rows) {
        const id = Number(row.employee_id);
        if (!result.has(id))
            result.set(id, new Map());
        result.get(id).set(String(row.work_date), row);
    }
    return result;
};
exports.attendanceByEmployee = attendanceByEmployee;
