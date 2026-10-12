"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteOvertime = exports.updateOvertime = exports.createOvertime = exports.getMyOvertime = exports.getOvertimes = void 0;
const moment_1 = __importDefault(require("moment"));
const sequelize_1 = require("sequelize");
const overtime_1 = __importDefault(require("../../models/overtime"));
const employee_1 = __importDefault(require("../../models/employee"));
const department_1 = __importDefault(require("../../models/department"));
const payroll_1 = __importDefault(require("../../models/payroll"));
const bansiHelpers_1 = require("../bansi/bansiHelpers");
const hrHelpers_1 = require("./hrHelpers");
const payrollRules_1 = require("./payrollRules");
const payrollController_1 = require("./payrollController");
const attendanceController_1 = require("./attendanceController");
const workCalendar_1 = require("./workCalendar");
/**
 * ການເຮັດວຽກລ່ວງເວລາ (OT) — HR ບັນທຶກມື້ທີ່ພະນັກງານເຮັດ OT (ຫຼາຍຄົນພ້ອມກັນໄດ້): ເວລາເລີ່ມ–ເລີກ (ຂ້າມທ່ຽງຄືນໄດ້) ຫຼື
 * ຈຳນວນຊົ່ວໂມງ + ປະເພດ + ວິທີຈ່າຍ: ຕາມອັດຕາ (% ຢູ່ ຕັ້ງຄ່າເງິນເດືອນ), ກຳນົດເງິນຕໍ່ຊົ່ວໂມງ ຫຼື ເໝົາຈ່າຍ. ໃບເງິນເດືອນຂອງເດືອນລວມ OT ໃຫ້ (ສ້າງ / ຄິດໄລ່ໃໝ່);
 * ເດືອນທີ່ຈ່າຍເງິນເດືອນແລ້ວ ບັນທຶກ/ແກ້/ລຶບ OT ບໍ່ໄດ້
 */
const PAYROLL_PAID = 2;
const KINDS = Object.keys(payrollRules_1.OT_KINDS).map(Number);
const MAX_HOURS = 24;
const employeeInclude = {
    model: employee_1.default,
    as: "employee",
    attributes: ["_uuid", "emp_code", "first_name", "last_name", "profile", "basic_salary"],
    include: [{ model: department_1.default, as: "department", attributes: ["_uuid", "depart_name"] }],
};
/** ບໍ່ສົ່ງເງິນເດືອນພື້ນຖານອອກໄປ (ໃຊ້ຄິດປະມານຄ່າ OT ຢູ່ backend ເທົ່ານັ້ນ) */
const present = (row) => {
    const { employee, ...r } = row.get({ plain: true });
    const { basic_salary: _salary, ...person } = employee ?? {};
    return {
        ...r,
        hours: Number(r.hours) || 0,
        amount: Number(r.amount) || 0,
        /** ເງິນຂອງລາຍການທີ່ກຳນົດເງິນເອງ (ຕໍ່ຊົ່ວໂມງ × ຊົ່ວໂມງ / ເໝົາຈ່າຍ); ຕາມອັດຕາ = 0 (ຄິດຕອນເຮັດເງິນເດືອນ) */
        fixed_amount: (0, payrollRules_1.otFixedOf)(r),
        employee: employee ? { ...person, profile_url: (0, hrHelpers_1.profileUrl)(person.profile) } : null,
    };
};
const minutesOf = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
/** ຊ່ວງເວລາເປັນນາທີ — ເລີກ ≤ ເລີ່ມ = ຂ້າມທ່ຽງຄືນ */
const spanOf = (start, end) => {
    const from = minutesOf(start);
    let to = minutesOf(end);
    if (to <= from)
        to += 24 * 60;
    return { from, to };
};
const payrollPaidFor = async (date, t) => !!(await payroll_1.default.count({ where: { period: date.slice(0, 7), status: PAYROLL_PAID }, transaction: t }));
const paidMessage = (date) => `ເດືອນ ${(0, moment_1.default)(date).format("MM/YYYY")} ຈ່າຍເງິນເດືອນແລ້ວ — ບັນທຶກ ຫຼື ແກ້ OT ຂອງເດືອນນີ້ບໍ່ໄດ້ (ຍົກເລີກການຈ່າຍກ່ອນ)`;
/** ກວດຂໍ້ມູນຈາກຟອມ — ມີເວລາເລີ່ມ–ເລີກ = ຄິດຊົ່ວໂມງໃຫ້, ບໍ່ມີ = ໃຊ້ hours ທີ່ສົ່ງມາ */
const parseInput = (body) => {
    const workDate = (0, bansiHelpers_1.toDateOnly)(body.work_date);
    if (!workDate)
        return { error: "ກະລຸນາເລືອກວັນທີ" };
    if (workDate.slice(0, 7) > (0, workCalendar_1.currentPeriod)())
        return { error: "ບັນທຶກ OT ຂອງເດືອນທີ່ຍັງບໍ່ຮອດບໍ່ໄດ້" };
    const kind = Number(body.kind);
    if (!KINDS.includes(kind))
        return { error: "ກະລຸນາເລືອກປະເພດ OT" };
    const start = String(body.start_time ?? "");
    const end = String(body.end_time ?? "");
    let hours;
    if (start || end) {
        if (!workCalendar_1.HHMM.test(start) || !workCalendar_1.HHMM.test(end))
            return { error: "ເວລາເລີ່ມ / ເລີກບໍ່ຖືກຕ້ອງ" };
        if (start === end)
            return { error: "ເວລາເລີ່ມ ແລະ ເວລາເລີກຕ້ອງບໍ່ຄືກັນ" };
        const span = spanOf(start, end);
        hours = Math.round(((span.to - span.from) / 60) * 100) / 100;
    }
    else {
        hours = Math.round((Number(body.hours) || 0) * 100) / 100;
    }
    if (!(hours > 0) || hours > MAX_HOURS)
        return { error: `ຊົ່ວໂມງ OT ຕ້ອງຫຼາຍກວ່າ 0 ແລະ ບໍ່ເກີນ ${MAX_HOURS}` };
    const payType = Number(body.pay_type ?? payrollRules_1.OT_PAY_RATE);
    if (!payrollRules_1.OT_PAY_TYPES.includes(payType))
        return { error: "ວິທີຈ່າຍ OT ບໍ່ຖືກຕ້ອງ" };
    const amount = payType === payrollRules_1.OT_PAY_RATE ? 0 : Math.round(Number(body.amount) || 0);
    if (payType !== payrollRules_1.OT_PAY_RATE && !(amount > 0))
        return { error: "ກະລຸນາປ້ອນຍອດເງິນ OT" };
    const note = String(body.note ?? "").trim().slice(0, 255) || null;
    return { work_date: workDate, start_time: start || null, end_time: end || null, hours, kind, pay_type: payType, amount, note };
};
/** ເວລາຊ້ອນກັບ OT ອື່ນຂອງຄົນດຽວກັນໃນມື້ດຽວກັນ (ສະເພາະລາຍການທີ່ມີເວລາ) */
const clashOf = async (employeeId, input, exceptId, t) => {
    if (!input.start_time || !input.end_time)
        return null;
    const mine = spanOf(input.start_time, input.end_time);
    const others = await overtime_1.default.findAll({
        where: { employee_id: employeeId, work_date: input.work_date, ...(exceptId ? { _uuid: { [sequelize_1.Op.ne]: exceptId } } : {}) },
        transaction: t,
    });
    return others.find((o) => {
        if (!o.start_time || !o.end_time)
            return false;
        const other = spanOf(o.start_time, o.end_time);
        return mine.from < other.to && other.from < mine.to;
    }) ?? null;
};
/**
 * POST /overtime/fetch { period: "YYYY-MM", employee_id? } — OT ຂອງເດືອນ (ວັນທີ, ເວລາ, ເງິນ pay ໂດຍປະມານ) + ສະຫຼຸບລາຍຄົນ (ຊົ່ວໂມງຕາມປະເພດ,
 * ຊົ່ວໂມງຄູນອັດຕາ, ຄ່າ OT ໂດຍປະມານຕາມຕັ້ງຄ່າປັດຈຸບັນ) + ມື້ຂອງເດືອນ (ມື້ເຮັດວຽກ / ວັນພັກ — ຟອມແນະນຳປະເພດ)
 */
const getOvertimes = async (req, res) => {
    try {
        const raw = String(req.body?.period ?? "");
        const period = workCalendar_1.PERIOD.test(raw) ? raw : (0, workCalendar_1.currentPeriod)();
        const employeeId = Number(req.body?.employee_id) || null;
        const { start, end, dates } = (0, workCalendar_1.monthOf)(period);
        const [rows, settings, company, holidays, paid] = await Promise.all([
            overtime_1.default.findAll({
                where: { work_date: { [sequelize_1.Op.between]: [start, end] }, ...(employeeId ? { employee_id: employeeId } : {}) },
                include: [employeeInclude],
                order: [["work_date", "DESC"], ["start_time", "ASC"], ["_uuid", "ASC"]],
            }),
            (0, payrollRules_1.loadPayrollSettings)(),
            (0, workCalendar_1.findCompany)(),
            (0, workCalendar_1.holidaysBetween)(start, end),
            payrollPaidFor(start),
        ]);
        const rules = (0, workCalendar_1.workRulesOf)(company);
        const days = dates.map((date) => ({ date, workday: (0, workCalendar_1.isWorkday)(date, rules, holidays), holiday: holidays.get(date) ?? null }));
        const workdays = days.filter((d) => d.workday).length;
        const people = new Map();
        for (const row of rows) {
            const id = Number(row.employee_id);
            const entry = people.get(id) ?? { employee: present(row).employee, basic: Number(row.employee?.basic_salary) || 0, rows: [] };
            entry.rows.push(row);
            people.set(id, entry);
        }
        const summary = [...people.entries()].map(([employeeId, p]) => {
            const totals = (0, payrollRules_1.otTotals)(p.rows, settings);
            const byKind = Object.fromEntries(KINDS.map((k) => [k, p.rows.filter((r) => Number(r.kind) === k).reduce((n, r) => n + (Number(r.hours) || 0), 0)]));
            const hourly = workdays > 0 ? p.basic / workdays / Math.max(1, settings.ot_hours_per_day) : 0;
            return {
                employee_id: employeeId,
                employee: p.employee,
                records: p.rows.length,
                hours: totals.hours,
                weighted_hours: totals.weighted,
                by_kind: byKind,
                /** ເງິນທີ່ກຳນົດເອງ (ຕໍ່ຊົ່ວໂມງ + ເໝົາຈ່າຍ) */
                fixed_amount: totals.fixed,
                estimate: Math.round(hourly * totals.weighted) + totals.fixed,
            };
        }).sort((a, b) => b.hours - a.hours);
        // ເງິນຂອງແຕ່ລະລາຍການ — ຕາມອັດຕາ: ເງິນເດືອນ ÷ ມື້ເຮັດວຽກ ÷ ຊົ່ວໂມງຕໍ່ມື້ × ຊົ່ວໂມງ × % (ໂດຍປະມານ — ຕົວເລກແທ້ຢູ່ໃບເງິນເດືອນ)
        const payOf = (row) => {
            if (Number(row.pay_type) !== payrollRules_1.OT_PAY_RATE)
                return (0, payrollRules_1.otFixedOf)(row);
            const basic = Number(row.employee?.basic_salary) || 0;
            const hourly = workdays > 0 ? basic / workdays / Math.max(1, settings.ot_hours_per_day) : 0;
            return Math.round((hourly * (Number(row.hours) || 0) * (0, payrollRules_1.otRateOf)(Number(row.kind), settings)) / 100);
        };
        res.status(200).json({
            period,
            paid,
            data: rows.map((row) => ({ ...present(row), pay: payOf(row) })),
            summary,
            days,
            rates: Object.fromEntries(KINDS.map((k) => [k, (0, payrollRules_1.otRateOf)(k, settings)])),
            hours_per_day: settings.ot_hours_per_day,
        });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting overtime");
    }
};
exports.getOvertimes = getOvertimes;
/**
 * GET /overtime/me?period=YYYY-MM — OT ຂອງຕົນເອງ (app ມືຖື): ລາຍການ (ວັນທີ, ເວລາ, ຊົ່ວໂມງ, ປະເພດ, ເງິນໂດຍປະມານ) + ສະຫຼຸບເດືອນ.
 * ເງິນເດືອນພື້ນຖານໃຊ້ຄິດປະມານເທົ່ານັ້ນ ບໍ່ສົ່ງອອກ; paid = ເດືອນນີ້ຈ່າຍເງິນເດືອນແລ້ວ (ຍອດແທ້ຢູ່ສະລິບ)
 */
const getMyOvertime = async (req, res) => {
    try {
        const self = await (0, attendanceController_1.selfEmployee)(req);
        if ("code" in self) {
            res.status(self.code).json({ message: self.message });
            return;
        }
        const me = self.employee;
        const raw = String(req.query.period ?? "");
        const period = workCalendar_1.PERIOD.test(raw) ? raw : (0, workCalendar_1.currentPeriod)();
        const { start, end, dates } = (0, workCalendar_1.monthOf)(period);
        const [rows, settings, company, holidays, paid] = await Promise.all([
            overtime_1.default.findAll({
                where: { employee_id: me._uuid, work_date: { [sequelize_1.Op.between]: [start, end] } },
                order: [["work_date", "DESC"], ["start_time", "ASC"], ["_uuid", "ASC"]],
            }),
            (0, payrollRules_1.loadPayrollSettings)(),
            (0, workCalendar_1.findCompany)(),
            (0, workCalendar_1.holidaysBetween)(start, end),
            payrollPaidFor(start),
        ]);
        const rules = (0, workCalendar_1.workRulesOf)(company);
        const workdays = dates.filter((date) => (0, workCalendar_1.isWorkday)(date, rules, holidays)).length;
        // ຄ່າແຮງຕໍ່ຊົ່ວໂມງ = ເງິນເດືອນ ÷ ມື້ເຮັດວຽກ ÷ ຊົ່ວໂມງຕໍ່ມື້ (ຄືກັບ POST /overtime/fetch)
        const hourly = workdays > 0 ? (Number(me.basic_salary) || 0) / workdays / Math.max(1, settings.ot_hours_per_day) : 0;
        const payOf = (row) => Number(row.pay_type) !== payrollRules_1.OT_PAY_RATE
            ? (0, payrollRules_1.otFixedOf)(row)
            : Math.round((hourly * (Number(row.hours) || 0) * (0, payrollRules_1.otRateOf)(Number(row.kind), settings)) / 100);
        const totals = (0, payrollRules_1.otTotals)(rows, settings);
        res.status(200).json({
            period,
            paid,
            data: rows.map((row) => ({
                _uuid: row._uuid,
                work_date: row.work_date,
                start_time: row.start_time,
                end_time: row.end_time,
                hours: Number(row.hours) || 0,
                kind: Number(row.kind),
                pay_type: Number(row.pay_type),
                note: row.note,
                pay: payOf(row),
            })),
            summary: {
                records: rows.length,
                hours: totals.hours,
                weighted_hours: totals.weighted,
                by_kind: Object.fromEntries(KINDS.map((k) => [k, rows.filter((r) => Number(r.kind) === k).reduce((n, r) => n + (Number(r.hours) || 0), 0)])),
                estimate: Math.round(hourly * totals.weighted) + totals.fixed,
            },
            rates: Object.fromEntries(KINDS.map((k) => [k, (0, payrollRules_1.otRateOf)(k, settings)])),
        });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting my overtime");
    }
};
exports.getMyOvertime = getMyOvertime;
/**
 * POST /overtime/create { work_date, employee_ids: number[], start_time?, end_time?, hours?, kind, pay_type, amount?, note? } —
 * ບັນທຶກ OT ໃຫ້ຫຼາຍຄົນພ້ອມກັນ (ເວລາດຽວກັນ); ຜິດຄົນດຽວ ບໍ່ບັນທຶກຈັກຄົນ
 */
const createOvertime = async (req, res) => {
    try {
        const body = req.body || {};
        const fail = (message) => res.status(400).json({ message });
        const input = parseInput(body);
        if ("error" in input)
            return fail(input.error);
        const ids = [...new Set((Array.isArray(body.employee_ids) ? body.employee_ids : []).map(Number).filter((n) => n > 0))];
        if (!ids.length)
            return fail("ກະລຸນາເລືອກພະນັກງານຢ່າງໜ້ອຍ 1 ຄົນ");
        if (ids.length > 500)
            return fail("ເລືອກພະນັກງານໄດ້ບໍ່ເກີນ 500 ຄົນຕໍ່ຄັ້ງ");
        if (await payrollPaidFor(input.work_date))
            return fail(paidMessage(input.work_date));
        const employees = await employee_1.default.findAll({ where: { _uuid: { [sequelize_1.Op.in]: ids } }, attributes: ["_uuid", "emp_code", "first_name", "start_date", "end_date", "work_status"] });
        if (employees.length !== ids.length)
            return fail("ບໍ່ພົບພະນັກງານບາງຄົນ");
        const notEmployed = employees.find((e) => !(0, workCalendar_1.employedOn)(e, input.work_date));
        if (notEmployed)
            return fail(`${notEmployed.emp_code} ${notEmployed.first_name} ບໍ່ໄດ້ເປັນພະນັກງານໃນວັນທີ ${(0, moment_1.default)(input.work_date).format("DD/MM/YYYY")}`);
        for (const e of employees) {
            const clash = await clashOf(e._uuid, input, null);
            if (clash)
                return fail(`${e.emp_code} ${e.first_name} ມີ OT ${clash.start_time}–${clash.end_time} ໃນມື້ນີ້ແລ້ວ (ເວລາຊ້ອນກັນ)`);
        }
        const actor = Number((0, bansiHelpers_1.actorOf)(req)) || null;
        const data = await overtime_1.default.bulkCreate(ids.map((employee_id) => ({ ...input, employee_id, createdbyid: actor, updatedbyid: actor })));
        await (0, payrollController_1.syncDraftOvertime)(input.work_date.slice(0, 7), ids);
        res.status(200).json({ message: `ບັນທຶກ OT ແລ້ວ ${data.length} ຄົນ · ${input.hours} ຊົ່ວໂມງ`, data });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error creating overtime");
    }
};
exports.createOvertime = createOvertime;
/** PUT /overtime/:id { work_date, start_time?, end_time?, hours?, kind, pay_type, amount?, note? } — ແກ້ OT 1 ລາຍການ (ພະນັກງານຄົນເດີມ) */
const updateOvertime = async (req, res) => {
    try {
        const row = await overtime_1.default.findByPk((0, bansiHelpers_1.decodeId)(req));
        if (!row) {
            res.status(404).json({ message: "ບໍ່ພົບລາຍການ OT" });
            return;
        }
        const fail = (message) => res.status(400).json({ message });
        const input = parseInput(req.body || {});
        if ("error" in input)
            return fail(input.error);
        for (const date of new Set([String(row.work_date), input.work_date])) {
            if (await payrollPaidFor(date))
                return fail(paidMessage(date));
        }
        const employee = await employee_1.default.findByPk(row.employee_id, { attributes: ["_uuid", "start_date", "end_date", "work_status"] });
        if (employee && !(0, workCalendar_1.employedOn)(employee, input.work_date))
            return fail(`ບໍ່ໄດ້ເປັນພະນັກງານໃນວັນທີ ${(0, moment_1.default)(input.work_date).format("DD/MM/YYYY")}`);
        const clash = await clashOf(Number(row.employee_id), input, row._uuid);
        if (clash)
            return fail(`ມີ OT ${clash.start_time}–${clash.end_time} ໃນມື້ນີ້ແລ້ວ (ເວລາຊ້ອນກັນ)`);
        const before = String(row.work_date).slice(0, 7);
        await row.update({ ...input, updatedbyid: Number((0, bansiHelpers_1.actorOf)(req)) || null, updatedAt: new Date() });
        for (const period of new Set([before, input.work_date.slice(0, 7)]))
            await (0, payrollController_1.syncDraftOvertime)(period, [Number(row.employee_id)]);
        res.status(200).json({ message: "Successfully updated overtime", data: row });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error updating overtime");
    }
};
exports.updateOvertime = updateOvertime;
/** DELETE /overtime/:id */
const deleteOvertime = async (req, res) => {
    try {
        const row = await overtime_1.default.findByPk((0, bansiHelpers_1.decodeId)(req));
        if (!row) {
            res.status(404).json({ message: "ບໍ່ພົບລາຍການ OT" });
            return;
        }
        if (await payrollPaidFor(String(row.work_date))) {
            res.status(400).json({ message: paidMessage(String(row.work_date)) });
            return;
        }
        await row.destroy();
        await (0, payrollController_1.syncDraftOvertime)(String(row.work_date).slice(0, 7), [Number(row.employee_id)]);
        res.status(200).json({ message: "Successfully deleted overtime" });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error deleting overtime");
    }
};
exports.deleteOvertime = deleteOvertime;
