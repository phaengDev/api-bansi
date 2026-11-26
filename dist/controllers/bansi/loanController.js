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
exports.hasAccrualToPost = exports.getAccrualRuns = exports.undoAccrual = exports.runAccrual = exports.previewAccrual = exports.computeAccruals = exports.cancelLoanPayment = exports.payLoan = exports.recordLoanPayment = exports.deleteLoan = exports.updateLoan = exports.createLoan = exports.previewLoan = exports.getLoan = exports.getLoans = exports.presentPayments = exports.paymentsOf = exports.currencyMap = exports.presentLoan = exports.summarize = exports.undoStart = exports.applyStart = exports.installmentsOf = exports.writeInstallments = exports.termsOf = exports.nextCode = exports.assertAccount = exports.takeOut = exports.lockTreasury = exports.treasuryCurrencyId = exports.baseCurrencyId = exports.currencyDecimals = exports.bookedOn = exports.isBorrowed = exports.fail = exports.LENT = exports.BORROWED = void 0;
const sequelize_1 = require("sequelize");
const moment_1 = __importDefault(require("moment"));
const database_1 = __importDefault(require("../../config/database"));
const loan_1 = __importStar(require("../../models/loan"));
const loanCredit_1 = require("../../models/loanCredit");
const chartAccount_1 = __importDefault(require("../../models/chartAccount"));
const journalEntry_1 = __importDefault(require("../../models/journalEntry"));
const treasuryAcount_1 = __importDefault(require("../../models/treasuryAcount"));
const typeTreasury_1 = __importDefault(require("../../models/typeTreasury"));
const currencyModel_1 = __importDefault(require("../../models/currencyModel"));
const glCore_1 = require("./glCore");
const glPosting_1 = require("./glPosting");
const accountMovement_1 = require("./accountMovement");
const bansiHelpers_1 = require("./bansiHelpers");
const journalHelpers_1 = require("./journalHelpers");
const loanSchedule_1 = require("../../utils/loanSchedule");
/**
 * ເງິນກູ້ຢືມ (direction 1) / ເງິນໃຫ້ກູ້ (direction 2): ສັນຍາ + ຕາຕະລາງຜ່ອນ, ການຈ່າຍ/ຮັບຄືນ ແລະ ດອກເບ້ຍຄ້າງທ້າຍເດືອນ. ລົງບັນຊີ:
 * - LOAN_START (source_id = ເງິນກູ້): ຮັບເງິນກູ້ = ໜີ້ ເງິນສົດ/ທະນາຄານ / ມີ ເງິນກູ້ຢືມ; ໃຫ້ກູ້ = ໜີ້ ເງິນໃຫ້ກູ້ / ມີ ເງິນສົດ/ທະນາຄານ.
 *   ຍອດຍົກມາ: ຍອດຕົ້ນທຶນຄົງເຫຼືອ ນ ວັນທີຍົກມາ ຄູ່ກັບ ທຶນຍອດຍົກມາ
 * - LOAN_PAYMENT (source_id = ການຈ່າຍ): ຈ່າຍຄືນ = ໜີ້ ເງິນກູ້ (ຕົ້ນທຶນ) + ໜີ້ ດອກເບ້ຍຈ່າຍ + ໜີ້ ຄ່າທຳນຽມ / ມີ ເງິນສົດ/ທະນາຄານ;
 *   ຮັບຄືນ = ກົງກັນຂ້າມ (ດອກເບ້ຍຮັບ, ຄ່າທຳນຽມຮັບ)
 * - LOAN_ACCRUAL (source_id = YYYY-MM, ວັນທີທ້າຍເດືອນ): ດອກເບ້ຍທີ່ເກີດແລ້ວແຕ່ຍັງບໍ່ທັນຈ່າຍ — ໜີ້ ດອກເບ້ຍຈ່າຍ / ມີ ດອກເບ້ຍຄ້າງຈ່າຍ
 *   (ໃຫ້ກູ້: ໜີ້ ດອກເບ້ຍຄ້າງຮັບ / ມີ ດອກເບ້ຍຮັບ). ກັບຄືນອັດຕະໂນມັດວັນທີ 1 ຂອງເດືອນຖັດໄປ (LOAN_ACCRUAL_REV) — ດອກເບ້ຍທີ່ຈ່າຍຈິງ
 *   ລົງເປັນລາຍຈ່າຍ/ລາຍຮັບ ຕອນຈ່າຍ. ຂ້າມເດືອນທີ່ບໍ່ໄດ້ຄິດກໍ່ບໍ່ຜິດ (ເປັນແບບເງິນສົດສຳລັບເດືອນນັ້ນ)
 * ຍອດທຸກຢ່າງເປັນສະກຸນຂອງເງິນກູ້ — ຮັບ/ຈ່າຍໄດ້ສະເພາະບັນຊີເງິນຄັງສະກຸນດຽວກັນ
 */
exports.BORROWED = 1;
exports.LENT = 2;
const START_TREASURY = 1;
const START_OPENING = 2;
const ACTIVE = 1;
const CANCELLED = 2;
const fail = (res, error, fallback) => {
    if (error instanceof glCore_1.GlError) {
        res.status(400).json({ message: error.message });
        return;
    }
    (0, bansiHelpers_1.sendError)(res, error, fallback);
};
exports.fail = fail;
const notReady = (res) => res.status(503).json({ message: "ຍັງບໍ່ໄດ້ເປີດໃຊ້ລະບົບບັນຊີຄູ່", notReady: true });
const monthEnd = (month) => (0, moment_1.default)(month, "YYYY-MM").endOf("month").format("YYYY-MM-DD");
const nextMonthStart = (month) => (0, moment_1.default)(month, "YYYY-MM").add(1, "month").startOf("month").format("YYYY-MM-DD");
const parseMonth = (value) => {
    const m = (0, moment_1.default)(String(value ?? ""), "YYYY-MM", true);
    if (!m.isValid())
        throw new glCore_1.GlError("ກະລຸນາເລືອກເດືອນ");
    return m.format("YYYY-MM");
};
const num = (value) => (0, glCore_1.round2)(Number(value) || 0);
const isBorrowed = (loan) => Number(loan.direction) !== exports.LENT;
exports.isBorrowed = isBorrowed;
/** ວັນທີທີ່ເງິນກູ້ເຂົ້າບັນຊີ (ຮັບ/ຈ່າຍເງິນ ຫຼື ວັນທີຍອດຍົກມາ) */
const bookedOn = (loan) => (Number(loan.start_mode) === START_OPENING ? String(loan.opening_date) : String(loan.start_date));
exports.bookedOn = bookedOn;
/** ທົດສະນິຍົມຂອງສະກຸນເງິນກູ້ (ກີບ = 0) */
const currencyDecimals = async (currencyId, t) => (0, loanSchedule_1.decimalsOf)(currencyId ? (await currencyModel_1.default.findByPk(currencyId, { attributes: ["_id", "name"], transaction: t }))?.name : "LAK");
exports.currencyDecimals = currencyDecimals;
const baseCurrencyId = async (t) => (await currencyModel_1.default.findOne({ where: { name: "LAK" }, attributes: ["_id"], transaction: t }))?._id ?? null;
exports.baseCurrencyId = baseCurrencyId;
/** ສະກຸນຂອງບັນຊີເງິນຄັງ */
const treasuryCurrencyId = async (treasuryId, t) => {
    const account = await treasuryAcount_1.default.findByPk(treasuryId, {
        include: [{ model: typeTreasury_1.default, as: "treasury", attributes: ["_uuid", "currencyId"] }], transaction: t,
    });
    return account ? Number(account.treasury?.currencyId ?? 0) || null : null;
};
exports.treasuryCurrencyId = treasuryCurrencyId;
/** ບັນຊີເງິນຄັງທີ່ໃຊ້ໄດ້ ແລະ ສະກຸນດຽວກັບເງິນກູ້ (ອ່ານແບບລັອກ ເພື່ອປ່ຽນຍອດ) */
const lockTreasury = async (treasuryId, currencyId, t) => {
    const account = Number.isInteger(treasuryId) ? await treasuryAcount_1.default.findByPk(treasuryId, { transaction: t, lock: t.LOCK.UPDATE }) : null;
    if (!account || Number(account.status) !== 1)
        throw new glCore_1.GlError("ກະລຸນາເລືອກບັນຊີເງິນຄັງ (ໃຊ້ງານຢູ່)");
    if (currencyId && (await (0, exports.treasuryCurrencyId)(treasuryId, t)) !== Number(currencyId)) {
        throw new glCore_1.GlError("ບັນຊີເງິນຄັງຕ້ອງເປັນສະກຸນດຽວກັບເງິນກູ້");
    }
    return account;
};
exports.lockTreasury = lockTreasury;
const takeOut = (account, amount) => {
    if ((Number(account.balance_treasury) || 0) < amount - 0.004)
        throw new glCore_1.GlError("ຍອດເງິນທີ່ໃຊ້ໄດ້ຂອງບັນຊີບໍ່ພໍ");
};
exports.takeOut = takeOut;
/** ກວດບັນຊີທີ່ເລືອກ — ລົງລາຍການໄດ້, ໃຊ້ງານ ແລະ ຢູ່ກຸ່ມທີ່ຖືກ */
const assertAccount = async (id, groups, label, t) => {
    if (!id)
        return;
    const account = await chartAccount_1.default.findByPk(id, { transaction: t });
    if (!account || Number(account.status) !== 1 || Number(account.is_postable) !== 1 || !groups.includes(Number(account.account_group))) {
        throw new glCore_1.GlError(`${label}: ເລືອກບັນຊີກຸ່ມ ${groups.join(", ")} ທີ່ລົງລາຍການໄດ້`);
    }
};
exports.assertAccount = assertAccount;
/** ລະຫັດຖັດໄປ — LN-0001 (ເງິນກູ້ທົ່ວໄປ) / CR-000001 (ສັນຍາສິນເຊື່ອ) */
const nextCode = async (t, prefix = "LN-", digits = 4) => {
    const rows = await loan_1.default.findAll({ attributes: ["loan_code"], where: { loan_code: { [sequelize_1.Op.like]: `${prefix}%` } }, raw: true, transaction: t });
    const max = rows.reduce((n, r) => Math.max(n, Number(String(r.loan_code).slice(prefix.length)) || 0), 0);
    return `${prefix}${String(max + 1).padStart(digits, "0")}`;
};
exports.nextCode = nextCode;
const termsOf = (body, current) => ({
    principal: num(body.principal ?? current?.principal),
    annual_rate: Number(body.annual_rate ?? current?.annual_rate ?? 0),
    method: Number(body.method ?? current?.method ?? loanSchedule_1.METHODS.ANNUITY),
    day_basis: Number(body.day_basis ?? current?.day_basis ?? 1) === 2 ? 2 : 1,
    frequency_months: Number(body.frequency_months ?? current?.frequency_months ?? 1),
    frequency_days: Number(body.frequency_days ?? current?.frequency_days) || null,
    term: Math.round(Number(body.term ?? current?.term)),
    start_date: (0, bansiHelpers_1.toDateOnly)(body.start_date ?? current?.start_date) ?? "",
    first_due_date: (0, bansiHelpers_1.toDateOnly)(body.first_due_date ?? current?.first_due_date) ?? "",
});
exports.termsOf = termsOf;
/** ກວດ ແລະ ແປງຂໍ້ມູນຈາກຟອມ (current = ແກ້ໄຂ) */
const parseInput = async (body, t, current) => {
    const direction = Number(body.direction ?? current?.direction) === exports.LENT ? exports.LENT : exports.BORROWED;
    const counterparty = String(body.counterparty ?? current?.counterparty ?? "").trim().slice(0, 200);
    if (!counterparty)
        throw new glCore_1.GlError(direction === exports.BORROWED ? "ກະລຸນາປ້ອນຊື່ຜູ້ໃຫ້ກູ້ (ທະນາຄານ / ບຸກຄົນ)" : "ກະລຸນາປ້ອນຊື່ຜູ້ກູ້");
    const terms = (0, exports.termsOf)(body, current);
    const error = (0, loanSchedule_1.termsError)(terms);
    if (error)
        throw new glCore_1.GlError(error);
    const currencyId = Number(body.currency_id ?? current?.currency_id) || (await (0, exports.baseCurrencyId)(t));
    terms.principal = (0, loanSchedule_1.roundTo)(terms.principal, await (0, exports.currencyDecimals)(currencyId, t));
    const startMode = Number(body.start_mode ?? current?.start_mode ?? START_TREASURY) === START_OPENING ? START_OPENING : START_TREASURY;
    const treasuryId = startMode === START_TREASURY ? Number(body.treasury_account_id ?? current?.treasury_account_id) || null : null;
    const openingDate = startMode === START_OPENING ? (0, bansiHelpers_1.toDateOnly)(body.opening_date ?? current?.opening_date) : null;
    if (startMode === START_TREASURY && !treasuryId) {
        throw new glCore_1.GlError(direction === exports.BORROWED ? "ກະລຸນາເລືອກບັນຊີທີ່ຮັບເງິນກູ້" : "ກະລຸນາເລືອກບັນຊີທີ່ຈ່າຍເງິນໃຫ້ກູ້");
    }
    if (startMode === START_TREASURY && terms.start_date > (0, journalHelpers_1.todayLao)())
        throw new glCore_1.GlError("ວັນທີຮັບ/ຈ່າຍເງິນກູ້ ຕ້ອງບໍ່ເກີນມື້ນີ້");
    if (startMode === START_OPENING) {
        if (!openingDate)
            throw new glCore_1.GlError("ກະລຸນາເລືອກວັນທີຍອດຍົກມາ");
        if (openingDate < terms.start_date)
            throw new glCore_1.GlError("ວັນທີຍອດຍົກມາ ຕ້ອງບໍ່ກ່ອນວັນທີກູ້");
        if (openingDate > (0, journalHelpers_1.todayLao)())
            throw new glCore_1.GlError("ວັນທີຍອດຍົກມາ ຕ້ອງບໍ່ເກີນມື້ນີ້");
    }
    if (treasuryId && currencyId && (await (0, exports.treasuryCurrencyId)(treasuryId, t)) !== currencyId) {
        throw new glCore_1.GlError("ບັນຊີເງິນຄັງຕ້ອງເປັນສະກຸນດຽວກັບເງິນກູ້");
    }
    const loanAccountId = Number(body.loan_account_id ?? current?.loan_account_id)
        || (await (0, glCore_1.roleAccountId)(direction === exports.BORROWED ? "LOAN_PAYABLE" : "LOAN_RECEIVABLE", t));
    const interestAccountId = body.interest_account_id !== undefined ? Number(body.interest_account_id) || null : current?.interest_account_id ?? null;
    await (0, exports.assertAccount)(loanAccountId, [direction === exports.BORROWED ? 2 : 1], direction === exports.BORROWED ? "ບັນຊີເງິນກູ້ຢືມ" : "ບັນຊີເງິນໃຫ້ກູ້", t);
    await (0, exports.assertAccount)(interestAccountId, [direction === exports.BORROWED ? 5 : 4], direction === exports.BORROWED ? "ບັນຊີດອກເບ້ຍຈ່າຍ" : "ບັນຊີດອກເບ້ຍຮັບ", t);
    const text = (key, max) => body[key] !== undefined ? String(body[key] ?? "").trim().slice(0, max) || null : current?.[key] ?? null;
    return {
        direction,
        counterparty,
        contract_no: text("contract_no", 100),
        currency_id: currencyId,
        ...terms,
        start_mode: startMode,
        treasury_account_id: treasuryId,
        opening_date: openingDate,
        loan_account_id: loanAccountId,
        interest_account_id: interestAccountId,
        purpose: text("purpose", 255),
        note: text("note", 255),
    };
};
/** ຖັນທີ່ກະທົບການລົງບັນຊີ / ຕາຕະລາງ — ແກ້ໄດ້ສະເພາະກ່ອນມີການຈ່າຍ ແລະ ກ່ອນຄິດດອກເບ້ຍຄ້າງ */
const TERM_FIELDS = [
    "direction", "currency_id", "principal", "annual_rate", "method", "day_basis", "frequency_months", "frequency_days", "term", "start_date",
    "first_due_date", "start_mode", "treasury_account_id", "opening_date", "loan_account_id",
];
const sameValue = (a, b) => String(a ?? "") === String(b ?? "") || (Number(a) === Number(b) && a !== null && b !== null && a !== "" && b !== "");
/** ສ້າງຕາຕະລາງຜ່ອນໃໝ່ (ລຶບຂອງເກົ່າ) — ຍອດຍົກມາ: ງວດທີ່ຄົບກຳນົດຮອດວັນທີຍົກມາ = ຈ່າຍແລ້ວ */
const writeInstallments = async (loan, t) => {
    await loan_1.LoanInstallment.destroy({ where: { loan_id: loan._uuid }, transaction: t });
    const rows = (0, loanSchedule_1.buildSchedule)((0, exports.termsOf)({}, loan), await (0, exports.currencyDecimals)(loan.currency_id, t));
    const opening = Number(loan.start_mode) === START_OPENING ? String(loan.opening_date) : null;
    await loan_1.LoanInstallment.bulkCreate(rows.map((r) => ({
        loan_id: loan._uuid, no: r.no, due_date: r.due_date, principal: r.principal, interest: r.interest, balance: r.balance,
        settled: opening && r.due_date <= opening ? 1 : 0,
    })), { transaction: t });
    return rows;
};
exports.writeInstallments = writeInstallments;
const installmentsOf = async (loanId, t) => (await loan_1.LoanInstallment.findAll({ where: { loan_id: loanId }, order: [["no", "ASC"]], transaction: t })).map((r) => ({
    no: r.no, due_date: String(r.due_date), principal: num(r.principal), interest: num(r.interest), settled: Number(r.settled) === 1,
}));
exports.installmentsOf = installmentsOf;
/** ຍອດຕົ້ນທຶນຄົງເຫຼືອ ນ ວັນທີເງິນກູ້ເຂົ້າບັນຊີ (ຍອດຍົກມາ = ຫັກງວດທີ່ຈ່າຍກ່ອນເຂົ້າລະບົບ) */
const startAmount = (loan, rows) => (0, glCore_1.round2)(num(loan.principal) - rows.filter((r) => r.settled).reduce((n, r) => n + r.principal, 0));
/** ຄ່າທຳນຽມເປີດສິນເຊື່ອທີ່ຫັກຕອນປ່ອຍກູ້ (ສະເພາະເງິນໃຫ້ກູ້ທີ່ຈ່າຍຜ່ານບັນຊີເງິນຄັງ) */
const feeOf = (loan) => (!(0, exports.isBorrowed)(loan) && Number(loan.start_mode) === START_TREASURY ? num(loan.upfront_fee) : 0);
/** ບັນຊີລາຍຮັບຄ່າທຳນຽມ: ຂອງຜະລິດຕະພັນ (fee_account_id) ຫຼື ບົດບາດ CREDIT_FEE_INCOME */
const feeAccountOf = async (loan, t) => {
    const product = loan.product_id ? await loanCredit_1.LoanProduct.findByPk(loan.product_id, { attributes: ["_uuid", "fee_account_id"], transaction: t }) : null;
    return Number(product?.fee_account_id) || (await (0, glCore_1.roleAccountId)("CREDIT_FEE_INCOME", t));
};
/** ລົງບັນຊີ + ປ່ຽນຍອດບັນຊີເງິນຄັງ ຂອງການຮັບ/ຈ່າຍເງິນກູ້ (ຫຼື ຍອດຍົກມາ) */
const applyStart = async (loan, t, actorId) => {
    const rows = await (0, exports.installmentsOf)(loan._uuid, t);
    const amount = startAmount(loan, rows);
    if (!(amount > 0))
        throw new glCore_1.GlError("ທຸກງວດຄົບກຳນົດກ່ອນວັນທີຍອດຍົກມາ — ບໍ່ມີຍອດຄົງເຫຼືອ");
    const borrowed = (0, exports.isBorrowed)(loan);
    const date = (0, exports.bookedOn)(loan);
    const rate = await (0, glCore_1.rateOf)(loan.currency_id, date, t);
    const loanSide = borrowed ? glCore_1.CREDIT : glCore_1.DEBIT;
    const otherSide = borrowed ? glCore_1.DEBIT : glCore_1.CREDIT;
    const lines = [
        { accountId: loan.loan_account_id, side: loanSide, amount, currencyId: loan.currency_id, rate, description: `${loan.loan_code} ${loan.counterparty}` },
    ];
    if (Number(loan.start_mode) === START_OPENING) {
        lines.push({ accountId: await (0, glCore_1.roleAccountId)("OPENING_EQUITY", t), side: otherSide, amount: (0, glCore_1.round2)(amount * rate) });
    }
    else {
        const account = await (0, exports.lockTreasury)(Number(loan.treasury_account_id), loan.currency_id, t);
        const cash = await (0, glPosting_1.treasurySide)(account._uuid, date, t);
        // ສິນເຊື່ອ: ຄ່າທຳນຽມເປີດສິນເຊື່ອຫັກອອກຈາກເງິນທີ່ຈ່າຍໃຫ້ລູກຄ້າ → ລາຍຮັບຄ່າທຳນຽມ (4230)
        const fee = feeOf(loan);
        const net = (0, glCore_1.round2)(amount - fee);
        lines.push({ accountId: cash.accountId, side: otherSide, amount: net, currencyId: cash.currencyId, rate: cash.rate, treasuryAccountId: account._uuid });
        if (fee > 0) {
            lines.push({ accountId: await feeAccountOf(loan, t), side: otherSide, amount: fee, currencyId: loan.currency_id, rate, description: `${loan.loan_code} ຄ່າທຳນຽມເປີດສິນເຊື່ອ` });
        }
        if (!borrowed)
            (0, exports.takeOut)(account, net);
        await (0, accountMovement_1.moveBalance)(account, {
            direction: borrowed ? accountMovement_1.MOVE_IN : accountMovement_1.MOVE_OUT, amount: net, source: "LOAN_START", sourceId: loan._uuid, docNumber: loan.loan_code, date,
            description: `${borrowed ? "ຮັບເງິນກູ້" : "ຈ່າຍເງິນໃຫ້ກູ້"} ${loan.loan_code} ${loan.counterparty}`, actorId,
        }, t);
    }
    const kind = Number(loan.start_mode) === START_OPENING ? "ຍອດຍົກມາ" : borrowed ? "ຮັບເງິນກູ້" : "ຈ່າຍເງິນໃຫ້ກູ້";
    await (0, glCore_1.postSource)({
        date, sourceType: "LOAN_START", sourceId: loan._uuid, reference: loan.loan_code,
        description: `${kind} ${loan.loan_code} · ${loan.counterparty}`, lines, actorId,
    }, t);
};
exports.applyStart = applyStart;
/** ກັບການລົງບັນຊີ + ຍອດບັນຊີເງິນຄັງ ຂອງການຮັບ/ຈ່າຍເງິນກູ້ (ກ່ອນແກ້ເງື່ອນໄຂ / ລຶບ) */
const undoStart = async (loan, t, actorId) => {
    await (0, glCore_1.reverseSource)("LOAN_START", loan._uuid, t, actorId);
    if (Number(loan.start_mode) !== START_TREASURY || !loan.treasury_account_id)
        return;
    const account = await treasuryAcount_1.default.findByPk(loan.treasury_account_id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!account)
        return;
    const amount = (0, glCore_1.round2)(startAmount(loan, await (0, exports.installmentsOf)(loan._uuid, t)) - feeOf(loan));
    const borrowed = (0, exports.isBorrowed)(loan);
    if (borrowed)
        (0, exports.takeOut)(account, amount);
    await (0, accountMovement_1.moveBalance)(account, {
        direction: borrowed ? accountMovement_1.MOVE_OUT : accountMovement_1.MOVE_IN, amount, source: "LOAN_START_CANCEL", sourceId: loan._uuid, docNumber: loan.loan_code,
        description: `ຍົກເລີກ${borrowed ? "ຮັບເງິນກູ້" : "ຈ່າຍເງິນໃຫ້ກູ້"} ${loan.loan_code}`, actorId,
    }, t);
};
exports.undoStart = undoStart;
/** ສະຫຼຸບເງິນກູ້: ຍອດຄົງເຫຼືອ, ງວດຕໍ່ໄປ, ງວດກາຍກຳນົດ + ສະຖານະແຕ່ລະງວດ */
const summarize = (loan, stored, payments, today = (0, journalHelpers_1.todayLao)()) => {
    const paidPrincipal = (0, glCore_1.round2)(payments.reduce((n, p) => n + p.principal, 0));
    const paidInterest = (0, glCore_1.round2)(payments.reduce((n, p) => n + p.interest, 0));
    const settledPrincipal = (0, glCore_1.round2)(stored.filter((r) => r.settled).reduce((n, r) => n + r.principal, 0));
    const outstanding = (0, glCore_1.round2)(num(loan.principal) - settledPrincipal - paidPrincipal);
    const closed = outstanding <= 0.004;
    const rows = (0, loanSchedule_1.allocatePaid)((0, loanSchedule_1.withPeriodStart)(String(loan.start_date), stored), paidPrincipal, paidInterest).map((r) => {
        const open = r.due_principal > 0.004 || r.due_interest > 0.004;
        const state = r.settled ? "settled"
            : !open ? "paid"
                : closed ? "closed"
                    : r.due_date < today ? "overdue"
                        : r.paid_principal + r.paid_interest > 0 ? "partial" : "upcoming";
        return { ...r, payment: (0, glCore_1.round2)(r.principal + r.interest), state };
    });
    const next = rows.find((r) => ["overdue", "partial", "upcoming"].includes(r.state)) ?? null;
    const overdue = rows.filter((r) => r.state === "overdue");
    return {
        rows,
        summary: {
            outstanding: Math.max(0, outstanding),
            closed,
            paid_principal: (0, glCore_1.round2)(paidPrincipal + settledPrincipal),
            paid_interest: (0, glCore_1.round2)(paidInterest + stored.filter((r) => r.settled).reduce((n, r) => n + r.interest, 0)),
            paid_fee: (0, glCore_1.round2)(payments.reduce((n, p) => n + p.fee, 0)),
            total_interest: (0, glCore_1.round2)(stored.reduce((n, r) => n + r.interest, 0)),
            installments: stored.length,
            paid_installments: rows.filter((r) => r.state === "paid" || r.state === "settled").length,
            next: next && { no: next.no, due_date: next.due_date, principal: next.due_principal, interest: next.due_interest, amount: (0, glCore_1.round2)(next.due_principal + next.due_interest) },
            overdue_count: overdue.length,
            overdue_amount: (0, glCore_1.round2)(overdue.reduce((n, r) => n + r.due_principal + r.due_interest, 0)),
        },
    };
};
exports.summarize = summarize;
const presentLoan = (loan, currencies) => {
    const plain = loan.get({ plain: true });
    const currency = currencies.get(Number(loan.currency_id));
    return {
        ...plain,
        principal: num(loan.principal),
        annual_rate: Number(loan.annual_rate),
        currency: currency ? { _id: currency._id, name: currency.name, genus: currency.genus } : null,
    };
};
exports.presentLoan = presentLoan;
const currencyMap = async () => new Map((await currencyModel_1.default.findAll({ raw: true })).map((c) => [Number(c._id), c]));
exports.currencyMap = currencyMap;
const paymentsOf = (rows) => rows.map((p) => ({ pay_date: String(p.pay_date), principal: num(p.principal), interest: num(p.interest), fee: num(p.fee) }));
exports.paymentsOf = paymentsOf;
/**
 * ປະຫວັດການຈ່າຍ / ຮັບ ຂອງເງິນກູ້ໜຶ່ງສັນຍາ ພ້ອມຊື່ບັນຊີເງິນຄັງ ແລະ ເລກລາຍການບັນຊີ — ໃຊ້ຮ່ວມ:
 * GET /loan/:id ແລະ GET /credit/contract/:id. treasury = ບັນຊີທີ່ຮັບ/ຈ່າຍເງິນກູ້ຕອນເລີ່ມ
 */
const presentPayments = async (loan, payments) => {
    const treasuries = new Map((await treasuryAcount_1.default.findAll({
        where: { _uuid: [...new Set([...payments.map((p) => p.treasury_account_id), loan.treasury_account_id].filter(Boolean))] },
        attributes: ["_uuid", "acountName", "account_code"], raw: true,
    })).map((a) => [Number(a._uuid), a]));
    const entries = new Map((await journalEntry_1.default.findAll({
        where: { source_type: "LOAN_PAYMENT", source_id: payments.map((p) => String(p._uuid)), reversal_of: null },
        attributes: ["source_id", "entry_number"], raw: true,
    })).map((e) => [String(e.source_id), e.entry_number]));
    return {
        treasury: loan.treasury_account_id ? treasuries.get(Number(loan.treasury_account_id)) ?? null : null,
        payments: payments.map((p) => {
            const amounts = { principal: num(p.principal), interest: num(p.interest), fee: num(p.fee), penalty: num(p.penalty) };
            return {
                ...p.get({ plain: true }), ...amounts,
                total: (0, glCore_1.round2)(amounts.principal + amounts.interest + amounts.fee + amounts.penalty),
                treasury: treasuries.get(Number(p.treasury_account_id)) ?? null,
                entry_number: entries.get(String(p._uuid)) ?? null,
            };
        }),
    };
};
exports.presentPayments = presentPayments;
/** GET /loan/fetch — ທຸກເງິນກູ້ (ທັງສອງທາງ) ພ້ອມຍອດຄົງເຫຼືອ ແລະ ງວດຕໍ່ໄປ */
const getLoans = async (_req, res) => {
    try {
        if (!(await (0, glCore_1.glReady)()))
            return notReady(res);
        const [loans, installments, payments, currencies] = await Promise.all([
            loan_1.default.findAll({ order: [["loan_code", "ASC"]] }),
            loan_1.LoanInstallment.findAll({ order: [["loan_id", "ASC"], ["no", "ASC"]] }),
            loan_1.LoanPayment.findAll({ where: { status: ACTIVE } }),
            (0, exports.currencyMap)(),
        ]);
        const data = loans.map((loan) => {
            const stored = installments.filter((r) => r.loan_id === loan._uuid).map((r) => ({
                no: r.no, due_date: String(r.due_date), principal: num(r.principal), interest: num(r.interest), settled: Number(r.settled) === 1,
            }));
            const { summary } = (0, exports.summarize)(loan, stored, (0, exports.paymentsOf)(payments.filter((p) => p.loan_id === loan._uuid)));
            return { ...(0, exports.presentLoan)(loan, currencies), ...summary };
        });
        res.status(200).json({ data, next_code: await (0, exports.nextCode)() });
    }
    catch (error) {
        (0, exports.fail)(res, error, "Error getting loans");
    }
};
exports.getLoans = getLoans;
/** GET /loan/:id — ເງິນກູ້ + ຕາຕະລາງຜ່ອນ (ສະຖານະແຕ່ລະງວດ) + ປະຫວັດການຈ່າຍ */
const getLoan = async (req, res) => {
    try {
        const loan = await loan_1.default.findByPk(Number(req.params.id));
        if (!loan)
            throw new glCore_1.GlError("ບໍ່ພົບເງິນກູ້");
        const [stored, payments, currencies] = await Promise.all([
            (0, exports.installmentsOf)(loan._uuid),
            loan_1.LoanPayment.findAll({ where: { loan_id: loan._uuid }, order: [["pay_date", "DESC"], ["_uuid", "DESC"]] }),
            (0, exports.currencyMap)(),
        ]);
        const active = payments.filter((p) => Number(p.status) === ACTIVE);
        const { rows, summary } = (0, exports.summarize)(loan, stored, (0, exports.paymentsOf)(active));
        const { treasury, payments: paymentRows } = await (0, exports.presentPayments)(loan, payments);
        const accruals = await loan_1.LoanAccrual.count({ where: { loan_id: loan._uuid } });
        res.status(200).json({
            data: {
                ...(0, exports.presentLoan)(loan, currencies),
                ...summary,
                treasury,
                // ແກ້ເງື່ອນໄຂ/ລຶບ ໄດ້ສະເພາະກ່ອນມີການຈ່າຍ ແລະ ກ່ອນຄິດດອກເບ້ຍຄ້າງ
                locked: active.length > 0 || accruals > 0,
                schedule: rows,
                payments: paymentRows,
            },
        });
    }
    catch (error) {
        (0, exports.fail)(res, error, "Error getting loan");
    }
};
exports.getLoan = getLoan;
/** POST /loan/preview { ເງື່ອນໄຂ } — ຕາຕະລາງຜ່ອນ (ຍັງບໍ່ບັນທຶກ) ສຳລັບຟອມ */
const previewLoan = async (req, res) => {
    try {
        const terms = (0, exports.termsOf)(req.body ?? {});
        const error = (0, loanSchedule_1.termsError)(terms);
        if (error)
            throw new glCore_1.GlError(error);
        const decimals = await (0, exports.currencyDecimals)(Number(req.body?.currency_id) || null);
        const rows = (0, loanSchedule_1.buildSchedule)(terms, decimals);
        res.status(200).json({
            data: rows,
            decimals,
            total_interest: (0, loanSchedule_1.roundTo)(rows.reduce((n, r) => n + r.interest, 0), decimals),
            total_payment: (0, loanSchedule_1.roundTo)(rows.reduce((n, r) => n + r.payment, 0), decimals),
        });
    }
    catch (error) {
        (0, exports.fail)(res, error, "Error previewing loan");
    }
};
exports.previewLoan = previewLoan;
/** POST /loan/create */
const createLoan = async (req, res) => {
    const t = await database_1.default.transaction();
    try {
        if (!(await (0, glCore_1.glReady)(t))) {
            await t.rollback();
            return notReady(res);
        }
        const input = await parseInput(req.body || {}, t);
        const code = String(req.body?.loan_code ?? "").trim().slice(0, 30) || (await (0, exports.nextCode)(t));
        if (await loan_1.default.count({ where: { loan_code: code }, transaction: t }))
            throw new glCore_1.GlError(`ລະຫັດ ${code} ມີແລ້ວ`);
        const actorId = Number((0, bansiHelpers_1.actorOf)(req)) || null;
        const loan = await loan_1.default.create({ ...input, loan_code: code, status: ACTIVE, created_by: actorId }, { transaction: t });
        await (0, exports.writeInstallments)(loan, t);
        await (0, exports.applyStart)(loan, t, actorId);
        await t.commit();
        res.status(200).json({ message: "Successfully created loan", data: loan });
    }
    catch (error) {
        await t.rollback();
        (0, exports.fail)(res, error, "Error creating loan");
    }
};
exports.createLoan = createLoan;
/**
 * PUT /loan/:id — ຊື່ຄູ່ສັນຍາ / ເລກສັນຍາ / ຈຸດປະສົງ / ໝາຍເຫດ / ບັນຊີດອກເບ້ຍ ແກ້ໄດ້ສະເໝີ;
 * ເງື່ອນໄຂ (ຍອດ, ອັດຕາ, ງວດ, ວັນທີ, ບັນຊີ…) ແກ້ໄດ້ສະເພາະກ່ອນມີການຈ່າຍ ແລະ ກ່ອນຄິດດອກເບ້ຍຄ້າງ — ສ້າງຕາຕະລາງ + ລົງບັນຊີໃໝ່
 */
const updateLoan = async (req, res) => {
    const t = await database_1.default.transaction();
    try {
        const loan = await loan_1.default.findByPk(Number(req.params.id), { transaction: t, lock: t.LOCK.UPDATE });
        if (!loan)
            throw new glCore_1.GlError("ບໍ່ພົບເງິນກູ້");
        // ສັນຍາສິນເຊື່ອ (ມາຈາກຄຳຮ້ອງທີ່ອະນຸມັດ) ແກ້ / ລຶບ ຢູ່ນີ້ບໍ່ໄດ້ — ຍົກເລີກການປ່ອຍກູ້ຢູ່ລະບົບສິນເຊື່ອ
        if (loan.customer_id)
            throw new glCore_1.GlError("ນີ້ແມ່ນສັນຍາສິນເຊື່ອ — ຈັດການຢູ່ ຄຳຮ້ອງ ແລະ ສັນຍາ");
        const input = await parseInput(req.body || {}, t, loan);
        const termsChanged = TERM_FIELDS.some((key) => !sameValue(input[key], loan[key]));
        const actorId = Number((0, bansiHelpers_1.actorOf)(req)) || null;
        if (termsChanged) {
            const used = (await loan_1.LoanPayment.count({ where: { loan_id: loan._uuid, status: ACTIVE }, transaction: t }))
                + (await loan_1.LoanAccrual.count({ where: { loan_id: loan._uuid }, transaction: t }));
            if (used)
                throw new glCore_1.GlError("ມີການຈ່າຍ ຫຼື ຄິດດອກເບ້ຍຄ້າງແລ້ວ — ແກ້ໄດ້ສະເພາະຊື່, ເລກສັນຍາ, ຈຸດປະສົງ ແລະ ໝາຍເຫດ");
            await (0, exports.undoStart)(loan, t, actorId);
            await loan.update({ ...input, updatedAt: new Date() }, { transaction: t });
            await (0, exports.writeInstallments)(loan, t);
            await (0, exports.applyStart)(loan, t, actorId);
        }
        else {
            await loan.update({
                counterparty: input.counterparty, contract_no: input.contract_no, purpose: input.purpose, note: input.note,
                interest_account_id: input.interest_account_id, updatedAt: new Date(),
            }, { transaction: t });
            // ຄຳອະທິບາຍຂອງໃບ (ຊື່ຄູ່ສັນຍາ) — ຕົວເລກຄືເກົ່າ postSource ແກ້ແຕ່ຂໍ້ຄວາມ
            const borrowed = (0, exports.isBorrowed)(loan);
            const kind = Number(loan.start_mode) === START_OPENING ? "ຍອດຍົກມາ" : borrowed ? "ຮັບເງິນກູ້" : "ຈ່າຍເງິນໃຫ້ກູ້";
            const entry = await journalEntry_1.default.findOne({
                where: { source_type: "LOAN_START", source_id: String(loan._uuid), reversal_of: null, reversed_by: null }, transaction: t,
            });
            if (entry)
                await entry.update({ description: `${kind} ${loan.loan_code} · ${loan.counterparty}` }, { transaction: t });
        }
        await t.commit();
        res.status(200).json({ message: "Successfully updated loan", data: loan });
    }
    catch (error) {
        await t.rollback();
        (0, exports.fail)(res, error, "Error updating loan");
    }
};
exports.updateLoan = updateLoan;
/** DELETE /loan/:id — ລຶບໄດ້ສະເພາະທີ່ຍັງບໍ່ມີການຈ່າຍ ແລະ ບໍ່ໄດ້ຄິດດອກເບ້ຍຄ້າງ (ກັບໃບ + ເງິນກັບເຂົ້າ/ອອກບັນຊີ) */
const deleteLoan = async (req, res) => {
    const t = await database_1.default.transaction();
    try {
        const loan = await loan_1.default.findByPk(Number(req.params.id), { transaction: t, lock: t.LOCK.UPDATE });
        if (!loan)
            throw new glCore_1.GlError("ບໍ່ພົບເງິນກູ້");
        // ສັນຍາສິນເຊື່ອ (ມາຈາກຄຳຮ້ອງທີ່ອະນຸມັດ) ແກ້ / ລຶບ ຢູ່ນີ້ບໍ່ໄດ້ — ຍົກເລີກການປ່ອຍກູ້ຢູ່ລະບົບສິນເຊື່ອ
        if (loan.customer_id)
            throw new glCore_1.GlError("ນີ້ແມ່ນສັນຍາສິນເຊື່ອ — ຈັດການຢູ່ ຄຳຮ້ອງ ແລະ ສັນຍາ");
        if (await loan_1.LoanPayment.count({ where: { loan_id: loan._uuid, status: ACTIVE }, transaction: t })) {
            throw new glCore_1.GlError("ມີການຈ່າຍແລ້ວ ລຶບບໍ່ໄດ້ — ຍົກເລີກການຈ່າຍກ່ອນ");
        }
        if (await loan_1.LoanAccrual.count({ where: { loan_id: loan._uuid }, transaction: t })) {
            throw new glCore_1.GlError("ຄິດດອກເບ້ຍຄ້າງຂອງເງິນກູ້ນີ້ແລ້ວ — ຍົກເລີກເດືອນເຫຼົ່ານັ້ນກ່ອນ");
        }
        await (0, exports.undoStart)(loan, t, Number((0, bansiHelpers_1.actorOf)(req)) || null);
        await loan_1.LoanInstallment.destroy({ where: { loan_id: loan._uuid }, transaction: t });
        await loan_1.LoanPayment.destroy({ where: { loan_id: loan._uuid }, transaction: t });
        await loan.destroy({ transaction: t });
        await t.commit();
        res.status(200).json({ message: "Successfully deleted loan" });
    }
    catch (error) {
        await t.rollback();
        (0, exports.fail)(res, error, "Error deleting loan");
    }
};
exports.deleteLoan = deleteLoan;
/**
 * ບັນທຶກການຈ່າຍ/ຮັບຄືນ (ໃຊ້ຮ່ວມ: POST /loan/pay ແລະ ຮັບຊຳລະສັນຍາສິນເຊື່ອ) — ກວດວັນທີ / ຍອດ, ເງິນເຂົ້າ-ອອກບັນຊີເງິນຄັງ,
 * ລົງບັນຊີ (ຕົ້ນທຶນ, ດອກເບ້ຍ, ຄ່າທຳນຽມ, ຄ່າປັບ). ເອີ້ນພາຍໃນ transaction ທີ່ລັອກເງິນກູ້ແລ້ວ
 */
const recordLoanPayment = async (loan, input, t, actorId) => {
    const date = input.date;
    if (!date)
        throw new glCore_1.GlError("ກະລຸນາເລືອກວັນທີ");
    if (date > (0, journalHelpers_1.todayLao)())
        throw new glCore_1.GlError("ວັນທີຕ້ອງບໍ່ເກີນມື້ນີ້");
    if (date < (0, exports.bookedOn)(loan))
        throw new glCore_1.GlError(`ວັນທີຕ້ອງບໍ່ກ່ອນ ${(0, moment_1.default)((0, exports.bookedOn)(loan)).format("DD/MM/YYYY")} (ວັນທີເງິນກູ້ເຂົ້າບັນຊີ)`);
    // ປັດຕາມສະກຸນ (ກີບ = ຈຳນວນເຕັມ) — ຍອດບັນຊີເງິນຄັງເກັບເປັນຈຳນວນເຕັມ
    const decimals = await (0, exports.currencyDecimals)(loan.currency_id, t);
    const principal = (0, loanSchedule_1.roundTo)(Number(input.principal) || 0, decimals);
    const interest = (0, loanSchedule_1.roundTo)(Number(input.interest) || 0, decimals);
    const fee = (0, loanSchedule_1.roundTo)(Number(input.fee) || 0, decimals);
    const penalty = (0, loanSchedule_1.roundTo)(Number(input.penalty) || 0, decimals);
    if (principal < 0 || interest < 0 || fee < 0 || penalty < 0)
        throw new glCore_1.GlError("ຈຳນວນເງິນຕ້ອງບໍ່ຕິດລົບ");
    const total = (0, glCore_1.round2)(principal + interest + fee + penalty);
    if (!(total > 0))
        throw new glCore_1.GlError("ກະລຸນາປ້ອນຈຳນວນເງິນ");
    const stored = await (0, exports.installmentsOf)(loan._uuid, t);
    const active = await loan_1.LoanPayment.findAll({ where: { loan_id: loan._uuid, status: ACTIVE }, transaction: t });
    const { summary } = (0, exports.summarize)(loan, stored, (0, exports.paymentsOf)(active));
    if (principal > summary.outstanding + 0.004) {
        throw new glCore_1.GlError(`ຕົ້ນທຶນເກີນຍອດຄົງເຫຼືອ (${summary.outstanding.toLocaleString("en-US")})`);
    }
    const borrowed = (0, exports.isBorrowed)(loan);
    const account = await (0, exports.lockTreasury)(Number(input.treasuryId), loan.currency_id, t);
    if (borrowed)
        (0, exports.takeOut)(account, total);
    const row = await loan_1.LoanPayment.create({
        loan_id: loan._uuid, pay_date: date, treasury_account_id: account._uuid, principal, interest, fee, penalty,
        payment_type: [1, 2, 3].includes(Number(input.paymentType)) ? Number(input.paymentType) : 1,
        reference: String(input.reference ?? "").trim().slice(0, 100) || null,
        note: String(input.note ?? "").trim().slice(0, 255) || null,
        status: ACTIVE, created_by: actorId,
    }, { transaction: t });
    const number = `LNP-${(0, moment_1.default)(date).format("YYYYMM")}-${String(row._uuid).padStart(4, "0")}`;
    await row.update({ number }, { transaction: t });
    const rate = await (0, glCore_1.rateOf)(loan.currency_id, date, t);
    const cash = await (0, glPosting_1.treasurySide)(account._uuid, date, t);
    const common = { currencyId: loan.currency_id, rate };
    const label = `${loan.loan_code} ${loan.counterparty}`;
    const sideOf = (lineIsLoanSide) => (borrowed === lineIsLoanSide ? glCore_1.DEBIT : glCore_1.CREDIT);
    const product = loan.product_id ? await loanCredit_1.LoanProduct.findByPk(loan.product_id, { transaction: t }) : null;
    const lines = [
        { ...common, accountId: loan.loan_account_id, side: sideOf(true), amount: principal, description: `${label} · ຕົ້ນທຶນ` },
        {
            ...common, side: sideOf(true), amount: interest, description: `${label} · ດອກເບ້ຍ`,
            accountId: loan.interest_account_id ?? (await (0, glCore_1.roleAccountId)(borrowed ? "INTEREST_EXPENSE" : "INTEREST_INCOME", t)),
        },
    ];
    if (fee > 0) {
        // ສັນຍາສິນເຊື່ອ: ຄ່າທຳນຽມ (ປິດກ່ອນກຳນົດ) → ບັນຊີຄ່າທຳນຽມຂອງຜະລິດຕະພັນ / 4230
        const feeAccount = borrowed ? await (0, glCore_1.roleAccountId)("LOAN_FEE_EXPENSE", t)
            : loan.customer_id ? product?.fee_account_id ?? (await (0, glCore_1.roleAccountId)("CREDIT_FEE_INCOME", t)) : await (0, glCore_1.roleAccountId)("LOAN_FEE_INCOME", t);
        lines.push({ ...common, accountId: feeAccount, side: sideOf(true), amount: fee, description: `${label} · ຄ່າທຳນຽມ` });
    }
    if (penalty > 0) {
        const penaltyAccount = borrowed ? await (0, glCore_1.roleAccountId)("LOAN_FEE_EXPENSE", t) : product?.penalty_account_id ?? (await (0, glCore_1.roleAccountId)("CREDIT_PENALTY_INCOME", t));
        lines.push({ ...common, accountId: penaltyAccount, side: sideOf(true), amount: penalty, description: `${label} · ຄ່າປັບກາຍກຳນົດ` });
    }
    lines.push({ accountId: cash.accountId, side: sideOf(false), amount: total, currencyId: cash.currencyId, rate: cash.rate, treasuryAccountId: account._uuid });
    const description = `${borrowed ? "ຈ່າຍຄືນເງິນກູ້" : "ຮັບຄືນເງິນໃຫ້ກູ້"} ${label}${row.reference ? ` (${row.reference})` : ""}`;
    await (0, glCore_1.postEntry)({ date, sourceType: "LOAN_PAYMENT", sourceId: row._uuid, reference: number, description, lines, actorId }, t);
    await (0, accountMovement_1.moveBalance)(account, {
        direction: borrowed ? accountMovement_1.MOVE_OUT : accountMovement_1.MOVE_IN, amount: total, source: "LOAN_PAYMENT", sourceId: row._uuid, docNumber: number, date, description, actorId,
    }, t);
    return { row, number, total };
};
exports.recordLoanPayment = recordLoanPayment;
/** POST /loan/pay/:id — ຈ່າຍ/ຮັບຄືນ ເງິນກູ້ທົ່ວໄປ (ສັນຍາສິນເຊື່ອ ຮັບຊຳລະຢູ່ /credit/contract/:id/collect — ຄ່າປັບຕ້ອງຕັດກ່ອນ) */
const payLoan = async (req, res) => {
    const t = await database_1.default.transaction();
    try {
        if (!(await (0, glCore_1.glReady)(t))) {
            await t.rollback();
            return notReady(res);
        }
        const loan = await loan_1.default.findByPk(Number(req.params.id), { transaction: t, lock: t.LOCK.UPDATE });
        if (!loan)
            throw new glCore_1.GlError("ບໍ່ພົບເງິນກູ້");
        if (loan.customer_id)
            throw new glCore_1.GlError("ນີ້ແມ່ນສັນຍາສິນເຊື່ອ — ຮັບຊຳລະຢູ່ ຄຳຮ້ອງ ແລະ ສັນຍາ");
        const body = req.body ?? {};
        const { row, number } = await (0, exports.recordLoanPayment)(loan, {
            date: (0, bansiHelpers_1.toDateOnly)(body.pay_date) ?? "", treasuryId: Number(body.treasury_account_id),
            principal: body.principal, interest: body.interest, fee: body.fee, reference: body.reference, note: body.note,
        }, t, Number((0, bansiHelpers_1.actorOf)(req)) || null);
        await t.commit();
        res.status(200).json({ message: "Successfully recorded loan payment", data: { ...row.get({ plain: true }), number } });
    }
    catch (error) {
        await t.rollback();
        (0, exports.fail)(res, error, "Error recording loan payment");
    }
};
exports.payLoan = payLoan;
/** PUT /loan/payment/cancel/:id — ຍົກເລີກການຈ່າຍ: ກັບລາຍການບັນຊີ ແລະ ເງິນກັບເຂົ້າ/ອອກບັນຊີເງິນຄັງ */
const cancelLoanPayment = async (req, res) => {
    const t = await database_1.default.transaction();
    try {
        const row = await loan_1.LoanPayment.findByPk(Number(req.params.id), { transaction: t, lock: t.LOCK.UPDATE });
        if (!row || Number(row.status) !== ACTIVE)
            throw new glCore_1.GlError("ບໍ່ພົບລາຍການ ຫຼື ຍົກເລີກແລ້ວ");
        const loan = await loan_1.default.findByPk(row.loan_id, { transaction: t });
        const actorId = Number((0, bansiHelpers_1.actorOf)(req)) || null;
        await (0, glCore_1.reverseSource)("LOAN_PAYMENT", row._uuid, t, actorId);
        const total = (0, glCore_1.round2)(num(row.principal) + num(row.interest) + num(row.fee) + num(row.penalty));
        // ຄ່າປັບທີ່ການຈ່າຍນີ້ຕັດ → ກັບມາຄ້າງ
        await loanCredit_1.LoanPenalty.destroy({ where: { payment_id: row._uuid }, transaction: t });
        const account = await treasuryAcount_1.default.findByPk(row.treasury_account_id, { transaction: t, lock: t.LOCK.UPDATE });
        if (account) {
            const borrowed = !loan || (0, exports.isBorrowed)(loan);
            if (!borrowed)
                (0, exports.takeOut)(account, total);
            await (0, accountMovement_1.moveBalance)(account, {
                direction: borrowed ? accountMovement_1.MOVE_IN : accountMovement_1.MOVE_OUT, amount: total, source: "LOAN_PAYMENT_CANCEL", sourceId: row._uuid, docNumber: row.number,
                description: `ຍົກເລີກ ${row.number ?? ""}`.trim(), actorId,
            }, t);
        }
        await row.update({ status: CANCELLED, updatedAt: new Date() }, { transaction: t });
        // ສັນຍາທີ່ການຈ່າຍນີ້ປິດໄວ້ → ເປີດຄືນ
        if (loan?.closed_date && num(row.principal) > 0)
            await loan.update({ closed_date: null, close_reason: null }, { transaction: t });
        await t.commit();
        res.status(200).json({ message: "Successfully cancelled loan payment" });
    }
    catch (error) {
        await t.rollback();
        (0, exports.fail)(res, error, "Error cancelling loan payment");
    }
};
exports.cancelLoanPayment = cancelLoanPayment;
// ================= ດອກເບ້ຍຄ້າງທ້າຍເດືອນ
/**
 * ດອກເບ້ຍຄ້າງ ນ ທ້າຍເດືອນ ຕໍ່ເງິນກູ້ = ດອກທີ່ເກີດແລ້ວຮອດທ້າຍເດືອນ − ດອກທີ່ຈ່າຍແລ້ວ (ລວມງວດກ່ອນເຂົ້າລະບົບ).
 * ຂ້າມເງິນກູ້ທີ່ຍັງບໍ່ເຂົ້າບັນຊີ, ຈ່າຍຕົ້ນທຶນໝົດແລ້ວ ຫຼື ຈ່າຍດອກລ່ວງໜ້າ
 */
const computeAccruals = async (month, t) => {
    const end = monthEnd(month);
    const loans = (await loan_1.default.findAll({ where: { status: ACTIVE }, order: [["loan_code", "ASC"]], transaction: t })).filter((l) => (0, exports.bookedOn)(l) <= end);
    if (!loans.length)
        return [];
    const [installments, payments] = await Promise.all([
        loan_1.LoanInstallment.findAll({ where: { loan_id: loans.map((l) => l._uuid) }, transaction: t }),
        loan_1.LoanPayment.findAll({ where: { loan_id: loans.map((l) => l._uuid), status: ACTIVE, pay_date: { [sequelize_1.Op.lte]: end } }, transaction: t }),
    ]);
    const out = [];
    for (const loan of loans) {
        const stored = installments.filter((r) => r.loan_id === loan._uuid).map((r) => ({
            no: r.no, due_date: String(r.due_date), principal: num(r.principal), interest: num(r.interest), settled: Number(r.settled) === 1,
        }));
        const paid = payments.filter((p) => p.loan_id === loan._uuid);
        const settled = stored.filter((r) => r.settled);
        const outstanding = (0, glCore_1.round2)(num(loan.principal) - settled.reduce((n, r) => n + r.principal, 0) - paid.reduce((n, p) => n + num(p.principal), 0));
        if (outstanding <= 0.004)
            continue;
        const earned = (0, loanSchedule_1.earnedInterest)(String(loan.start_date), stored, end);
        const paidInterest = (0, glCore_1.round2)(settled.reduce((n, r) => n + r.interest, 0) + paid.reduce((n, p) => n + num(p.interest), 0));
        const accrued = (0, loanSchedule_1.roundTo)(earned - paidInterest, await (0, exports.currencyDecimals)(loan.currency_id, t));
        if (accrued <= 0)
            continue;
        const rate = await (0, glCore_1.rateOf)(loan.currency_id, end, t);
        out.push({ loan, earned, paid: paidInterest, accrued, rate, lak: (0, glCore_1.round2)(accrued * rate) });
    }
    return out;
};
exports.computeAccruals = computeAccruals;
const latestAccrual = async (t) => {
    const row = await loan_1.LoanAccrual.findOne({ order: [["period", "DESC"]], attributes: ["period"], transaction: t });
    return row ? String(row.period) : null;
};
const activeAccrualEntry = (sourceType, month, t) => journalEntry_1.default.findOne({ where: { source_type: sourceType, source_id: month, reversal_of: null, reversed_by: null }, transaction: t });
/** POST /loan/accrual-preview { month } — ຍອດທີ່ຈະລົງ ຫຼື ທີ່ລົງແລ້ວ */
const previewAccrual = async (req, res) => {
    try {
        if (!(await (0, glCore_1.glReady)()))
            return notReady(res);
        const month = parseMonth(req.body?.month);
        const entry = await activeAccrualEntry("LOAN_ACCRUAL", month);
        const currencies = await (0, exports.currencyMap)();
        let rows;
        if (entry) {
            const saved = await loan_1.LoanAccrual.findAll({ where: { period: month } });
            const loans = new Map((await loan_1.default.findAll({ where: { _uuid: saved.map((s) => s.loan_id) } })).map((l) => [l._uuid, l]));
            rows = saved.map((s) => {
                const loan = loans.get(s.loan_id);
                return { loan_id: s.loan_id, loan_code: loan?.loan_code, counterparty: loan?.counterparty, direction: loan?.direction, accrued: num(s.amount),
                    currency: currencies.get(Number(loan?.currency_id))?.name ?? null };
            });
        }
        else {
            rows = (await (0, exports.computeAccruals)(month)).map((r) => ({
                loan_id: r.loan._uuid, loan_code: r.loan.loan_code, counterparty: r.loan.counterparty, direction: r.loan.direction,
                earned: r.earned, paid: r.paid, accrued: r.accrued, rate: r.rate, lak: r.lak, currency: currencies.get(Number(r.loan.currency_id))?.name ?? null,
            }));
        }
        const reversal = entry ? await activeAccrualEntry("LOAN_ACCRUAL_REV", month) : null;
        res.status(200).json({
            month,
            posted: entry ? { entry_number: entry.entry_number, entry_date: entry.entry_date, total: Number(entry.total_debit),
                reversal_number: reversal?.entry_number ?? null, reversal_date: reversal?.entry_date ?? null } : null,
            latest: await latestAccrual(),
            rows,
            payable: (0, glCore_1.round2)(rows.filter((r) => Number(r.direction) !== exports.LENT).reduce((n, r) => n + (r.lak ?? 0), 0)),
            receivable: (0, glCore_1.round2)(rows.filter((r) => Number(r.direction) === exports.LENT).reduce((n, r) => n + (r.lak ?? 0), 0)),
        });
    }
    catch (error) {
        (0, exports.fail)(res, error, "Error previewing interest accrual");
    }
};
exports.previewAccrual = previewAccrual;
/** ກັບໃບດອກເບ້ຍຄ້າງຂອງເດືອນ (ທັງໃບທ້າຍເດືອນ ແລະ ໃບກັບຄືນຕົ້ນເດືອນຖັດໄປ) ແລ້ວລຶບແຖວ */
const undoAccrualMonth = async (month, t, actorId) => {
    for (const type of ["LOAN_ACCRUAL_REV", "LOAN_ACCRUAL"]) {
        const entry = await activeAccrualEntry(type, month, t);
        if (entry)
            await (0, glCore_1.reverseEntry)(entry, t, { actorId, description: `ຍົກເລີກດອກເບ້ຍຄ້າງ ${(0, moment_1.default)(month).format("MM/YYYY")}` });
    }
    await loan_1.LoanAccrual.destroy({ where: { period: month }, transaction: t });
};
/**
 * POST /loan/accrue { month } — ລົງດອກເບ້ຍຄ້າງທ້າຍເດືອນ (ໃບດຽວ) + ໃບກັບຄືນວັນທີ 1 ເດືອນຖັດໄປ.
 * ລົງຊ້ຳເດືອນລ່າສຸດໄດ້ (ກັບຂອງເກົ່າແລ້ວຄິດໃໝ່); ເດືອນກ່ອນເດືອນລ່າສຸດລົງບໍ່ໄດ້
 */
const runAccrual = async (req, res) => {
    const t = await database_1.default.transaction();
    try {
        if (!(await (0, glCore_1.glReady)(t))) {
            await t.rollback();
            return notReady(res);
        }
        const month = parseMonth(req.body?.month);
        const date = monthEnd(month);
        if (date > (0, moment_1.default)().utcOffset("+07:00").endOf("month").format("YYYY-MM-DD"))
            throw new glCore_1.GlError("ຄິດດອກເບ້ຍຄ້າງເດືອນທີ່ຍັງບໍ່ເຖິງບໍ່ໄດ້");
        await (0, glCore_1.assertOpenPeriod)(date, t);
        await (0, glCore_1.assertOpenPeriod)(nextMonthStart(month), t);
        const latest = await latestAccrual(t);
        if (latest && month < latest)
            throw new glCore_1.GlError(`ຄິດດອກເບ້ຍຄ້າງຮອດ ${(0, moment_1.default)(latest).format("MM/YYYY")} ແລ້ວ — ຄິດເດືອນກ່ອນໜ້ານັ້ນບໍ່ໄດ້`);
        const actorId = Number((0, bansiHelpers_1.actorOf)(req)) || null;
        if (latest === month)
            await undoAccrualMonth(month, t, actorId);
        const rows = await (0, exports.computeAccruals)(month, t);
        if (!rows.length)
            throw new glCore_1.GlError("ບໍ່ມີດອກເບ້ຍຄ້າງໃນເດືອນນີ້");
        const lines = [];
        for (const r of rows) {
            const borrowed = (0, exports.isBorrowed)(r.loan);
            const label = `${r.loan.loan_code} ${r.loan.counterparty}`;
            const interestAccount = r.loan.interest_account_id ?? (await (0, glCore_1.roleAccountId)(borrowed ? "INTEREST_EXPENSE" : "INTEREST_INCOME", t));
            const accruedAccount = r.loan.accrued_account_id ?? (await (0, glCore_1.roleAccountId)(borrowed ? "INTEREST_PAYABLE" : "INTEREST_RECEIVABLE", t));
            lines.push({ accountId: borrowed ? interestAccount : accruedAccount, side: glCore_1.DEBIT, amount: r.lak, description: label }, { accountId: borrowed ? accruedAccount : interestAccount, side: glCore_1.CREDIT, amount: r.lak, description: label });
        }
        const title = (0, moment_1.default)(month).format("MM/YYYY");
        const entry = await (0, glCore_1.postEntry)({
            date, sourceType: "LOAN_ACCRUAL", sourceId: month, reference: `ACR-${month}`, description: `ດອກເບ້ຍຄ້າງ ${title}`, lines, actorId,
        }, t);
        const reversal = await (0, glCore_1.postEntry)({
            date: nextMonthStart(month), sourceType: "LOAN_ACCRUAL_REV", sourceId: month, reference: `ACR-${month}-R`,
            description: `ກັບດອກເບ້ຍຄ້າງ ${title} (ຕົ້ນເດືອນຖັດໄປ — ດອກທີ່ຈ່າຍຈິງລົງຕອນຈ່າຍ)`,
            lines: lines.map((l) => ({ ...l, side: l.side === glCore_1.DEBIT ? glCore_1.CREDIT : glCore_1.DEBIT })), actorId,
        }, t);
        await loan_1.LoanAccrual.bulkCreate(rows.map((r) => ({
            loan_id: r.loan._uuid, period: month, amount: r.accrued, entry_id: entry._uuid, reversal_id: reversal._uuid,
        })), { transaction: t });
        await t.commit();
        res.status(200).json({
            message: "Successfully posted interest accrual",
            data: { entry_number: entry.entry_number, reversal_number: reversal.entry_number, total: (0, glCore_1.round2)(rows.reduce((n, r) => n + r.lak, 0)) },
        });
    }
    catch (error) {
        await t.rollback();
        (0, exports.fail)(res, error, "Error posting interest accrual");
    }
};
exports.runAccrual = runAccrual;
/** DELETE /loan/accrue/:month — ຍົກເລີກສະເພາະເດືອນລ່າສຸດທີ່ຄິດ */
const undoAccrual = async (req, res) => {
    const t = await database_1.default.transaction();
    try {
        const month = parseMonth(req.params.month);
        if ((await latestAccrual(t)) !== month)
            throw new glCore_1.GlError("ຍົກເລີກໄດ້ສະເພາະເດືອນລ່າສຸດທີ່ຄິດດອກເບ້ຍຄ້າງ");
        await (0, glCore_1.assertOpenPeriod)(monthEnd(month), t);
        await undoAccrualMonth(month, t, Number((0, bansiHelpers_1.actorOf)(req)) || null);
        await t.commit();
        res.status(200).json({ message: "Successfully removed interest accrual" });
    }
    catch (error) {
        await t.rollback();
        (0, exports.fail)(res, error, "Error removing interest accrual");
    }
};
exports.undoAccrual = undoAccrual;
/** GET /loan/accrual-runs — ເດືອນທີ່ຄິດດອກເບ້ຍຄ້າງແລ້ວ (ໃໝ່ສຸດກ່ອນ) */
const getAccrualRuns = async (_req, res) => {
    try {
        const rows = await database_1.default.query(`SELECT a.period, COUNT(*) AS loans, MAX(e.entry_number) AS entry_number, MAX(e.total_debit) AS total,
              MAX(r.entry_number) AS reversal_number
       FROM tbl_loan_accrual a
       LEFT JOIN tbl_journal_entry e ON e._uuid = a.entry_id
       LEFT JOIN tbl_journal_entry r ON r._uuid = a.reversal_id
       GROUP BY a.period ORDER BY a.period DESC`, { type: sequelize_1.QueryTypes.SELECT });
        res.status(200).json({ data: rows.map((r) => ({ ...r, total: (0, glCore_1.round2)(Number(r.total)), loans: Number(r.loans) })) });
    }
    catch (error) {
        (0, exports.fail)(res, error, "Error getting accrual runs");
    }
};
exports.getAccrualRuns = getAccrualRuns;
/** ມີເງິນກູ້ທີ່ຕ້ອງຄິດດອກເບ້ຍຄ້າງເດືອນນີ້ບໍ (ລາຍການກວດກ່ອນປິດງວດ) */
const hasAccrualToPost = async (month) => (await (0, exports.computeAccruals)(month)).length > 0;
exports.hasAccrualToPost = hasAccrualToPost;
