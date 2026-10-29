"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.unpayPayroll = exports.payPayroll = exports.deletePayroll = exports.deletePayrollLine = exports.updatePayrollLine = exports.previewPayrollLine = exports.syncDraftOvertime = exports.recalcPayroll = exports.createPayroll = exports.getPayroll = exports.getMyPayrollPreview = exports.getMyPayslips = exports.getPayrolls = exports.savePayrollSetting = exports.getPayrollSetting = void 0;
const moment_1 = __importDefault(require("moment"));
const sequelize_1 = require("sequelize");
const payroll_1 = __importDefault(require("../../models/payroll"));
const payrollLine_1 = __importDefault(require("../../models/payrollLine"));
const payrollSetting_1 = __importDefault(require("../../models/payrollSetting"));
const employee_1 = __importDefault(require("../../models/employee"));
const department_1 = __importDefault(require("../../models/department"));
const position_1 = __importDefault(require("../../models/position"));
const bankModel_1 = __importDefault(require("../../models/bankModel"));
const treasuryAcount_1 = __importDefault(require("../../models/treasuryAcount"));
const typeTreasury_1 = __importDefault(require("../../models/typeTreasury"));
const currencyModel_1 = __importDefault(require("../../models/currencyModel"));
const bansiHelpers_1 = require("../bansi/bansiHelpers");
const journalHelpers_1 = require("../bansi/journalHelpers");
const accountMovement_1 = require("../bansi/accountMovement");
const glCore_1 = require("../bansi/glCore");
const glPosting_1 = require("../bansi/glPosting");
const payrollRules_1 = require("./payrollRules");
const workCalendar_1 = require("./workCalendar");
const attendanceController_1 = require("./attendanceController");
const hrHelpers_1 = require("./hrHelpers");
const myMoneyController_1 = require("./myMoneyController");
const notificationController_1 = require("./notificationController");
/**
 * ເງິນເດືອນປະຈຳເດືອນ: ສ້າງໃບ (ຄິດຈາກເງິນເດືອນພື້ນຖານ + ການເຂົ້າວຽກ) → ແກ້ລາຍຄົນ (ເງິນເພີ່ມ / ຫັກ / ປກສ / ອາກອນ)
 * → ຈ່າຍ (ເງິນອອກຈາກບັນຊີເງິນຄັງສະກຸນກີບ + ລົງບັນຊີຄູ່). ແກ້ໄຂໄດ້ສະເພາະໃບຮ່າງ; ຍົກເລີກການຈ່າຍ = ກັບເປັນຮ່າງ
 */
const DRAFT = 1;
const PAID = 2;
const MONEY_FIELDS = ["allowance", "overtime", "bonus", "other_deduction", "absence_deduction", "late_deduction", "sso_employee", "sso_employer", "tax"];
/** ນະໂຍບາຍສະເພາະຄົນຂອງແຕ່ລະກຸ່ມການຫັກ (MODE_* ໃນ payrollRules) */
const MODE_FIELDS = ["deduction_mode", "sso_mode", "tax_mode"];
/** ຖັນທີ່ຜູ້ໃຊ້ປ້ອນ/ເລືອກເອງ — ຄິດໄລ່ໃໝ່ຈາກການເຂົ້າວຽກແລ້ວຍັງຢູ່ຄືເກົ່າ (overtime_mode: 1 ຈາກບັນທຶກ OT, 0 ປ້ອນເອງ) */
const MANUAL_FIELDS = [...MONEY_FIELDS, ...MODE_FIELDS, "overtime_mode", "note"];
const periodText = (period) => (0, moment_1.default)(`${period}-01`).format("MM/YYYY");
const lineOrder = [[{ model: payrollLine_1.default, as: "lines" }, "emp_code", "ASC"]];
const NUMBER_FIELDS = [
    "total_base", "total_attendance_deduction", "total_additions", "total_gross", "total_sso_employee",
    "total_sso_employer", "total_tax", "total_other_deduction", "total_net",
];
const LINE_NUMBER_FIELDS = [
    "basic_salary", "base_pay", "absence_deduction", "late_deduction", "allowance", "overtime", "bonus", "gross",
    "sso_base", "sso_employee", "sso_employer", "taxable", "tax", "other_deduction", "net", "ot_hours", "ot_weighted_hours", "ot_fixed_amount",
];
const numbers = (r, fields) => Object.fromEntries(fields.map((f) => [f, Number(r[f]) || 0]));
const presentLine = (row) => {
    const r = row.get ? row.get({ plain: true }) : row;
    return { ...r, ...numbers(r, LINE_NUMBER_FIELDS) };
};
const present = (row) => {
    const r = row.get({ plain: true });
    return {
        ...r,
        ...numbers(r, NUMBER_FIELDS),
        lines: r.lines?.map(presentLine),
        /** ເດືອນສິ້ນສຸດແລ້ວບໍ່ — ຍັງບໍ່ສິ້ນສຸດ ມື້ທີ່ຍັງບໍ່ຮອດບໍ່ນັບເປັນຂາດວຽກ */
        complete: (0, workCalendar_1.monthOf)(r.period).end < (0, workCalendar_1.todayLao)(),
    };
};
const findFull = (id, t) => payroll_1.default.findByPk(id, {
    include: [{ model: payrollLine_1.default, as: "lines" }, { ...journalHelpers_1.accountInclude, as: "account" }],
    order: lineOrder,
    transaction: t,
});
/** ພະແນກ / ຕຳແໜ່ງ / ທະນາຄານ — ສຳເນົາລົງແຖວເງິນເດືອນ */
const employeeInclude = [
    { model: department_1.default, as: "department", attributes: ["_uuid", "depart_name"] },
    { model: position_1.default, as: "position", attributes: ["_uuid", "position_name"] },
    { model: bankModel_1.default, as: "bank", attributes: ["_uuid", "abbr", "name_la"] },
];
/** ພະນັກງານທີ່ຕ້ອງຈ່າຍເງິນເດືອນຂອງເດືອນ — ເຂົ້າວຽກກ່ອນ/ໃນເດືອນ ແລະ ຍັງເຮັດວຽກ ຫຼື ລາອອກໃນ/ຫຼັງເດືອນນັ້ນ */
const eligibleEmployees = (period, t) => {
    const { start, end } = (0, workCalendar_1.monthOf)(period);
    return employee_1.default.findAll({
        where: {
            [sequelize_1.Op.and]: [
                { [sequelize_1.Op.or]: [{ start_date: null }, { start_date: { [sequelize_1.Op.lte]: end } }] },
                { [sequelize_1.Op.or]: [{ work_status: workCalendar_1.WORKING }, { work_status: workCalendar_1.RESIGNED, end_date: { [sequelize_1.Op.gte]: start } }] },
            ],
        },
        include: employeeInclude,
        order: [["emp_code", "ASC"]],
        transaction: t,
    });
};
/** ທຸກຢ່າງທີ່ຕ້ອງໃຊ້ຄິດເງິນເດືອນຂອງເດືອນ — ຕັ້ງຄ່າ, ເວລາເຮັດວຽກ, ວັນພັກ */
const contextOf = async (period, t) => {
    const month = (0, workCalendar_1.monthOf)(period);
    const [settings, company, holidays] = await Promise.all([
        (0, payrollRules_1.loadPayrollSettings)(t),
        (0, workCalendar_1.findCompany)(t),
        (0, workCalendar_1.holidaysBetween)(month.start, month.end, t),
    ]);
    return { ...month, settings, rules: (0, workCalendar_1.workRulesOf)(company), holidays, today: (0, workCalendar_1.todayLao)() };
};
/** ມື້ເຮັດວຽກທັງເດືອນ (ບໍ່ລວມວັນພັກປະຈຳອາທິດ ແລະ ວັນພັກລັດຖະການ) */
const workdaysOf = (ctx) => ctx.dates.filter((d) => (0, workCalendar_1.isWorkday)(d, ctx.rules, ctx.holidays)).length;
/**
 * ແຖວເງິນເດືອນຂອງພະນັກງານ: ສຳເນົາຂໍ້ມູນພະນັກງານ + ສະຖິຕິການເຂົ້າວຽກ + OT ຂອງເດືອນ + ຄ່າທີ່ປ້ອນເອງ (ຈາກແຖວເດີມ ຖ້າມີ)
 * → ຄິດໃໝ່ທັງແຖວ
 */
const buildLine = (emp, attendance, ctx, existing, ot = payrollRules_1.NO_OVERTIME) => {
    const { stats } = (0, workCalendar_1.monthStatsOf)(emp, attendance, ctx.dates, ctx.rules, ctx.holidays, ctx.today, ctx.settings.late_grace_minutes);
    const manual = existing
        ? Object.fromEntries(MANUAL_FIELDS.map((f) => [f, existing[f]]))
        : {
            ...Object.fromEntries(MONEY_FIELDS.map((f) => [f, 0])),
            ...Object.fromEntries(MODE_FIELDS.map((f) => [f, payrollRules_1.MODE_POLICY])),
            overtime_mode: payrollRules_1.MODE_POLICY,
            note: null,
        };
    const snapshot = {
        employee_id: emp._uuid,
        emp_code: emp.emp_code,
        employee_name: [emp.first_name, emp.last_name].filter(Boolean).join(" "),
        department_name: emp.department?.depart_name ?? null,
        position_name: emp.position?.position_name ?? null,
        bank_name: emp.bank?.abbr ?? null,
        bank_account_no: emp.bank_account_no ?? null,
        bank_account_name: emp.bank_account_name ?? null,
        basic_salary: Number(emp.basic_salary) || 0,
        workdays: stats.workdays,
        employed_days: stats.employed_days,
        present_days: stats.present_days,
        leave_days: stats.leave_days,
        unpaid_days: stats.unpaid_days,
        absent_days: stats.absent_days,
        late_days: stats.late_days,
        late_minutes: stats.late_minutes + stats.early_minutes,
        ot_hours: ot.hours,
        ot_weighted_hours: ot.weighted,
        ot_fixed_amount: ot.fixed,
    };
    return { ...snapshot, ...manual, ...(0, payrollRules_1.computeLine)({ ...snapshot, ...manual }, ctx.settings, ctx.rules.minutesPerDay) };
};
/** ຄິດຍອດລວມຂອງໃບຈາກທຸກແຖວ */
const refreshTotals = async (payroll, t) => {
    const lines = await payrollLine_1.default.findAll({ where: { payroll_id: payroll._uuid }, transaction: t });
    const sum = (pick) => lines.reduce((n, l) => n + pick(l), 0);
    const n = (v) => Number(v) || 0;
    await payroll.update({
        employees: lines.length,
        total_base: sum((l) => n(l.base_pay)),
        total_attendance_deduction: sum((l) => n(l.absence_deduction) + n(l.late_deduction)),
        total_additions: sum((l) => n(l.allowance) + n(l.overtime) + n(l.bonus)),
        total_gross: sum((l) => n(l.gross)),
        total_sso_employee: sum((l) => n(l.sso_employee)),
        total_sso_employer: sum((l) => n(l.sso_employer)),
        total_tax: sum((l) => n(l.tax)),
        total_other_deduction: sum((l) => n(l.other_deduction)),
        total_net: sum((l) => n(l.net)),
        updatedAt: new Date(),
    }, { transaction: t });
};
const reply = async (res, id, message) => {
    const saved = await findFull(id);
    res.status(200).json({ message, data: saved && present(saved) });
};
/** ໃບຮ່າງ (ລັອກແຖວ) — ບໍ່ພົບ / ຈ່າຍແລ້ວ = error */
const draftOf = async (id, t) => {
    const payroll = await payroll_1.default.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!payroll)
        return { code: 404, message: "ບໍ່ພົບໃບເງິນເດືອນ" };
    if (Number(payroll.status) !== DRAFT)
        return { code: 400, message: "ໃບເງິນເດືອນນີ້ຈ່າຍແລ້ວ — ຍົກເລີກການຈ່າຍກ່ອນຈຶ່ງແກ້ໄຂໄດ້" };
    return payroll;
};
// ================= ຕັ້ງຄ່າ
/** GET /payroll/setting — ຕັ້ງຄ່າປັດຈຸບັນ (ຍັງບໍ່ເຄີຍບັນທຶກ = ຄ່າເລີ່ມຕົ້ນ) + ຄ່າເລີ່ມຕົ້ນ (ປຸ່ມ "ໃຊ້ຄ່າເລີ່ມຕົ້ນ") */
const getPayrollSetting = async (_req, res) => {
    try {
        res.status(200).json({ data: await (0, payrollRules_1.loadPayrollSettings)(), defaults: payrollRules_1.DEFAULT_SETTINGS });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting payroll setting");
    }
};
exports.getPayrollSetting = getPayrollSetting;
/**
 * PUT /payroll/setting — ເປີດ/ປິດ (1/0): sso_enabled, tax_enabled, deduct_absent, deduct_late; ອັດຕາ 0–100%, ເພດານ/ເງິນເດືອນ ≥ 0,
 * ນາທີຜ່ອນຜັນ 0–120, ຂັ້ນອາກອນ (ເບິ່ງ parseBrackets), OT: ຊົ່ວໂມງຕໍ່ມື້ 1–24, ອັດຕາ ot_rate_* 0–1000%
 */
const savePayrollSetting = async (req, res) => {
    try {
        const body = req.body || {};
        const rate = (value) => {
            const n = Number(value);
            return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : null;
        };
        const amount = (value) => {
            const n = Number(value);
            return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
        };
        const employeeRate = rate(body.sso_employee_rate);
        const employerRate = rate(body.sso_employer_rate);
        const cap = amount(body.sso_salary_cap);
        const otFree = amount(body.ot_tax_free_salary);
        const grace = Number(body.late_grace_minutes);
        const brackets = (0, payrollRules_1.parseBrackets)(body.tax_brackets);
        const fail = (message) => res.status(400).json({ message });
        if (employeeRate === null || employerRate === null)
            return fail("ອັດຕາປະກັນສັງຄົມຕ້ອງຢູ່ລະຫວ່າງ 0–100%");
        if (cap === null)
            return fail("ເພດານເງິນເດືອນຂອງປະກັນສັງຄົມບໍ່ຖືກຕ້ອງ");
        if (otFree === null)
            return fail("ເງິນເດືອນທີ່ຄ່າລ່ວງເວລາບໍ່ເສຍອາກອນ ບໍ່ຖືກຕ້ອງ");
        if (!Number.isInteger(grace) || grace < 0 || grace > 120)
            return fail("ນາທີຜ່ອນຜັນຕ້ອງຢູ່ລະຫວ່າງ 0–120");
        if (!brackets)
            return fail("ຂັ້ນອາກອນບໍ່ຖືກຕ້ອງ — ແຕ່ລະຂັ້ນຕ້ອງສູງກວ່າຂັ້ນກ່ອນ ແລະ ອັດຕາ 0–100%");
        const hoursPerDay = Number(body.ot_hours_per_day);
        if (!Number.isFinite(hoursPerDay) || hoursPerDay < 1 || hoursPerDay > 24)
            return fail("ຊົ່ວໂມງເຮັດວຽກຕໍ່ມື້ຕ້ອງຢູ່ລະຫວ່າງ 1–24");
        const otRate = (value) => {
            const n = Number(value);
            return Number.isFinite(n) && n >= 0 && n <= 1000 ? Math.round(n * 100) / 100 : null;
        };
        const otRates = {
            ot_rate_normal: otRate(body.ot_rate_normal),
            ot_rate_night: otRate(body.ot_rate_night),
            ot_rate_dayoff: otRate(body.ot_rate_dayoff),
            ot_rate_dayoff_night: otRate(body.ot_rate_dayoff_night),
        };
        if (Object.values(otRates).some((r) => r === null))
            return fail("ອັດຕາຄ່າລ່ວງເວລາຕ້ອງຢູ່ລະຫວ່າງ 0–1000%");
        const flag = (value) => (Number(value) === 1 || value === true ? 1 : 0);
        const values = {
            sso_enabled: flag(body.sso_enabled),
            sso_employee_rate: employeeRate,
            sso_employer_rate: employerRate,
            sso_salary_cap: cap,
            tax_enabled: flag(body.tax_enabled),
            tax_brackets: JSON.stringify(brackets),
            ot_tax_free_salary: otFree,
            late_grace_minutes: grace,
            deduct_absent: flag(body.deduct_absent),
            deduct_late: flag(body.deduct_late),
            ot_hours_per_day: Math.round(hoursPerDay * 100) / 100,
            ...otRates,
            updatedbyid: Number((0, bansiHelpers_1.actorOf)(req)) || null,
        };
        const row = await (0, payrollRules_1.findPayrollSetting)();
        const saved = row ? await row.update({ ...values, updatedAt: new Date() }) : await payrollSetting_1.default.create(values);
        res.status(200).json({ message: "Successfully saved payroll setting", data: (0, payrollRules_1.presentSettings)(saved) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error saving payroll setting");
    }
};
exports.savePayrollSetting = savePayrollSetting;
// ================= ໃບເງິນເດືອນ
/** POST /payroll/fetch { year? } — ໃບເງິນເດືອນ (ບໍ່ມີລາຍຄົນ) ໃໝ່ສຸດກ່ອນ; ບໍ່ສົ່ງປີ = ທັງໝົດ */
const getPayrolls = async (req, res) => {
    try {
        const year = String(req.body?.year ?? "");
        const where = /^\d{4}$/.test(year) ? { period: { [sequelize_1.Op.like]: `${year}-%` } } : {};
        const rows = await payroll_1.default.findAll({ where, order: [["period", "DESC"]], include: [{ ...journalHelpers_1.accountInclude, as: "account" }] });
        res.status(200).json({ data: rows.map(present), current_period: (0, workCalendar_1.currentPeriod)() });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting payrolls");
    }
};
exports.getPayrolls = getPayrolls;
/**
 * GET /payroll/me?year=YYYY — ສະລິບເງິນເດືອນຂອງຕົນເອງ (app ມືຖື, ບັນຊີຕ້ອງຜູກກັບພະນັກງານ): ສະເພາະໃບທີ່ຈ່າຍແລ້ວ
 * (ໃບຮ່າງຍອດຍັງປ່ຽນໄດ້), ເດືອນໃໝ່ສຸດກ່ອນ; ບໍ່ສົ່ງປີ = ທັງໝົດ. ແຕ່ລະແຖວມີ payroll { period, pay_date, … } ຕິດມາ
 */
const getMyPayslips = async (req, res) => {
    try {
        const self = await (0, attendanceController_1.selfEmployee)(req);
        if ("code" in self) {
            res.status(self.code).json({ message: self.message });
            return;
        }
        const year = String(req.query.year ?? "");
        const [lines, company] = await Promise.all([
            payrollLine_1.default.findAll({
                where: { employee_id: self.employee._uuid },
                include: [{
                        model: payroll_1.default,
                        as: "payroll",
                        required: true,
                        where: { status: PAID, ...(/^\d{4}$/.test(year) ? { period: { [sequelize_1.Op.like]: `${year}-%` } } : {}) },
                        attributes: ["_uuid", "period", "workdays", "number", "pay_date"],
                    }],
                order: [[{ model: payroll_1.default, as: "payroll" }, "period", "DESC"]],
            }),
            (0, workCalendar_1.findCompany)(),
        ]);
        res.status(200).json({
            data: lines.map(presentLine),
            company: company && { name_la: company.name_la, name_en: company.name_en, logo_url: (0, hrHelpers_1.companyLogoUrl)(company.logo) },
        });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting my payslips");
    }
};
exports.getMyPayslips = getMyPayslips;
/**
 * GET /payroll/me/preview?month=YYYY-MM — ກວດເງິນເດືອນຫຼວງໜ້າຂອງຕົນເອງ (app): ຄິດແບບດຽວກັບໃບເງິນເດືອນ (buildLine) ຈາກການເຂົ້າວຽກ
 * ເຖິງມື້ນີ້ — ມື້ເຮັດວຽກທີ່ຍັງບໍ່ຮອດ ນັບວ່າມາວຽກ. ມີໃບຮ່າງຂອງເດືອນແລ້ວ = ໃຊ້ເງິນເພີ່ມ/ຫັກທີ່ HR ປ້ອນໄວ້ (OT, ໂບນັດ, ຫັກອື່ນ…);
 * ຈ່າຍແລ້ວ = ແຖວຈິງ. status: "estimate" ຍັງບໍ່ມີໃບເງິນເດືອນ, "draft" HR ກຳລັງກວດ, "paid" ຈ່າຍແລ້ວ. ບໍ່ສົ່ງເດືອນ = ເດືອນນີ້
 */
const getMyPayrollPreview = async (req, res) => {
    try {
        const self = await (0, attendanceController_1.selfEmployee)(req);
        if ("code" in self) {
            res.status(self.code).json({ message: self.message });
            return;
        }
        const month = String(req.query.month ?? "");
        const period = workCalendar_1.PERIOD.test(month) ? month : (0, workCalendar_1.currentPeriod)();
        if (period > (0, workCalendar_1.currentPeriod)()) {
            res.status(400).json({ message: "ເດືອນທີ່ຍັງບໍ່ຮອດ ກວດເງິນເດືອນບໍ່ໄດ້" });
            return;
        }
        const employeeId = self.employee._uuid;
        const [employee, payroll, ctx] = await Promise.all([
            employee_1.default.findByPk(employeeId, { include: employeeInclude }),
            payroll_1.default.findOne({ where: { period }, attributes: ["_uuid", "status", "pay_date"] }),
            contextOf(period),
        ]);
        const existing = payroll ? await payrollLine_1.default.findOne({ where: { payroll_id: payroll._uuid, employee_id: employeeId } }) : null;
        const [attendance, overtime] = await Promise.all([
            (0, workCalendar_1.attendanceByEmployee)([employeeId], ctx.start, ctx.end),
            (0, payrollRules_1.overtimeByEmployee)([employeeId], ctx.start, ctx.end, ctx.settings),
        ]);
        const rows = attendance.get(employeeId) ?? new Map();
        const { stats } = (0, workCalendar_1.monthStatsOf)(employee, rows, ctx.dates, ctx.rules, ctx.holidays, ctx.today, ctx.settings.late_grace_minutes);
        const paid = !!payroll && Number(payroll.status) === PAID && !!existing;
        const line = paid ? existing : buildLine(employee, rows, ctx, existing ?? undefined, overtime.get(employeeId));
        const { settings } = ctx;
        res.status(200).json({
            period,
            status: paid ? "paid" : existing ? "draft" : "estimate",
            pay_date: paid ? payroll.pay_date : null,
            today: ctx.today,
            complete: ctx.end < ctx.today,
            stats,
            line: presentLine(line),
            settings: {
                deduct_absent: settings.deduct_absent,
                deduct_late: settings.deduct_late,
                late_grace_minutes: settings.late_grace_minutes,
                sso_enabled: settings.sso_enabled,
                sso_employee_rate: settings.sso_employee_rate,
                tax_enabled: settings.tax_enabled,
            },
        });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error previewing my payroll");
    }
};
exports.getMyPayrollPreview = getMyPayrollPreview;
/** GET /payroll/:id — ໃບເງິນເດືອນ + ລາຍຄົນ (ລະຫັດພະນັກງານນ້ອຍກ່ອນ) + ບັນຊີທີ່ຈ່າຍ */
const getPayroll = async (req, res) => {
    try {
        const row = await findFull(Number((0, bansiHelpers_1.decodeId)(req)));
        if (!row) {
            res.status(404).json({ message: "ບໍ່ພົບໃບເງິນເດືອນ" });
            return;
        }
        res.status(200).json({ data: present(row), settings: await (0, payrollRules_1.loadPayrollSettings)() });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting payroll");
    }
};
exports.getPayroll = getPayroll;
/** POST /payroll/create { period: "YYYY-MM" } — ສ້າງໃບຮ່າງ + ລາຍຄົນຂອງທຸກຄົນທີ່ຕ້ອງຈ່າຍ (1 ໃບ ຕໍ່ ເດືອນ) */
const createPayroll = async (req, res) => {
    const t = await payroll_1.default.sequelize.transaction();
    const fail = async (message) => {
        await t.rollback();
        res.status(400).json({ message });
    };
    try {
        const period = String(req.body?.period ?? "");
        if (!workCalendar_1.PERIOD.test(period))
            return fail("ເດືອນບໍ່ຖືກຕ້ອງ");
        if (period > (0, workCalendar_1.currentPeriod)())
            return fail("ສ້າງເງິນເດືອນຂອງເດືອນທີ່ຍັງບໍ່ຮອດບໍ່ໄດ້");
        if (await payroll_1.default.count({ where: { period }, transaction: t }))
            return fail(`ເດືອນ ${periodText(period)} ມີໃບເງິນເດືອນແລ້ວ`);
        const employees = await eligibleEmployees(period, t);
        if (!employees.length)
            return fail(`ບໍ່ມີພະນັກງານທີ່ຕ້ອງຈ່າຍເງິນເດືອນໃນເດືອນ ${periodText(period)}`);
        const ctx = await contextOf(period, t);
        const ids = employees.map((e) => e._uuid);
        const attendance = await (0, workCalendar_1.attendanceByEmployee)(ids, ctx.start, ctx.end, t);
        const overtime = await (0, payrollRules_1.overtimeByEmployee)(ids, ctx.start, ctx.end, ctx.settings, t);
        const payroll = await payroll_1.default.create({
            period,
            workdays: workdaysOf(ctx),
            status: DRAFT,
            createdbyid: Number((0, bansiHelpers_1.actorOf)(req)) || null,
        }, { transaction: t });
        await payrollLine_1.default.bulkCreate(employees.map((e) => ({ payroll_id: payroll._uuid, ...buildLine(e, attendance.get(e._uuid) ?? new Map(), ctx, undefined, overtime.get(e._uuid)) })), { transaction: t });
        await refreshTotals(payroll, t);
        await t.commit();
        await reply(res, payroll._uuid, "Successfully created payroll");
    }
    catch (error) {
        await t.rollback();
        (0, bansiHelpers_1.sendError)(res, error, "Error creating payroll");
    }
};
exports.createPayroll = createPayroll;
/**
 * PUT /payroll/recalc/:id — ຄິດໄລ່ໃໝ່ (ໃບຮ່າງ): ດຶງເງິນເດືອນພື້ນຖານ/ບັນຊີທະນາຄານ/ການເຂົ້າວຽກ/OT ແລະ ຕັ້ງຄ່າລ່າສຸດ,
 * ເພີ່ມຄົນທີ່ຍັງບໍ່ມີ. ເງິນເພີ່ມ/ຫັກທີ່ປ້ອນເອງ ແລະ ຄ່າທີ່ກຳນົດເອງ ຢູ່ຄືເກົ່າ
 */
const recalcPayroll = async (req, res) => {
    const t = await payroll_1.default.sequelize.transaction();
    try {
        const payroll = await draftOf((0, bansiHelpers_1.decodeId)(req), t);
        if ("code" in payroll) {
            await t.rollback();
            res.status(payroll.code).json({ message: payroll.message });
            return;
        }
        const ctx = await contextOf(payroll.period, t);
        const lines = await payrollLine_1.default.findAll({ where: { payroll_id: payroll._uuid }, transaction: t });
        const eligible = await eligibleEmployees(payroll.period, t);
        const lineEmployeeIds = lines.map((l) => Number(l.employee_id));
        const extra = await employee_1.default.findAll({
            where: { _uuid: { [sequelize_1.Op.in]: lineEmployeeIds.filter((id) => !eligible.some((e) => e._uuid === id)) } },
            include: employeeInclude,
            transaction: t,
        });
        const employees = new Map([...eligible, ...extra].map((e) => [e._uuid, e]));
        const attendance = await (0, workCalendar_1.attendanceByEmployee)([...employees.keys()], ctx.start, ctx.end, t);
        const overtime = await (0, payrollRules_1.overtimeByEmployee)([...employees.keys()], ctx.start, ctx.end, ctx.settings, t);
        for (const line of lines) {
            const emp = employees.get(Number(line.employee_id));
            if (!emp)
                continue; // ພະນັກງານຖືກລຶບ — ແຖວຢູ່ຄືເກົ່າ
            await line.update({
                ...buildLine(emp, attendance.get(emp._uuid) ?? new Map(), ctx, line, overtime.get(emp._uuid)),
                updatedAt: new Date(),
            }, { transaction: t });
        }
        const missing = eligible.filter((e) => !lineEmployeeIds.includes(e._uuid));
        if (missing.length) {
            await payrollLine_1.default.bulkCreate(missing.map((e) => ({ payroll_id: payroll._uuid, ...buildLine(e, attendance.get(e._uuid) ?? new Map(), ctx, undefined, overtime.get(e._uuid)) })), { transaction: t });
        }
        await payroll.update({ workdays: workdaysOf(ctx) }, { transaction: t });
        await refreshTotals(payroll, t);
        await t.commit();
        await reply(res, payroll._uuid, `Successfully recalculated payroll (+${missing.length})`);
    }
    catch (error) {
        await t.rollback();
        (0, bansiHelpers_1.sendError)(res, error, "Error recalculating payroll");
    }
};
exports.recalcPayroll = recalcPayroll;
/** ຄ່າທີ່ປ້ອນເອງຈາກ body ທັບແຖວເດີມ — ບໍ່ສົ່ງ = ຄືເກົ່າ; ຈຳນວນເງິນຕິດລົບ = error */
const manualOf = (line, body) => {
    const manual = Object.fromEntries(MANUAL_FIELDS.map((f) => [f, line[f]]));
    for (const field of MONEY_FIELDS) {
        if (body[field] === undefined)
            continue;
        const n = Number(body[field]);
        if (!Number.isFinite(n) || n < 0)
            return { error: "ຈຳນວນເງິນຕ້ອງບໍ່ຕິດລົບ" };
        manual[field] = Math.round(n);
    }
    for (const field of MODE_FIELDS) {
        if (body[field] === undefined)
            continue;
        const mode = Number(body[field]);
        if (!payrollRules_1.LINE_MODES.includes(mode))
            return { error: "ວິທີຄິດບໍ່ຖືກຕ້ອງ" };
        manual[field] = mode;
    }
    if (body.overtime_mode !== undefined) {
        const mode = Number(body.overtime_mode);
        if (mode !== payrollRules_1.MODE_MANUAL && mode !== payrollRules_1.MODE_POLICY)
            return { error: "ວິທີຄິດລ່ວງເວລາບໍ່ຖືກຕ້ອງ" };
        manual.overtime_mode = mode;
    }
    if (body.note !== undefined)
        manual.note = String(body.note ?? "").trim().slice(0, 255) || null;
    return manual;
};
/** OT ຂອງຄົນໃນແຖວ ຕາມບັນທຶກ OT ປັດຈຸບັນຂອງເດືອນ → ຖັນ ot_* ຂອງແຖວ */
const otFieldsOf = (ot = payrollRules_1.NO_OVERTIME) => ({ ot_hours: ot.hours, ot_weighted_hours: ot.weighted, ot_fixed_amount: ot.fixed });
/** ຄິດແຖວໃໝ່ດ້ວຍຕັ້ງຄ່າ, ເວລາເຮັດວຽກ ແລະ ບັນທຶກ OT ປັດຈຸບັນ (ບັນທຶກ OT ຫຼັງສ້າງໃບ ກໍ່ຂຶ້ນທັນທີ) */
const recompute = async (line, manual, t) => {
    const [settings, company, payroll] = await Promise.all([
        (0, payrollRules_1.loadPayrollSettings)(t),
        (0, workCalendar_1.findCompany)(t),
        payroll_1.default.findByPk(line.payroll_id, { attributes: ["period"], transaction: t }),
    ]);
    const month = payroll ? (0, workCalendar_1.monthOf)(payroll.period) : null;
    const ot = otFieldsOf(month
        ? (await (0, payrollRules_1.overtimeByEmployee)([Number(line.employee_id)], month.start, month.end, settings, t)).get(Number(line.employee_id))
        : undefined);
    return { ...ot, ...(0, payrollRules_1.computeLine)({ ...line.get({ plain: true }), ...manual, ...ot }, settings, (0, workCalendar_1.workRulesOf)(company).minutesPerDay) };
};
/**
 * ຫຼັງບັນທຶກ / ແກ້ / ລຶບ OT — ໃບເງິນເດືອນຮ່າງຂອງເດືອນນັ້ນ ຄິດ OT ຂອງຄົນເຫຼົ່ານັ້ນໃໝ່ທັນທີ (ບໍ່ຕ້ອງກົດຄິດໄລ່ໃໝ່);
 * ແຖວທີ່ປ້ອນ OT ເອງ ອັບເດດສະເພາະຊົ່ວໂມງ (ຍອດເງິນຄືເກົ່າ). ໃບທີ່ຈ່າຍແລ້ວບໍ່ປ່ຽນ
 */
const syncDraftOvertime = async (period, employeeIds) => {
    if (!employeeIds.length)
        return;
    const t = await payroll_1.default.sequelize.transaction();
    try {
        const payroll = await payroll_1.default.findOne({ where: { period, status: DRAFT }, transaction: t, lock: t.LOCK.UPDATE });
        const lines = payroll
            ? await payrollLine_1.default.findAll({ where: { payroll_id: payroll._uuid, employee_id: { [sequelize_1.Op.in]: employeeIds } }, transaction: t })
            : [];
        if (!payroll || !lines.length) {
            await t.rollback();
            return;
        }
        for (const line of lines) {
            const values = await recompute(line, {}, t);
            await line.update({ ...values, updatedAt: new Date() }, { transaction: t });
        }
        await refreshTotals(payroll, t);
        await t.commit();
    }
    catch (error) {
        await t.rollback();
        console.error("❌ syncDraftOvertime:", error);
    }
};
exports.syncDraftOvertime = syncDraftOvertime;
const negativeNet = (net) => `ເງິນເດືອນສຸດທິຕິດລົບ (${net.toLocaleString("en-US")}) — ກວດຍອດຫັກ`;
/**
 * POST /payroll/line/preview/:id { …ຄືກັບ PUT /payroll/line/:id } — ຜົນການຄິດໂດຍບໍ່ບັນທຶກ (ຟອມແກ້ລາຍຄົນສະແດງທັນທີ)
 */
const previewPayrollLine = async (req, res) => {
    try {
        const line = await payrollLine_1.default.findByPk((0, bansiHelpers_1.decodeId)(req));
        if (!line) {
            res.status(404).json({ message: "ບໍ່ພົບລາຍການເງິນເດືອນ" });
            return;
        }
        const manual = manualOf(line, req.body || {});
        if ("error" in manual) {
            res.status(400).json({ message: manual.error });
            return;
        }
        const data = await recompute(line, manual);
        res.status(200).json({ data, warning: data.net < 0 ? negativeNet(data.net) : null });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error previewing payroll line");
    }
};
exports.previewPayrollLine = previewPayrollLine;
/**
 * PUT /payroll/line/:id { allowance, overtime, bonus, other_deduction, deduction_mode, absence_deduction, late_deduction,
 * sso_mode, sso_employee, sso_employer, tax_mode, tax, note } — ແກ້ລາຍຄົນ (ໃບຮ່າງ); *_mode ≠ 0 = ລະບົບຄິດໃຫ້
 * (ບໍ່ສົນຈຳນວນທີ່ສົ່ງມາ). ເງິນສຸດທິຕິດລົບ = ບັນທຶກບໍ່ໄດ້
 */
const updatePayrollLine = async (req, res) => {
    const t = await payroll_1.default.sequelize.transaction();
    const fail = async (code, message) => {
        await t.rollback();
        res.status(code).json({ message });
    };
    try {
        const line = await payrollLine_1.default.findByPk((0, bansiHelpers_1.decodeId)(req), { transaction: t, lock: t.LOCK.UPDATE });
        if (!line)
            return fail(404, "ບໍ່ພົບລາຍການເງິນເດືອນ");
        const payroll = await draftOf(line.payroll_id, t);
        if ("code" in payroll)
            return fail(payroll.code, payroll.message);
        const manual = manualOf(line, req.body || {});
        if ("error" in manual)
            return fail(400, manual.error);
        const values = await recompute(line, manual, t);
        if (values.net < 0)
            return fail(400, negativeNet(values.net));
        await line.update({ ...manual, ...values, updatedAt: new Date() }, { transaction: t });
        await refreshTotals(payroll, t);
        await t.commit();
        await reply(res, payroll._uuid, "Successfully updated payroll line");
    }
    catch (error) {
        await t.rollback();
        (0, bansiHelpers_1.sendError)(res, error, "Error updating payroll line");
    }
};
exports.updatePayrollLine = updatePayrollLine;
/** DELETE /payroll/line/:id — ເອົາຄົນອອກຈາກໃບຮ່າງ (ຄິດໄລ່ໃໝ່ຈະເພີ່ມຄືນ ຖ້າຍັງຕ້ອງຈ່າຍ) */
const deletePayrollLine = async (req, res) => {
    const t = await payroll_1.default.sequelize.transaction();
    try {
        const line = await payrollLine_1.default.findByPk((0, bansiHelpers_1.decodeId)(req), { transaction: t });
        const payroll = line ? await draftOf(line.payroll_id, t) : { code: 404, message: "ບໍ່ພົບລາຍການເງິນເດືອນ" };
        if ("code" in payroll) {
            await t.rollback();
            res.status(payroll.code).json({ message: payroll.message });
            return;
        }
        await line.destroy({ transaction: t });
        await refreshTotals(payroll, t);
        await t.commit();
        await reply(res, payroll._uuid, "Successfully deleted payroll line");
    }
    catch (error) {
        await t.rollback();
        (0, bansiHelpers_1.sendError)(res, error, "Error deleting payroll line");
    }
};
exports.deletePayrollLine = deletePayrollLine;
/** DELETE /payroll/:id — ລຶບໃບຮ່າງທັງໃບ */
const deletePayroll = async (req, res) => {
    const t = await payroll_1.default.sequelize.transaction();
    try {
        const payroll = await draftOf((0, bansiHelpers_1.decodeId)(req), t);
        if ("code" in payroll) {
            await t.rollback();
            res.status(payroll.code).json({ message: payroll.message });
            return;
        }
        await payrollLine_1.default.destroy({ where: { payroll_id: payroll._uuid }, transaction: t });
        await payroll.destroy({ transaction: t });
        await t.commit();
        res.status(200).json({ message: "Successfully deleted payroll" });
    }
    catch (error) {
        await t.rollback();
        (0, bansiHelpers_1.sendError)(res, error, "Error deleting payroll");
    }
};
exports.deletePayroll = deletePayroll;
/**
 * PUT /payroll/pay/:id { account_id, pay_date?, description? } — ຈ່າຍເງິນເດືອນ: ຍອດສຸດທິລວມອອກຈາກບັນຊີເງິນຄັງ
 * (ສະກຸນກີບ, ຍອດໃຊ້ໄດ້ຕ້ອງພໍ) + ລົງບັນຊີຄູ່ (ໜີ້ ເງິນເດືອນ + ປກສ ບໍລິສັດ / ມີ ເງິນສົດ-ທະນາຄານ, ປກສ ຄ້າງຈ່າຍ,
 * ອາກອນຄ້າງຈ່າຍ, ຫັກອື່ນ). ວັນທີຈ່າຍ: ບໍ່ສົ່ງ = ມື້ນີ້, ບໍ່ກ່ອນເດືອນຂອງເງິນເດືອນ ແລະ ບໍ່ເກີນມື້ນີ້
 */
const payPayroll = async (req, res) => {
    const t = await payroll_1.default.sequelize.transaction();
    const fail = async (code, message) => {
        await t.rollback();
        res.status(code).json({ message });
    };
    try {
        const payroll = await draftOf((0, bansiHelpers_1.decodeId)(req), t);
        if ("code" in payroll)
            return fail(payroll.code, payroll.message);
        const body = req.body || {};
        const lines = await payrollLine_1.default.findAll({ where: { payroll_id: payroll._uuid }, transaction: t });
        if (!lines.length)
            return fail(400, "ໃບເງິນເດືອນນີ້ບໍ່ມີພະນັກງານ");
        const negative = lines.find((l) => Number(l.net) < 0);
        if (negative)
            return fail(400, `${negative.emp_code} ${negative.employee_name}: ເງິນເດືອນສຸດທິຕິດລົບ`);
        const total = Number(payroll.total_net) || 0;
        if (total <= 0)
            return fail(400, "ຍອດເງິນເດືອນສຸດທິຕ້ອງຫຼາຍກວ່າ 0");
        const payDate = (0, journalHelpers_1.entryDateOf)(body.pay_date, "ວັນທີຈ່າຍເງິນເດືອນ");
        if ("error" in payDate)
            return fail(400, payDate.error);
        if (payDate.date < (0, workCalendar_1.monthOf)(payroll.period).start)
            return fail(400, "ວັນທີຈ່າຍຕ້ອງບໍ່ກ່ອນເດືອນຂອງເງິນເດືອນ");
        const accountId = Number(body.account_id);
        if (!Number.isInteger(accountId))
            return fail(400, "ກະລຸນາເລືອກບັນຊີທີ່ຈ່າຍເງິນ");
        const account = await treasuryAcount_1.default.findByPk(accountId, { transaction: t, lock: t.LOCK.UPDATE });
        if (!account || Number(account.status) !== 1)
            return fail(400, "ບັນຊີທີ່ຈ່າຍເງິນບໍ່ມີ ຫຼື ປິດໃຊ້ງານແລ້ວ");
        const type = await typeTreasury_1.default.findByPk(account.type_treasuryid, {
            include: [{ model: currencyModel_1.default, as: "currency", attributes: ["_id", "name"] }],
            transaction: t,
        });
        if (!(0, glCore_1.isBaseCurrency)(type?.currency))
            return fail(400, "ຈ່າຍເງິນເດືອນໄດ້ສະເພາະບັນຊີສະກຸນກີບ (LAK)");
        if ((Number(account.balance_treasury) || 0) < total)
            return fail(400, "ຍອດເງິນທີ່ໃຊ້ໄດ້ຂອງບັນຊີບໍ່ພໍຈ່າຍເງິນເດືອນ");
        const actor = Number((0, bansiHelpers_1.actorOf)(req)) || null;
        const number = `SAL-${payroll.period}`;
        const description = String(body.description ?? "").trim().slice(0, 255) || `ຈ່າຍເງິນເດືອນ ${periodText(payroll.period)}`;
        await (0, accountMovement_1.moveBalance)(account, {
            direction: accountMovement_1.MOVE_OUT, amount: total, source: "PAYROLL", sourceId: payroll._uuid,
            docNumber: number, date: payDate.date, description, actorId: actor,
        }, t);
        await payroll.update({
            status: PAID, number, pay_date: payDate.date, account_id: accountId, description, paidbyid: actor, paidAt: new Date(), updatedAt: new Date(),
        }, { transaction: t });
        // ລົງບັນຊີຄູ່ — ບໍ່ສຳເລັດ (ເຊັ່ນ ຍັງບໍ່ຜູກບັນຊີ, ປີປິດແລ້ວ) = ບໍ່ຈ່າຍ
        await (0, glPosting_1.postPayroll)(payroll, t, actor);
        await t.commit();
        // ແຈ້ງພະນັກງານແຕ່ລະຄົນວ່າໂອນເງິນເດືອນແລ້ວ (ຫຼັງ commit — ແຈ້ງບໍ່ສຳເລັດ ບໍ່ກະທົບການຈ່າຍ)
        await (0, notificationController_1.notify)(lines.map((l) => ({
            employee_id: Number(l.employee_id),
            type: "payroll",
            title: `ເງິນເດືອນ ${periodText(payroll.period)} ໂອນແລ້ວ 💰`,
            body: `ຍອດສຸດທິ ₭ ${Math.round(Number(l.net) || 0).toLocaleString("en-US")} — ເບິ່ງສະລິບເງິນເດືອນໄດ້ໃນແອັບ`,
            ref: `payroll:${payroll.period}`,
            createdbyid: actor,
            push: true,
        })));
        // ລາຍຮັບ "ເງິນເດືອນ" ໃນບັນຊີລາຍຮັບ-ລາຍຈ່າຍສ່ວນຕົວຂອງແຕ່ລະຄົນ (ແອັບ) — ບໍ່ສຳເລັດ ບໍ່ກະທົບການຈ່າຍ
        await (0, myMoneyController_1.recordSalaryIncome)(payroll._uuid, payDate.date, `ເງິນເດືອນ ${periodText(payroll.period)}`, lines)
            .catch((error) => console.error("❌ salary income:", error));
        await reply(res, payroll._uuid, "Successfully paid payroll");
    }
    catch (error) {
        await t.rollback();
        if ((0, glCore_1.replyGlError)(res, error))
            return;
        (0, bansiHelpers_1.sendError)(res, error, "Error paying payroll");
    }
};
exports.payPayroll = payPayroll;
/** PUT /payroll/unpay/:id — ຍົກເລີກການຈ່າຍ: ຄືນເງິນເຂົ້າບັນຊີ + ກັບລາຍການບັນຊີຄູ່ ແລ້ວກັບເປັນໃບຮ່າງ */
const unpayPayroll = async (req, res) => {
    const t = await payroll_1.default.sequelize.transaction();
    const fail = async (code, message) => {
        await t.rollback();
        res.status(code).json({ message });
    };
    try {
        const payroll = await payroll_1.default.findByPk((0, bansiHelpers_1.decodeId)(req), { transaction: t, lock: t.LOCK.UPDATE });
        if (!payroll)
            return fail(404, "ບໍ່ພົບໃບເງິນເດືອນ");
        if (Number(payroll.status) !== PAID)
            return fail(400, "ໃບເງິນເດືອນນີ້ຍັງບໍ່ໄດ້ຈ່າຍ");
        const actor = Number((0, bansiHelpers_1.actorOf)(req)) || null;
        const account = payroll.account_id
            ? await treasuryAcount_1.default.findByPk(payroll.account_id, { transaction: t, lock: t.LOCK.UPDATE })
            : null;
        if (account) {
            await (0, accountMovement_1.moveBalance)(account, {
                direction: accountMovement_1.MOVE_IN, amount: Number(payroll.total_net) || 0, source: "PAYROLL_CANCEL", sourceId: payroll._uuid,
                docNumber: payroll.number, description: `ຍົກເລີກ${payroll.description ? ` — ${payroll.description}` : ""}`, actorId: actor,
            }, t);
        }
        await (0, glCore_1.reverseSource)("PAYROLL", payroll._uuid, t, actor);
        await payroll.update({
            status: DRAFT, number: null, pay_date: null, account_id: null, paidbyid: null, paidAt: null, updatedAt: new Date(),
        }, { transaction: t });
        await t.commit();
        await (0, myMoneyController_1.removeSalaryIncome)(payroll._uuid).catch((error) => console.error("❌ salary income:", error));
        await reply(res, payroll._uuid, "Successfully cancelled payroll payment");
    }
    catch (error) {
        await t.rollback();
        if ((0, glCore_1.replyGlError)(res, error))
            return;
        (0, bansiHelpers_1.sendError)(res, error, "Error cancelling payroll payment");
    }
};
exports.unpayPayroll = unpayPayroll;
