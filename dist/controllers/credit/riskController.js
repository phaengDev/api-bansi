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
exports.CLOSE_WRITTEN_OFF = exports.CLOSE_RESTRUCTURED = exports.CLOSE_PAID = exports.CLOSE_EARLY = exports.closureOf = exports.undoRestructure = exports.restructureContract = exports.recoverContract = exports.undoWriteOff = exports.writeOffContract = exports.hasProvisionToPost = exports.provisionPosted = exports.undoClassification = exports.postClassification = exports.getClassification = exports.portfolioAt = void 0;
const sequelize_1 = require("sequelize");
const moment_1 = __importDefault(require("moment"));
const database_1 = __importDefault(require("../../config/database"));
const loan_1 = __importStar(require("../../models/loan"));
const journalEntry_1 = __importDefault(require("../../models/journalEntry"));
const journalLine_1 = __importDefault(require("../../models/journalLine"));
const loanCredit_1 = require("../../models/loanCredit");
const glCore_1 = require("../bansi/glCore");
const bansiHelpers_1 = require("../bansi/bansiHelpers");
const journalHelpers_1 = require("../bansi/journalHelpers");
const loanController_1 = require("../bansi/loanController");
const loanSchedule_1 = require("../../utils/loanSchedule");
const loanPenalty_1 = require("../../utils/loanPenalty");
const creditPenalty_1 = require("./creditPenalty");
/**
 * ລະບົບສິນເຊື່ອ ໄລຍະ 3: ຈັດຊັ້ນໜີ້ + ເງິນແຮທ້າຍເດືອນ, ຕັດໜີ້ສູນ / ເກັບຄືນ, ປັບໂຄງສ້າງໜີ້.
 * ເງິນແຮ: ຍອດທີ່ຄວນມີ (ຕົ້ນທຶນຄ້າງ × % ຂອງຊັ້ນ) ທຽບກັບຍອດຈິງຂອງບັນຊີ 1186 ໃນປຶ້ມ (ແຕ່ລະສະກຸນ) — ລົງສະເພາະສ່ວນຕ່າງ
 * (ໜີ້ 5250 / ມີ 1186 ເພີ່ມ, ກົງກັນຂ້າມເມື່ອຫຼຸດ) ສະນັ້ນການຕັດໜີ້ສູນ ແລະ ການປັບດ້ວຍມືຢູ່ນຳກັນໄດ້ສະເໝີ
 */
const ACTIVE = 1;
const CLOSE_PAID = 1;
exports.CLOSE_PAID = CLOSE_PAID;
const CLOSE_EARLY = 2;
exports.CLOSE_EARLY = CLOSE_EARLY;
const CLOSE_RESTRUCTURED = 3;
exports.CLOSE_RESTRUCTURED = CLOSE_RESTRUCTURED;
const CLOSE_WRITTEN_OFF = 4;
exports.CLOSE_WRITTEN_OFF = CLOSE_WRITTEN_OFF;
const num = (v) => Number(v) || 0;
const paidRows = (rows) => rows.map((p) => ({ pay_date: String(p.pay_date), principal: num(p.principal), interest: num(p.interest) }));
const contractOf = async (id, t, lock = false) => {
    const loan = await loan_1.default.findByPk(id, { transaction: t, ...(lock && t ? { lock: t.LOCK.UPDATE } : {}) });
    if (!loan || !loan.customer_id)
        throw new glCore_1.GlError("ບໍ່ພົບສັນຍາສິນເຊື່ອ");
    return loan;
};
/** ຍອດຂອງບັນຊີເງິນແຮ (1186) ໃນສະກຸນ currencyId ຮອດວັນທີ date — ຍອດຝັ່ງມີ (ບວກ) */
const allowanceBalance = async (accountId, currencyId, date, t) => {
    const base = await (0, loanController_1.baseCurrencyId)(t);
    const lines = await journalLine_1.default.findAll({ where: { account_id: accountId }, attributes: ["entry_id", "currency_id", "amount_currency"], transaction: t });
    if (!lines.length)
        return 0;
    const entries = new Set((await journalEntry_1.default.findAll({
        where: { _uuid: [...new Set(lines.map((l) => l.entry_id))], entry_date: { [sequelize_1.Op.lte]: date } }, attributes: ["_uuid"], transaction: t,
    })).map((e) => Number(e._uuid)));
    return (0, glCore_1.round2)(-lines
        .filter((l) => entries.has(Number(l.entry_id)) && Number(l.currency_id ?? base) === Number(currencyId))
        .reduce((n, l) => n + num(l.amount_currency), 0));
};
/** ສະຖານະຂອງສັນຍາ ณ ວັນທີ: ຕົ້ນທຶນຄ້າງ, ຕົ້ນ / ດອກ ທີ່ກາຍກຳນົດ, ມື້ກາຍກຳນົດ */
const positionAt = (loan, stored, payments, date) => {
    const upTo = payments.filter((p) => String(p.pay_date) <= date);
    const { rows, summary } = (0, loanController_1.summarize)(loan, stored, (0, loanController_1.paymentsOf)(upTo), (0, moment_1.default)(date).add(1, "day").format("YYYY-MM-DD"));
    const due = rows.filter((r) => !r.settled && r.due_date <= date);
    return {
        outstanding: summary.outstanding,
        overdue_principal: (0, glCore_1.round2)(due.reduce((n, r) => n + r.due_principal, 0)),
        overdue_interest: (0, glCore_1.round2)(due.reduce((n, r) => n + r.due_interest, 0)),
        days_overdue: (0, loanPenalty_1.daysOverdueAt)(String(loan.start_date), stored, paidRows(upTo), date),
        rows,
    };
};
// ================= ຈັດຊັ້ນໜີ້ ແລະ ເງິນແຮ ທ້າຍເດືອນ
/**
 * ສັນຍາທີ່ຍັງຄ້າງ ณ ວັນທີ end ພ້ອມຊັ້ນ ແລະ ເງິນແຮ — ໃຊ້ຮ່ວມ: ຈັດຊັ້ນທ້າຍເດືອນ ແລະ ລາຍງານພອດໂຟລິໂອ
 */
const portfolioAt = async (end, t) => {
    const [loans, rules, currencies] = await Promise.all([
        loan_1.default.findAll({ where: { direction: loanController_1.LENT, customer_id: { [sequelize_1.Op.ne]: null }, status: ACTIVE, start_date: { [sequelize_1.Op.lte]: end } }, order: [["loan_code", "ASC"]], transaction: t }),
        loanCredit_1.LoanClassRule.findAll({ order: [["loan_class", "ASC"]], transaction: t }),
        (0, loanController_1.currencyMap)(),
    ]);
    const open = loans.filter((l) => !(l.closed_date && String(l.closed_date) <= end));
    if (!open.length || !rules.length)
        return { end, rows: [], rules };
    const ids = open.map((l) => l._uuid);
    const [installments, payments] = await Promise.all([
        loan_1.LoanInstallment.findAll({ where: { loan_id: ids }, order: [["loan_id", "ASC"], ["no", "ASC"]], transaction: t }),
        loan_1.LoanPayment.findAll({ where: { loan_id: ids, status: ACTIVE, pay_date: { [sequelize_1.Op.lte]: end } }, transaction: t }),
    ]);
    const rows = open.map((loan) => {
        const stored = installments.filter((r) => r.loan_id === loan._uuid).map((r) => ({
            no: r.no, due_date: String(r.due_date), principal: num(r.principal), interest: num(r.interest), settled: Number(r.settled) === 1,
        }));
        const pos = positionAt(loan, stored, payments.filter((p) => p.loan_id === loan._uuid), end);
        const rule = (0, loanPenalty_1.classOf)(rules, pos.days_overdue);
        const currency = currencies.get(Number(loan.currency_id));
        const decimals = (0, loanSchedule_1.decimalsOf)(currency?.name);
        return {
            loan_id: loan._uuid, loan_code: loan.loan_code, counterparty: loan.counterparty, currency_id: Number(loan.currency_id),
            customer_id: loan.customer_id, product_id: loan.product_id, officer_id: loan.officer_id, start_date: String(loan.start_date),
            maturity: stored.reduce((m, r) => (r.due_date > m ? r.due_date : m), ""), principal: num(loan.principal),
            annual_rate: Number(loan.annual_rate),
            currency: currency ? { _id: currency._id, name: currency.name, genus: currency.genus } : null,
            days_overdue: pos.days_overdue, outstanding: pos.outstanding,
            overdue_principal: pos.overdue_principal, overdue_interest: pos.overdue_interest,
            loan_class: rule.loan_class, class_code: rule.class_code, is_npl: Number(rule.is_npl) === 1,
            provision_rate: Number(rule.provision_rate),
            provision_amount: (0, loanSchedule_1.roundTo)((pos.outstanding * Number(rule.provision_rate)) / 100, decimals),
        };
    }).filter((r) => r.outstanding > 0.004);
    return { end, rows, rules };
};
exports.portfolioAt = portfolioAt;
/** ສັນຍາທີ່ຍັງຄ້າງ ณ ທ້າຍເດືອນ */
const classifyMonth = (month, t) => (0, exports.portfolioAt)((0, loanController_1.monthEnd)(month), t);
/** ຍອດເງິນແຮ: ຄວນມີ vs ມີໃນປຶ້ມ ຕໍ່ສະກຸນ */
const allowanceDeltas = async (rows, end, t) => {
    const accountId = await (0, glCore_1.roleAccountId)("LOAN_ALLOWANCE", t);
    const byCurrency = new Map();
    for (const r of rows) {
        const cur = byCurrency.get(r.currency_id) ?? { currency: r.currency, target: 0 };
        cur.target = (0, glCore_1.round2)(cur.target + r.provision_amount);
        byCurrency.set(r.currency_id, cur);
    }
    const out = [];
    for (const [currencyId, v] of byCurrency) {
        const balance = await allowanceBalance(accountId, currencyId, end, t);
        out.push({ currency_id: currencyId, currency: v.currency, target: v.target, balance, delta: (0, glCore_1.round2)(v.target - balance) });
    }
    return { accountId, deltas: out };
};
const latestPeriod = async (t) => {
    const row = await loanCredit_1.LoanClassification.findOne({ order: [["period", "DESC"]], attributes: ["period"], transaction: t });
    return row ? String(row.period) : null;
};
/**
 * GET /credit/classification?period=YYYY-MM — ລົງແລ້ວ = ແຖວທີ່ບັນທຶກໄວ້; ຍັງບໍ່ລົງ = ຄິດໃໝ່ (ຕົວຢ່າງ).
 * ສະຫຼຸບຕາມຊັ້ນ, NPL ratio, ເງິນແຮທີ່ຄວນມີ / ມີແລ້ວ / ຕ້ອງລົງເພີ່ມ
 */
const getClassification = async (req, res) => {
    try {
        if (!(await (0, glCore_1.glReady)()))
            throw new glCore_1.GlError("ຍັງບໍ່ໄດ້ເປີດໃຊ້ລະບົບບັນຊີຄູ່");
        const month = (0, loanController_1.parseMonth)(req.query.period ?? (0, moment_1.default)((0, journalHelpers_1.todayLao)()).subtract(1, "month").format("YYYY-MM"));
        const saved = await loanCredit_1.LoanClassification.findAll({ where: { period: month } });
        const latest = await latestPeriod();
        let rows;
        let rules = await loanCredit_1.LoanClassRule.findAll({ order: [["loan_class", "ASC"]] });
        const end = (0, loanController_1.monthEnd)(month);
        const entry = saved.length ? await journalEntry_1.default.findOne({ where: { source_type: "LOAN_PROVISION", source_id: month, reversal_of: null, reversed_by: null } }) : null;
        if (saved.length) {
            const loans = new Map((await loan_1.default.findAll({ where: { _uuid: saved.map((s) => s.loan_id) } })).map((l) => [l._uuid, l]));
            const currencies = await (0, loanController_1.currencyMap)();
            rows = saved.map((s) => {
                const loan = loans.get(s.loan_id);
                const currency = currencies.get(Number(loan?.currency_id));
                const rule = rules.find((r) => r.loan_class === s.loan_class);
                return {
                    loan_id: s.loan_id, loan_code: loan?.loan_code, counterparty: loan?.counterparty, currency_id: Number(loan?.currency_id),
                    currency: currency ? { _id: currency._id, name: currency.name, genus: currency.genus } : null,
                    days_overdue: s.days_overdue, outstanding: num(s.outstanding), overdue_principal: num(s.overdue_principal), overdue_interest: num(s.overdue_interest),
                    loan_class: s.loan_class, class_code: rule?.class_code ?? "?", is_npl: Number(rule?.is_npl) === 1,
                    provision_rate: Number(s.provision_rate), provision_amount: num(s.provision_amount),
                };
            });
        }
        else {
            const computed = await classifyMonth(month);
            rows = computed.rows;
            rules = computed.rules;
        }
        const { deltas } = await allowanceDeltas(rows, end);
        const summary = rules.map((rule) => {
            const list = rows.filter((r) => r.loan_class === rule.loan_class);
            return {
                loan_class: rule.loan_class, class_code: rule.class_code, name_la: rule.name_la, is_npl: Number(rule.is_npl) === 1,
                provision_rate: Number(rule.provision_rate), contracts: list.length,
                outstanding: (0, glCore_1.round2)(list.reduce((n, r) => n + r.outstanding, 0)), provision: (0, glCore_1.round2)(list.reduce((n, r) => n + r.provision_amount, 0)),
            };
        });
        const total = (0, glCore_1.round2)(rows.reduce((n, r) => n + r.outstanding, 0));
        const npl = (0, glCore_1.round2)(rows.filter((r) => r.is_npl).reduce((n, r) => n + r.outstanding, 0));
        res.status(200).json({
            data: {
                period: month, end, posted: !!entry, entry_number: entry?.entry_number ?? null, latest,
                can_post: !saved.length && (!latest || month > latest) && end < (0, journalHelpers_1.todayLao)(),
                can_undo: saved.length > 0 && latest === month,
                rows: rows.sort((a, b) => b.days_overdue - a.days_overdue || String(a.loan_code).localeCompare(String(b.loan_code))),
                summary, allowance: deltas, total, npl, npl_ratio: total > 0 ? (0, glCore_1.round2)((npl / total) * 100) : 0,
            },
        });
    }
    catch (error) {
        (0, loanController_1.fail)(res, error, "Error getting classification");
    }
};
exports.getClassification = getClassification;
/** POST /credit/classification { period } — ບັນທຶກຜົນຈັດຊັ້ນ + ລົງບັນຊີເງິນແຮ (ສ່ວນຕ່າງ) ວັນທີທ້າຍເດືອນ */
const postClassification = async (req, res) => {
    const t = await database_1.default.transaction();
    try {
        if (!(await (0, glCore_1.glReady)(t)))
            throw new glCore_1.GlError("ຍັງບໍ່ໄດ້ເປີດໃຊ້ລະບົບບັນຊີຄູ່");
        const month = (0, loanController_1.parseMonth)(req.body?.period);
        const end = (0, loanController_1.monthEnd)(month);
        if (end >= (0, journalHelpers_1.todayLao)())
            throw new glCore_1.GlError("ຈັດຊັ້ນໄດ້ຫຼັງສິ້ນເດືອນແລ້ວ");
        const latest = await latestPeriod(t);
        if (latest && month <= latest)
            throw new glCore_1.GlError(`ຈັດຊັ້ນເດືອນ ${latest} ແລ້ວ — ຍົກເລີກເດືອນຫຼ້າສຸດກ່ອນ ຈຶ່ງເຮັດຄືນໄດ້`);
        const { rows } = await classifyMonth(month, t);
        if (!rows.length)
            throw new glCore_1.GlError("ບໍ່ມີສັນຍາທີ່ຍັງຄ້າງ ณ ທ້າຍເດືອນນີ້");
        const { accountId, deltas } = await allowanceDeltas(rows, end, t);
        const actorId = Number((0, bansiHelpers_1.actorOf)(req)) || null;
        let entryId = null;
        const lines = [];
        const expense = await (0, glCore_1.roleAccountId)("LOAN_PROVISION_EXPENSE", t);
        for (const d of deltas.filter((x) => Math.abs(x.delta) > 0.004)) {
            const rate = await (0, glCore_1.rateOf)(d.currency_id, end, t);
            const up = d.delta > 0;
            lines.push({ accountId: expense, side: up ? glCore_1.DEBIT : glCore_1.CREDIT, amount: Math.abs(d.delta), currencyId: d.currency_id, rate, description: `ເງິນແຮໜີ້ສົງໄສຈະສູນ ${month}` }, { accountId, side: up ? glCore_1.CREDIT : glCore_1.DEBIT, amount: Math.abs(d.delta), currencyId: d.currency_id, rate, description: `ເງິນແຮໜີ້ສົງໄສຈະສູນ ${month}` });
        }
        if (lines.length) {
            const entry = await (0, glCore_1.postEntry)({
                date: end, sourceType: "LOAN_PROVISION", sourceId: month, reference: `PRV-${month}`,
                description: `ຈັດຊັ້ນໜີ້ ແລະ ເງິນແຮ ${(0, moment_1.default)(month, "YYYY-MM").format("MM/YYYY")}`, lines, actorId,
            }, t);
            entryId = entry?._uuid ?? null;
        }
        await loanCredit_1.LoanClassification.bulkCreate(rows.map((r) => ({
            period: month, loan_id: r.loan_id, days_overdue: r.days_overdue, outstanding: r.outstanding,
            overdue_principal: r.overdue_principal, overdue_interest: r.overdue_interest, loan_class: r.loan_class,
            provision_rate: r.provision_rate, provision_amount: r.provision_amount, entry_id: entryId,
        })), { transaction: t });
        for (const r of rows)
            await loan_1.default.update({ loan_class: r.loan_class, days_overdue: r.days_overdue }, { where: { _uuid: r.loan_id }, transaction: t });
        await t.commit();
        res.status(200).json({ message: "Successfully posted classification", data: { period: month, contracts: rows.length, deltas } });
    }
    catch (error) {
        await t.rollback();
        (0, loanController_1.fail)(res, error, "Error posting classification");
    }
};
exports.postClassification = postClassification;
/** DELETE /credit/classification/:period — ຍົກເລີກເດືອນຫຼ້າສຸດ (ກັບລາຍການບັນຊີ, ລຶບຜົນ) */
const undoClassification = async (req, res) => {
    const t = await database_1.default.transaction();
    try {
        const month = (0, loanController_1.parseMonth)(req.params.period);
        if ((await latestPeriod(t)) !== month)
            throw new glCore_1.GlError("ຍົກເລີກໄດ້ສະເພາະເດືອນຫຼ້າສຸດ");
        await (0, glCore_1.reverseSource)("LOAN_PROVISION", month, t, Number((0, bansiHelpers_1.actorOf)(req)) || null);
        await loanCredit_1.LoanClassification.destroy({ where: { period: month }, transaction: t });
        // ຊັ້ນປັດຈຸບັນຂອງສັນຍາ = ເດືອນກ່ອນໜ້າ (ຖ້າມີ)
        const prev = await latestPeriod(t);
        const prevRows = prev ? await loanCredit_1.LoanClassification.findAll({ where: { period: prev }, transaction: t }) : [];
        await loan_1.default.update({ loan_class: 1, days_overdue: 0 }, { where: { customer_id: { [sequelize_1.Op.ne]: null } }, transaction: t });
        for (const r of prevRows)
            await loan_1.default.update({ loan_class: r.loan_class, days_overdue: r.days_overdue }, { where: { _uuid: r.loan_id }, transaction: t });
        await t.commit();
        res.status(200).json({ message: "Successfully undid classification" });
    }
    catch (error) {
        await t.rollback();
        (0, loanController_1.fail)(res, error, "Error undoing classification");
    }
};
exports.undoClassification = undoClassification;
/** ເດືອນທີ່ຈັດຊັ້ນແລ້ວ (ໃຊ້ໃນລາຍການກວດປິດເດືອນ) */
const provisionPosted = async (month) => (await loanCredit_1.LoanClassification.count({ where: { period: month } })) > 0;
exports.provisionPosted = provisionPosted;
/** ມີສັນຍາສິນເຊື່ອທີ່ຍັງຄ້າງ ณ ທ້າຍເດືອນ (ຕ້ອງຈັດຊັ້ນກ່ອນປິດເດືອນ) */
const hasProvisionToPost = async (month) => (await classifyMonth(month)).rows.length > 0;
exports.hasProvisionToPost = hasProvisionToPost;
// ================= ຕັດໜີ້ສູນ / ເກັບຄືນ
/**
 * POST /credit/contract/:id/writeoff { date, reason } — ຕັດຕົ້ນທຶນທີ່ຄ້າງອອກ: ໜີ້ 1186 (ເງິນແຮທີ່ມີ) + 5250 (ສ່ວນທີ່ເກີນ)
 * / ມີ ບັນຊີເງິນໃຫ້ກູ້. ດອກເບ້ຍ ແລະ ຄ່າປັບທີ່ຄ້າງ ບັນທຶກໄວ້ຕິດຕາມ (ບໍ່ໄດ້ຢູ່ໃນປຶ້ມ). ສັນຍາປິດ (close_reason 4)
 */
const writeOffContract = async (req, res) => {
    const t = await database_1.default.transaction();
    try {
        if (!(await (0, glCore_1.glReady)(t)))
            throw new glCore_1.GlError("ຍັງບໍ່ໄດ້ເປີດໃຊ້ລະບົບບັນຊີຄູ່");
        const loan = await contractOf(Number(req.params.id), t, true);
        if (loan.closed_date)
            throw new glCore_1.GlError("ສັນຍານີ້ປິດແລ້ວ");
        const date = (0, bansiHelpers_1.toDateOnly)(req.body?.date) ?? (0, journalHelpers_1.todayLao)();
        if (date > (0, journalHelpers_1.todayLao)())
            throw new glCore_1.GlError("ວັນທີຕ້ອງບໍ່ເກີນມື້ນີ້");
        const reason = String(req.body?.reason ?? "").trim().slice(0, 255);
        if (!reason)
            throw new glCore_1.GlError("ກະລຸນາບອກເຫດຜົນທີ່ຕັດໜີ້ສູນ");
        const payments = await loan_1.LoanPayment.findAll({ where: { loan_id: loan._uuid, status: ACTIVE }, transaction: t });
        if (payments.some((p) => String(p.pay_date) > date))
            throw new glCore_1.GlError("ມີການຊຳລະຫຼັງວັນທີນີ້ — ເລືອກວັນທີໃຫ້ບໍ່ກ່ອນການຊຳລະຄັ້ງຫຼ້າສຸດ");
        const stored = await (0, loanController_1.installmentsOf)(loan._uuid, t);
        const pos = positionAt(loan, stored, payments, date);
        if (!(pos.outstanding > 0))
            throw new glCore_1.GlError("ບໍ່ມີຕົ້ນທຶນຄ້າງ");
        const decimals = await (0, loanController_1.currencyDecimals)(loan.currency_id, t);
        const ledger = await loanCredit_1.LoanPenalty.findAll({ where: { loan_id: loan._uuid }, transaction: t });
        const penalty = (0, creditPenalty_1.penaltyState)(loan, stored, payments, ledger, date, decimals).due;
        const allowanceId = await (0, glCore_1.roleAccountId)("LOAN_ALLOWANCE", t);
        const available = Math.max(0, await allowanceBalance(allowanceId, Number(loan.currency_id), date, t));
        const fromAllowance = (0, loanSchedule_1.roundTo)(Math.min(pos.outstanding, available), decimals);
        const actorId = Number((0, bansiHelpers_1.actorOf)(req)) || null;
        const row = await loanCredit_1.LoanWriteoff.create({
            loan_id: loan._uuid, writeoff_date: date, principal: pos.outstanding, interest: pos.overdue_interest, penalty,
            reason, approved_by: actorId, status: ACTIVE, created_by: actorId,
        }, { transaction: t });
        const rate = await (0, glCore_1.rateOf)(loan.currency_id, date, t);
        const common = { currencyId: loan.currency_id, rate };
        const label = `${loan.loan_code} ${loan.counterparty}`;
        const entry = await (0, glCore_1.postEntry)({
            date, sourceType: "LOAN_WRITEOFF", sourceId: row._uuid, reference: `WO-${loan.loan_code}`, description: `ຕັດໜີ້ສູນ ${label} — ${reason}`, actorId,
            lines: [
                { ...common, accountId: allowanceId, side: glCore_1.DEBIT, amount: fromAllowance, description: `${label} · ໃຊ້ເງິນແຮ` },
                { ...common, accountId: await (0, glCore_1.roleAccountId)("LOAN_PROVISION_EXPENSE", t), side: glCore_1.DEBIT, amount: (0, loanSchedule_1.roundTo)(pos.outstanding - fromAllowance, decimals), description: `${label} · ສ່ວນທີ່ເກີນເງິນແຮ` },
                { ...common, accountId: loan.loan_account_id, side: glCore_1.CREDIT, amount: pos.outstanding, description: `${label} · ຕັດຕົ້ນທຶນ` },
            ],
        }, t);
        await row.update({ entry_id: entry?._uuid ?? null }, { transaction: t });
        const npl = await loanCredit_1.LoanClassRule.findOne({ order: [["loan_class", "DESC"]], transaction: t });
        await loan.update({ closed_date: date, close_reason: CLOSE_WRITTEN_OFF, loan_class: npl?.loan_class ?? 5, days_overdue: pos.days_overdue }, { transaction: t });
        await t.commit();
        res.status(200).json({ message: "Successfully wrote off", data: { _uuid: row._uuid, principal: pos.outstanding, from_allowance: fromAllowance } });
    }
    catch (error) {
        await t.rollback();
        (0, loanController_1.fail)(res, error, "Error writing off contract");
    }
};
exports.writeOffContract = writeOffContract;
/** DELETE /credit/writeoff/:id — ຍົກເລີກການຕັດໜີ້ສູນ (ຍັງບໍ່ມີການເກັບຄືນ) */
const undoWriteOff = async (req, res) => {
    const t = await database_1.default.transaction();
    try {
        const row = await loanCredit_1.LoanWriteoff.findByPk(Number(req.params.id), { transaction: t, lock: t.LOCK.UPDATE });
        if (!row || Number(row.status) !== ACTIVE)
            throw new glCore_1.GlError("ບໍ່ພົບການຕັດໜີ້ສູນ");
        if (num(row.recovered_amount) > 0)
            throw new glCore_1.GlError("ມີການເກັບຄືນແລ້ວ — ຍົກເລີກການເກັບຄືນກ່ອນ");
        const loan = await contractOf(row.loan_id, t, true);
        await (0, glCore_1.reverseSource)("LOAN_WRITEOFF", row._uuid, t, Number((0, bansiHelpers_1.actorOf)(req)) || null);
        await row.update({ status: 2, updatedAt: new Date() }, { transaction: t });
        await loan.update({ closed_date: null, close_reason: null }, { transaction: t });
        await t.commit();
        res.status(200).json({ message: "Successfully undid write-off" });
    }
    catch (error) {
        await t.rollback();
        (0, loanController_1.fail)(res, error, "Error undoing write-off");
    }
};
exports.undoWriteOff = undoWriteOff;
/** POST /credit/contract/:id/recover { pay_date, treasury_account_id, amount, reference?, note? } — ເກັບຄືນໜີ້ສູນ → 4250 */
const recoverContract = async (req, res) => {
    const t = await database_1.default.transaction();
    try {
        if (!(await (0, glCore_1.glReady)(t)))
            throw new glCore_1.GlError("ຍັງບໍ່ໄດ້ເປີດໃຊ້ລະບົບບັນຊີຄູ່");
        const loan = await contractOf(Number(req.params.id), t, true);
        const row = await loanCredit_1.LoanWriteoff.findOne({ where: { loan_id: loan._uuid, status: ACTIVE }, transaction: t, lock: t.LOCK.UPDATE });
        if (!row || Number(loan.close_reason) !== CLOSE_WRITTEN_OFF)
            throw new glCore_1.GlError("ສັນຍານີ້ບໍ່ໄດ້ຕັດເປັນໜີ້ສູນ");
        const date = (0, bansiHelpers_1.toDateOnly)(req.body?.pay_date);
        if (!date)
            throw new glCore_1.GlError("ກະລຸນາເລືອກວັນທີ");
        if (date < String(row.writeoff_date))
            throw new glCore_1.GlError("ວັນທີຕ້ອງບໍ່ກ່ອນວັນທີຕັດໜີ້ສູນ");
        const decimals = await (0, loanController_1.currencyDecimals)(loan.currency_id, t);
        const amount = (0, loanSchedule_1.roundTo)(num(req.body?.amount), decimals);
        if (!(amount > 0))
            throw new glCore_1.GlError("ກະລຸນາປ້ອນຈຳນວນເງິນ");
        const left = (0, glCore_1.round2)(num(row.principal) + num(row.interest) + num(row.penalty) - num(row.recovered_amount));
        if (amount > left + 0.004)
            throw new glCore_1.GlError(`ເກີນຍອດທີ່ຕັດໄປ (ຍັງເຫຼືອ ${left.toLocaleString("en-US")})`);
        // ຕົ້ນທຶນກ່ອນ (ເທົ່າທີ່ຍັງຄ້າງໃນສັນຍາ) ສ່ວນເກີນ = ດອກເບ້ຍ / ຄ່າປັບ — ທັງໝົດເຂົ້າ 4250
        const payments = await loan_1.LoanPayment.findAll({ where: { loan_id: loan._uuid, status: ACTIVE }, transaction: t });
        const { summary } = (0, loanController_1.summarize)(loan, await (0, loanController_1.installmentsOf)(loan._uuid, t), (0, loanController_1.paymentsOf)(payments));
        const principal = (0, loanSchedule_1.roundTo)(Math.min(amount, summary.outstanding), decimals);
        const { row: payment, number } = await (0, loanController_1.recordLoanPayment)(loan, {
            date, treasuryId: Number(req.body?.treasury_account_id), principal, interest: (0, loanSchedule_1.roundTo)(amount - principal, decimals), fee: 0,
            recovery: true, reference: req.body?.reference, note: req.body?.note ?? "ເກັບຄືນໜີ້ສູນ",
        }, t, Number((0, bansiHelpers_1.actorOf)(req)) || null);
        await row.update({ recovered_amount: (0, glCore_1.round2)(num(row.recovered_amount) + amount), updatedAt: new Date() }, { transaction: t });
        await t.commit();
        res.status(200).json({ message: "Successfully recorded recovery", data: { _uuid: payment._uuid, number } });
    }
    catch (error) {
        await t.rollback();
        (0, loanController_1.fail)(res, error, "Error recording recovery");
    }
};
exports.recoverContract = recoverContract;
// ================= ປັບໂຄງສ້າງໜີ້
/**
 * POST /credit/contract/:id/restructure { date, reason, annual_rate, term, first_due_date, method?, capitalize_interest?, note? }
 * ປິດສັນຍາເດີມ (close_reason 3) ແລະ ອອກສັນຍາໃໝ່ = ຕົ້ນທຶນຄ້າງ (+ ດອກເບ້ຍທີ່ກາຍກຳນົດ ຖ້າເລືອກລວມ) ດ້ວຍເງື່ອນໄຂໃໝ່;
 * ບໍ່ມີເງິນເຂົ້າ-ອອກ: ໜີ້ ເງິນໃຫ້ກູ້ (ສັນຍາໃໝ່) / ມີ ເງິນໃຫ້ກູ້ (ສັນຍາເດີມ) + ມີ ດອກເບ້ຍຮັບ (ທີ່ລວມເຂົ້າຕົ້ນທຶນ).
 * ຄ່າປັບຕ້ອງຮັບ ຫຼື ຍົກເວັ້ນກ່ອນ; ຫຼັກຊັບ ແລະ ຜູ້ຄ້ຳ ຍ້າຍໄປສັນຍາໃໝ່
 */
const restructureContract = async (req, res) => {
    const t = await database_1.default.transaction();
    try {
        if (!(await (0, glCore_1.glReady)(t)))
            throw new glCore_1.GlError("ຍັງບໍ່ໄດ້ເປີດໃຊ້ລະບົບບັນຊີຄູ່");
        const old = await contractOf(Number(req.params.id), t, true);
        if (old.closed_date)
            throw new glCore_1.GlError("ສັນຍານີ້ປິດແລ້ວ");
        const body = req.body ?? {};
        const date = (0, bansiHelpers_1.toDateOnly)(body.date) ?? (0, journalHelpers_1.todayLao)();
        if (date > (0, journalHelpers_1.todayLao)())
            throw new glCore_1.GlError("ວັນທີຕ້ອງບໍ່ເກີນມື້ນີ້");
        const reason = String(body.reason ?? "").trim().slice(0, 255);
        if (!reason)
            throw new glCore_1.GlError("ກະລຸນາບອກເຫດຜົນທີ່ປັບໂຄງສ້າງ");
        const payments = await loan_1.LoanPayment.findAll({ where: { loan_id: old._uuid, status: ACTIVE }, transaction: t });
        if (payments.some((p) => String(p.pay_date) > date))
            throw new glCore_1.GlError("ມີການຊຳລະຫຼັງວັນທີນີ້ — ເລືອກວັນທີໃຫ້ບໍ່ກ່ອນການຊຳລະຄັ້ງຫຼ້າສຸດ");
        const stored = await (0, loanController_1.installmentsOf)(old._uuid, t);
        const decimals = await (0, loanController_1.currencyDecimals)(old.currency_id, t);
        const ledger = await loanCredit_1.LoanPenalty.findAll({ where: { loan_id: old._uuid }, transaction: t });
        const penaltyDue = (0, creditPenalty_1.penaltyState)(old, stored, payments, ledger, date, decimals).due;
        if (penaltyDue > 0)
            throw new glCore_1.GlError(`ຍັງມີຄ່າປັບຄ້າງ ${penaltyDue.toLocaleString("en-US")} — ຮັບຊຳລະ ຫຼື ຍົກເວັ້ນກ່ອນ`);
        const pos = positionAt(old, stored, payments, date);
        if (!(pos.outstanding > 0))
            throw new glCore_1.GlError("ບໍ່ມີຕົ້ນທຶນຄ້າງ");
        const capitalized = body.capitalize_interest ? (0, loanSchedule_1.roundTo)(pos.overdue_interest, decimals) : 0;
        const principal = (0, loanSchedule_1.roundTo)(pos.outstanding + capitalized, decimals);
        const terms = {
            principal, annual_rate: Number(body.annual_rate), method: Number(body.method) || Number(old.method), day_basis: Number(old.day_basis),
            frequency_months: Number(old.frequency_months) || 1, frequency_days: Number(old.frequency_days) || null, term: Math.round(Number(body.term) || 0),
            start_date: date, first_due_date: (0, bansiHelpers_1.toDateOnly)(body.first_due_date) ?? "",
        };
        const error = (0, loanSchedule_1.termsError)(terms);
        if (error)
            throw new glCore_1.GlError(error);
        (0, loanSchedule_1.buildSchedule)(terms, decimals);
        const actorId = Number((0, bansiHelpers_1.actorOf)(req)) || null;
        const fresh = await loan_1.default.create({
            loan_code: await (0, loanController_1.nextCode)(t, "CR-", 6), direction: loanController_1.LENT, counterparty: old.counterparty,
            customer_id: old.customer_id, product_id: old.product_id, application_id: null, officer_id: old.officer_id,
            contract_no: old.contract_no, currency_id: old.currency_id, principal, annual_rate: terms.annual_rate, method: terms.method,
            day_basis: terms.day_basis, frequency_months: terms.frequency_months, frequency_days: terms.frequency_days, term: terms.term,
            start_date: date, first_due_date: terms.first_due_date, start_mode: 1, treasury_account_id: null,
            loan_account_id: old.loan_account_id, interest_account_id: old.interest_account_id,
            purpose: `ປັບໂຄງສ້າງຈາກ ${old.loan_code}`, note: String(body.note ?? "").trim().slice(0, 255) || null,
            status: ACTIVE, created_by: actorId, upfront_fee: 0,
            penalty_rate: Number(old.penalty_rate), penalty_base: old.penalty_base, grace_days: old.grace_days,
            loan_class: old.loan_class, days_overdue: 0,
        }, { transaction: t });
        await (0, loanController_1.writeInstallments)(fresh, t);
        const row = await loanCredit_1.LoanRestructure.create({
            loan_id: old._uuid, new_loan_id: fresh._uuid, restructure_date: date, reason,
            old_outstanding: pos.outstanding, old_rate: Number(old.annual_rate), old_term: old.term, capitalized_interest: capitalized,
            new_rate: terms.annual_rate, new_term: terms.term, new_first_due_date: terms.first_due_date,
            approved_by: actorId, note: fresh.note, status: ACTIVE, created_by: actorId,
        }, { transaction: t });
        const rate = await (0, glCore_1.rateOf)(old.currency_id, date, t);
        const common = { currencyId: old.currency_id, rate };
        const lines = [
            { ...common, accountId: fresh.loan_account_id, side: glCore_1.DEBIT, amount: principal, description: `${fresh.loan_code} · ຕົ້ນທຶນສັນຍາໃໝ່` },
            { ...common, accountId: old.loan_account_id, side: glCore_1.CREDIT, amount: pos.outstanding, description: `${old.loan_code} · ປິດຕົ້ນທຶນສັນຍາເດີມ` },
        ];
        if (capitalized > 0) {
            lines.push({ ...common, accountId: old.interest_account_id ?? (await (0, glCore_1.roleAccountId)("INTEREST_INCOME", t)), side: glCore_1.CREDIT, amount: capitalized, description: `${old.loan_code} · ດອກເບ້ຍລວມເຂົ້າຕົ້ນທຶນ` });
        }
        await (0, glCore_1.postEntry)({
            date, sourceType: "LOAN_RESTRUCTURE", sourceId: row._uuid, reference: `RS-${old.loan_code}`,
            description: `ປັບໂຄງສ້າງໜີ້ ${old.loan_code} → ${fresh.loan_code} ${old.counterparty} — ${reason}`, lines, actorId,
        }, t);
        await loanCredit_1.LoanCollateral.update({ loan_id: fresh._uuid }, { where: { loan_id: old._uuid }, transaction: t });
        await loanCredit_1.LoanGuarantor.update({ loan_id: fresh._uuid }, { where: { loan_id: old._uuid }, transaction: t });
        await old.update({ closed_date: date, close_reason: CLOSE_RESTRUCTURED }, { transaction: t });
        await t.commit();
        res.status(200).json({ message: "Successfully restructured", data: { _uuid: row._uuid, loan_id: fresh._uuid, loan_code: fresh.loan_code, principal } });
    }
    catch (error) {
        await t.rollback();
        (0, loanController_1.fail)(res, error, "Error restructuring contract");
    }
};
exports.restructureContract = restructureContract;
/** DELETE /credit/restructure/:id — ຍົກເລີກການປັບໂຄງສ້າງ (ສັນຍາໃໝ່ຍັງບໍ່ມີການຊຳລະ / ດອກເບ້ຍຄ້າງ) */
const undoRestructure = async (req, res) => {
    const t = await database_1.default.transaction();
    try {
        const row = await loanCredit_1.LoanRestructure.findByPk(Number(req.params.id), { transaction: t, lock: t.LOCK.UPDATE });
        if (!row || Number(row.status) !== ACTIVE)
            throw new glCore_1.GlError("ບໍ່ພົບການປັບໂຄງສ້າງ");
        const fresh = row.new_loan_id ? await loan_1.default.findByPk(row.new_loan_id, { transaction: t, lock: t.LOCK.UPDATE }) : null;
        if (fresh) {
            if (await loan_1.LoanPayment.count({ where: { loan_id: fresh._uuid, status: ACTIVE }, transaction: t }))
                throw new glCore_1.GlError(`${fresh.loan_code} ມີການຊຳລະແລ້ວ — ຍົກເລີກການຊຳລະກ່ອນ`);
            if (await loan_1.LoanAccrual.count({ where: { loan_id: fresh._uuid }, transaction: t }))
                throw new glCore_1.GlError(`ຄິດດອກເບ້ຍຄ້າງຂອງ ${fresh.loan_code} ແລ້ວ — ຍົກເລີກເດືອນນັ້ນກ່ອນ`);
            if (await loanCredit_1.LoanRestructure.count({ where: { loan_id: fresh._uuid, status: ACTIVE }, transaction: t }))
                throw new glCore_1.GlError(`${fresh.loan_code} ຖືກປັບໂຄງສ້າງຕໍ່ແລ້ວ`);
        }
        const old = await contractOf(row.loan_id, t, true);
        await (0, glCore_1.reverseSource)("LOAN_RESTRUCTURE", row._uuid, t, Number((0, bansiHelpers_1.actorOf)(req)) || null);
        if (fresh) {
            await loanCredit_1.LoanCollateral.update({ loan_id: old._uuid }, { where: { loan_id: fresh._uuid }, transaction: t });
            await loanCredit_1.LoanGuarantor.update({ loan_id: old._uuid }, { where: { loan_id: fresh._uuid }, transaction: t });
            await loan_1.LoanInstallment.destroy({ where: { loan_id: fresh._uuid }, transaction: t });
            await loanCredit_1.LoanPenalty.destroy({ where: { loan_id: fresh._uuid }, transaction: t });
            await loan_1.LoanPayment.destroy({ where: { loan_id: fresh._uuid }, transaction: t });
            await fresh.destroy({ transaction: t });
        }
        await old.update({ closed_date: null, close_reason: null }, { transaction: t });
        await row.update({ status: 2, updatedAt: new Date() }, { transaction: t });
        await t.commit();
        res.status(200).json({ message: "Successfully undid restructure" });
    }
    catch (error) {
        await t.rollback();
        (0, loanController_1.fail)(res, error, "Error undoing restructure");
    }
};
exports.undoRestructure = undoRestructure;
/** ຂໍ້ມູນການປິດພິເສດ ຂອງສັນຍາ (ລາຍລະອຽດສັນຍາ): ຕັດໜີ້ສູນ, ປັບໂຄງສ້າງ (ຈາກ / ເປັນ) */
const closureOf = async (loan) => {
    const [writeoff, from, into] = await Promise.all([
        loanCredit_1.LoanWriteoff.findOne({ where: { loan_id: loan._uuid, status: ACTIVE } }),
        loanCredit_1.LoanRestructure.findOne({ where: { new_loan_id: loan._uuid, status: ACTIVE } }),
        loanCredit_1.LoanRestructure.findOne({ where: { loan_id: loan._uuid, status: ACTIVE } }),
    ]);
    const codes = new Map((await loan_1.default.findAll({
        where: { _uuid: [from?.loan_id, into?.new_loan_id].filter(Boolean) }, attributes: ["_uuid", "loan_code"],
    })).map((l) => [l._uuid, l.loan_code]));
    const names = await (0, creditPenalty_1.userNames)([writeoff?.approved_by, from?.approved_by, into?.approved_by]);
    const present = (r, otherId) => r && {
        _uuid: r._uuid, date: r.restructure_date, reason: r.reason, other_id: otherId, other_code: codes.get(Number(otherId)) ?? null,
        old_outstanding: num(r.old_outstanding), capitalized_interest: num(r.capitalized_interest), old_rate: Number(r.old_rate), new_rate: Number(r.new_rate),
        old_term: r.old_term, new_term: r.new_term, by: names.get(Number(r.approved_by)) ?? null,
    };
    return {
        close_reason: loan.close_reason ? Number(loan.close_reason) : null,
        writeoff: writeoff && {
            _uuid: writeoff._uuid, date: writeoff.writeoff_date, principal: num(writeoff.principal), interest: num(writeoff.interest), penalty: num(writeoff.penalty),
            recovered: num(writeoff.recovered_amount), reason: writeoff.reason, by: names.get(Number(writeoff.approved_by)) ?? null,
        },
        restructured_from: present(from, from?.loan_id),
        restructured_into: present(into, into?.new_loan_id),
    };
};
exports.closureOf = closureOf;
