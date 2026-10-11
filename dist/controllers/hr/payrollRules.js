"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.overtimeByEmployee = exports.NO_OVERTIME = exports.computeLine = exports.LINE_MODES = exports.MODE_ALWAYS = exports.MODE_NONE = exports.MODE_POLICY = exports.MODE_MANUAL = exports.progressiveTax = exports.loadPayrollSettings = exports.findPayrollSetting = exports.presentSettings = exports.parseBrackets = exports.otTotals = exports.otFixedOf = exports.OT_PAY_TYPES = exports.OT_PAY_LUMP = exports.OT_PAY_HOURLY = exports.OT_PAY_RATE = exports.otRateOf = exports.OT_KINDS = exports.DEFAULT_SETTINGS = exports.DEFAULT_TAX_BRACKETS = void 0;
const sequelize_1 = require("sequelize");
const payrollSetting_1 = __importDefault(require("../../models/payrollSetting"));
const overtime_1 = __importDefault(require("../../models/overtime"));
exports.DEFAULT_TAX_BRACKETS = [
    { upto: 2500000, rate: 0 },
    { upto: 5000000, rate: 5 },
    { upto: 15000000, rate: 10 },
    { upto: 25000000, rate: 15 },
    { upto: 65000000, rate: 20 },
    { upto: null, rate: 25 },
];
exports.DEFAULT_SETTINGS = {
    sso_enabled: true,
    sso_employee_rate: 5.5,
    sso_employer_rate: 6,
    sso_salary_cap: 4500000,
    tax_enabled: true,
    tax_brackets: exports.DEFAULT_TAX_BRACKETS,
    ot_tax_free_salary: 3000000,
    late_grace_minutes: 0,
    deduct_absent: true,
    deduct_late: true,
    ot_hours_per_day: 8,
    ot_rate_normal: 150,
    ot_rate_night: 200,
    ot_rate_dayoff: 250,
    ot_rate_dayoff_night: 300,
    updatedAt: null,
};
/** ປະເພດ OT (tbl_overtime.kind) → ຖັນອັດຕາໃນຕັ້ງຄ່າ */
exports.OT_KINDS = {
    1: "ot_rate_normal",
    2: "ot_rate_night",
    3: "ot_rate_dayoff",
    4: "ot_rate_dayoff_night",
};
/** % ຂອງປະເພດ OT */
const otRateOf = (kind, settings) => settings[exports.OT_KINDS[kind] ?? "ot_rate_normal"];
exports.otRateOf = otRateOf;
/** ວິທີຈ່າຍ OT (tbl_overtime.pay_type) — ຕາມອັດຕາ (ເງິນເດືອນ × %), ກຳນົດເງິນຕໍ່ຊົ່ວໂມງ, ເໝົາຈ່າຍ */
exports.OT_PAY_RATE = 1;
exports.OT_PAY_HOURLY = 2;
exports.OT_PAY_LUMP = 3;
exports.OT_PAY_TYPES = [exports.OT_PAY_RATE, exports.OT_PAY_HOURLY, exports.OT_PAY_LUMP];
/** ເງິນຂອງ OT 1 ລາຍການທີ່ກຳນົດເງິນເອງ (ຕາມອັດຕາ = 0 — ຄິດຕອນເຮັດເງິນເດືອນ) */
const otFixedOf = (r) => {
    const amount = Number(r.amount) || 0;
    const type = Number(r.pay_type);
    if (type === exports.OT_PAY_HOURLY)
        return Math.round(amount * (Number(r.hours) || 0));
    if (type === exports.OT_PAY_LUMP)
        return Math.round(amount);
    return 0;
};
exports.otFixedOf = otFixedOf;
/**
 * OT ລວມຂອງລາຍການ: hours ຊົ່ວໂມງທັງໝົດ, weighted ຊົ່ວໂມງຄູນອັດຕາ (Σ ຊົ່ວໂມງ × % ÷ 100 ສະເພາະ "ຕາມອັດຕາ"),
 * fixed ເງິນທີ່ກຳນົດເອງ (ຕໍ່ຊົ່ວໂມງ + ເໝົາຈ່າຍ)
 */
const otTotals = (rows, settings) => {
    const round2 = (n) => Math.round(n * 100) / 100;
    return rows.reduce((sum, r) => {
        const hours = Number(r.hours) || 0;
        const byRate = Number(r.pay_type || exports.OT_PAY_RATE) === exports.OT_PAY_RATE;
        return {
            hours: round2(sum.hours + hours),
            weighted: byRate ? round2(sum.weighted + (hours * (0, exports.otRateOf)(Number(r.kind), settings)) / 100) : sum.weighted,
            fixed: sum.fixed + (0, exports.otFixedOf)(r),
        };
    }, { hours: 0, weighted: 0, fixed: 0 });
};
exports.otTotals = otTotals;
/** ຂັ້ນອາກອນຈາກ JSON / array — ຂັ້ນສູງຂຶ້ນເລື້ອຍໆ, ອັດຕາ 0–100, ຂັ້ນສຸດທ້າຍ upto = null; ຜິດ = null */
const parseBrackets = (raw) => {
    let list = raw;
    if (typeof raw === "string") {
        try {
            list = JSON.parse(raw);
        }
        catch {
            return null;
        }
    }
    if (!Array.isArray(list) || !list.length || list.length > 20)
        return null;
    const brackets = [];
    let previous = 0;
    for (const [index, item] of list.entries()) {
        const last = index === list.length - 1;
        const rate = Number(item?.rate);
        if (!Number.isFinite(rate) || rate < 0 || rate > 100)
            return null;
        if (last) {
            brackets.push({ upto: null, rate: Math.round(rate * 100) / 100 });
            break;
        }
        const upto = Number(item?.upto);
        if (!Number.isFinite(upto) || upto <= previous)
            return null;
        brackets.push({ upto: Math.round(upto), rate: Math.round(rate * 100) / 100 });
        previous = upto;
    }
    return brackets;
};
exports.parseBrackets = parseBrackets;
const presentSettings = (row) => {
    if (!row)
        return exports.DEFAULT_SETTINGS;
    return {
        sso_enabled: Number(row.sso_enabled) === 1,
        sso_employee_rate: Number(row.sso_employee_rate) || 0,
        sso_employer_rate: Number(row.sso_employer_rate) || 0,
        sso_salary_cap: Number(row.sso_salary_cap) || 0,
        tax_enabled: Number(row.tax_enabled) === 1,
        tax_brackets: (0, exports.parseBrackets)(row.tax_brackets) ?? exports.DEFAULT_TAX_BRACKETS,
        ot_tax_free_salary: Number(row.ot_tax_free_salary) || 0,
        late_grace_minutes: Number(row.late_grace_minutes) || 0,
        deduct_absent: Number(row.deduct_absent) === 1,
        deduct_late: Number(row.deduct_late) === 1,
        ot_hours_per_day: Number(row.ot_hours_per_day) || exports.DEFAULT_SETTINGS.ot_hours_per_day,
        ot_rate_normal: Number(row.ot_rate_normal) || 0,
        ot_rate_night: Number(row.ot_rate_night) || 0,
        ot_rate_dayoff: Number(row.ot_rate_dayoff) || 0,
        ot_rate_dayoff_night: Number(row.ot_rate_dayoff_night) || 0,
        updatedAt: row.updatedAt ?? null,
    };
};
exports.presentSettings = presentSettings;
const findPayrollSetting = (t) => payrollSetting_1.default.findOne({ order: [["_uuid", "ASC"]], transaction: t });
exports.findPayrollSetting = findPayrollSetting;
const loadPayrollSettings = async (t) => (0, exports.presentSettings)(await (0, exports.findPayrollSetting)(t));
exports.loadPayrollSettings = loadPayrollSettings;
/** ອາກອນແບບຂັ້ນໄດ — ແຕ່ລະອັດຕາຄິດສະເພາະສ່ວນທີ່ຢູ່ໃນຂັ້ນຂອງມັນ */
const progressiveTax = (taxable, brackets) => {
    let tax = 0;
    let lower = 0;
    for (const bracket of brackets) {
        const upper = bracket.upto ?? Infinity;
        if (taxable > lower)
            tax += ((Math.min(taxable, upper) - lower) * bracket.rate) / 100;
        if (taxable <= upper)
            break;
        lower = upper;
    }
    return Math.round(tax);
};
exports.progressiveTax = progressiveTax;
/**
 * ວິທີຄິດແຕ່ລະກຸ່ມການຫັກຂອງ 1 ຄົນ (deduction_mode, sso_mode, tax_mode) — ນະໂຍບາຍສະເພາະຄົນ:
 * MANUAL ຈຳນວນທີ່ປ້ອນເອງ, POLICY ຕາມນະໂຍບາຍບໍລິສັດ (ຄ່າເລີ່ມຕົ້ນ), NONE ບໍ່ຫັກ, ALWAYS ຫັກສະເໝີ (ເຖິງບໍລິສັດປິດໄວ້)
 */
exports.MODE_MANUAL = 0;
exports.MODE_POLICY = 1;
exports.MODE_NONE = 2;
exports.MODE_ALWAYS = 3;
exports.LINE_MODES = [exports.MODE_MANUAL, exports.MODE_POLICY, exports.MODE_NONE, exports.MODE_ALWAYS];
const kip = (value) => Math.max(0, Math.round(Number(value) || 0));
/** ຈຳນວນຕາມວິທີຄິດ — policyOn = ນະໂຍບາຍບໍລິສັດຂອງກຸ່ມນັ້ນເປີດຢູ່ບໍ່ */
const byMode = (mode, policyOn, computed, manual) => {
    const m = Number(mode);
    if (m === exports.MODE_MANUAL)
        return kip(manual);
    if (m === exports.MODE_NONE)
        return 0;
    return m === exports.MODE_ALWAYS || policyOn ? computed() : 0;
};
/**
 * ຄິດເງິນເດືອນ 1 ຄົນ (ກີບ ບໍ່ມີທົດສະນິຍົມ):
 * - ເງິນເດືອນຕາມວັນ = ພື້ນຖານ × ມື້ທີ່ເປັນພະນັກງານ ÷ ມື້ເຮັດວຽກຂອງເດືອນ (ເຂົ້າ/ອອກກາງເດືອນ)
 * - ຫັກຂາດວຽກ = ຄ່າແຮງຕໍ່ມື້ × (ຂາດ + ລາບໍ່ໄດ້ເງິນ); ຫັກມາຊ້າ = ຄ່າແຮງຕໍ່ນາທີ × ນາທີ (ຫັກບໍ່ເກີນເງິນເດືອນຕາມວັນ)
 * - ລ່ວງເວລາ = ຄ່າແຮງຕໍ່ມື້ ÷ ຊົ່ວໂມງຕໍ່ມື້ × ຊົ່ວໂມງຄູນອັດຕາ + OT ທີ່ກຳນົດເງິນເອງ (ຫຼື ຈຳນວນທີ່ປ້ອນເອງທັງໝົດ)
 * - gross = ເງິນເດືອນຕາມວັນ − ຫັກ + ເງິນອຸດໜູນ + ລ່ວງເວລາ + ໂບນັດ
 * - ປກສ ຄິດຈາກ gross (ບໍ່ເກີນເພດານ); ອາກອນຄິດຈາກ gross − ປກສ ພະນັກງານ (− ລ່ວງເວລາທີ່ຍົກເວັ້ນ)
 * - ແຕ່ລະກຸ່ມ (ຂາດ/ຊ້າ, ປກສ, ອາກອນ) ຕາມ *_mode ຂອງຄົນນັ້ນ: ຕາມນະໂຍບາຍບໍລິສັດ (ປິດ = 0), ຫັກສະເໝີ, ບໍ່ຫັກ ຫຼື ປ້ອນເອງ
 * - net = gross − ປກສ ພະນັກງານ − ອາກອນ − ຫັກອື່ນ
 */
const computeLine = (line, settings, minutesPerDay) => {
    const basic = kip(line.basic_salary);
    const workdays = Number(line.workdays) || 0;
    const daily = workdays > 0 ? basic / workdays : 0;
    const base_pay = workdays > 0 ? Math.round((basic * Math.min(Number(line.employed_days) || 0, workdays)) / workdays) : basic;
    const absenceWanted = byMode(line.deduction_mode, settings.deduct_absent, () => Math.round(daily * ((Number(line.absent_days) || 0) + (Number(line.unpaid_days) || 0))), line.absence_deduction);
    const lateWanted = byMode(line.deduction_mode, settings.deduct_late, () => Math.round((daily / Math.max(1, minutesPerDay)) * (Number(line.late_minutes) || 0)), line.late_deduction);
    const absence_deduction = Math.min(absenceWanted, base_pay);
    const late_deduction = Math.min(lateWanted, base_pay - absence_deduction);
    const allowance = kip(line.allowance);
    const overtime = Number(line.overtime_mode) === exports.MODE_MANUAL
        ? kip(line.overtime)
        : Math.round((daily / Math.max(1, settings.ot_hours_per_day)) * (Number(line.ot_weighted_hours) || 0)) + kip(line.ot_fixed_amount);
    const bonus = kip(line.bonus);
    const gross = base_pay - absence_deduction - late_deduction + allowance + overtime + bonus;
    const sso_base = settings.sso_salary_cap > 0 ? Math.min(gross, settings.sso_salary_cap) : gross;
    const ssoOf = (rate) => () => Math.round((sso_base * rate) / 100);
    const sso_employee = byMode(line.sso_mode, settings.sso_enabled, ssoOf(settings.sso_employee_rate), line.sso_employee);
    const sso_employer = byMode(line.sso_mode, settings.sso_enabled, ssoOf(settings.sso_employer_rate), line.sso_employer);
    const otFree = settings.ot_tax_free_salary > 0 && basic <= settings.ot_tax_free_salary ? overtime : 0;
    const taxable = Math.max(0, gross - sso_employee - otFree);
    const tax = byMode(line.tax_mode, settings.tax_enabled, () => (0, exports.progressiveTax)(taxable, settings.tax_brackets), line.tax);
    const other_deduction = kip(line.other_deduction);
    const net = gross - sso_employee - tax - other_deduction;
    return {
        basic_salary: basic, base_pay, absence_deduction, late_deduction, allowance, overtime, bonus, gross,
        sso_base, sso_employee, sso_employer, taxable, tax, other_deduction, net,
    };
};
exports.computeLine = computeLine;
exports.NO_OVERTIME = { hours: 0, weighted: 0, fixed: 0 };
/** OT ລວມຂອງແຕ່ລະຄົນໃນຊ່ວງ → Map(employee_id, { ຊົ່ວໂມງ, ຊົ່ວໂມງຄູນອັດຕາ }) — ໃຊ້ຄິດເງິນເດືອນ */
const overtimeByEmployee = async (employeeIds, start, end, settings, t) => {
    const result = new Map();
    if (!employeeIds.length)
        return result;
    const rows = await overtime_1.default.findAll({
        where: { employee_id: { [sequelize_1.Op.in]: employeeIds }, work_date: { [sequelize_1.Op.between]: [start, end] } },
        attributes: ["employee_id", "hours", "kind", "pay_type", "amount"],
        raw: true,
        transaction: t,
    });
    const byEmployee = new Map();
    for (const row of rows) {
        const id = Number(row.employee_id);
        byEmployee.set(id, [...(byEmployee.get(id) ?? []), row]);
    }
    for (const [id, list] of byEmployee)
        result.set(id, (0, exports.otTotals)(list, settings));
    return result;
};
exports.overtimeByEmployee = overtimeByEmployee;
