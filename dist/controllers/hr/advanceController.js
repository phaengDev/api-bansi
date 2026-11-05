"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.advancePendingCounts = exports.advanceBalanceOf = exports.closeAdvancesOfResigned = exports.AdvanceMismatch = exports.reversePayrollRepayments = exports.notifyAdvancesSettled = exports.applyPayrollRepayments = exports.deleteAdvanceRepayment = exports.repayAdvance = exports.updateAdvanceSchedule = exports.unpayAdvance = exports.payAdvance = exports.cancelAdvance = exports.rejectAdvance = exports.approveAdvance = exports.createAdvance = exports.getAdvance = exports.getAdvances = exports.cancelMyAdvance = exports.createMyAdvance = exports.getMyAdvances = void 0;
const moment_1 = __importDefault(require("moment"));
const sequelize_1 = require("sequelize");
const salaryAdvance_1 = __importDefault(require("../../models/salaryAdvance"));
const salaryAdvanceRepayment_1 = __importDefault(require("../../models/salaryAdvanceRepayment"));
const employee_1 = __importDefault(require("../../models/employee"));
const department_1 = __importDefault(require("../../models/department"));
const position_1 = __importDefault(require("../../models/position"));
const payroll_1 = __importDefault(require("../../models/payroll"));
const treasuryAcount_1 = __importDefault(require("../../models/treasuryAcount"));
const typeTreasury_1 = __importDefault(require("../../models/typeTreasury"));
const currencyModel_1 = __importDefault(require("../../models/currencyModel"));
const bansiHelpers_1 = require("../bansi/bansiHelpers");
const journalHelpers_1 = require("../bansi/journalHelpers");
const accountMovement_1 = require("../bansi/accountMovement");
const glCore_1 = require("../bansi/glCore");
const glPosting_1 = require("../bansi/glPosting");
const attendanceController_1 = require("./attendanceController");
const hrHelpers_1 = require("./hrHelpers");
const notificationController_1 = require("./notificationController");
const payrollController_1 = require("./payrollController");
const payrollRules_1 = require("./payrollRules");
const workCalendar_1 = require("./workCalendar");
/**
 * ເງິນເບີກລ່ວງໜ້າ:
 * - ພະນັກງານ (app ມືຖື): GET/POST /advance/me, PUT /advance/me/cancel/:id — ສະເພາະຂອງຕົນເອງ, ຕາມເງື່ອນໄຂຢູ່ຕັ້ງຄ່າເງິນເດືອນ
 * - HR: POST /advance/fetch, GET /advance/:id, POST /advance/create, PUT /advance/approve|reject|cancel/:id,
 *   PUT /advance/pay|unpay/:id, PUT /advance/schedule/:id, POST /advance/repay/:id, DELETE /advance/repayment/:id
 * ຈ່າຍເງິນ = ເງິນອອກຈາກບັນຊີເງິນຄັງສະກຸນກີບ + ລົງບັນຊີ ໜີ້ ເງິນລ່ວງໜ້າພະນັກງານ. ຫັກຄືນຜ່ານເງິນເດືອນ (payrollRules → ໃບເງິນເດືອນ):
 * ຈ່າຍເງິນເດືອນ = applyPayrollRepayments, ຍົກເລີກການຈ່າຍ = reversePayrollRepayments
 */
const PENDING = 1;
const APPROVED = 2;
const SETTLED = 4;
const REJECTED = 5;
const CANCELLED = 6;
const STATUSES = [PENDING, APPROVED, payrollRules_1.ADVANCE_ACTIVE, SETTLED, REJECTED, CANCELLED];
const FROM_APP = 1;
const FROM_HR = 2;
const BY_PAYROLL = 1;
const BY_CASH = 2;
/** HR ກຳນົດຜ່ອນໄດ້ບໍ່ເກີນ (ຄຳຂໍຈາກ app ໃຊ້ຂີດຈຳກັດຢູ່ຕັ້ງຄ່າ) */
const MAX_INSTALLMENTS = 36;
/** ຊອກເດືອນທີ່ຍັງບໍ່ໄດ້ຈ່າຍເງິນເດືອນ ໄກສຸດຈັກເດືອນ */
const OPEN_PERIOD_LOOKAHEAD = 24;
const PAYROLL_PAID = 2;
const employeeInclude = {
    model: employee_1.default,
    as: "employee",
    attributes: ["_uuid", "emp_code", "first_name", "last_name", "phone", "profile", "basic_salary", "work_status"],
    include: [
        { model: department_1.default, as: "department", attributes: ["_uuid", "depart_name"] },
        { model: position_1.default, as: "position", attributes: ["_uuid", "position_name"] },
    ],
};
const n = (value) => Number(value) || 0;
const kipText = (value) => `₭ ${Math.round(n(value)).toLocaleString("en-US")}`;
const text = (value) => String(value ?? "").trim().slice(0, 255) || null;
const leftOf = (row) => Math.max(0, Math.round(n(row.amount) - n(row.repaid)));
const periodText = (period) => (0, moment_1.default)(`${period}-01`).format("MM/YYYY");
const docNumber = (id) => `ADV-${String(id).padStart(5, "0")}`;
/** ຫັກຕໍ່ເດືອນ — ປັດຂຶ້ນ ບໍ່ໃຫ້ເຫຼືອເສດໃນງວດສຸດທ້າຍ */
const monthlyOf = (amount, installments) => Math.ceil(amount / Math.max(1, installments));
const present = (row) => {
    const { employee, repayments, account, ...r } = row.get({ plain: true });
    return {
        ...r,
        requested_amount: n(r.requested_amount),
        amount: n(r.amount),
        monthly_deduction: n(r.monthly_deduction),
        repaid: n(r.repaid),
        balance: leftOf(r),
        ...(employee ? { employee: { ...employee, basic_salary: n(employee.basic_salary), profile_url: (0, hrHelpers_1.profileUrl)(employee.profile) } } : {}),
        ...(account !== undefined ? { account } : {}),
        ...(repayments ? { repayments: repayments.map((p) => ({ ...p, amount: n(p.amount) })) } : {}),
    };
};
const repaymentInclude = { model: salaryAdvanceRepayment_1.default, as: "repayments" };
const repaymentOrder = [[{ model: salaryAdvanceRepayment_1.default, as: "repayments" }, "repay_date", "DESC"], [{ model: salaryAdvanceRepayment_1.default, as: "repayments" }, "_uuid", "DESC"]];
const findFull = (id) => salaryAdvance_1.default.findByPk(id, {
    include: [employeeInclude, repaymentInclude, { ...journalHelpers_1.accountInclude, as: "account" }],
    order: repaymentOrder,
});
const reply = async (res, id, message) => {
    const saved = await findFull(id);
    res.status(200).json({ message, data: saved && present(saved) });
};
/** ເດືອນທຳອິດ (ເລີ່ມຈາກ from, ບໍ່ກ່ອນເດືອນນີ້) ທີ່ຍັງບໍ່ໄດ້ຈ່າຍເງິນເດືອນ — ເດືອນທີ່ຈ່າຍແລ້ວຫັກຄືນບໍ່ໄດ້ອີກ */
const openPeriodFrom = async (from, t) => {
    const current = (0, workCalendar_1.currentPeriod)();
    const start = from && from > current ? from : current;
    const paid = await payroll_1.default.findAll({ where: { status: PAYROLL_PAID, period: { [sequelize_1.Op.gte]: start } }, attributes: ["period"], raw: true, transaction: t });
    const closed = new Set(paid.map((p) => String(p.period)));
    const month = (0, moment_1.default)(`${start}-01`);
    for (let i = 0; i < OPEN_PERIOD_LOOKAHEAD && closed.has(month.format("YYYY-MM")); i++)
        month.add(1, "month");
    return month.format("YYYY-MM");
};
/** ຍອດທີ່ຕິດຢູ່ຂອງຄົນນີ້: ຄ້າງຄືນ + ລໍຖ້າ/ອະນຸມັດ ທີ່ຍັງບໍ່ໄດ້ຈ່າຍ */
const exposureOf = async (employeeId, excludeId, t) => {
    const rows = await salaryAdvance_1.default.findAll({
        where: {
            employee_id: employeeId,
            status: { [sequelize_1.Op.in]: [PENDING, APPROVED, payrollRules_1.ADVANCE_ACTIVE] },
            ...(excludeId ? { _uuid: { [sequelize_1.Op.ne]: excludeId } } : {}),
        },
        attributes: ["amount", "repaid", "status"],
        raw: true,
        transaction: t,
    });
    return rows.reduce((sum, r) => sum + leftOf(r), 0);
};
/** ຍອດສູງສຸດທີ່ເບີກໄດ້ຕາມຕັ້ງຄ່າ (null = ບໍ່ຈຳກັດ) */
const limitOf = (basicSalary, percent) => (percent > 0 ? Math.floor((n(basicSalary) * percent) / 100) : null);
const notifyAdvance = (row, title, lines, actor, push = true) => (0, notificationController_1.notify)([{
        employee_id: Number(row.employee_id),
        type: "advance",
        title,
        body: lines.filter(Boolean).join("\n") || null,
        ref: `advance:${row._uuid}`,
        createdbyid: actor,
        push,
    }]);
/** ບັນຊີເງິນຄັງທີ່ຮັບ/ຈ່າຍເງິນເບີກ (ລັອກແຖວ) — ຕ້ອງເປີດໃຊ້ງານ ແລະ ເປັນສະກຸນກີບ */
const lakAccountOf = async (accountId, t) => {
    const account = await treasuryAcount_1.default.findByPk(accountId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!account || Number(account.status) !== 1)
        return { error: "ບັນຊີເງິນຄັງບໍ່ມີ ຫຼື ປິດໃຊ້ງານແລ້ວ" };
    const type = await typeTreasury_1.default.findByPk(account.type_treasuryid, {
        include: [{ model: currencyModel_1.default, as: "currency", attributes: ["_id", "name"] }],
        transaction: t,
    });
    if (!(0, glCore_1.isBaseCurrency)(type?.currency))
        return { error: "ເງິນເບີກລ່ວງໜ້າໃຊ້ໄດ້ສະເພາະບັນຊີສະກຸນກີບ (LAK)" };
    return account;
};
/** ເດືອນຮ່າງທີ່ກະທົບຈາກການປ່ຽນເງິນເບີກຂອງຄົນນີ້ — ຄິດເງິນເດືອນຂອງຄົນນັ້ນໃໝ່ */
const syncEmployee = (row) => (0, payrollController_1.syncDraftPayrolls)([Number(row.employee_id)]);
// ================= ພະນັກງານ (app ມືຖື)
/**
 * GET /advance/me — ເງິນເບີກຂອງຕົນເອງ (ໃໝ່ສຸດກ່ອນ) ພ້ອມການຄືນ + balance ຍອດຄ້າງ + rules ເງື່ອນໄຂສຳລັບຟອມ
 * (enabled, max_amount = ຍັງເບີກໄດ້ເທົ່າໃດ — null ບໍ່ຈຳກັດ, max_installments, start_period, pending)
 */
const getMyAdvances = async (req, res) => {
    try {
        const self = await (0, attendanceController_1.selfEmployee)(req);
        if ("code" in self) {
            res.status(self.code).json({ message: self.message });
            return;
        }
        const { employee } = self;
        const [rows, settings, startPeriod] = await Promise.all([
            salaryAdvance_1.default.findAll({
                where: { employee_id: employee._uuid },
                include: [repaymentInclude],
                order: [["createdAt", "DESC"], ["_uuid", "DESC"], ...repaymentOrder],
            }),
            (0, payrollRules_1.loadPayrollSettings)(),
            openPeriodFrom(),
        ]);
        const data = rows.map(present);
        const limit = limitOf(employee.basic_salary, settings.advance_max_percent);
        const exposure = await exposureOf(employee._uuid);
        res.status(200).json({
            data,
            balance: data.filter((r) => Number(r.status) === payrollRules_1.ADVANCE_ACTIVE).reduce((sum, r) => sum + r.balance, 0),
            rules: {
                enabled: settings.advance_enabled,
                max_percent: settings.advance_max_percent,
                max_amount: limit === null ? null : Math.max(0, limit - exposure),
                max_installments: settings.advance_max_installments,
                start_period: startPeriod,
                pending: data.some((r) => Number(r.status) === PENDING),
            },
        });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting my salary advances");
    }
};
exports.getMyAdvances = getMyAdvances;
/** POST /advance/me { amount, installments?, reason } — ສົ່ງຄຳຂໍ (ລໍຖ້າ HR ອະນຸມັດ); ມີຄຳຂໍລໍຖ້າຢູ່ ຫຼື ເກີນຂີດຈຳກັດ = ຂໍບໍ່ໄດ້ */
const createMyAdvance = async (req, res) => {
    try {
        const self = await (0, attendanceController_1.selfEmployee)(req);
        if ("code" in self) {
            res.status(self.code).json({ message: self.message });
            return;
        }
        const { employee } = self;
        const fail = (message) => res.status(400).json({ message });
        const settings = await (0, payrollRules_1.loadPayrollSettings)();
        if (!settings.advance_enabled)
            return fail("ບໍລິສັດປິດການຂໍເບີກເງິນລ່ວງໜ້າຜ່ານແອັບ — ຕິດຕໍ່ HR");
        const body = req.body || {};
        const amount = Math.round(n(body.amount));
        const installments = Number(body.installments ?? 1);
        const reason = text(body.reason);
        if (amount <= 0)
            return fail("ກະລຸນາປ້ອນຈຳນວນເງິນທີ່ຂໍເບີກ");
        if (!reason)
            return fail("ກະລຸນາປ້ອນເຫດຜົນ");
        if (!Number.isInteger(installments) || installments < 1 || installments > settings.advance_max_installments) {
            return fail(`ຜ່ອນຄືນໄດ້ 1–${settings.advance_max_installments} ເດືອນ`);
        }
        if (await salaryAdvance_1.default.count({ where: { employee_id: employee._uuid, status: PENDING } })) {
            return fail("ທ່ານມີຄຳຂໍເບີກທີ່ລໍຖ້າອະນຸມັດຢູ່ແລ້ວ");
        }
        const limit = limitOf(employee.basic_salary, settings.advance_max_percent);
        if (limit !== null) {
            const available = Math.max(0, limit - (await exposureOf(employee._uuid)));
            if (amount > available)
                return fail(`ເບີກໄດ້ອີກບໍ່ເກີນ ${kipText(available)} (${settings.advance_max_percent}% ຂອງເງິນເດືອນ ລົບຍອດທີ່ຄ້າງຢູ່)`);
        }
        const row = await salaryAdvance_1.default.create({
            employee_id: employee._uuid,
            requested_amount: amount,
            amount,
            installments,
            monthly_deduction: monthlyOf(amount, installments),
            start_period: await openPeriodFrom(),
            reason,
            status: PENDING,
            source: FROM_APP,
        });
        res.status(200).json({ message: "ສົ່ງຄຳຂໍເບີກເງິນແລ້ວ — ລໍຖ້າ HR ອະນຸມັດ", data: present(row) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error creating salary advance request");
    }
};
exports.createMyAdvance = createMyAdvance;
/** PUT /advance/me/cancel/:id — ຍົກເລີກຄຳຂໍຂອງຕົນເອງ (ສະເພາະທີ່ຍັງລໍຖ້າ) */
const cancelMyAdvance = async (req, res) => {
    try {
        const self = await (0, attendanceController_1.selfEmployee)(req);
        if ("code" in self) {
            res.status(self.code).json({ message: self.message });
            return;
        }
        const row = await salaryAdvance_1.default.findByPk((0, bansiHelpers_1.decodeId)(req));
        if (!row || Number(row.employee_id) !== self.employee._uuid) {
            res.status(404).json({ message: "ບໍ່ພົບຄຳຂໍເບີກເງິນ" });
            return;
        }
        if (Number(row.status) !== PENDING) {
            res.status(400).json({ message: "ຍົກເລີກໄດ້ສະເພາະຄຳຂໍທີ່ຍັງລໍຖ້າອະນຸມັດ" });
            return;
        }
        await row.update({ status: CANCELLED, updatedAt: new Date() });
        res.status(200).json({ message: "ຍົກເລີກຄຳຂໍເບີກເງິນແລ້ວ", data: present(row) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error cancelling salary advance request");
    }
};
exports.cancelMyAdvance = cancelMyAdvance;
// ================= HR
/** ຍອດຄ້າງຂອງແຖວ (ໃຊ້ໃນ SUM) */
const literalBalance = () => salaryAdvance_1.default.sequelize.literal("amount - repaid");
/**
 * POST /advance/fetch { status?, year?, employee_id? } — ເງິນເບີກ (ລໍຖ້າກ່ອນ, ໃໝ່ສຸດກ່ອນ) + ຈຳນວນຕາມສະຖານະ + ຍອດຄ້າງລວມ;
 * ກຳລັງຫັກຄືນ ສະແດງທຸກປີ (ບໍ່ກັ່ນຕາມປີ) ເພາະຍັງຄ້າງຢູ່
 */
const getAdvances = async (req, res) => {
    try {
        const body = req.body || {};
        const status = Number(body.status);
        const year = /^\d{4}$/.test(String(body.year ?? "")) ? String(body.year) : null;
        const employeeId = Number(body.employee_id) || null;
        const inYear = { createdAt: { [sequelize_1.Op.between]: [new Date(`${year}-01-01T00:00:00+07:00`), new Date(`${year}-12-31T23:59:59+07:00`)] } };
        const scope = {
            ...(employeeId ? { employee_id: employeeId } : {}),
            ...(year ? { [sequelize_1.Op.or]: [{ status: { [sequelize_1.Op.in]: [PENDING, APPROVED, payrollRules_1.ADVANCE_ACTIVE] } }, inYear] } : {}),
        };
        const [rows, counts] = await Promise.all([
            salaryAdvance_1.default.findAll({
                where: { ...scope, ...(STATUSES.includes(status) ? { status } : {}) },
                include: [employeeInclude, { ...journalHelpers_1.accountInclude, as: "account" }],
                order: [["status", "ASC"], ["createdAt", "DESC"], ["_uuid", "DESC"]],
            }),
            salaryAdvance_1.default.findAll({
                where: scope,
                attributes: ["status", [(0, sequelize_1.fn)("COUNT", (0, sequelize_1.col)("_uuid")), "total"], [(0, sequelize_1.fn)("SUM", literalBalance()), "left"]],
                group: ["status"],
                raw: true,
            }),
        ]);
        const countOf = (s) => Number(counts.find((c) => Number(c.status) === s)?.total) || 0;
        res.status(200).json({
            data: rows.map(present),
            summary: {
                pending: countOf(PENDING),
                approved: countOf(APPROVED),
                active: countOf(payrollRules_1.ADVANCE_ACTIVE),
                settled: countOf(SETTLED),
                rejected: countOf(REJECTED),
                cancelled: countOf(CANCELLED),
                outstanding: Math.round(n(counts.find((c) => Number(c.status) === payrollRules_1.ADVANCE_ACTIVE)?.left)),
            },
        });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting salary advances");
    }
};
exports.getAdvances = getAdvances;
/** GET /advance/:id — ລາຍລະອຽດ + ການຄືນທັງໝົດ */
const getAdvance = async (req, res) => {
    try {
        const row = await findFull(Number((0, bansiHelpers_1.decodeId)(req)));
        if (!row) {
            res.status(404).json({ message: "ບໍ່ພົບເງິນເບີກ" });
            return;
        }
        res.status(200).json({ data: present(row) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting salary advance");
    }
};
exports.getAdvance = getAdvance;
/** ຍອດ / ຈຳນວນງວດ / ເດືອນເລີ່ມຫັກ ຈາກຟອມຂອງ HR — ບໍ່ສົ່ງ = ຄ່າເດີມ */
const scheduleOf = async (body, fallback) => {
    const amount = body.amount === undefined || body.amount === "" ? fallback.amount : Math.round(n(body.amount));
    const installments = body.installments === undefined || body.installments === "" ? fallback.installments : Number(body.installments);
    const wanted = String(body.start_period ?? fallback.start_period ?? "");
    if (amount <= 0)
        return { error: "ຈຳນວນເງິນຕ້ອງຫຼາຍກວ່າ 0" };
    if (!Number.isInteger(installments) || installments < 1 || installments > MAX_INSTALLMENTS)
        return { error: `ຈຳນວນງວດຕ້ອງຢູ່ລະຫວ່າງ 1–${MAX_INSTALLMENTS} ເດືອນ` };
    if (wanted && !workCalendar_1.PERIOD.test(wanted))
        return { error: "ເດືອນເລີ່ມຫັກບໍ່ຖືກຕ້ອງ" };
    return { amount, installments, start_period: await openPeriodFrom(wanted || null) };
};
/** POST /advance/create { employee_id, amount, installments?, start_period?, reason } — HR ບັນທຶກແທນພະນັກງານ (ຖືວ່າອະນຸມັດແລ້ວ, ລໍຖ້າຈ່າຍເງິນ) */
const createAdvance = async (req, res) => {
    try {
        const body = req.body || {};
        const fail = (message) => res.status(400).json({ message });
        const employee = await employee_1.default.findByPk(Number(body.employee_id) || 0, { attributes: ["_uuid", "work_status"] });
        if (!employee)
            return fail("ບໍ່ພົບພະນັກງານ");
        if (Number(employee.work_status) !== workCalendar_1.WORKING)
            return fail("ພະນັກງານຄົນນີ້ລາອອກແລ້ວ");
        const reason = text(body.reason);
        if (!reason)
            return fail("ກະລຸນາປ້ອນເຫດຜົນ");
        const schedule = await scheduleOf(body, { amount: 0, installments: 1 });
        if ("error" in schedule)
            return fail(schedule.error);
        const actor = Number((0, bansiHelpers_1.actorOf)(req)) || null;
        const row = await salaryAdvance_1.default.create({
            employee_id: employee._uuid,
            requested_amount: schedule.amount,
            amount: schedule.amount,
            installments: schedule.installments,
            monthly_deduction: monthlyOf(schedule.amount, schedule.installments),
            start_period: schedule.start_period,
            reason,
            status: APPROVED,
            source: FROM_HR,
            reviewedbyid: actor,
            reviewedAt: new Date(),
            createdbyid: actor,
        });
        await reply(res, row._uuid, "Successfully created salary advance");
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error creating salary advance");
    }
};
exports.createAdvance = createAdvance;
/** PUT /advance/approve/:id { amount?, installments?, start_period?, note? } — ອະນຸມັດ (HR ປ່ຽນຍອດ / ງວດ ໄດ້); ລໍຖ້າຈ່າຍເງິນ */
const approveAdvance = async (req, res) => {
    try {
        const row = await salaryAdvance_1.default.findByPk((0, bansiHelpers_1.decodeId)(req));
        if (!row) {
            res.status(404).json({ message: "ບໍ່ພົບເງິນເບີກ" });
            return;
        }
        if (Number(row.status) !== PENDING) {
            res.status(400).json({ message: "ຄຳຂໍນີ້ບໍ່ໄດ້ລໍຖ້າອະນຸມັດແລ້ວ" });
            return;
        }
        const body = req.body || {};
        const schedule = await scheduleOf(body, { amount: n(row.amount), installments: Number(row.installments), start_period: row.start_period });
        if ("error" in schedule) {
            res.status(400).json({ message: schedule.error });
            return;
        }
        const actor = Number((0, bansiHelpers_1.actorOf)(req)) || null;
        const note = text(body.note);
        await row.update({
            amount: schedule.amount,
            installments: schedule.installments,
            monthly_deduction: monthlyOf(schedule.amount, schedule.installments),
            start_period: schedule.start_period,
            status: APPROVED,
            review_note: note,
            reviewedbyid: actor,
            reviewedAt: new Date(),
            updatedAt: new Date(),
        });
        await notifyAdvance(row, "ຄຳຂໍເບີກເງິນໄດ້ຮັບການອະນຸມັດແລ້ວ ✅", [
            `${kipText(schedule.amount)} · ຜ່ອນ ${schedule.installments} ເດືອນ ເລີ່ມຫັກ ${periodText(schedule.start_period)}`,
            "ລໍຖ້າ HR ຈ່າຍເງິນ",
            note,
        ], actor);
        await reply(res, row._uuid, "ອະນຸມັດແລ້ວ — ລໍຖ້າຈ່າຍເງິນ");
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error approving salary advance");
    }
};
exports.approveAdvance = approveAdvance;
/** PUT /advance/reject/:id { note? } — ປະຕິເສດ (ສະເພາະທີ່ລໍຖ້າ) */
const rejectAdvance = async (req, res) => {
    try {
        const row = await salaryAdvance_1.default.findByPk((0, bansiHelpers_1.decodeId)(req));
        if (!row) {
            res.status(404).json({ message: "ບໍ່ພົບເງິນເບີກ" });
            return;
        }
        if (Number(row.status) !== PENDING) {
            res.status(400).json({ message: "ຄຳຂໍນີ້ບໍ່ໄດ້ລໍຖ້າອະນຸມັດແລ້ວ" });
            return;
        }
        const actor = Number((0, bansiHelpers_1.actorOf)(req)) || null;
        const note = text(req.body?.note);
        await row.update({ status: REJECTED, review_note: note, reviewedbyid: actor, reviewedAt: new Date(), updatedAt: new Date() });
        await notifyAdvance(row, "ຄຳຂໍເບີກເງິນບໍ່ໄດ້ຮັບການອະນຸມັດ", [kipText(row.amount), note], actor);
        await reply(res, row._uuid, "ປະຕິເສດຄຳຂໍແລ້ວ");
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error rejecting salary advance");
    }
};
exports.rejectAdvance = rejectAdvance;
/** PUT /advance/cancel/:id { note? } — ຍົກເລີກລາຍການທີ່ອະນຸມັດແລ້ວ ແຕ່ຍັງບໍ່ໄດ້ຈ່າຍເງິນ */
const cancelAdvance = async (req, res) => {
    try {
        const row = await salaryAdvance_1.default.findByPk((0, bansiHelpers_1.decodeId)(req));
        if (!row) {
            res.status(404).json({ message: "ບໍ່ພົບເງິນເບີກ" });
            return;
        }
        if (Number(row.status) !== APPROVED) {
            res.status(400).json({ message: "ຍົກເລີກໄດ້ສະເພາະລາຍການທີ່ຍັງບໍ່ໄດ້ຈ່າຍເງິນ" });
            return;
        }
        const actor = Number((0, bansiHelpers_1.actorOf)(req)) || null;
        const note = text(req.body?.note);
        await row.update({ status: CANCELLED, review_note: note ?? row.review_note, updatedAt: new Date() });
        await notifyAdvance(row, "ເງິນເບີກຖືກຍົກເລີກ", [kipText(row.amount), note], actor);
        await reply(res, row._uuid, "ຍົກເລີກແລ້ວ");
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error cancelling salary advance");
    }
};
exports.cancelAdvance = cancelAdvance;
/**
 * PUT /advance/pay/:id { account_id, pay_date? } — ຈ່າຍເງິນເບີກ: ເງິນອອກຈາກບັນຊີເງິນຄັງສະກຸນກີບ (ຍອດໃຊ້ໄດ້ຕ້ອງພໍ)
 * + ລົງບັນຊີ ໜີ້ ເງິນລ່ວງໜ້າພະນັກງານ / ມີ ເງິນສົດ-ທະນາຄານ. ໃບເງິນເດືອນຮ່າງຂອງຄົນນີ້ຂຶ້ນງວດຫັກທັນທີ
 */
const payAdvance = async (req, res) => {
    const t = await salaryAdvance_1.default.sequelize.transaction();
    const fail = async (code, message) => {
        await t.rollback();
        res.status(code).json({ message });
    };
    try {
        const row = await salaryAdvance_1.default.findByPk((0, bansiHelpers_1.decodeId)(req), { transaction: t, lock: t.LOCK.UPDATE });
        if (!row)
            return fail(404, "ບໍ່ພົບເງິນເບີກ");
        if (Number(row.status) !== APPROVED)
            return fail(400, "ຈ່າຍໄດ້ສະເພາະລາຍການທີ່ອະນຸມັດແລ້ວ ແລະ ຍັງບໍ່ໄດ້ຈ່າຍ");
        const body = req.body || {};
        const payDate = (0, journalHelpers_1.entryDateOf)(body.pay_date, "ວັນທີຈ່າຍ");
        if ("error" in payDate)
            return fail(400, payDate.error);
        const accountId = Number(body.account_id);
        if (!Number.isInteger(accountId))
            return fail(400, "ກະລຸນາເລືອກບັນຊີທີ່ຈ່າຍເງິນ");
        const account = await lakAccountOf(accountId, t);
        if ("error" in account)
            return fail(400, account.error);
        const amount = n(row.amount);
        if (n(account.balance_treasury) < amount)
            return fail(400, "ຍອດເງິນທີ່ໃຊ້ໄດ້ຂອງບັນຊີບໍ່ພໍຈ່າຍເງິນເບີກ");
        const actor = Number((0, bansiHelpers_1.actorOf)(req)) || null;
        const number = docNumber(row._uuid);
        const employee = await employee_1.default.findByPk(row.employee_id, { attributes: ["emp_code", "first_name", "last_name"], transaction: t });
        const who = employee ? `${employee.emp_code} ${[employee.first_name, employee.last_name].filter(Boolean).join(" ")}` : "";
        await (0, accountMovement_1.moveBalance)(account, {
            direction: accountMovement_1.MOVE_OUT, amount, source: "ADVANCE", sourceId: row._uuid, docNumber: number, date: payDate.date,
            description: `ຈ່າຍເງິນເບີກລ່ວງໜ້າ ${who}`.trim().slice(0, 255), actorId: actor,
        }, t);
        await row.update({
            status: payrollRules_1.ADVANCE_ACTIVE, number, account_id: accountId, pay_date: payDate.date,
            start_period: await openPeriodFrom(row.start_period, t), paidbyid: actor, paidAt: new Date(), updatedAt: new Date(),
        }, { transaction: t });
        // ລົງບັນຊີຄູ່ — ບໍ່ສຳເລັດ (ເຊັ່ນ ຍັງບໍ່ຜູກບັນຊີ, ປີປິດແລ້ວ) = ບໍ່ຈ່າຍ
        await (0, glPosting_1.postAdvance)(row, t, actor);
        await t.commit();
        await syncEmployee(row);
        await notifyAdvance(row, "ຈ່າຍເງິນເບີກລ່ວງໜ້າໃຫ້ແລ້ວ 💵", [
            `${kipText(amount)} · ຫັກຈາກເງິນເດືອນ ${kipText(row.monthly_deduction)}/ເດືອນ ເລີ່ມ ${periodText(row.start_period)}`,
        ], actor);
        await reply(res, row._uuid, "ຈ່າຍເງິນເບີກແລ້ວ");
    }
    catch (error) {
        await t.rollback();
        if ((0, glCore_1.replyGlError)(res, error))
            return;
        (0, bansiHelpers_1.sendError)(res, error, "Error paying salary advance");
    }
};
exports.payAdvance = payAdvance;
/** PUT /advance/unpay/:id — ຍົກເລີກການຈ່າຍ (ຍັງບໍ່ທັນມີການຄືນ): ຄືນເງິນເຂົ້າບັນຊີ + ກັບລາຍການບັນຊີຄູ່ ແລ້ວກັບເປັນ "ອະນຸມັດແລ້ວ" */
const unpayAdvance = async (req, res) => {
    const t = await salaryAdvance_1.default.sequelize.transaction();
    const fail = async (code, message) => {
        await t.rollback();
        res.status(code).json({ message });
    };
    try {
        const row = await salaryAdvance_1.default.findByPk((0, bansiHelpers_1.decodeId)(req), { transaction: t, lock: t.LOCK.UPDATE });
        if (!row)
            return fail(404, "ບໍ່ພົບເງິນເບີກ");
        if (Number(row.status) !== payrollRules_1.ADVANCE_ACTIVE)
            return fail(400, "ຍົກເລີກໄດ້ສະເພາະລາຍການທີ່ຈ່າຍເງິນແລ້ວ");
        if (n(row.repaid) > 0 || await salaryAdvanceRepayment_1.default.count({ where: { advance_id: row._uuid }, transaction: t })) {
            return fail(400, "ມີການຄືນເງິນແລ້ວ — ຍົກເລີກການຄືນເງິນກ່ອນ");
        }
        const actor = Number((0, bansiHelpers_1.actorOf)(req)) || null;
        const account = row.account_id ? await treasuryAcount_1.default.findByPk(row.account_id, { transaction: t, lock: t.LOCK.UPDATE }) : null;
        if (account) {
            await (0, accountMovement_1.moveBalance)(account, {
                direction: accountMovement_1.MOVE_IN, amount: n(row.amount), source: "ADVANCE_CANCEL", sourceId: row._uuid, docNumber: row.number,
                description: `ຍົກເລີກຈ່າຍເງິນເບີກ ${row.number ?? ""}`.trim(), actorId: actor,
            }, t);
        }
        await (0, glCore_1.reverseSource)("ADVANCE", row._uuid, t, actor);
        await row.update({ status: APPROVED, number: null, account_id: null, pay_date: null, paidbyid: null, paidAt: null, updatedAt: new Date() }, { transaction: t });
        await t.commit();
        await syncEmployee(row);
        await reply(res, row._uuid, "ຍົກເລີກການຈ່າຍເງິນເບີກແລ້ວ");
    }
    catch (error) {
        await t.rollback();
        if ((0, glCore_1.replyGlError)(res, error))
            return;
        (0, bansiHelpers_1.sendError)(res, error, "Error cancelling salary advance payment");
    }
};
exports.unpayAdvance = unpayAdvance;
/**
 * PUT /advance/schedule/:id { monthly_deduction?, installments?, start_period? } — ປ່ຽນແຜນຫັກຄືນຂອງລາຍການທີ່ກຳລັງຫັກ
 * (ເຊັ່ນ ຂໍຜ່ອນຍາວຂຶ້ນ): ສົ່ງ installments = ແບ່ງຍອດຄ້າງເທົ່າກັນ, ສົ່ງ monthly_deduction = ກຳນົດເອງ
 */
const updateAdvanceSchedule = async (req, res) => {
    try {
        const row = await salaryAdvance_1.default.findByPk((0, bansiHelpers_1.decodeId)(req));
        if (!row) {
            res.status(404).json({ message: "ບໍ່ພົບເງິນເບີກ" });
            return;
        }
        const fail = (message) => res.status(400).json({ message });
        if (Number(row.status) !== payrollRules_1.ADVANCE_ACTIVE)
            return fail("ປ່ຽນແຜນໄດ້ສະເພາະລາຍການທີ່ກຳລັງຫັກຄືນ");
        const body = req.body || {};
        const left = leftOf(row);
        const installments = body.installments === undefined || body.installments === "" ? null : Number(body.installments);
        if (installments !== null && (!Number.isInteger(installments) || installments < 1 || installments > MAX_INSTALLMENTS)) {
            return fail(`ຈຳນວນງວດຕ້ອງຢູ່ລະຫວ່າງ 1–${MAX_INSTALLMENTS} ເດືອນ`);
        }
        const monthly = installments !== null ? monthlyOf(left, installments) : Math.round(n(body.monthly_deduction ?? row.monthly_deduction));
        if (monthly <= 0)
            return fail("ຫັກຕໍ່ເດືອນຕ້ອງຫຼາຍກວ່າ 0");
        const wanted = String(body.start_period ?? row.start_period);
        if (!workCalendar_1.PERIOD.test(wanted))
            return fail("ເດືອນເລີ່ມຫັກບໍ່ຖືກຕ້ອງ");
        await row.update({
            monthly_deduction: monthly,
            installments: installments ?? Number(row.installments),
            start_period: await openPeriodFrom(wanted),
            updatedAt: new Date(),
        });
        await syncEmployee(row);
        await notifyAdvance(row, "ແຜນຫັກຄືນເງິນເບີກປ່ຽນແລ້ວ", [`ຫັກ ${kipText(monthly)}/ເດືອນ · ເລີ່ມ ${periodText(row.start_period)} · ຄ້າງ ${kipText(left)}`], Number((0, bansiHelpers_1.actorOf)(req)) || null, false);
        await reply(res, row._uuid, "ປ່ຽນແຜນຫັກຄືນແລ້ວ");
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error updating salary advance schedule");
    }
};
exports.updateAdvanceSchedule = updateAdvanceSchedule;
/** ບວກ/ລົບຍອດທີ່ຄືນແລ້ວ ແລະ ປັບສະຖານະ (ຄົບ = ຄືນຄົບແລ້ວ, ຍັງບໍ່ຄົບ = ກຳລັງຫັກຄືນ); ຄືນ true ເມື່ອຫາກໍ່ຄືນຄົບ */
const applyRepaid = async (row, delta, t) => {
    const repaid = Math.max(0, Math.round(n(row.repaid) + delta));
    const done = repaid >= Math.round(n(row.amount));
    const settledNow = done && Number(row.status) !== SETTLED;
    await row.update({ repaid, status: done ? SETTLED : payrollRules_1.ADVANCE_ACTIVE, settledAt: done ? row.settledAt ?? new Date() : null, updatedAt: new Date() }, { transaction: t });
    return settledNow;
};
const notifySettled = (rows, actor) => (0, notificationController_1.notify)(rows.map((row) => ({
    employee_id: Number(row.employee_id),
    type: "advance",
    title: "ຄືນເງິນເບີກລ່ວງໜ້າຄົບແລ້ວ ✅",
    body: `${row.number ?? ""} · ${kipText(row.amount)}`.trim(),
    ref: `advance:${row._uuid}`,
    createdbyid: actor,
})));
/**
 * POST /advance/repay/:id { amount, account_id, repay_date?, note? } — ຮັບຄືນເງິນເບີກເປັນເງິນສົດ / ໂອນ (ເຊັ່ນ ກ່ອນລາອອກ):
 * ເງິນເຂົ້າບັນຊີເງິນຄັງສະກຸນກີບ + ລົງບັນຊີ ໜີ້ ເງິນສົດ-ທະນາຄານ / ມີ ເງິນລ່ວງໜ້າພະນັກງານ. ບໍ່ເກີນຍອດຄ້າງ
 */
const repayAdvance = async (req, res) => {
    const t = await salaryAdvance_1.default.sequelize.transaction();
    const fail = async (code, message) => {
        await t.rollback();
        res.status(code).json({ message });
    };
    try {
        const row = await salaryAdvance_1.default.findByPk((0, bansiHelpers_1.decodeId)(req), { transaction: t, lock: t.LOCK.UPDATE });
        if (!row)
            return fail(404, "ບໍ່ພົບເງິນເບີກ");
        if (Number(row.status) !== payrollRules_1.ADVANCE_ACTIVE)
            return fail(400, "ຮັບຄືນໄດ້ສະເພາະລາຍການທີ່ກຳລັງຫັກຄືນ");
        const body = req.body || {};
        const amount = Math.round(n(body.amount));
        const left = leftOf(row);
        if (amount <= 0)
            return fail(400, "ກະລຸນາປ້ອນຈຳນວນເງິນ");
        if (amount > left)
            return fail(400, `ຮັບຄືນໄດ້ບໍ່ເກີນຍອດຄ້າງ ${kipText(left)}`);
        const date = (0, journalHelpers_1.entryDateOf)(body.repay_date, "ວັນທີຮັບຄືນ");
        if ("error" in date)
            return fail(400, date.error);
        const accountId = Number(body.account_id);
        if (!Number.isInteger(accountId))
            return fail(400, "ກະລຸນາເລືອກບັນຊີທີ່ຮັບເງິນ");
        const account = await lakAccountOf(accountId, t);
        if ("error" in account)
            return fail(400, account.error);
        const actor = Number((0, bansiHelpers_1.actorOf)(req)) || null;
        const note = text(body.note) ?? `ຮັບຄືນເງິນເບີກ ${row.number ?? ""}`.trim();
        const repayment = await salaryAdvanceRepayment_1.default.create({
            advance_id: row._uuid, employee_id: row.employee_id, kind: BY_CASH, amount, repay_date: date.date, account_id: accountId, note, createdbyid: actor,
        }, { transaction: t });
        await (0, accountMovement_1.moveBalance)(account, {
            direction: accountMovement_1.MOVE_IN, amount, source: "ADVANCE_REPAY", sourceId: repayment._uuid, docNumber: row.number, date: date.date, description: note, actorId: actor,
        }, t);
        const settled = await applyRepaid(row, amount, t);
        await (0, glPosting_1.postAdvanceRepayment)(repayment, row.number, t, actor);
        await t.commit();
        await syncEmployee(row);
        if (settled)
            await notifySettled([row], actor);
        await reply(res, row._uuid, settled ? "ຮັບຄືນຄົບແລ້ວ" : "ຮັບຄືນແລ້ວ");
    }
    catch (error) {
        await t.rollback();
        if ((0, glCore_1.replyGlError)(res, error))
            return;
        (0, bansiHelpers_1.sendError)(res, error, "Error repaying salary advance");
    }
};
exports.repayAdvance = repayAdvance;
/** DELETE /advance/repayment/:id — ຍົກເລີກການຮັບຄືນເງິນສົດ; ສ່ວນທີ່ຫັກຈາກເງິນເດືອນ ຍົກເລີກຜ່ານ "ຍົກເລີກການຈ່າຍ" ຂອງໃບເງິນເດືອນ */
const deleteAdvanceRepayment = async (req, res) => {
    const t = await salaryAdvance_1.default.sequelize.transaction();
    const fail = async (code, message) => {
        await t.rollback();
        res.status(code).json({ message });
    };
    try {
        const repayment = await salaryAdvanceRepayment_1.default.findByPk((0, bansiHelpers_1.decodeId)(req), { transaction: t, lock: t.LOCK.UPDATE });
        if (!repayment)
            return fail(404, "ບໍ່ພົບລາຍການຄືນເງິນ");
        if (Number(repayment.kind) !== BY_CASH)
            return fail(400, "ຫັກຈາກເງິນເດືອນ — ຍົກເລີກຜ່ານ \"ຍົກເລີກການຈ່າຍ\" ຂອງໃບເງິນເດືອນ");
        const row = await salaryAdvance_1.default.findByPk(repayment.advance_id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!row)
            return fail(404, "ບໍ່ພົບເງິນເບີກ");
        const actor = Number((0, bansiHelpers_1.actorOf)(req)) || null;
        const account = repayment.account_id ? await treasuryAcount_1.default.findByPk(repayment.account_id, { transaction: t, lock: t.LOCK.UPDATE }) : null;
        if (account) {
            await (0, accountMovement_1.moveBalance)(account, {
                direction: accountMovement_1.MOVE_OUT, amount: n(repayment.amount), source: "ADVANCE_REPAY_CANCEL", sourceId: repayment._uuid, docNumber: row.number,
                description: `ຍົກເລີກຮັບຄືນເງິນເບີກ ${row.number ?? ""}`.trim(), actorId: actor,
            }, t);
        }
        await (0, glCore_1.reverseSource)("ADVANCE_REPAY", repayment._uuid, t, actor);
        await applyRepaid(row, -n(repayment.amount), t);
        await repayment.destroy({ transaction: t });
        await t.commit();
        await syncEmployee(row);
        await reply(res, row._uuid, "ຍົກເລີກການຮັບຄືນແລ້ວ");
    }
    catch (error) {
        await t.rollback();
        if ((0, glCore_1.replyGlError)(res, error))
            return;
        (0, bansiHelpers_1.sendError)(res, error, "Error deleting salary advance repayment");
    }
};
exports.deleteAdvanceRepayment = deleteAdvanceRepayment;
// ================= ເຊື່ອມກັບໃບເງິນເດືອນ
/**
 * ຈ່າຍເງິນເດືອນ (ໃນ transaction ດຽວກັນ): ຍອດ advance_deduction ຂອງແຕ່ລະແຖວ ຕັດລາຍການເກົ່າກ່ອນ (ຕາມວັນທີຈ່າຍ).
 * ຍອດຫັກເກີນຍອດຄ້າງ (ເຊັ່ນ ຮັບຄືນເງິນສົດຫຼັງສ້າງໃບ ແລ້ວແຖວປ້ອນເອງ) = error ບໍ່ຈ່າຍ. ຄືນລາຍການທີ່ຄືນຄົບ (ແຈ້ງພະນັກງານຫຼັງ commit)
 */
const applyPayrollRepayments = async (payroll, lines, date, actor, t) => {
    const settled = [];
    for (const line of lines) {
        let left = Math.round(n(line.advance_deduction));
        if (left <= 0)
            continue;
        const rows = await salaryAdvance_1.default.findAll({
            where: { employee_id: line.employee_id, status: payrollRules_1.ADVANCE_ACTIVE },
            order: [["pay_date", "ASC"], ["_uuid", "ASC"]],
            transaction: t,
            lock: t.LOCK.UPDATE,
        });
        for (const row of rows) {
            if (left <= 0)
                break;
            const portion = Math.min(left, leftOf(row));
            if (portion <= 0)
                continue;
            await salaryAdvanceRepayment_1.default.create({
                advance_id: row._uuid, employee_id: row.employee_id, kind: BY_PAYROLL, amount: portion, repay_date: date,
                period: payroll.period, payroll_id: payroll._uuid, createdbyid: actor,
            }, { transaction: t });
            if (await applyRepaid(row, portion, t))
                settled.push(row);
            left -= portion;
        }
        if (left > 0)
            throw new AdvanceMismatch(`${line.emp_code} ${line.employee_name}: ຍອດຫັກເງິນເບີກເກີນຍອດຄ້າງ — ກົດ "ຄິດໄລ່ໃໝ່" ກ່ອນຈ່າຍ`);
    }
    return settled;
};
exports.applyPayrollRepayments = applyPayrollRepayments;
exports.notifyAdvancesSettled = notifySettled;
/** ຍົກເລີກການຈ່າຍເງິນເດືອນ: ຖອນການຫັກຄືນຂອງໃບນີ້ (ລາຍການທີ່ຄືນຄົບ ກັບມາກຳລັງຫັກຄືນ) */
const reversePayrollRepayments = async (payrollId, t) => {
    const repayments = await salaryAdvanceRepayment_1.default.findAll({ where: { payroll_id: payrollId, kind: BY_PAYROLL }, transaction: t, lock: t.LOCK.UPDATE });
    for (const repayment of repayments) {
        const row = await salaryAdvance_1.default.findByPk(repayment.advance_id, { transaction: t, lock: t.LOCK.UPDATE });
        if (row)
            await applyRepaid(row, -n(repayment.amount), t);
        await repayment.destroy({ transaction: t });
    }
};
exports.reversePayrollRepayments = reversePayrollRepayments;
/** ຍອດຫັກເງິນເບີກບໍ່ກົງກັບຍອດຄ້າງ — ບອກ HR ຕອນຈ່າຍເງິນເດືອນ (400) */
class AdvanceMismatch extends Error {
}
exports.AdvanceMismatch = AdvanceMismatch;
/** ພະນັກງານລາອອກ: ຍົກເລີກຄຳຂໍທີ່ຍັງບໍ່ໄດ້ຈ່າຍເງິນ; ຄືນຍອດຄ້າງ (ຫັກໝົດໃນເງິນເດືອນງວດສຸດທ້າຍ ຫຼື ຮັບຄືນເງິນສົດ) */
const closeAdvancesOfResigned = async (employeeId) => {
    await salaryAdvance_1.default.update({ status: CANCELLED, review_note: "ພະນັກງານລາອອກ", updatedAt: new Date() }, { where: { employee_id: employeeId, status: { [sequelize_1.Op.in]: [PENDING, APPROVED] } } });
};
exports.closeAdvancesOfResigned = closeAdvancesOfResigned;
/** ຍອດເບີກຄ້າງຂອງຄົນ (ຈ່າຍເງິນແລ້ວ ຍັງຄືນບໍ່ຄົບ) */
const advanceBalanceOf = async (employeeId) => {
    const rows = await salaryAdvance_1.default.findAll({ where: { employee_id: employeeId, status: payrollRules_1.ADVANCE_ACTIVE }, attributes: ["amount", "repaid"], raw: true });
    return rows.reduce((sum, r) => sum + leftOf(r), 0);
};
exports.advanceBalanceOf = advanceBalanceOf;
/** ຄຳຂໍທີ່ລໍຖ້າ / ລາຍການທີ່ອະນຸມັດລໍຖ້າຈ່າຍ — ໜ້າ desktop ຂອງ HR */
const advancePendingCounts = async () => {
    const [pending, approved] = await Promise.all([
        salaryAdvance_1.default.count({ where: { status: PENDING } }),
        salaryAdvance_1.default.count({ where: { status: APPROVED } }),
    ]);
    return { pending, approved };
};
exports.advancePendingCounts = advancePendingCounts;
