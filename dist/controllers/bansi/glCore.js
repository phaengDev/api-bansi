"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.reverseSource = exports.reverseEntry = exports.postSource = exports.activeEntryOf = exports.postEntry = exports.treasuryAccountId = exports.categoryAccountId = exports.roleAccountId = exports.assertOpenPeriod = exports.closedFiscalOf = exports.rateOf = exports.isBaseCurrency = exports.glReady = exports.round2 = exports.replyGlError = exports.GlError = exports.ROLES = exports.TYPES_BY_GROUP = exports.GROUP_SIDE = exports.BASE_CURRENCY = exports.CREDIT = exports.DEBIT = void 0;
const sequelize_1 = require("sequelize");
const moment_1 = __importDefault(require("moment"));
const database_1 = __importDefault(require("../../config/database"));
const chartAccount_1 = __importDefault(require("../../models/chartAccount"));
const glMapping_1 = __importDefault(require("../../models/glMapping"));
const journalEntry_1 = __importDefault(require("../../models/journalEntry"));
const journalLine_1 = __importDefault(require("../../models/journalLine"));
const fiscalYear_1 = __importDefault(require("../../models/fiscalYear"));
const exchangeRate_1 = __importDefault(require("../../models/exchangeRate"));
const currencyModel_1 = __importDefault(require("../../models/currencyModel"));
const docNumberingController_1 = require("./docNumberingController");
/**
 * ແກນຂອງລະບົບບັນຊີຄູ່ (double-entry): ຜັງບັນຊີ 5 ກຸ່ມ, ການຜູກບັນຊີ, ອັດຕາແລກປ່ຽນ, ການລັອກງວດ
 * ແລະ ການລົງ/ກັບລາຍການໃບບັນທຶກ. ຍອດ debit/credit ເປັນສະກຸນຫຼັກ (LAK) ທຸກແຖວ.
 * ຕາຕະລາງສ້າງດ້ວຍ sql/create_gl_accounting.sql — ຍັງບໍ່ແລ່ນ (glReady() = false) ລາຍຮັບ/ລາຍຈ່າຍ ເຮັດວຽກຄືເກົ່າ
 */
exports.DEBIT = 1;
exports.CREDIT = 2;
exports.BASE_CURRENCY = "LAK";
/** ກຸ່ມ → ຝັ່ງປົກກະຕິ: ຊັບສິນ/ລາຍຈ່າຍ = ໜີ້, ໜີ້ສິນ/ທຶນ/ລາຍຮັບ = ມີ */
exports.GROUP_SIDE = { 1: exports.DEBIT, 2: exports.CREDIT, 3: exports.CREDIT, 4: exports.CREDIT, 5: exports.DEBIT };
/** ໝວດຍ່ອຍໃນໃບລາຍງານ ທີ່ແຕ່ລະກຸ່ມໃຊ້ໄດ້ */
exports.TYPES_BY_GROUP = {
    1: ["CASH", "RECEIVABLE", "CURRENT_ASSET", "FIXED_ASSET", "NONCURRENT_ASSET"],
    2: ["PAYABLE", "CURRENT_LIABILITY", "NONCURRENT_LIABILITY"],
    3: ["EQUITY"],
    4: ["REVENUE", "OTHER_INCOME"],
    5: ["COST_OF_SALES", "EXPENSE", "OTHER_EXPENSE", "TAX_EXPENSE"],
};
/** ບົດບາດຂອງລະບົບ → ກຸ່ມທີ່ບັນຊີຕ້ອງຢູ່ + ຊື່ສຳລັບຂໍ້ຄວາມ error */
exports.ROLES = {
    DEFAULT_CASH: { groups: [1], label: "ເງິນສົດ (ຄ່າເລີ່ມຕົ້ນ)" },
    DEFAULT_BANK: { groups: [1], label: "ເງິນຝາກທະນາຄານ (ຄ່າເລີ່ມຕົ້ນ)" },
    AR: { groups: [1], label: "ລູກໜີ້ (ຄ່າເລີ່ມຕົ້ນ)" },
    AP: { groups: [2], label: "ເຈົ້າໜີ້ (ຄ່າເລີ່ມຕົ້ນ)" },
    VAT_INPUT: { groups: [1], label: "ອາກອນຂາເຂົ້າ" },
    VAT_OUTPUT: { groups: [2], label: "ອາກອນຂາອອກ" },
    RETAINED_EARNINGS: { groups: [3], label: "ກຳໄລສະສົມ" },
    OPENING_EQUITY: { groups: [3], label: "ທຶນຍອດຍົກມາ" },
    DEFAULT_REVENUE: { groups: [4], label: "ລາຍຮັບ (ຄ່າເລີ່ມຕົ້ນ)" },
    DEFAULT_EXPENSE: { groups: [5], label: "ລາຍຈ່າຍ (ຄ່າເລີ່ມຕົ້ນ)" },
    FX_GAIN: { groups: [4], label: "ກຳໄລອັດຕາແລກປ່ຽນ" },
    FX_LOSS: { groups: [5], label: "ຂາດທຶນອັດຕາແລກປ່ຽນ" },
    // ເງິນເດືອນ (hr/payrollController) — ຜູກໃຫ້ເອງຕອນເປີດ server (glSeed)
    SALARY_EXPENSE: { groups: [5], label: "ລາຍຈ່າຍເງິນເດືອນ" },
    SSO_EXPENSE: { groups: [5], label: "ປະກັນສັງຄົມສ່ວນບໍລິສັດ" },
    SSO_PAYABLE: { groups: [2], label: "ປະກັນສັງຄົມຄ້າງຈ່າຍ" },
    PIT_PAYABLE: { groups: [2], label: "ອາກອນລາຍໄດ້ຄ້າງຈ່າຍ" },
    PAYROLL_DEDUCTION: { groups: [1, 2], label: "ຍອດຫັກອື່ນຈາກເງິນເດືອນ" },
};
/** error ທີ່ສົ່ງກັບໃຫ້ຜູ້ໃຊ້ເປັນ 400 (ຂໍ້ມູນ/ການຕັ້ງຄ່າບໍ່ຄົບ) */
class GlError extends Error {
}
exports.GlError = GlError;
/** ໃຊ້ໃນ catch ຂອງເອກະສານ: GlError → ຕອບ 400 ແລ້ວຄືນ true; ອື່ນໆ ຄືນ false ໃຫ້ຜູ້ເອີ້ນຈັດການຕໍ່ */
const replyGlError = (res, error) => {
    if (!(error instanceof GlError))
        return false;
    res.status(400).json({ message: error.message });
    return true;
};
exports.replyGlError = replyGlError;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
exports.round2 = round2;
const fmtDate = (date) => (0, moment_1.default)(date).format("DD/MM/YYYY");
// ---- ຕາຕະລາງພ້ອມບໍ່ (ກວດເທື່ອດຽວ; ຍັງບໍ່ພ້ອມກໍ່ກວດຄືນທຸກ 60 ວິນາທີ) ----
let ready = false;
let checkedAt = 0;
const glReady = async (t) => {
    if (ready)
        return true;
    if (Date.now() - checkedAt < 60000)
        return false;
    checkedAt = Date.now();
    const rows = await database_1.default.query("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() " +
        "AND table_name IN ('tbl_chart_account','tbl_gl_mapping','tbl_journal_entry','tbl_journal_line')", { type: sequelize_1.QueryTypes.SELECT, transaction: t });
    ready = Number(rows[0]?.n) === 4;
    return ready;
};
exports.glReady = glReady;
// ---- ອັດຕາແລກປ່ຽນ: ສະກຸນຫຼັກ = 1, ອື່ນໆ = ອັດຕາຫຼ້າສຸດທີ່ rate_date ≤ ວັນທີ (ບໍ່ມີ → tbl_currency.reate) ----
const isBaseCurrency = (currency) => !currency || String(currency.name ?? "").toUpperCase() === exports.BASE_CURRENCY;
exports.isBaseCurrency = isBaseCurrency;
const rateOf = async (currencyId, date, t) => {
    if (!currencyId)
        return 1;
    const currency = await currencyModel_1.default.findByPk(currencyId, { transaction: t });
    if ((0, exports.isBaseCurrency)(currency))
        return 1;
    const row = await exchangeRate_1.default.findOne({
        where: { currencyId, status: 1, rate_date: { [sequelize_1.Op.lte]: date } },
        order: [["rate_date", "DESC"], ["createdAt", "DESC"]],
        transaction: t,
    });
    const rate = Number(row?.rate) || Number(currency?.reate) || 0;
    if (!(rate > 0))
        throw new GlError(`ຍັງບໍ່ມີອັດຕາແລກປ່ຽນຂອງ ${currency?.name ?? currencyId} — ຕັ້ງຢູ່ ຕັ້ງຄ່າບັນຊີ → ອັດຕາແລກປ່ຽນ`);
    return rate;
};
exports.rateOf = rateOf;
// ---- ລັອກງວດ: ລົງ/ແກ້ລາຍການໃນປີການເງິນທີ່ປິດແລ້ວບໍ່ໄດ້ ----
const closedFiscalOf = (date, t) => fiscalYear_1.default.findOne({
    where: { status: 2, start_date: { [sequelize_1.Op.lte]: date }, end_date: { [sequelize_1.Op.gte]: date } },
    transaction: t,
});
exports.closedFiscalOf = closedFiscalOf;
const assertOpenPeriod = async (date, t) => {
    const closed = await (0, exports.closedFiscalOf)(date, t);
    if (closed)
        throw new GlError(`ວັນທີ ${fmtDate(date)} ຢູ່ໃນປີການເງິນ ${closed.fiscal_code} ທີ່ປິດບັນຊີແລ້ວ`);
};
exports.assertOpenPeriod = assertOpenPeriod;
// ---- ການຜູກບັນຊີ ----
const mappedAccountId = async (sourceType, sourceKey, t) => {
    const row = await glMapping_1.default.findOne({
        where: { source_type: sourceType, source_key: String(sourceKey) },
        transaction: t,
    });
    return row ? Number(row.account_id) : null;
};
const roleAccountId = async (role, t) => {
    const id = await mappedAccountId("ROLE", role, t);
    if (!id)
        throw new GlError(`ຍັງບໍ່ໄດ້ກຳນົດບັນຊີ "${exports.ROLES[role]?.label ?? role}" — ຕັ້ງຢູ່ ຜັງບັນຊີ → ຜູກບັນຊີ`);
    return id;
};
exports.roleAccountId = roleAccountId;
/** ປະເພດລາຍຮັບ (kind 1) / ລາຍຈ່າຍ (kind 2) → ບັນຊີທີ່ຜູກ ຫຼື ບັນຊີເລີ່ມຕົ້ນ */
const categoryAccountId = async (categoryId, kind, t) => (categoryId ? await mappedAccountId("FINANCE_CATEGORY", categoryId, t) : null) ??
    (0, exports.roleAccountId)(kind === 1 ? "DEFAULT_REVENUE" : "DEFAULT_EXPENSE", t);
exports.categoryAccountId = categoryAccountId;
/** ບັນຊີເງິນຄັງ → ບັນຊີທີ່ຜູກ ຫຼື ເງິນສົດ/ເງິນຝາກ ເລີ່ມຕົ້ນ ຕາມໝວດຂອງບັນຊີ */
const treasuryAccountId = async (treasuryId, isCash, t) => (await mappedAccountId("TREASURY_ACCOUNT", treasuryId, t)) ?? (0, exports.roleAccountId)(isCash ? "DEFAULT_CASH" : "DEFAULT_BANK", t);
exports.treasuryAccountId = treasuryAccountId;
/** ເລກທີໃບບັນທຶກ — ຮູບແບບຂອງ doc_code JOURNAL (ຕັ້ງຄ່າ → ເລກທີເອກະສານ) ຫຼື JV-YYYY-00001 */
const nextEntryNumber = async (date, t) => {
    const issued = await (0, docNumberingController_1.issueDocNumber)("JOURNAL", t);
    if (issued?.number)
        return issued.number;
    const prefix = `JV-${(0, moment_1.default)(date).format("YYYY")}-`;
    const last = await journalEntry_1.default.findOne({
        where: { entry_number: { [sequelize_1.Op.like]: `${prefix}%` } },
        order: [["entry_number", "DESC"]],
        transaction: t,
        lock: t.LOCK.UPDATE,
    });
    const seq = last ? Number(String(last.entry_number).slice(prefix.length)) || 0 : 0;
    return `${prefix}${String(seq + 1).padStart(5, "0")}`;
};
/**
 * ກວດ ແລະ ແປງແຖວຮ່າງເປັນແຖວ LAK — ບັນຊີຕ້ອງລົງລາຍການໄດ້ ແລະ ໃຊ້ງານຢູ່; ໜີ້ = ມີ ເປັນ LAK.
 * ເສດປັດຈາກການແປງສະກຸນ ໃສ່ແຖວໃຫຍ່ສຸດຂອງຝັ່ງທີ່ນ້ອຍກວ່າ
 */
const buildLines = async (input, t) => {
    const lines = input.lines.filter((l) => (0, exports.round2)(l.amount) !== 0);
    if (lines.length < 2)
        throw new GlError("ໃບບັນທຶກຕ້ອງມີຢ່າງໜ້ອຍ 2 ແຖວ");
    const ids = [...new Set(lines.map((l) => Number(l.accountId)))];
    const accounts = await chartAccount_1.default.findAll({ where: { _uuid: ids }, transaction: t });
    for (const id of ids) {
        const account = accounts.find((a) => Number(a._uuid) === id);
        if (!account)
            throw new GlError(`ບໍ່ພົບບັນຊີ #${id} ໃນຜັງບັນຊີ`);
        if (Number(account.status) !== 1)
            throw new GlError(`ບັນຊີ ${account.account_code} ${account.name_la} ປິດໃຊ້ງານແລ້ວ`);
        if (Number(account.is_postable) !== 1)
            throw new GlError(`ບັນຊີ ${account.account_code} ${account.name_la} ເປັນບັນຊີຫົວ — ລົງລາຍການບໍ່ໄດ້`);
    }
    const rows = lines.map((l, i) => {
        const amount = (0, exports.round2)(Math.abs(l.amount));
        const side = l.amount < 0 ? (l.side === exports.DEBIT ? exports.CREDIT : exports.DEBIT) : l.side;
        const rate = Number(l.rate) > 0 ? Number(l.rate) : 1;
        const base = (0, exports.round2)(amount * rate);
        return {
            line_no: i + 1,
            account_id: Number(l.accountId),
            description: l.description ?? null,
            debit: side === exports.DEBIT ? base : 0,
            credit: side === exports.CREDIT ? base : 0,
            currency_id: l.currencyId ?? null,
            amount_currency: side === exports.DEBIT ? amount : -amount,
            exchange_rate: rate,
            treasury_account_id: l.treasuryAccountId ?? null,
        };
    });
    const debit = (0, exports.round2)(rows.reduce((n, r) => n + r.debit, 0));
    const credit = (0, exports.round2)(rows.reduce((n, r) => n + r.credit, 0));
    const diff = (0, exports.round2)(debit - credit);
    if (diff !== 0) {
        // ຍອມໃຫ້ຕ່າງໄດ້ສະເພາະເສດປັດຂອງແຖວທີ່ແປງສະກຸນ (≤ 0.01 ຕໍ່ແຖວ) — ແຖວ LAK ລ້ວນຕ້ອງເທົ່າກັນພໍດີ
        const fxLines = rows.filter((r) => r.exchange_rate !== 1).length;
        if (Math.abs(diff) > 0.01 * fxLines + 1e-9)
            throw new GlError("ຍອດໜີ້ ແລະ ຍອດມີ ບໍ່ເທົ່າກັນ");
        const smaller = diff > 0 ? "credit" : "debit";
        const target = rows.filter((r) => r[smaller] > 0).sort((a, b) => b[smaller] - a[smaller])[0];
        target[smaller] = (0, exports.round2)(target[smaller] + Math.abs(diff));
    }
    const total = (0, exports.round2)(rows.reduce((n, r) => n + r.debit, 0));
    return { rows, total };
};
/** ສ້າງໃບບັນທຶກໃໝ່ */
const postEntry = async (input, t) => {
    await (0, exports.assertOpenPeriod)(input.date, t);
    const { rows, total } = await buildLines(input, t);
    const entry = await journalEntry_1.default.create({
        entry_number: await nextEntryNumber(input.date, t),
        entry_date: input.date,
        source_type: input.sourceType,
        source_id: input.sourceId == null ? null : String(input.sourceId),
        reference: input.reference ?? null,
        description: input.description ?? null,
        total_debit: total,
        total_credit: total,
        status: 1,
        created_by: input.actorId || null,
    }, { transaction: t });
    await journalLine_1.default.bulkCreate(rows.map((r) => ({ ...r, entry_id: entry._uuid })), { transaction: t });
    return entry;
};
exports.postEntry = postEntry;
/** ໃບທີ່ຍັງມີຜົນຂອງເອກະສານ (ບໍ່ແມ່ນໃບກັບລາຍການ ແລະ ຍັງບໍ່ຖືກກັບ) */
const activeEntryOf = (sourceType, sourceId, t) => journalEntry_1.default.findOne({
    where: { source_type: sourceType, source_id: String(sourceId), reversal_of: null, reversed_by: null },
    transaction: t,
    lock: t.LOCK.UPDATE,
});
exports.activeEntryOf = activeEntryOf;
/**
 * ລົງບັນຊີໃຫ້ເອກະສານ — ມີໃບຢູ່ແລ້ວ (ແກ້ເອກະສານ) ປ່ຽນວັນທີ/ແຖວໃນໃບເດີມ (ເລກທີຄືເກົ່າ), ບໍ່ມີ → ສ້າງໃໝ່
 */
const postSource = async (input, t) => {
    const existing = await (0, exports.activeEntryOf)(input.sourceType, input.sourceId, t);
    if (!existing)
        return (0, exports.postEntry)(input, t);
    await (0, exports.assertOpenPeriod)(existing.entry_date, t);
    await (0, exports.assertOpenPeriod)(input.date, t);
    const { rows, total } = await buildLines(input, t);
    await journalLine_1.default.destroy({ where: { entry_id: existing._uuid }, transaction: t });
    await existing.update({
        entry_date: input.date,
        reference: input.reference ?? null,
        description: input.description ?? null,
        total_debit: total,
        total_credit: total,
        updatedAt: new Date(),
    }, { transaction: t });
    await journalLine_1.default.bulkCreate(rows.map((r) => ({ ...r, entry_id: existing._uuid })), { transaction: t });
    return existing;
};
exports.postSource = postSource;
/**
 * ກັບລາຍການ — ໃບໃໝ່ທີ່ສະຫຼັບໜີ້/ມີ ຂອງໃບເດີມ. ວັນທີ: ບໍ່ສົ່ງ = ວັນທີຂອງໃບເດີມ ຖ້າງວດຍັງເປີດ, ປິດແລ້ວ = ມື້ນີ້
 */
const reverseEntry = async (entry, t, options = {}) => {
    if (entry.reversed_by)
        throw new GlError(`ໃບ ${entry.entry_number} ຖືກກັບລາຍການແລ້ວ`);
    if (entry.reversal_of)
        throw new GlError(`ໃບ ${entry.entry_number} ເປັນໃບກັບລາຍການ — ກັບຊ້ຳບໍ່ໄດ້`);
    const date = options.date ?? ((await (0, exports.closedFiscalOf)(entry.entry_date, t)) ? (0, moment_1.default)().utcOffset("+07:00").format("YYYY-MM-DD") : entry.entry_date);
    await (0, exports.assertOpenPeriod)(date, t);
    const lines = await journalLine_1.default.findAll({ where: { entry_id: entry._uuid }, order: [["line_no", "ASC"]], transaction: t });
    const reversal = await journalEntry_1.default.create({
        entry_number: await nextEntryNumber(date, t),
        entry_date: date,
        source_type: entry.source_type,
        source_id: entry.source_id,
        reference: entry.entry_number,
        description: options.description ?? `ກັບລາຍການ ${entry.entry_number}${entry.description ? ` — ${entry.description}` : ""}`,
        total_debit: entry.total_credit,
        total_credit: entry.total_debit,
        reversal_of: entry._uuid,
        status: 1,
        created_by: options.actorId || null,
    }, { transaction: t });
    await journalLine_1.default.bulkCreate(lines.map((l) => ({
        entry_id: reversal._uuid,
        line_no: l.line_no,
        account_id: l.account_id,
        description: l.description,
        debit: l.credit,
        credit: l.debit,
        currency_id: l.currency_id,
        amount_currency: -Number(l.amount_currency),
        exchange_rate: l.exchange_rate,
        treasury_account_id: l.treasury_account_id,
    })), { transaction: t });
    await entry.update({ reversed_by: reversal._uuid, updatedAt: new Date() }, { transaction: t });
    return reversal;
};
exports.reverseEntry = reverseEntry;
/** ກັບລາຍການຂອງເອກະສານ (ຍົກເລີກລາຍຮັບ/ລາຍຈ່າຍ) — ບໍ່ມີໃບ (ລົງກ່ອນເປີດລະບົບ) ກໍ່ຂ້າມ */
const reverseSource = async (sourceType, sourceId, t, actorId) => {
    const entry = await (0, exports.activeEntryOf)(sourceType, sourceId, t);
    return entry ? (0, exports.reverseEntry)(entry, t, { actorId }) : null;
};
exports.reverseSource = reverseSource;
