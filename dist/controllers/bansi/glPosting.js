"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rebuildFromDocuments = exports.postAccountOpening = exports.accountOpeningId = exports.postPayroll = exports.postTransfer = exports.postExpense = exports.postIncome = void 0;
const moment_1 = __importDefault(require("moment"));
const incomeModel_1 = __importDefault(require("../../models/incomeModel"));
const expenseModel_1 = __importDefault(require("../../models/expenseModel"));
const transferMoney_1 = __importDefault(require("../../models/transferMoney"));
const payroll_1 = __importDefault(require("../../models/payroll"));
const treasuryAcount_1 = __importDefault(require("../../models/treasuryAcount"));
const typeTreasury_1 = __importDefault(require("../../models/typeTreasury"));
const journalEntry_1 = __importDefault(require("../../models/journalEntry"));
const journalLine_1 = __importDefault(require("../../models/journalLine"));
const journalHelpers_1 = require("./journalHelpers");
const glCore_1 = require("./glCore");
/**
 * ກົດການລົງບັນຊີອັດຕະໂນມັດຂອງເອກະສານ (source_type → ແຖວໜີ້/ມີ):
 * - INCOME:   ໜີ້ ເງິນສົດ/ທະນາຄານ (ຍອດເຂົ້າ)         / ມີ ລາຍຮັບ (ຍອດກ່ອນອາກອນ) + ມີ ອາກອນຂາອອກ
 * - EXPENSE:  ໜີ້ ລາຍຈ່າຍ (ຍອດກ່ອນອາກອນ) + ໜີ້ ອາກອນຂາເຂົ້າ / ມີ ເງິນສົດ/ທະນາຄານ (ຍອດຈ່າຍ)
 * - TRANSFER: ໜີ້ ບັນຊີຮັບ                             / ມີ ບັນຊີໂອນອອກ
 * - OPENING:  ໜີ້ ເງິນສົດ/ທະນາຄານ (ຍອດເລີ່ມຕົ້ນຕອນເປີດບັນຊີເງິນຄັງ) / ມີ ທຶນຍອດຍົກມາ — source_id "TA-{id}"
 * - PAYROLL:  ໜີ້ ລາຍຈ່າຍເງິນເດືອນ (gross) + ໜີ້ ປກສ ສ່ວນບໍລິສັດ / ມີ ເງິນສົດ/ທະນາຄານ (ສຸດທິ) + ມີ ປກສ ຄ້າງຈ່າຍ
 *             (ພະນັກງານ + ບໍລິສັດ) + ມີ ອາກອນລາຍໄດ້ຄ້າງຈ່າຍ + ມີ ຍອດຫັກອື່ນ
 * ຍອດຍົກມາຕົ້ນປີ (tbl_opening_balance) ເປັນພຽງພາບຖ່າຍຂອງຍອດທີ່ຍົກມາຈາກປີກ່ອນ ຈຶ່ງບໍ່ລົງບັນຊີ (ລົງແລ້ວຈະນັບຊ້ຳ).
 * ທຸກຟັງຊັນບໍ່ເຮັດຫຍັງ ຖ້າຍັງບໍ່ໄດ້ສ້າງຕາຕະລາງ (glReady)
 */
const ACTIVE = 1;
/** ບັນຊີເງິນຄັງ → { ບັນຊີໃນຜັງ, ສະກຸນ, ອັດຕາ } ຕາມວັນທີ */
const treasurySide = async (treasuryId, date, t) => {
    const account = await treasuryAcount_1.default.findByPk(treasuryId, {
        include: [{ model: typeTreasury_1.default, as: "treasury", attributes: ["_uuid", "currencyId"] }],
        transaction: t,
    });
    if (!account)
        throw new glCore_1.GlError(`ບໍ່ພົບບັນຊີເງິນຄັງ #${treasuryId}`);
    const currencyId = account.treasury?.currencyId ?? null;
    return {
        accountId: await (0, glCore_1.treasuryAccountId)(account._uuid, await (0, journalHelpers_1.isCashAccount)(account, t), t),
        currencyId,
        rate: await (0, glCore_1.rateOf)(currencyId, date, t),
        name: account.acountName,
    };
};
/** ວັນທີທຸລະກິດ (ລາວ) ຂອງ createdAt — ເອກະສານທີ່ບໍ່ມີຖັນວັນທີ (ໂອນເງິນ) ຫຼື ແຖວເກົ່າ */
const laoDateOf = (value) => (0, moment_1.default)(value).utcOffset(journalHelpers_1.BUSINESS_OFFSET).format("YYYY-MM-DD");
const postIncome = async (row, t, actorId) => {
    if (!(await (0, glCore_1.glReady)(t)))
        return null;
    const date = row.income_date || laoDateOf(row.createdAt);
    const cash = await treasurySide(Number(row.acount_id_fk), date, t);
    const total = (0, glCore_1.round2)(Number(row.balance_income));
    const tax = (0, glCore_1.round2)(Number(row.tax) || 0);
    const common = { currencyId: cash.currencyId, rate: cash.rate };
    const lines = [
        { ...common, accountId: cash.accountId, side: glCore_1.DEBIT, amount: total, treasuryAccountId: Number(row.acount_id_fk) },
        { ...common, accountId: await (0, glCore_1.categoryAccountId)(row.type_incom_fk, 1, t), side: glCore_1.CREDIT, amount: (0, glCore_1.round2)(total - tax) },
    ];
    if (tax)
        lines.push({ ...common, accountId: await (0, glCore_1.roleAccountId)("VAT_OUTPUT", t), side: glCore_1.CREDIT, amount: tax });
    return (0, glCore_1.postSource)({
        date, sourceType: "INCOME", sourceId: row._uuid, reference: row.number, description: row.incom_title, lines, actorId,
    }, t);
};
exports.postIncome = postIncome;
const postExpense = async (row, t, actorId) => {
    if (!(await (0, glCore_1.glReady)(t)))
        return null;
    const date = row.expense_date || laoDateOf(row.createdAt);
    const cash = await treasurySide(Number(row.acount_id_fk), date, t);
    const total = (0, glCore_1.round2)(Number(row.balance_expense));
    const tax = (0, glCore_1.round2)(Number(row.tax) || 0);
    const common = { currencyId: cash.currencyId, rate: cash.rate };
    const lines = [
        { ...common, accountId: await (0, glCore_1.categoryAccountId)(row.type_expense_fk, 2, t), side: glCore_1.DEBIT, amount: (0, glCore_1.round2)(total - tax) },
    ];
    if (tax)
        lines.push({ ...common, accountId: await (0, glCore_1.roleAccountId)("VAT_INPUT", t), side: glCore_1.DEBIT, amount: tax });
    lines.push({ ...common, accountId: cash.accountId, side: glCore_1.CREDIT, amount: total, treasuryAccountId: Number(row.acount_id_fk) });
    return (0, glCore_1.postSource)({
        date, sourceType: "EXPENSE", sourceId: row._uuid, reference: row.number, description: row.expense_title, lines, actorId,
    }, t);
};
exports.postExpense = postExpense;
const postTransfer = async (row, t, actorId) => {
    if (!(await (0, glCore_1.glReady)(t)))
        return null;
    const date = laoDateOf(row.createdAt);
    const amount = (0, glCore_1.round2)(Number(row.balance_transfer));
    const from = await treasurySide(Number(row.account_outid), date, t);
    const to = await treasurySide(Number(row.account_inid), date, t);
    return (0, glCore_1.postSource)({
        date,
        sourceType: "TRANSFER",
        sourceId: row._uuid,
        description: row.description || `ໂອນເງິນ ${from.name} → ${to.name}`,
        lines: [
            { accountId: to.accountId, side: glCore_1.DEBIT, amount, currencyId: to.currencyId, rate: to.rate, treasuryAccountId: Number(row.account_inid) },
            { accountId: from.accountId, side: glCore_1.CREDIT, amount, currencyId: from.currencyId, rate: from.rate, treasuryAccountId: Number(row.account_outid) },
        ],
        actorId,
    }, t);
};
exports.postTransfer = postTransfer;
/** ເງິນເດືອນທີ່ຈ່າຍແລ້ວ (ບັນຊີສະກຸນກີບເທົ່ານັ້ນ) — ແຖວທີ່ເປັນ 0 ບໍ່ລົງ ແລະ ບໍ່ຕ້ອງຜູກບົດບາດຂອງມັນ */
const postPayroll = async (row, t, actorId) => {
    if (!(await (0, glCore_1.glReady)(t)))
        return null;
    const date = row.pay_date;
    const cash = await treasurySide(Number(row.account_id), date, t);
    const value = (field) => (0, glCore_1.round2)(Number(row[field]) || 0);
    const employer = value("total_sso_employer");
    const lines = [];
    const add = async (role, side, amount) => {
        if (amount)
            lines.push({ accountId: await (0, glCore_1.roleAccountId)(role, t), side, amount });
    };
    await add("SALARY_EXPENSE", glCore_1.DEBIT, value("total_gross"));
    await add("SSO_EXPENSE", glCore_1.DEBIT, employer);
    lines.push({
        accountId: cash.accountId, side: glCore_1.CREDIT, amount: value("total_net"),
        currencyId: cash.currencyId, rate: cash.rate, treasuryAccountId: Number(row.account_id),
    });
    await add("SSO_PAYABLE", glCore_1.CREDIT, (0, glCore_1.round2)(value("total_sso_employee") + employer));
    await add("PIT_PAYABLE", glCore_1.CREDIT, value("total_tax"));
    await add("PAYROLL_DEDUCTION", glCore_1.CREDIT, value("total_other_deduction"));
    return (0, glCore_1.postSource)({
        date, sourceType: "PAYROLL", sourceId: row._uuid, reference: row.number, description: row.description, lines, actorId,
    }, t);
};
exports.postPayroll = postPayroll;
/** source_id ຂອງໃບຍອດເລີ່ມຕົ້ນຂອງບັນຊີເງິນຄັງ */
const accountOpeningId = (treasuryId) => `TA-${treasuryId}`;
exports.accountOpeningId = accountOpeningId;
/**
 * ຍອດເລີ່ມຕົ້ນຂອງບັນຊີເງິນຄັງ (ສະກຸນຂອງບັນຊີ) — ໜີ້ ເງິນສົດ/ທະນາຄານ / ມີ ທຶນຍອດຍົກມາ (ຕິດລົບ = ສະຫຼັບຝັ່ງ).
 * ລົງໃໝ່ທັງໃບທຸກເທື່ອ (postSource); ຍອດ 0 = ກັບລາຍການໃບເກົ່າ (ຖ້າມີ)
 */
const postAccountOpening = async (treasuryId, amount, date, t, actorId) => {
    if (!(await (0, glCore_1.glReady)(t)))
        return null;
    const value = (0, glCore_1.round2)(amount);
    if (!value)
        return (0, glCore_1.reverseSource)("OPENING", (0, exports.accountOpeningId)(treasuryId), t, actorId);
    const cash = await treasurySide(treasuryId, date, t);
    return (0, glCore_1.postSource)({
        date,
        sourceType: "OPENING",
        sourceId: (0, exports.accountOpeningId)(treasuryId),
        description: `ຍອດເລີ່ມຕົ້ນ — ${cash.name}`,
        lines: [
            { accountId: cash.accountId, side: glCore_1.DEBIT, amount: value, currencyId: cash.currencyId, rate: cash.rate, treasuryAccountId: treasuryId },
            { accountId: await (0, glCore_1.roleAccountId)("OPENING_EQUITY", t), side: glCore_1.CREDIT, amount: (0, glCore_1.round2)(value * cash.rate) },
        ],
        actorId,
    }, t);
};
exports.postAccountOpening = postAccountOpening;
/**
 * ກະທົບຍອດບັນຊີເງິນຄັງກັບສະໝຸດບັນຊີ: ຍອດເລີ່ມຕົ້ນ = ຍອດປັດຈຸບັນ (ໃຊ້ໄດ້ + ຄ້າງ) − ທຸກແຖວທີ່ລົງແລ້ວຂອງບັນຊີນີ້
 * (ບໍ່ນັບໃບຍອດເລີ່ມຕົ້ນເອງ) — ຫຼັງລົງເອກະສານຄົບ ຍອດເງິນສົດ/ທະນາຄານໃນບັນຊີ = ຍອດໃນບັນຊີເງິນຄັງພໍດີ.
 * ວັນທີ = ວັນເປີດບັນຊີ; ປີນັ້ນປິດແລ້ວ = ມື້ນີ້
 */
const reconcileAccountOpening = async (account, t, actorId) => {
    const ownOpening = await (0, glCore_1.activeEntryOf)("OPENING", (0, exports.accountOpeningId)(account._uuid), t);
    const lines = await journalLine_1.default.findAll({
        where: { treasury_account_id: account._uuid },
        attributes: ["entry_id", "amount_currency"],
        transaction: t,
    });
    const posted = lines
        .filter((l) => !ownOpening || Number(l.entry_id) !== Number(ownOpening._uuid))
        .reduce((n, l) => n + Number(l.amount_currency), 0);
    const current = (Number(account.balance_treasury) || 0) + (Number(account.balance_unable) || 0);
    const opening = (0, glCore_1.round2)(current - posted);
    if (!opening && !ownOpening)
        return false;
    const created = account.createdAt ? laoDateOf(account.createdAt) : (0, moment_1.default)().utcOffset(journalHelpers_1.BUSINESS_OFFSET).format("YYYY-MM-DD");
    const today = (0, moment_1.default)().utcOffset(journalHelpers_1.BUSINESS_OFFSET).format("YYYY-MM-DD");
    const date = ownOpening?.entry_date ?? (created > today ? today : created);
    try {
        await (0, exports.postAccountOpening)(account._uuid, opening, date, t, actorId);
    }
    catch (error) {
        // ປີຂອງວັນເປີດບັນຊີປິດແລ້ວ → ລົງເປັນມື້ນີ້ແທນ (ຍອດປັດຈຸບັນຍັງຖືກ)
        if (!(error instanceof glCore_1.GlError) || ownOpening)
            throw error;
        await (0, exports.postAccountOpening)(account._uuid, opening, today, t, actorId);
    }
    return true;
};
/**
 * ລົງບັນຊີຍ້ອນຫຼັງໃຫ້ເອກະສານທີ່ມີກ່ອນເປີດລະບົບ (ສະເພາະທີ່ໃຊ້ງານ ແລະ ຍັງບໍ່ມີໃບ) — ແຕ່ລະເອກະສານຄົນລະ transaction:
 * ອັນທີ່ລົ້ມເຫຼວ (ເຊັ່ນ ປີປິດແລ້ວ, ບໍ່ມີອັດຕາ) ບໍ່ກະທົບອັນອື່ນ ແລະ ລາຍງານກັບ
 */
const rebuildFromDocuments = async (actorId) => {
    const sequelize = journalEntry_1.default.sequelize;
    if (!(await (0, glCore_1.glReady)()))
        throw new glCore_1.GlError("ຍັງບໍ່ໄດ້ສ້າງຕາຕະລາງບັນຊີຄູ່ — ແລ່ນ sql/create_gl_accounting.sql ກ່ອນ");
    const result = { posted: 0, skipped: 0, failed: [] };
    const run = async (sourceType, id, label, post) => {
        const t = await sequelize.transaction();
        try {
            if (await (0, glCore_1.activeEntryOf)(sourceType, id, t)) {
                await t.rollback();
                result.skipped++;
                return;
            }
            await post(t);
            await t.commit();
            result.posted++;
        }
        catch (error) {
            await t.rollback();
            result.failed.push({ source: label, message: error?.message ?? String(error) });
        }
    };
    const incomes = await incomeModel_1.default.findAll({ where: { status: ACTIVE }, order: [["_uuid", "ASC"]] });
    for (const row of incomes)
        await run("INCOME", row._uuid, row.number ?? `INCOME #${row._uuid}`, (t) => (0, exports.postIncome)(row, t, actorId));
    const expenses = await expenseModel_1.default.findAll({ where: { status: ACTIVE }, order: [["_uuid", "ASC"]] });
    for (const row of expenses)
        await run("EXPENSE", row._uuid, row.number ?? `EXPENSE #${row._uuid}`, (t) => (0, exports.postExpense)(row, t, actorId));
    const transfers = await transferMoney_1.default.findAll({ where: { status: ACTIVE }, order: [["_uuid", "ASC"]] });
    for (const row of transfers)
        await run("TRANSFER", row._uuid, `TRANSFER #${row._uuid}`, (t) => (0, exports.postTransfer)(row, t, actorId));
    const payrolls = await payroll_1.default.findAll({ where: { status: 2 }, order: [["_uuid", "ASC"]] });
    for (const row of payrolls)
        await run("PAYROLL", row._uuid, row.number ?? `PAYROLL #${row._uuid}`, (t) => (0, exports.postPayroll)(row, t, actorId));
    // ສຸດທ້າຍ: ຍອດເລີ່ມຕົ້ນຂອງແຕ່ລະບັນຊີເງິນຄັງ ໃຫ້ຍອດໃນສະໝຸດບັນຊີກົງກັບຍອດປັດຈຸບັນ (ຄິດໃໝ່ທຸກເທື່ອ)
    const accounts = await treasuryAcount_1.default.findAll({ order: [["_uuid", "ASC"]] });
    for (const account of accounts) {
        const t = await sequelize.transaction();
        try {
            const changed = await reconcileAccountOpening(account, t, actorId);
            await t.commit();
            if (changed)
                result.posted++;
        }
        catch (error) {
            await t.rollback();
            result.failed.push({ source: account.acountName ?? `ACCOUNT #${account._uuid}`, message: error?.message ?? String(error) });
        }
    }
    return result;
};
exports.rebuildFromDocuments = rebuildFromDocuments;
