"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDashboard = exports.deleteCollection = exports.createCollection = exports.getCollections = exports.undoWaiver = exports.waivePenalty = exports.collectContract = exports.quoteContract = void 0;
const sequelize_1 = require("sequelize");
const moment_1 = __importDefault(require("moment"));
const database_1 = __importDefault(require("../../config/database"));
const loan_1 = __importStar(require("../../models/loan"));
const loanCredit_1 = require("../../models/loanCredit");
const glCore_1 = require("../bansi/glCore");
const bansiHelpers_1 = require("../bansi/bansiHelpers");
const journalHelpers_1 = require("../bansi/journalHelpers");
const loanController_1 = require("../bansi/loanController");
const taxReportController_1 = require("../bansi/taxReportController");
const loanSchedule_1 = require("../../utils/loanSchedule");
const loanPenalty_1 = require("../../utils/loanPenalty");
const creditPenalty_1 = require("./creditPenalty");
const creditController_1 = require("./creditController");
/**
 * ລະບົບສິນເຊື່ອ ໄລຍະ 2: ຮັບຊຳລະ (ຄ່າປັບ → ດອກເບ້ຍ → ຕົ້ນທຶນ, ປິດບັນຊີກ່ອນກຳນົດ), ຍົກເວັ້ນຄ່າປັບ, ລາຍການຕິດຕາມໜີ້ + ອາຍຸໜີ້,
 * ບັນທຶກການຕິດຕາມ ແລະ ພາບລວມ (ປ່ອຍກູ້, ລາຍຮັບ, ກຳໄລ, PAR)
 */
const ACTIVE = 1;
const PAY_REGULAR = 1;
const PAY_PREPAY = 2;
const PAY_OFF = 3;
const num = (v) => Number(v) || 0;
const daysBetween = (a, b) => Math.max(0, (0, moment_1.default)(b).diff((0, moment_1.default)(a), "days"));
const contractOf = async (id, t, lock = false) => {
    const loan = await loan_1.default.findByPk(id, { transaction: t, ...(lock && t ? { lock: t.LOCK.UPDATE } : {}) });
    if (!loan || !loan.customer_id)
        throw new glCore_1.GlError("ບໍ່ພົບສັນຍາສິນເຊື່ອ");
    return loan;
};
/**
 * ຍອດທີ່ຕ້ອງຈ່າຍ ณ ວັນທີ date: ຄ່າປັບຄ້າງ, ງວດທີ່ຍັງຄ້າງ, ງວດຕໍ່ໄປ, ຄົບກຳນົດແລ້ວທັງໝົດ ແລະ ປິດບັນຊີ
 * (ດອກເບ້ຍຮອດມື້ນັ້ນ + ຕົ້ນທຶນທັງໝົດ + ຄ່າທຳນຽມປິດກ່ອນກຳນົດ % ຂອງຕົ້ນທຶນທີ່ຈ່າຍກ່ອນກຳນົດ)
 */
const quoteOf = async (loan, date, t) => {
    const decimals = await (0, loanController_1.currencyDecimals)(loan.currency_id, t);
    const stored = await (0, loanController_1.installmentsOf)(loan._uuid, t);
    const active = (await loan_1.LoanPayment.findAll({ where: { loan_id: loan._uuid, status: ACTIVE }, transaction: t })).filter((p) => String(p.pay_date) <= date);
    const ledger = await loanCredit_1.LoanPenalty.findAll({ where: { loan_id: loan._uuid }, transaction: t });
    const { rows, summary } = (0, loanController_1.summarize)(loan, stored, (0, loanController_1.paymentsOf)(active), date);
    const penalty = (0, creditPenalty_1.penaltyState)(loan, stored, active, ledger, date, decimals);
    const open = rows.filter((r) => !r.settled && (r.due_principal > 0.004 || r.due_interest > 0.004));
    const dueRows = open.filter((r) => r.due_date <= date);
    const sum = (list, pick) => (0, loanSchedule_1.roundTo)(list.reduce((n, r) => n + pick(r), 0), decimals);
    const product = loan.product_id ? await loanCredit_1.LoanProduct.findByPk(loan.product_id, { transaction: t }) : null;
    // ປິດບັນຊີ: ດອກເບ້ຍຂອງງວດທີ່ຄົບກຳນົດແລ້ວ + ດອກເບ້ຍຂອງງວດປັດຈຸບັນ ຕາມມື້ທີ່ຜ່ານໄປ
    const current = open.find((r) => r.due_date > date);
    const currentInterest = current
        ? (0, loanSchedule_1.roundTo)(Math.min(current.due_interest, Math.max(0, (current.interest * daysBetween(current.period_start, date)) / Math.max(1, daysBetween(current.period_start, current.due_date)) - current.paid_interest)), decimals)
        : 0;
    const prepaidPrincipal = sum(open.filter((r) => r.due_date > date), (r) => r.due_principal);
    const prepayFee = prepaidPrincipal > 0 ? (0, loanSchedule_1.roundTo)((prepaidPrincipal * num(product?.prepayment_fee_rate)) / 100, decimals) : 0;
    const payoff = {
        penalty: penalty.due,
        interest: (0, loanSchedule_1.roundTo)(sum(dueRows, (r) => r.due_interest) + currentInterest, decimals),
        principal: summary.outstanding,
        fee: prepayFee,
    };
    const next = open[0] ?? null;
    return {
        decimals, summary, penalty, open,
        /** ຕົ້ນທຶນທີ່ຄົບກຳນົດແລ້ວ + ງວດຕໍ່ໄປ (ຈ່າຍລ່ວງໜ້າງວດຕໍ່ໄປ ຍັງນັບເປັນຕາມງວດ) */
        regularPrincipal: sum([...new Set([...dueRows, ...(next ? [next] : [])])], (r) => r.due_principal),
        lastDue: stored.reduce((m, r) => (r.due_date > m ? r.due_date : m), ""),
        presets: {
            next: next ? (0, loanSchedule_1.roundTo)(penalty.due + next.due_interest + next.due_principal, decimals) : 0,
            due: (0, loanSchedule_1.roundTo)(penalty.due + sum(dueRows.length ? dueRows : open.slice(0, 1), (r) => r.due_interest + r.due_principal), decimals),
            payoff: (0, loanSchedule_1.roundTo)(payoff.penalty + payoff.interest + payoff.principal + payoff.fee, decimals),
        },
        payoff,
        next: next && { no: next.no, due_date: next.due_date, interest: next.due_interest, principal: next.due_principal },
        due_count: dueRows.length,
    };
};
/** ແບ່ງຈຳນວນເງິນ (ຫຼື ປິດບັນຊີ) → ຄ່າປັບ / ດອກເບ້ຍ / ຕົ້ນທຶນ / ຄ່າທຳນຽມ + ປະເພດການຈ່າຍ */
const splitOf = (q, amount, payoff, date) => {
    const payoffTotal = q.presets.payoff;
    // ພິມຍອດເທົ່າກັບປິດບັນຊີ = ປິດບັນຊີ (ບໍ່ດັ່ງນັ້ນຈະໄປຕັດດອກເບ້ຍຂອງງວດອະນາຄົດແທນຕົ້ນທຶນ)
    if (payoff || Math.abs(amount - payoffTotal) < 0.5) {
        return { ...q.payoff, total: payoffTotal, payment_type: date < q.lastDue ? PAY_OFF : PAY_REGULAR, outstanding_after: 0 };
    }
    if (!(amount > 0))
        throw new glCore_1.GlError("ກະລຸນາປ້ອນຈຳນວນເງິນທີ່ຮັບ");
    if (amount > payoffTotal)
        throw new glCore_1.GlError(`ຈຳນວນເກີນຍອດປິດບັນຊີ (${payoffTotal.toLocaleString("en-US")}) — ເລືອກ ປິດບັນຊີ`);
    const split = (0, loanPenalty_1.splitAmount)(amount, q.penalty.due, q.open.map((r) => ({ interest: r.due_interest, principal: r.due_principal })), q.decimals);
    return {
        penalty: split.penalty, interest: split.interest, principal: split.principal, fee: 0,
        total: (0, loanSchedule_1.roundTo)(amount, q.decimals),
        payment_type: split.principal > q.regularPrincipal + 0.004 ? PAY_PREPAY : PAY_REGULAR,
        outstanding_after: (0, glCore_1.round2)(Math.max(0, q.summary.outstanding - split.principal)),
    };
};
/** POST /credit/contract/:id/quote { pay_date?, amount?, payoff? } — ຍອດທີ່ຄວນຮັບ + ການແບ່ງ (ສະແດງໃນຟອມກ່ອນບັນທຶກ) */
const quoteContract = async (req, res) => {
    try {
        const loan = await contractOf(Number(req.params.id));
        const date = (0, bansiHelpers_1.toDateOnly)(req.body?.pay_date) ?? (0, journalHelpers_1.todayLao)();
        const q = await quoteOf(loan, date);
        const amount = num(req.body?.amount);
        let split = null;
        let error = null;
        try {
            if (amount > 0 || req.body?.payoff)
                split = splitOf(q, amount, !!req.body?.payoff, date);
        }
        catch (e) {
            error = e.message;
        }
        res.status(200).json({
            data: {
                date, penalty_due: q.penalty.due, penalty_rows: q.penalty.rows, days_overdue: q.penalty.days_overdue,
                outstanding: q.summary.outstanding, presets: q.presets, payoff: q.payoff, next: q.next, due_count: q.due_count, split, error,
            },
        });
    }
    catch (error) {
        (0, loanController_1.fail)(res, error, "Error quoting contract");
    }
};
exports.quoteContract = quoteContract;
/**
 * POST /credit/contract/:id/collect { pay_date, treasury_account_id, amount, payoff?, reference?, note? } — ຮັບຊຳລະ:
 * ແບ່ງໂດຍລະບົບ (ຄ່າປັບກ່ອນ), ລົງບັນຊີ / ເງິນເຂົ້າບັນຊີເງິນຄັງ (recordLoanPayment), ຄ່າປັບທີ່ຕັດ → tbl_loan_penalty
 */
const collectContract = async (req, res) => {
    const t = await database_1.default.transaction();
    try {
        if (!(await (0, glCore_1.glReady)(t)))
            throw new glCore_1.GlError("ຍັງບໍ່ໄດ້ເປີດໃຊ້ລະບົບບັນຊີຄູ່");
        const loan = await contractOf(Number(req.params.id), t, true);
        const body = req.body ?? {};
        const date = (0, bansiHelpers_1.toDateOnly)(body.pay_date);
        if (!date)
            throw new glCore_1.GlError("ກະລຸນາເລືອກວັນທີ");
        const q = await quoteOf(loan, date, t);
        if (q.summary.closed && !(q.penalty.due > 0))
            throw new glCore_1.GlError("ສັນຍານີ້ຈ່າຍຄົບແລ້ວ");
        // ການຈ່າຍທີ່ລົງວັນທີຫຼັງມື້ນີ້ຂອງການຮັບ ຈະເຮັດໃຫ້ຄ່າປັບທີ່ຄິດໄວ້ບໍ່ຖືກ
        if (await loan_1.LoanPayment.count({ where: { loan_id: loan._uuid, status: ACTIVE, pay_date: { [sequelize_1.Op.gt]: date } }, transaction: t })) {
            throw new glCore_1.GlError("ມີການຊຳລະທີ່ລົງວັນທີຫຼັງວັນທີນີ້ແລ້ວ — ເລືອກວັນທີໃຫ້ບໍ່ກ່ອນການຊຳລະຄັ້ງຫຼ້າສຸດ");
        }
        const split = splitOf(q, num(body.amount), !!body.payoff, date);
        const actorId = Number((0, bansiHelpers_1.actorOf)(req)) || null;
        const { row, number } = await (0, loanController_1.recordLoanPayment)(loan, {
            date, treasuryId: Number(body.treasury_account_id), principal: split.principal, interest: split.interest, fee: split.fee,
            penalty: split.penalty, paymentType: split.payment_type, reference: body.reference, note: body.note,
        }, t, actorId);
        if (split.penalty > 0) {
            const rows = q.penalty.rows.filter((r) => r.due > 0);
            await loanCredit_1.LoanPenalty.bulkCreate((0, loanPenalty_1.spreadOldestFirst)(rows, split.penalty, q.decimals).map((part) => {
                const r = rows.find((x) => x.no === part.no);
                return {
                    loan_id: loan._uuid, installment_no: part.no, calc_date: date, days_late: r.days_late, base_amount: r.base,
                    rate: num(loan.penalty_rate), amount: part.amount, payment_id: row._uuid, status: creditPenalty_1.PENALTY_PAID,
                };
            }), { transaction: t });
        }
        if (split.outstanding_after <= 0.004 && !loan.closed_date) {
            await loan.update({ closed_date: date, close_reason: split.payment_type === PAY_OFF ? 2 : 1 }, { transaction: t });
        }
        await t.commit();
        res.status(200).json({ message: "Successfully collected", data: { _uuid: row._uuid, number, ...split } });
    }
    catch (error) {
        await t.rollback();
        (0, loanController_1.fail)(res, error, "Error collecting payment");
    }
};
exports.collectContract = collectContract;
/** POST /credit/contract/:id/waive { amount, reason } — ຍົກເວັ້ນຄ່າປັບ (ບັນທຶກຜູ້ອະນຸມັດ + ເຫດຜົນ), ຕັດງວດເກົ່າສຸດກ່ອນ */
const waivePenalty = async (req, res) => {
    const t = await database_1.default.transaction();
    try {
        const loan = await contractOf(Number(req.params.id), t, true);
        const reason = String(req.body?.reason ?? "").trim().slice(0, 255);
        if (!reason)
            throw new glCore_1.GlError("ກະລຸນາບອກເຫດຜົນທີ່ຍົກເວັ້ນ");
        const today = (0, journalHelpers_1.todayLao)();
        const q = await quoteOf(loan, today, t);
        const amount = (0, loanSchedule_1.roundTo)(num(req.body?.amount), q.decimals);
        if (!(amount > 0))
            throw new glCore_1.GlError("ກະລຸນາປ້ອນຈຳນວນທີ່ຍົກເວັ້ນ");
        if (amount > q.penalty.due + 0.004)
            throw new glCore_1.GlError(`ຍົກເວັ້ນໄດ້ບໍ່ເກີນຄ່າປັບຄ້າງ (${q.penalty.due.toLocaleString("en-US")})`);
        const rows = q.penalty.rows.filter((r) => r.due > 0);
        const actorId = Number((0, bansiHelpers_1.actorOf)(req)) || null;
        await loanCredit_1.LoanPenalty.bulkCreate((0, loanPenalty_1.spreadOldestFirst)(rows, amount, q.decimals).map((part) => {
            const r = rows.find((x) => x.no === part.no);
            return {
                loan_id: loan._uuid, installment_no: part.no, calc_date: today, days_late: r.days_late, base_amount: r.base, rate: num(loan.penalty_rate),
                amount: part.amount, waived_amount: part.amount, waived_by: actorId, waive_reason: reason, status: creditPenalty_1.PENALTY_WAIVED,
            };
        }), { transaction: t });
        await t.commit();
        res.status(200).json({ message: "Successfully waived penalty" });
    }
    catch (error) {
        await t.rollback();
        (0, loanController_1.fail)(res, error, "Error waiving penalty");
    }
};
exports.waivePenalty = waivePenalty;
/** DELETE /credit/penalty/:id — ຍົກເລີກການຍົກເວັ້ນ (ຄ່າປັບກັບມາຄ້າງ) */
const undoWaiver = async (req, res) => {
    try {
        const row = await loanCredit_1.LoanPenalty.findByPk(Number(req.params.id));
        if (!row || Number(row.status) !== creditPenalty_1.PENALTY_WAIVED)
            throw new glCore_1.GlError("ບໍ່ພົບການຍົກເວັ້ນ");
        await row.destroy();
        res.status(200).json({ message: "Successfully removed waiver" });
    }
    catch (error) {
        (0, loanController_1.fail)(res, error, "Error removing waiver");
    }
};
exports.undoWaiver = undoWaiver;
// ================= ຕິດຕາມໜີ້
/** GET /credit/collections — ສັນຍາທີ່ຍັງຜ່ອນ: ກາຍກຳນົດ (ອາຍຸໜີ້), ຄົບກຳນົດມື້ນີ້, ຄ່າປັບຄ້າງ, ການຕິດຕາມຫຼ້າສຸດ / ນັດຈ່າຍ */
const getCollections = async (_req, res) => {
    try {
        if (!(await (0, glCore_1.glReady)()))
            throw new glCore_1.GlError("ຍັງບໍ່ໄດ້ເປີດໃຊ້ລະບົບບັນຊີຄູ່");
        const contracts = (await (0, creditController_1.contractsWithSummary)({})).filter((c) => !c.closed || c.penalty_due > 0);
        const ids = contracts.map((c) => c._uuid);
        const logs = ids.length ? await loanCredit_1.LoanCollection.findAll({ where: { loan_id: ids }, order: [["contact_date", "DESC"], ["_uuid", "DESC"]] }) : [];
        const names = await (0, creditController_1.userNames)(logs.map((l) => l.created_by));
        res.status(200).json({
            data: contracts.map((c) => {
                const last = logs.find((l) => l.loan_id === c._uuid);
                return {
                    ...c,
                    last_contact: last ? { ...last.get({ plain: true }), promise_amount: num(last.promise_amount), by: names.get(Number(last.created_by)) ?? null } : null,
                    contacts: logs.filter((l) => l.loan_id === c._uuid).length,
                };
            }),
            today: (0, journalHelpers_1.todayLao)(),
        });
    }
    catch (error) {
        (0, loanController_1.fail)(res, error, "Error getting collections");
    }
};
exports.getCollections = getCollections;
/** POST /credit/collection { loan_id, method, result, promise_date?, promise_amount?, note?, contact_date? } — ບັນທຶກການຕິດຕາມ */
const createCollection = async (req, res) => {
    try {
        const body = req.body ?? {};
        const loan = await contractOf(Number(body.loan_id));
        const method = [1, 2, 3, 4, 5].includes(Number(body.method)) ? Number(body.method) : 1;
        const result = [1, 2, 3, 4].includes(Number(body.result)) ? Number(body.result) : 1;
        const promise = (0, bansiHelpers_1.toDateOnly)(body.promise_date);
        if (result === 1 && !promise)
            throw new glCore_1.GlError("ກະລຸນາເລືອກວັນທີນັດຈ່າຍ");
        if (promise && promise < (0, journalHelpers_1.todayLao)())
            throw new glCore_1.GlError("ວັນນັດຈ່າຍຕ້ອງບໍ່ກ່ອນມື້ນີ້");
        const row = await loanCredit_1.LoanCollection.create({
            loan_id: loan._uuid, contact_date: body.contact_date ? new Date(body.contact_date) : new Date(), method, result,
            officer_id: Number(body.officer_id) || loan.officer_id || null,
            promise_date: result === 1 ? promise : null, promise_amount: result === 1 ? (0, loanSchedule_1.roundTo)(num(body.promise_amount), 2) : 0,
            note: String(body.note ?? "").trim().slice(0, 500) || null, created_by: Number((0, bansiHelpers_1.actorOf)(req)) || null,
        });
        res.status(200).json({ message: "Successfully saved follow-up", data: row });
    }
    catch (error) {
        (0, loanController_1.fail)(res, error, "Error saving follow-up");
    }
};
exports.createCollection = createCollection;
/** DELETE /credit/collection/:id */
const deleteCollection = async (req, res) => {
    try {
        const row = await loanCredit_1.LoanCollection.findByPk(Number(req.params.id));
        if (!row)
            throw new glCore_1.GlError("ບໍ່ພົບລາຍການ");
        await row.destroy();
        res.status(200).json({ message: "Successfully deleted follow-up" });
    }
    catch (error) {
        (0, loanController_1.fail)(res, error, "Error deleting follow-up");
    }
};
exports.deleteCollection = deleteCollection;
// ================= ພາບລວມ
/**
 * GET /credit/dashboard?from&to — ຕາມສະກຸນເງິນ: ພອດໂຟລິໂອ (ຍອດຄ້າງ, ສັນຍາ, ລູກຄ້າ), PAR 1/30/90, ອາຍຸໜີ້,
 * ຊ່ວງເວລາ (ປ່ອຍກູ້, ຮັບຄືນ, ລາຍຮັບ = ດອກເບ້ຍ + ຄ່າທຳນຽມ + ຄ່າປັບ), 12 ເດືອນ, ຕາມຜະລິດຕະພັນ, ກາຍກຳນົດຫຼາຍສຸດ;
 * company = ກຳໄລຂອງບໍລິສັດຈາກບັນຊີ (ລາຍຮັບ − ລາຍຈ່າຍ ທັງໝົດ) ໃນຊ່ວງດຽວກັນ
 */
const getDashboard = async (req, res) => {
    try {
        if (!(await (0, glCore_1.glReady)()))
            throw new glCore_1.GlError("ຍັງບໍ່ໄດ້ເປີດໃຊ້ລະບົບບັນຊີຄູ່");
        const today = (0, journalHelpers_1.todayLao)();
        const from = (0, bansiHelpers_1.toDateOnly)(req.query.from) ?? (0, moment_1.default)(today).startOf("month").format("YYYY-MM-DD");
        const to = (0, bansiHelpers_1.toDateOnly)(req.query.to) ?? today;
        if (from > to)
            throw new glCore_1.GlError("ວັນທີເລີ່ມຕ້ອງບໍ່ຫຼັງວັນທີສິ້ນສຸດ");
        const contracts = await (0, creditController_1.contractsWithSummary)({});
        const ids = contracts.map((c) => c._uuid);
        const monthStart = (0, moment_1.default)(to).startOf("month").subtract(11, "months").format("YYYY-MM-DD");
        const [payments, waivers, pnl] = await Promise.all([
            ids.length ? loan_1.LoanPayment.findAll({ where: { loan_id: ids, status: ACTIVE, pay_date: { [sequelize_1.Op.gte]: from < monthStart ? from : monthStart, [sequelize_1.Op.lte]: to } } }) : [],
            ids.length ? loanCredit_1.LoanPenalty.findAll({ where: { loan_id: ids, status: creditPenalty_1.PENALTY_WAIVED, calc_date: { [sequelize_1.Op.between]: [from, to] } } }) : [],
            (0, taxReportController_1.pnlOf)(from, to),
        ]);
        const months = Array.from({ length: 12 }, (_, i) => (0, moment_1.default)(monthStart).add(i, "months").format("YYYY-MM"));
        const currencies = new Map();
        for (const c of contracts) {
            const key = c.currency?.name ?? "LAK";
            if (!currencies.has(key))
                currencies.set(key, { currency: c.currency, contracts: [] });
            currencies.get(key).contracts.push(c);
        }
        const r = (n) => (0, glCore_1.round2)(n);
        const data = [...currencies.values()].map(({ currency, contracts: list }) => {
            const idSet = new Set(list.map((c) => c._uuid));
            const pays = payments.filter((p) => idSet.has(p.loan_id));
            const inPeriod = pays.filter((p) => String(p.pay_date) >= from && String(p.pay_date) <= to);
            const open = list.filter((c) => !c.closed);
            const outstanding = r(open.reduce((n, c) => n + c.outstanding, 0));
            const par = (days) => {
                const amount = r(open.filter((c) => c.days_overdue >= days).reduce((n, c) => n + c.outstanding, 0));
                return { amount, rate: outstanding > 0 ? r((amount / outstanding) * 100) : 0, contracts: open.filter((c) => c.days_overdue >= days).length };
            };
            const disbursed = list.filter((c) => c.start_date >= from && c.start_date <= to);
            const collected = {
                principal: r(inPeriod.reduce((n, p) => n + num(p.principal), 0)),
                interest: r(inPeriod.reduce((n, p) => n + num(p.interest), 0)),
                fee: r(inPeriod.reduce((n, p) => n + num(p.fee), 0)),
                penalty: r(inPeriod.reduce((n, p) => n + num(p.penalty), 0)),
            };
            const upfront = r(disbursed.reduce((n, c) => n + num(c.upfront_fee), 0));
            const byMonth = (m) => {
                const p = pays.filter((x) => String(x.pay_date).slice(0, 7) === m);
                const d = list.filter((c) => String(c.start_date).slice(0, 7) === m);
                return {
                    month: m,
                    disbursed: r(d.reduce((n, c) => n + c.principal, 0)),
                    collected: r(p.reduce((n, x) => n + num(x.principal) + num(x.interest) + num(x.fee) + num(x.penalty), 0)),
                    income: r(p.reduce((n, x) => n + num(x.interest) + num(x.fee) + num(x.penalty), 0) + d.reduce((n, c) => n + num(c.upfront_fee), 0)),
                };
            };
            const products = new Map();
            for (const c of open) {
                const key = c.product?.name ?? "—";
                const row = products.get(key) ?? { name: key, contracts: 0, outstanding: 0, overdue: 0 };
                row.contracts += 1;
                row.outstanding = r(row.outstanding + c.outstanding);
                if (c.days_overdue > 0)
                    row.overdue = r(row.overdue + c.outstanding);
                products.set(key, row);
            }
            return {
                currency,
                portfolio: {
                    contracts: open.length,
                    customers: new Set(open.map((c) => c.customer_id)).size,
                    outstanding,
                    overdue_amount: r(open.reduce((n, c) => n + c.overdue_amount, 0)),
                    penalty_due: r(list.reduce((n, c) => n + (c.penalty_due ?? 0), 0)),
                    disbursed_total: r(list.reduce((n, c) => n + c.principal, 0)),
                    closed: list.length - open.length,
                },
                par: { par1: par(1), par30: par(30), par90: par(90) },
                aging: creditPenalty_1.AGING.map((b) => {
                    const rows = open.filter((c) => c.aging === b.key);
                    return { key: b.key, contracts: rows.length, outstanding: r(rows.reduce((n, c) => n + c.outstanding, 0)) };
                }),
                period: {
                    disbursed: { contracts: disbursed.length, amount: r(disbursed.reduce((n, c) => n + c.principal, 0)), upfront_fee: upfront },
                    collected: { ...collected, total: r(collected.principal + collected.interest + collected.fee + collected.penalty) },
                    income: {
                        interest: collected.interest, fees: r(upfront + collected.fee), penalty: collected.penalty,
                        total: r(collected.interest + upfront + collected.fee + collected.penalty),
                    },
                    waived: r(waivers.filter((w) => idSet.has(w.loan_id)).reduce((n, w) => n + num(w.waived_amount), 0)),
                },
                months: months.map(byMonth),
                products: [...products.values()].sort((a, b) => b.outstanding - a.outstanding),
                top_overdue: open.filter((c) => c.days_overdue > 0).sort((a, b) => b.days_overdue - a.days_overdue).slice(0, 8)
                    .map((c) => ({ _uuid: c._uuid, loan_code: c.loan_code, customer: c.customer, days_overdue: c.days_overdue, overdue_amount: c.overdue_amount, outstanding: c.outstanding, penalty_due: c.penalty_due })),
            };
        }).sort((a, b) => b.portfolio.outstanding - a.portfolio.outstanding);
        res.status(200).json({ data, from, to, company: pnl });
    }
    catch (error) {
        (0, loanController_1.fail)(res, error, "Error getting credit dashboard");
    }
};
exports.getDashboard = getDashboard;
