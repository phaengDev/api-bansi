"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMyWorkHistory = void 0;
const moment_1 = __importDefault(require("moment"));
const sequelize_1 = require("sequelize");
const overtime_1 = __importDefault(require("../../models/overtime"));
const bansiHelpers_1 = require("../bansi/bansiHelpers");
const hrHelpers_1 = require("./hrHelpers");
const payrollRules_1 = require("./payrollRules");
const attendanceController_1 = require("./attendanceController");
const workCalendar_1 = require("./workCalendar");
/**
 * ປະຫວັດການເຮັດວຽກໃນບໍລິສັດຂອງຕົນເອງ (app ມືຖື) — ວັນເລີ່ມວຽກ, ອາຍຸງານ, ຕຳແໜ່ງ/ພະແນກປັດຈຸບັນ
 * ແລະ ສະຫຼຸບແຕ່ລະເດືອນຂອງປີ (ມາວຽກ, ມາຊ້າ, ຂາດ, ລາພັກ, ຊົ່ວໂມງ OT) ຄິດແບບດຽວກັບ GET /attendance/me
 */
const round2 = (n) => Math.round(n * 100) / 100;
/** GET /employee/me/history?year=YYYY — ບໍ່ສົ່ງປີ = ປີນີ້; ປີທີ່ເລືອກໄດ້ = ປີເລີ່ມວຽກ … ປີນີ້ */
const getMyWorkHistory = async (req, res) => {
    try {
        const self = await (0, attendanceController_1.selfEmployee)(req);
        if ("code" in self) {
            res.status(self.code).json({ message: self.message });
            return;
        }
        const me = self.employee;
        const e = me.get({ plain: true });
        const today = (0, workCalendar_1.todayLao)();
        const thisYear = Number(today.slice(0, 4));
        const startDate = e.start_date ? String(e.start_date) : null;
        const firstYear = Math.min(startDate ? Number(startDate.slice(0, 4)) : thisYear, thisYear);
        const asked = Number(req.query.year);
        const year = Number.isInteger(asked) && asked >= firstYear && asked <= thisYear ? asked : thisYear;
        // ເດືອນທີ່ນັບ: ຕັ້ງແຕ່ເດືອນເລີ່ມວຽກ (ປີທຳອິດ) ຫາ ເດືອນນີ້ (ປີນີ້)
        const firstMonth = startDate && startDate.slice(0, 4) === String(year) ? Number(startDate.slice(5, 7)) : 1;
        const lastMonth = year === thisYear ? Number(today.slice(5, 7)) : 12;
        const yearStart = `${year}-01-01`;
        const yearEnd = `${year}-12-31`;
        const [company, settings, holidays, rowsById, overtime] = await Promise.all([
            (0, workCalendar_1.findCompany)(),
            (0, payrollRules_1.loadPayrollSettings)(),
            (0, workCalendar_1.holidaysBetween)(yearStart, yearEnd),
            (0, workCalendar_1.attendanceByEmployee)([me._uuid], yearStart, yearEnd),
            overtime_1.default.findAll({
                where: { employee_id: me._uuid, work_date: { [sequelize_1.Op.between]: [yearStart, yearEnd] } },
                attributes: ["work_date", "hours"],
                raw: true,
            }),
        ]);
        const rules = (0, workCalendar_1.workRulesOf)(company);
        const rows = rowsById.get(me._uuid) ?? new Map();
        const months = [];
        if (!startDate || startDate <= today) {
            for (let m = lastMonth; m >= firstMonth; m--) {
                const period = `${year}-${String(m).padStart(2, "0")}`;
                const { dates } = (0, workCalendar_1.monthOf)(period);
                const { stats } = (0, workCalendar_1.monthStatsOf)(me, rows, dates, rules, holidays, today, settings.late_grace_minutes);
                const otHours = overtime
                    .filter((o) => String(o.work_date).startsWith(period))
                    .reduce((n, o) => n + (Number(o.hours) || 0), 0);
                months.push({
                    period,
                    // ມື້ເຮັດວຽກທີ່ຜ່ານມາແລ້ວ (ບໍ່ນັບມື້ທີ່ຍັງບໍ່ຮອດ) — ໃຊ້ຄິດອັດຕາມາວຽກ
                    workdays: stats.employed_days - stats.pending_days,
                    present_days: stats.present_days,
                    late_days: stats.late_days,
                    late_minutes: stats.late_minutes,
                    absent_days: stats.absent_days,
                    leave_days: stats.leave_days,
                    unpaid_days: stats.unpaid_days,
                    offday_work_days: stats.offday_work_days,
                    ot_hours: round2(otHours),
                });
            }
        }
        const sum = (key) => round2(months.reduce((n, m) => n + (Number(m[key]) || 0), 0));
        const totals = Object.fromEntries(["workdays", "present_days", "late_days", "late_minutes", "absent_days", "leave_days", "unpaid_days", "offday_work_days", "ot_hours"].map((k) => [k, sum(k)]));
        // ອາຍຸງານ ນັບຮອດມື້ນີ້ (ລາອອກແລ້ວ = ຮອດມື້ລາອອກ)
        const until = e.end_date && String(e.end_date) < today ? String(e.end_date) : today;
        const from = startDate ? (0, moment_1.default)(startDate, "YYYY-MM-DD") : null;
        const to = (0, moment_1.default)(until, "YYYY-MM-DD");
        const service = from && !from.isAfter(to)
            ? (() => {
                const totalMonths = to.diff(from, "months");
                const days = to.diff(from.clone().add(totalMonths, "months"), "days");
                return { years: Math.floor(totalMonths / 12), months: totalMonths % 12, days, total_days: to.diff(from, "days") };
            })()
            : null;
        res.status(200).json({
            employee: {
                _uuid: e._uuid,
                emp_code: e.emp_code,
                first_name: e.first_name,
                last_name: e.last_name,
                profile_url: (0, hrHelpers_1.profileUrl)(e.profile),
                department: e.department ?? null,
                position: e.position ?? null,
                start_date: startDate,
                end_date: e.end_date ?? null,
                work_status: e.work_status,
            },
            today,
            service,
            year,
            years: Array.from({ length: thisYear - firstYear + 1 }, (_, i) => thisYear - i),
            months,
            totals,
        });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting my work history");
    }
};
exports.getMyWorkHistory = getMyWorkHistory;
