import { Request, Response } from "express";
import { Op, QueryTypes, Transaction } from "sequelize";
import moment from "moment";
import sequelize from "../../config/database";
import Loan, { LoanAccrual, LoanInstallment, LoanPayment } from "../../models/loan";
import { LoanPenalty, LoanProduct } from "../../models/loanCredit";
import ChartAccount from "../../models/chartAccount";
import JournalEntry from "../../models/journalEntry";
import TreasuryAccount from "../../models/treasuryAcount";
import TypeTreasury from "../../models/typeTreasury";
import Currency from "../../models/currencyModel";
import {
  CREDIT, DEBIT, DraftLine, GlError, assertOpenPeriod, glReady, postEntry, postSource, rateOf, reverseEntry, reverseSource, roleAccountId, round2,
} from "./glCore";
import { treasurySide } from "./glPosting";
import { MOVE_IN, MOVE_OUT, moveBalance } from "./accountMovement";
import { actorOf, sendError, toDateOnly } from "./bansiHelpers";
import { todayLao } from "./journalHelpers";
import {
  METHODS, allocatePaid, buildSchedule, decimalsOf, earnedInterest, roundTo, termsError, withPeriodStart,
  type ScheduleTerms, type StoredInstallment,
} from "../../utils/loanSchedule";

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

export const BORROWED = 1;
export const LENT = 2;
const START_TREASURY = 1;
const START_OPENING = 2;
const ACTIVE = 1;
const CANCELLED = 2;

export const fail = (res: Response, error: unknown, fallback: string) => {
  if (error instanceof GlError) {
    res.status(400).json({ message: error.message });
    return;
  }
  sendError(res, error, fallback);
};

const notReady = (res: Response) => res.status(503).json({ message: "ຍັງບໍ່ໄດ້ເປີດໃຊ້ລະບົບບັນຊີຄູ່", notReady: true });

const monthEnd = (month: string) => moment(month, "YYYY-MM").endOf("month").format("YYYY-MM-DD");
const nextMonthStart = (month: string) => moment(month, "YYYY-MM").add(1, "month").startOf("month").format("YYYY-MM-DD");
const parseMonth = (value: unknown) => {
  const m = moment(String(value ?? ""), "YYYY-MM", true);
  if (!m.isValid()) throw new GlError("ກະລຸນາເລືອກເດືອນ");
  return m.format("YYYY-MM");
};
const num = (value: unknown) => round2(Number(value) || 0);
export const isBorrowed = (loan: { direction: number }) => Number(loan.direction) !== LENT;
/** ວັນທີທີ່ເງິນກູ້ເຂົ້າບັນຊີ (ຮັບ/ຈ່າຍເງິນ ຫຼື ວັນທີຍອດຍົກມາ) */
export const bookedOn = (loan: Loan) => (Number(loan.start_mode) === START_OPENING ? String(loan.opening_date) : String(loan.start_date));

/** ທົດສະນິຍົມຂອງສະກຸນເງິນກູ້ (ກີບ = 0) */
export const currencyDecimals = async (currencyId: number | null | undefined, t?: Transaction) =>
  decimalsOf(currencyId ? ((await Currency.findByPk(currencyId, { attributes: ["_id", "name"], transaction: t })) as any)?.name : "LAK");

export const baseCurrencyId = async (t?: Transaction) =>
  ((await Currency.findOne({ where: { name: "LAK" }, attributes: ["_id"], transaction: t })) as any)?._id ?? null;

/** ສະກຸນຂອງບັນຊີເງິນຄັງ */
export const treasuryCurrencyId = async (treasuryId: number, t?: Transaction) => {
  const account: any = await TreasuryAccount.findByPk(treasuryId, {
    include: [{ model: TypeTreasury, as: "treasury", attributes: ["_uuid", "currencyId"] }], transaction: t,
  });
  return account ? Number(account.treasury?.currencyId ?? 0) || null : null;
};

/** ບັນຊີເງິນຄັງທີ່ໃຊ້ໄດ້ ແລະ ສະກຸນດຽວກັບເງິນກູ້ (ອ່ານແບບລັອກ ເພື່ອປ່ຽນຍອດ) */
export const lockTreasury = async (treasuryId: number, currencyId: number | null, t: Transaction) => {
  const account: any = Number.isInteger(treasuryId) ? await TreasuryAccount.findByPk(treasuryId, { transaction: t, lock: t.LOCK.UPDATE }) : null;
  if (!account || Number(account.status) !== 1) throw new GlError("ກະລຸນາເລືອກບັນຊີເງິນຄັງ (ໃຊ້ງານຢູ່)");
  if (currencyId && (await treasuryCurrencyId(treasuryId, t)) !== Number(currencyId)) {
    throw new GlError("ບັນຊີເງິນຄັງຕ້ອງເປັນສະກຸນດຽວກັບເງິນກູ້");
  }
  return account;
};

export const takeOut = (account: any, amount: number) => {
  if ((Number(account.balance_treasury) || 0) < amount - 0.004) throw new GlError("ຍອດເງິນທີ່ໃຊ້ໄດ້ຂອງບັນຊີບໍ່ພໍ");
};

/** ກວດບັນຊີທີ່ເລືອກ — ລົງລາຍການໄດ້, ໃຊ້ງານ ແລະ ຢູ່ກຸ່ມທີ່ຖືກ */
export const assertAccount = async (id: number | null, groups: number[], label: string, t?: Transaction) => {
  if (!id) return;
  const account: any = await ChartAccount.findByPk(id, { transaction: t });
  if (!account || Number(account.status) !== 1 || Number(account.is_postable) !== 1 || !groups.includes(Number(account.account_group))) {
    throw new GlError(`${label}: ເລືອກບັນຊີກຸ່ມ ${groups.join(", ")} ທີ່ລົງລາຍການໄດ້`);
  }
};

/** ລະຫັດຖັດໄປ — LN-0001 (ເງິນກູ້ທົ່ວໄປ) / CR-000001 (ສັນຍາສິນເຊື່ອ) */
export const nextCode = async (t?: Transaction, prefix = "LN-", digits = 4) => {
  const rows: any[] = await Loan.findAll({ attributes: ["loan_code"], where: { loan_code: { [Op.like]: `${prefix}%` } }, raw: true, transaction: t });
  const max = rows.reduce((n, r) => Math.max(n, Number(String(r.loan_code).slice(prefix.length)) || 0), 0);
  return `${prefix}${String(max + 1).padStart(digits, "0")}`;
};

export const termsOf = (body: any, current?: Loan): ScheduleTerms => ({
  principal: num(body.principal ?? current?.principal),
  annual_rate: Number(body.annual_rate ?? current?.annual_rate ?? 0),
  method: Number(body.method ?? current?.method ?? METHODS.ANNUITY),
  day_basis: Number(body.day_basis ?? current?.day_basis ?? 1) === 2 ? 2 : 1,
  frequency_months: Number(body.frequency_months ?? current?.frequency_months ?? 1),
  frequency_days: Number(body.frequency_days ?? current?.frequency_days) || null,
  term: Math.round(Number(body.term ?? current?.term)),
  start_date: toDateOnly(body.start_date ?? current?.start_date) ?? "",
  first_due_date: toDateOnly(body.first_due_date ?? current?.first_due_date) ?? "",
});

/** ກວດ ແລະ ແປງຂໍ້ມູນຈາກຟອມ (current = ແກ້ໄຂ) */
const parseInput = async (body: any, t: Transaction, current?: Loan) => {
  const direction = Number(body.direction ?? current?.direction) === LENT ? LENT : BORROWED;
  const counterparty = String(body.counterparty ?? current?.counterparty ?? "").trim().slice(0, 200);
  if (!counterparty) throw new GlError(direction === BORROWED ? "ກະລຸນາປ້ອນຊື່ຜູ້ໃຫ້ກູ້ (ທະນາຄານ / ບຸກຄົນ)" : "ກະລຸນາປ້ອນຊື່ຜູ້ກູ້");
  const terms = termsOf(body, current);
  const error = termsError(terms);
  if (error) throw new GlError(error);

  const currencyId = Number(body.currency_id ?? current?.currency_id) || (await baseCurrencyId(t));
  terms.principal = roundTo(terms.principal, await currencyDecimals(currencyId, t));
  const startMode = Number(body.start_mode ?? current?.start_mode ?? START_TREASURY) === START_OPENING ? START_OPENING : START_TREASURY;
  const treasuryId = startMode === START_TREASURY ? Number(body.treasury_account_id ?? current?.treasury_account_id) || null : null;
  const openingDate = startMode === START_OPENING ? toDateOnly(body.opening_date ?? current?.opening_date) : null;
  if (startMode === START_TREASURY && !treasuryId) {
    throw new GlError(direction === BORROWED ? "ກະລຸນາເລືອກບັນຊີທີ່ຮັບເງິນກູ້" : "ກະລຸນາເລືອກບັນຊີທີ່ຈ່າຍເງິນໃຫ້ກູ້");
  }
  if (startMode === START_TREASURY && terms.start_date > todayLao()) throw new GlError("ວັນທີຮັບ/ຈ່າຍເງິນກູ້ ຕ້ອງບໍ່ເກີນມື້ນີ້");
  if (startMode === START_OPENING) {
    if (!openingDate) throw new GlError("ກະລຸນາເລືອກວັນທີຍອດຍົກມາ");
    if (openingDate < terms.start_date) throw new GlError("ວັນທີຍອດຍົກມາ ຕ້ອງບໍ່ກ່ອນວັນທີກູ້");
    if (openingDate > todayLao()) throw new GlError("ວັນທີຍອດຍົກມາ ຕ້ອງບໍ່ເກີນມື້ນີ້");
  }
  if (treasuryId && currencyId && (await treasuryCurrencyId(treasuryId, t)) !== currencyId) {
    throw new GlError("ບັນຊີເງິນຄັງຕ້ອງເປັນສະກຸນດຽວກັບເງິນກູ້");
  }

  const loanAccountId = Number(body.loan_account_id ?? current?.loan_account_id)
    || (await roleAccountId(direction === BORROWED ? "LOAN_PAYABLE" : "LOAN_RECEIVABLE", t));
  const interestAccountId = body.interest_account_id !== undefined ? Number(body.interest_account_id) || null : current?.interest_account_id ?? null;
  await assertAccount(loanAccountId, [direction === BORROWED ? 2 : 1], direction === BORROWED ? "ບັນຊີເງິນກູ້ຢືມ" : "ບັນຊີເງິນໃຫ້ກູ້", t);
  await assertAccount(interestAccountId, [direction === BORROWED ? 5 : 4], direction === BORROWED ? "ບັນຊີດອກເບ້ຍຈ່າຍ" : "ບັນຊີດອກເບ້ຍຮັບ", t);

  const text = (key: string, max: number) =>
    body[key] !== undefined ? String(body[key] ?? "").trim().slice(0, max) || null : (current as any)?.[key] ?? null;
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

type Parsed = Awaited<ReturnType<typeof parseInput>>;

/** ຖັນທີ່ກະທົບການລົງບັນຊີ / ຕາຕະລາງ — ແກ້ໄດ້ສະເພາະກ່ອນມີການຈ່າຍ ແລະ ກ່ອນຄິດດອກເບ້ຍຄ້າງ */
const TERM_FIELDS = [
  "direction", "currency_id", "principal", "annual_rate", "method", "day_basis", "frequency_months", "frequency_days", "term", "start_date",
  "first_due_date", "start_mode", "treasury_account_id", "opening_date", "loan_account_id",
] as const;
const sameValue = (a: unknown, b: unknown) => String(a ?? "") === String(b ?? "") || (Number(a) === Number(b) && a !== null && b !== null && a !== "" && b !== "");

/** ສ້າງຕາຕະລາງຜ່ອນໃໝ່ (ລຶບຂອງເກົ່າ) — ຍອດຍົກມາ: ງວດທີ່ຄົບກຳນົດຮອດວັນທີຍົກມາ = ຈ່າຍແລ້ວ */
export const writeInstallments = async (loan: Loan, t: Transaction) => {
  await LoanInstallment.destroy({ where: { loan_id: loan._uuid }, transaction: t });
  const rows = buildSchedule(termsOf({}, loan), await currencyDecimals(loan.currency_id, t));
  const opening = Number(loan.start_mode) === START_OPENING ? String(loan.opening_date) : null;
  await LoanInstallment.bulkCreate(rows.map((r) => ({
    loan_id: loan._uuid, no: r.no, due_date: r.due_date, principal: r.principal, interest: r.interest, balance: r.balance,
    settled: opening && r.due_date <= opening ? 1 : 0,
  })), { transaction: t });
  return rows;
};

export const installmentsOf = async (loanId: number, t?: Transaction): Promise<StoredInstallment[]> =>
  (await LoanInstallment.findAll({ where: { loan_id: loanId }, order: [["no", "ASC"]], transaction: t })).map((r) => ({
    no: r.no, due_date: String(r.due_date), principal: num(r.principal), interest: num(r.interest), settled: Number(r.settled) === 1,
  }));

/** ຍອດຕົ້ນທຶນຄົງເຫຼືອ ນ ວັນທີເງິນກູ້ເຂົ້າບັນຊີ (ຍອດຍົກມາ = ຫັກງວດທີ່ຈ່າຍກ່ອນເຂົ້າລະບົບ) */
const startAmount = (loan: Loan, rows: StoredInstallment[]) =>
  round2(num(loan.principal) - rows.filter((r) => r.settled).reduce((n, r) => n + r.principal, 0));

/** ຄ່າທຳນຽມເປີດສິນເຊື່ອທີ່ຫັກຕອນປ່ອຍກູ້ (ສະເພາະເງິນໃຫ້ກູ້ທີ່ຈ່າຍຜ່ານບັນຊີເງິນຄັງ) */
const feeOf = (loan: Loan) => (!isBorrowed(loan) && Number(loan.start_mode) === START_TREASURY ? num(loan.upfront_fee) : 0);

/** ບັນຊີລາຍຮັບຄ່າທຳນຽມ: ຂອງຜະລິດຕະພັນ (fee_account_id) ຫຼື ບົດບາດ CREDIT_FEE_INCOME */
const feeAccountOf = async (loan: Loan, t: Transaction) => {
  const product = loan.product_id ? await LoanProduct.findByPk(loan.product_id, { attributes: ["_uuid", "fee_account_id"], transaction: t }) : null;
  return Number(product?.fee_account_id) || (await roleAccountId("CREDIT_FEE_INCOME", t));
};

/** ລົງບັນຊີ + ປ່ຽນຍອດບັນຊີເງິນຄັງ ຂອງການຮັບ/ຈ່າຍເງິນກູ້ (ຫຼື ຍອດຍົກມາ) */
export const applyStart = async (loan: Loan, t: Transaction, actorId: number | null) => {
  const rows = await installmentsOf(loan._uuid, t);
  const amount = startAmount(loan, rows);
  if (!(amount > 0)) throw new GlError("ທຸກງວດຄົບກຳນົດກ່ອນວັນທີຍອດຍົກມາ — ບໍ່ມີຍອດຄົງເຫຼືອ");
  const borrowed = isBorrowed(loan);
  const date = bookedOn(loan);
  const rate = await rateOf(loan.currency_id, date, t);
  const loanSide = borrowed ? CREDIT : DEBIT;
  const otherSide = borrowed ? DEBIT : CREDIT;
  const lines: DraftLine[] = [
    { accountId: loan.loan_account_id, side: loanSide, amount, currencyId: loan.currency_id, rate, description: `${loan.loan_code} ${loan.counterparty}` },
  ];
  if (Number(loan.start_mode) === START_OPENING) {
    lines.push({ accountId: await roleAccountId("OPENING_EQUITY", t), side: otherSide, amount: round2(amount * rate) });
  } else {
    const account = await lockTreasury(Number(loan.treasury_account_id), loan.currency_id, t);
    const cash = await treasurySide(account._uuid, date, t);
    // ສິນເຊື່ອ: ຄ່າທຳນຽມເປີດສິນເຊື່ອຫັກອອກຈາກເງິນທີ່ຈ່າຍໃຫ້ລູກຄ້າ → ລາຍຮັບຄ່າທຳນຽມ (4230)
    const fee = feeOf(loan);
    const net = round2(amount - fee);
    lines.push({ accountId: cash.accountId, side: otherSide, amount: net, currencyId: cash.currencyId, rate: cash.rate, treasuryAccountId: account._uuid });
    if (fee > 0) {
      lines.push({ accountId: await feeAccountOf(loan, t), side: otherSide, amount: fee, currencyId: loan.currency_id, rate, description: `${loan.loan_code} ຄ່າທຳນຽມເປີດສິນເຊື່ອ` });
    }
    if (!borrowed) takeOut(account, net);
    await moveBalance(account, {
      direction: borrowed ? MOVE_IN : MOVE_OUT, amount: net, source: "LOAN_START", sourceId: loan._uuid, docNumber: loan.loan_code, date,
      description: `${borrowed ? "ຮັບເງິນກູ້" : "ຈ່າຍເງິນໃຫ້ກູ້"} ${loan.loan_code} ${loan.counterparty}`, actorId,
    }, t);
  }
  const kind = Number(loan.start_mode) === START_OPENING ? "ຍອດຍົກມາ" : borrowed ? "ຮັບເງິນກູ້" : "ຈ່າຍເງິນໃຫ້ກູ້";
  await postSource({
    date, sourceType: "LOAN_START", sourceId: loan._uuid, reference: loan.loan_code,
    description: `${kind} ${loan.loan_code} · ${loan.counterparty}`, lines, actorId,
  }, t);
};

/** ກັບການລົງບັນຊີ + ຍອດບັນຊີເງິນຄັງ ຂອງການຮັບ/ຈ່າຍເງິນກູ້ (ກ່ອນແກ້ເງື່ອນໄຂ / ລຶບ) */
export const undoStart = async (loan: Loan, t: Transaction, actorId: number | null) => {
  await reverseSource("LOAN_START", loan._uuid, t, actorId);
  if (Number(loan.start_mode) !== START_TREASURY || !loan.treasury_account_id) return;
  const account: any = await TreasuryAccount.findByPk(loan.treasury_account_id, { transaction: t, lock: t.LOCK.UPDATE });
  if (!account) return;
  const amount = round2(startAmount(loan, await installmentsOf(loan._uuid, t)) - feeOf(loan));
  const borrowed = isBorrowed(loan);
  if (borrowed) takeOut(account, amount);
  await moveBalance(account, {
    direction: borrowed ? MOVE_OUT : MOVE_IN, amount, source: "LOAN_START_CANCEL", sourceId: loan._uuid, docNumber: loan.loan_code,
    description: `ຍົກເລີກ${borrowed ? "ຮັບເງິນກູ້" : "ຈ່າຍເງິນໃຫ້ກູ້"} ${loan.loan_code}`, actorId,
  }, t);
};

// ================= ສະຫຼຸບ

type PaymentRow = { pay_date: string; principal: number; interest: number; fee: number };

/** ສະຫຼຸບເງິນກູ້: ຍອດຄົງເຫຼືອ, ງວດຕໍ່ໄປ, ງວດກາຍກຳນົດ + ສະຖານະແຕ່ລະງວດ */
export const summarize = (loan: Loan, stored: StoredInstallment[], payments: PaymentRow[], today = todayLao()) => {
  const paidPrincipal = round2(payments.reduce((n, p) => n + p.principal, 0));
  const paidInterest = round2(payments.reduce((n, p) => n + p.interest, 0));
  const settledPrincipal = round2(stored.filter((r) => r.settled).reduce((n, r) => n + r.principal, 0));
  const outstanding = round2(num(loan.principal) - settledPrincipal - paidPrincipal);
  const closed = outstanding <= 0.004;
  const rows = allocatePaid(withPeriodStart(String(loan.start_date), stored), paidPrincipal, paidInterest).map((r) => {
    const open = r.due_principal > 0.004 || r.due_interest > 0.004;
    const state = r.settled ? "settled"
      : !open ? "paid"
        : closed ? "closed"
          : r.due_date < today ? "overdue"
            : r.paid_principal + r.paid_interest > 0 ? "partial" : "upcoming";
    return { ...r, payment: round2(r.principal + r.interest), state };
  });
  const next = rows.find((r) => ["overdue", "partial", "upcoming"].includes(r.state)) ?? null;
  const overdue = rows.filter((r) => r.state === "overdue");
  return {
    rows,
    summary: {
      outstanding: Math.max(0, outstanding),
      closed,
      paid_principal: round2(paidPrincipal + settledPrincipal),
      paid_interest: round2(paidInterest + stored.filter((r) => r.settled).reduce((n, r) => n + r.interest, 0)),
      paid_fee: round2(payments.reduce((n, p) => n + p.fee, 0)),
      total_interest: round2(stored.reduce((n, r) => n + r.interest, 0)),
      installments: stored.length,
      paid_installments: rows.filter((r) => r.state === "paid" || r.state === "settled").length,
      next: next && { no: next.no, due_date: next.due_date, principal: next.due_principal, interest: next.due_interest, amount: round2(next.due_principal + next.due_interest) },
      overdue_count: overdue.length,
      overdue_amount: round2(overdue.reduce((n, r) => n + r.due_principal + r.due_interest, 0)),
    },
  };
};

export const presentLoan = (loan: Loan, currencies: Map<number, any>) => {
  const plain: any = loan.get({ plain: true });
  const currency = currencies.get(Number(loan.currency_id));
  return {
    ...plain,
    principal: num(loan.principal),
    annual_rate: Number(loan.annual_rate),
    currency: currency ? { _id: currency._id, name: currency.name, genus: currency.genus } : null,
  };
};

export const currencyMap = async () => new Map(((await Currency.findAll({ raw: true })) as any[]).map((c) => [Number(c._id), c]));
export const paymentsOf = (rows: LoanPayment[]): PaymentRow[] =>
  rows.map((p) => ({ pay_date: String(p.pay_date), principal: num(p.principal), interest: num(p.interest), fee: num(p.fee) }));

/**
 * ປະຫວັດການຈ່າຍ / ຮັບ ຂອງເງິນກູ້ໜຶ່ງສັນຍາ ພ້ອມຊື່ບັນຊີເງິນຄັງ ແລະ ເລກລາຍການບັນຊີ — ໃຊ້ຮ່ວມ:
 * GET /loan/:id ແລະ GET /credit/contract/:id. treasury = ບັນຊີທີ່ຮັບ/ຈ່າຍເງິນກູ້ຕອນເລີ່ມ
 */
export const presentPayments = async (loan: Loan, payments: LoanPayment[]) => {
  const treasuries = new Map(((await TreasuryAccount.findAll({
    where: { _uuid: [...new Set([...payments.map((p) => p.treasury_account_id), loan.treasury_account_id].filter(Boolean) as number[])] },
    attributes: ["_uuid", "acountName", "account_code"], raw: true,
  })) as any[]).map((a) => [Number(a._uuid), a]));
  const entries = new Map(((await JournalEntry.findAll({
    where: { source_type: "LOAN_PAYMENT", source_id: payments.map((p) => String(p._uuid)), reversal_of: null },
    attributes: ["source_id", "entry_number"], raw: true,
  })) as any[]).map((e) => [String(e.source_id), e.entry_number]));
  return {
    treasury: loan.treasury_account_id ? treasuries.get(Number(loan.treasury_account_id)) ?? null : null,
    payments: payments.map((p) => {
      const amounts = { principal: num(p.principal), interest: num(p.interest), fee: num(p.fee), penalty: num(p.penalty) };
      return {
        ...p.get({ plain: true }), ...amounts,
        total: round2(amounts.principal + amounts.interest + amounts.fee + amounts.penalty),
        treasury: treasuries.get(Number(p.treasury_account_id)) ?? null,
        entry_number: entries.get(String(p._uuid)) ?? null,
      };
    }),
  };
};

/** GET /loan/fetch — ທຸກເງິນກູ້ (ທັງສອງທາງ) ພ້ອມຍອດຄົງເຫຼືອ ແລະ ງວດຕໍ່ໄປ */
export const getLoans = async (_req: Request, res: Response) => {
  try {
    if (!(await glReady())) return notReady(res);
    const [loans, installments, payments, currencies] = await Promise.all([
      Loan.findAll({ order: [["loan_code", "ASC"]] }),
      LoanInstallment.findAll({ order: [["loan_id", "ASC"], ["no", "ASC"]] }),
      LoanPayment.findAll({ where: { status: ACTIVE } }),
      currencyMap(),
    ]);
    const data = loans.map((loan) => {
      const stored = installments.filter((r) => r.loan_id === loan._uuid).map((r) => ({
        no: r.no, due_date: String(r.due_date), principal: num(r.principal), interest: num(r.interest), settled: Number(r.settled) === 1,
      }));
      const { summary } = summarize(loan, stored, paymentsOf(payments.filter((p) => p.loan_id === loan._uuid)));
      return { ...presentLoan(loan, currencies), ...summary };
    });
    res.status(200).json({ data, next_code: await nextCode() });
  } catch (error) {
    fail(res, error, "Error getting loans");
  }
};

/** GET /loan/:id — ເງິນກູ້ + ຕາຕະລາງຜ່ອນ (ສະຖານະແຕ່ລະງວດ) + ປະຫວັດການຈ່າຍ */
export const getLoan = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const loan = await Loan.findByPk(Number(req.params.id));
    if (!loan) throw new GlError("ບໍ່ພົບເງິນກູ້");
    const [stored, payments, currencies] = await Promise.all([
      installmentsOf(loan._uuid),
      LoanPayment.findAll({ where: { loan_id: loan._uuid }, order: [["pay_date", "DESC"], ["_uuid", "DESC"]] }),
      currencyMap(),
    ]);
    const active = payments.filter((p) => Number(p.status) === ACTIVE);
    const { rows, summary } = summarize(loan, stored, paymentsOf(active));
    const { treasury, payments: paymentRows } = await presentPayments(loan, payments);
    const accruals = await LoanAccrual.count({ where: { loan_id: loan._uuid } });
    res.status(200).json({
      data: {
        ...presentLoan(loan, currencies),
        ...summary,
        treasury,
        // ແກ້ເງື່ອນໄຂ/ລຶບ ໄດ້ສະເພາະກ່ອນມີການຈ່າຍ ແລະ ກ່ອນຄິດດອກເບ້ຍຄ້າງ
        locked: active.length > 0 || accruals > 0,
        schedule: rows,
        payments: paymentRows,
      },
    });
  } catch (error) {
    fail(res, error, "Error getting loan");
  }
};

/** POST /loan/preview { ເງື່ອນໄຂ } — ຕາຕະລາງຜ່ອນ (ຍັງບໍ່ບັນທຶກ) ສຳລັບຟອມ */
export const previewLoan = async (req: Request, res: Response) => {
  try {
    const terms = termsOf(req.body ?? {});
    const error = termsError(terms);
    if (error) throw new GlError(error);
    const decimals = await currencyDecimals(Number(req.body?.currency_id) || null);
    const rows = buildSchedule(terms, decimals);
    res.status(200).json({
      data: rows,
      decimals,
      total_interest: roundTo(rows.reduce((n, r) => n + r.interest, 0), decimals),
      total_payment: roundTo(rows.reduce((n, r) => n + r.payment, 0), decimals),
    });
  } catch (error) {
    fail(res, error, "Error previewing loan");
  }
};

/** POST /loan/create */
export const createLoan = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    if (!(await glReady(t))) {
      await t.rollback();
      return notReady(res);
    }
    const input = await parseInput(req.body || {}, t);
    const code = String(req.body?.loan_code ?? "").trim().slice(0, 30) || (await nextCode(t));
    if (await Loan.count({ where: { loan_code: code }, transaction: t })) throw new GlError(`ລະຫັດ ${code} ມີແລ້ວ`);
    const actorId = Number(actorOf(req)) || null;
    const loan = await Loan.create({ ...input, loan_code: code, status: ACTIVE, created_by: actorId } as any, { transaction: t });
    await writeInstallments(loan, t);
    await applyStart(loan, t, actorId);
    await t.commit();
    res.status(200).json({ message: "Successfully created loan", data: loan });
  } catch (error) {
    await t.rollback();
    fail(res, error, "Error creating loan");
  }
};

/**
 * PUT /loan/:id — ຊື່ຄູ່ສັນຍາ / ເລກສັນຍາ / ຈຸດປະສົງ / ໝາຍເຫດ / ບັນຊີດອກເບ້ຍ ແກ້ໄດ້ສະເໝີ;
 * ເງື່ອນໄຂ (ຍອດ, ອັດຕາ, ງວດ, ວັນທີ, ບັນຊີ…) ແກ້ໄດ້ສະເພາະກ່ອນມີການຈ່າຍ ແລະ ກ່ອນຄິດດອກເບ້ຍຄ້າງ — ສ້າງຕາຕະລາງ + ລົງບັນຊີໃໝ່
 */
export const updateLoan = async (req: Request<{ id: string }>, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const loan = await Loan.findByPk(Number(req.params.id), { transaction: t, lock: t.LOCK.UPDATE });
    if (!loan) throw new GlError("ບໍ່ພົບເງິນກູ້");
    // ສັນຍາສິນເຊື່ອ (ມາຈາກຄຳຮ້ອງທີ່ອະນຸມັດ) ແກ້ / ລຶບ ຢູ່ນີ້ບໍ່ໄດ້ — ຍົກເລີກການປ່ອຍກູ້ຢູ່ລະບົບສິນເຊື່ອ
    if (loan.customer_id) throw new GlError("ນີ້ແມ່ນສັນຍາສິນເຊື່ອ — ຈັດການຢູ່ ຄຳຮ້ອງ ແລະ ສັນຍາ");
    const input: Parsed = await parseInput(req.body || {}, t, loan);
    const termsChanged = TERM_FIELDS.some((key) => !sameValue((input as any)[key], (loan as any)[key]));
    const actorId = Number(actorOf(req)) || null;
    if (termsChanged) {
      const used = (await LoanPayment.count({ where: { loan_id: loan._uuid, status: ACTIVE }, transaction: t }))
        + (await LoanAccrual.count({ where: { loan_id: loan._uuid }, transaction: t }));
      if (used) throw new GlError("ມີການຈ່າຍ ຫຼື ຄິດດອກເບ້ຍຄ້າງແລ້ວ — ແກ້ໄດ້ສະເພາະຊື່, ເລກສັນຍາ, ຈຸດປະສົງ ແລະ ໝາຍເຫດ");
      await undoStart(loan, t, actorId);
      await loan.update({ ...input, updatedAt: new Date() } as any, { transaction: t });
      await writeInstallments(loan, t);
      await applyStart(loan, t, actorId);
    } else {
      await loan.update({
        counterparty: input.counterparty, contract_no: input.contract_no, purpose: input.purpose, note: input.note,
        interest_account_id: input.interest_account_id, updatedAt: new Date(),
      }, { transaction: t });
      // ຄຳອະທິບາຍຂອງໃບ (ຊື່ຄູ່ສັນຍາ) — ຕົວເລກຄືເກົ່າ postSource ແກ້ແຕ່ຂໍ້ຄວາມ
      const borrowed = isBorrowed(loan);
      const kind = Number(loan.start_mode) === START_OPENING ? "ຍອດຍົກມາ" : borrowed ? "ຮັບເງິນກູ້" : "ຈ່າຍເງິນໃຫ້ກູ້";
      const entry: any = await JournalEntry.findOne({
        where: { source_type: "LOAN_START", source_id: String(loan._uuid), reversal_of: null, reversed_by: null }, transaction: t,
      });
      if (entry) await entry.update({ description: `${kind} ${loan.loan_code} · ${loan.counterparty}` }, { transaction: t });
    }
    await t.commit();
    res.status(200).json({ message: "Successfully updated loan", data: loan });
  } catch (error) {
    await t.rollback();
    fail(res, error, "Error updating loan");
  }
};

/** DELETE /loan/:id — ລຶບໄດ້ສະເພາະທີ່ຍັງບໍ່ມີການຈ່າຍ ແລະ ບໍ່ໄດ້ຄິດດອກເບ້ຍຄ້າງ (ກັບໃບ + ເງິນກັບເຂົ້າ/ອອກບັນຊີ) */
export const deleteLoan = async (req: Request<{ id: string }>, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const loan = await Loan.findByPk(Number(req.params.id), { transaction: t, lock: t.LOCK.UPDATE });
    if (!loan) throw new GlError("ບໍ່ພົບເງິນກູ້");
    // ສັນຍາສິນເຊື່ອ (ມາຈາກຄຳຮ້ອງທີ່ອະນຸມັດ) ແກ້ / ລຶບ ຢູ່ນີ້ບໍ່ໄດ້ — ຍົກເລີກການປ່ອຍກູ້ຢູ່ລະບົບສິນເຊື່ອ
    if (loan.customer_id) throw new GlError("ນີ້ແມ່ນສັນຍາສິນເຊື່ອ — ຈັດການຢູ່ ຄຳຮ້ອງ ແລະ ສັນຍາ");
    if (await LoanPayment.count({ where: { loan_id: loan._uuid, status: ACTIVE }, transaction: t })) {
      throw new GlError("ມີການຈ່າຍແລ້ວ ລຶບບໍ່ໄດ້ — ຍົກເລີກການຈ່າຍກ່ອນ");
    }
    if (await LoanAccrual.count({ where: { loan_id: loan._uuid }, transaction: t })) {
      throw new GlError("ຄິດດອກເບ້ຍຄ້າງຂອງເງິນກູ້ນີ້ແລ້ວ — ຍົກເລີກເດືອນເຫຼົ່ານັ້ນກ່ອນ");
    }
    await undoStart(loan, t, Number(actorOf(req)) || null);
    await LoanInstallment.destroy({ where: { loan_id: loan._uuid }, transaction: t });
    await LoanPayment.destroy({ where: { loan_id: loan._uuid }, transaction: t });
    await loan.destroy({ transaction: t });
    await t.commit();
    res.status(200).json({ message: "Successfully deleted loan" });
  } catch (error) {
    await t.rollback();
    fail(res, error, "Error deleting loan");
  }
};

// ================= ການຈ່າຍ / ຮັບຄືນ

export type PaymentInput = {
  date: string;
  treasuryId: number;
  principal: number;
  interest: number;
  fee: number;
  /** ຄ່າປັບກາຍກຳນົດ (ສັນຍາສິນເຊື່ອ) */
  penalty?: number;
  /** 1 ຕາມງວດ, 2 ຈ່າຍລ່ວງໜ້າບາງສ່ວນ, 3 ປິດບັນຊີກ່ອນກຳນົດ */
  paymentType?: number;
  reference?: string | null;
  note?: string | null;
};

/**
 * ບັນທຶກການຈ່າຍ/ຮັບຄືນ (ໃຊ້ຮ່ວມ: POST /loan/pay ແລະ ຮັບຊຳລະສັນຍາສິນເຊື່ອ) — ກວດວັນທີ / ຍອດ, ເງິນເຂົ້າ-ອອກບັນຊີເງິນຄັງ,
 * ລົງບັນຊີ (ຕົ້ນທຶນ, ດອກເບ້ຍ, ຄ່າທຳນຽມ, ຄ່າປັບ). ເອີ້ນພາຍໃນ transaction ທີ່ລັອກເງິນກູ້ແລ້ວ
 */
export const recordLoanPayment = async (loan: Loan, input: PaymentInput, t: Transaction, actorId: number | null) => {
  const date = input.date;
  if (!date) throw new GlError("ກະລຸນາເລືອກວັນທີ");
  if (date > todayLao()) throw new GlError("ວັນທີຕ້ອງບໍ່ເກີນມື້ນີ້");
  if (date < bookedOn(loan)) throw new GlError(`ວັນທີຕ້ອງບໍ່ກ່ອນ ${moment(bookedOn(loan)).format("DD/MM/YYYY")} (ວັນທີເງິນກູ້ເຂົ້າບັນຊີ)`);
  // ປັດຕາມສະກຸນ (ກີບ = ຈຳນວນເຕັມ) — ຍອດບັນຊີເງິນຄັງເກັບເປັນຈຳນວນເຕັມ
  const decimals = await currencyDecimals(loan.currency_id, t);
  const principal = roundTo(Number(input.principal) || 0, decimals);
  const interest = roundTo(Number(input.interest) || 0, decimals);
  const fee = roundTo(Number(input.fee) || 0, decimals);
  const penalty = roundTo(Number(input.penalty) || 0, decimals);
  if (principal < 0 || interest < 0 || fee < 0 || penalty < 0) throw new GlError("ຈຳນວນເງິນຕ້ອງບໍ່ຕິດລົບ");
  const total = round2(principal + interest + fee + penalty);
  if (!(total > 0)) throw new GlError("ກະລຸນາປ້ອນຈຳນວນເງິນ");
  const stored = await installmentsOf(loan._uuid, t);
  const active = await LoanPayment.findAll({ where: { loan_id: loan._uuid, status: ACTIVE }, transaction: t });
  const { summary } = summarize(loan, stored, paymentsOf(active));
  if (principal > summary.outstanding + 0.004) {
    throw new GlError(`ຕົ້ນທຶນເກີນຍອດຄົງເຫຼືອ (${summary.outstanding.toLocaleString("en-US")})`);
  }

  const borrowed = isBorrowed(loan);
  const account = await lockTreasury(Number(input.treasuryId), loan.currency_id, t);
  if (borrowed) takeOut(account, total);
  const row = await LoanPayment.create({
    loan_id: loan._uuid, pay_date: date, treasury_account_id: account._uuid, principal, interest, fee, penalty,
    payment_type: [1, 2, 3].includes(Number(input.paymentType)) ? Number(input.paymentType) : 1,
    reference: String(input.reference ?? "").trim().slice(0, 100) || null,
    note: String(input.note ?? "").trim().slice(0, 255) || null,
    status: ACTIVE, created_by: actorId,
  } as any, { transaction: t });
  const number = `LNP-${moment(date).format("YYYYMM")}-${String(row._uuid).padStart(4, "0")}`;
  await row.update({ number }, { transaction: t });

  const rate = await rateOf(loan.currency_id, date, t);
  const cash = await treasurySide(account._uuid, date, t);
  const common = { currencyId: loan.currency_id, rate };
  const label = `${loan.loan_code} ${loan.counterparty}`;
  const sideOf = (lineIsLoanSide: boolean) => (borrowed === lineIsLoanSide ? DEBIT : CREDIT);
  const product = loan.product_id ? await LoanProduct.findByPk(loan.product_id, { transaction: t }) : null;
  const lines: DraftLine[] = [
    { ...common, accountId: loan.loan_account_id, side: sideOf(true), amount: principal, description: `${label} · ຕົ້ນທຶນ` },
    {
      ...common, side: sideOf(true), amount: interest, description: `${label} · ດອກເບ້ຍ`,
      accountId: loan.interest_account_id ?? (await roleAccountId(borrowed ? "INTEREST_EXPENSE" : "INTEREST_INCOME", t)),
    },
  ];
  if (fee > 0) {
    // ສັນຍາສິນເຊື່ອ: ຄ່າທຳນຽມ (ປິດກ່ອນກຳນົດ) → ບັນຊີຄ່າທຳນຽມຂອງຜະລິດຕະພັນ / 4230
    const feeAccount = borrowed ? await roleAccountId("LOAN_FEE_EXPENSE", t)
      : loan.customer_id ? product?.fee_account_id ?? (await roleAccountId("CREDIT_FEE_INCOME", t)) : await roleAccountId("LOAN_FEE_INCOME", t);
    lines.push({ ...common, accountId: feeAccount, side: sideOf(true), amount: fee, description: `${label} · ຄ່າທຳນຽມ` });
  }
  if (penalty > 0) {
    const penaltyAccount = borrowed ? await roleAccountId("LOAN_FEE_EXPENSE", t) : product?.penalty_account_id ?? (await roleAccountId("CREDIT_PENALTY_INCOME", t));
    lines.push({ ...common, accountId: penaltyAccount, side: sideOf(true), amount: penalty, description: `${label} · ຄ່າປັບກາຍກຳນົດ` });
  }
  lines.push({ accountId: cash.accountId, side: sideOf(false), amount: total, currencyId: cash.currencyId, rate: cash.rate, treasuryAccountId: account._uuid });
  const description = `${borrowed ? "ຈ່າຍຄືນເງິນກູ້" : "ຮັບຄືນເງິນໃຫ້ກູ້"} ${label}${row.reference ? ` (${row.reference})` : ""}`;
  await postEntry({ date, sourceType: "LOAN_PAYMENT", sourceId: row._uuid, reference: number, description, lines, actorId }, t);
  await moveBalance(account, {
    direction: borrowed ? MOVE_OUT : MOVE_IN, amount: total, source: "LOAN_PAYMENT", sourceId: row._uuid, docNumber: number, date, description, actorId,
  }, t);
  return { row, number, total };
};

/** POST /loan/pay/:id — ຈ່າຍ/ຮັບຄືນ ເງິນກູ້ທົ່ວໄປ (ສັນຍາສິນເຊື່ອ ຮັບຊຳລະຢູ່ /credit/contract/:id/collect — ຄ່າປັບຕ້ອງຕັດກ່ອນ) */
export const payLoan = async (req: Request<{ id: string }>, res: Response) => {
  const t = await sequelize.transaction();
  try {
    if (!(await glReady(t))) {
      await t.rollback();
      return notReady(res);
    }
    const loan = await Loan.findByPk(Number(req.params.id), { transaction: t, lock: t.LOCK.UPDATE });
    if (!loan) throw new GlError("ບໍ່ພົບເງິນກູ້");
    if (loan.customer_id) throw new GlError("ນີ້ແມ່ນສັນຍາສິນເຊື່ອ — ຮັບຊຳລະຢູ່ ຄຳຮ້ອງ ແລະ ສັນຍາ");
    const body = req.body ?? {};
    const { row, number } = await recordLoanPayment(loan, {
      date: toDateOnly(body.pay_date) ?? "", treasuryId: Number(body.treasury_account_id),
      principal: body.principal, interest: body.interest, fee: body.fee, reference: body.reference, note: body.note,
    }, t, Number(actorOf(req)) || null);
    await t.commit();
    res.status(200).json({ message: "Successfully recorded loan payment", data: { ...row.get({ plain: true }), number } });
  } catch (error) {
    await t.rollback();
    fail(res, error, "Error recording loan payment");
  }
};

/** PUT /loan/payment/cancel/:id — ຍົກເລີກການຈ່າຍ: ກັບລາຍການບັນຊີ ແລະ ເງິນກັບເຂົ້າ/ອອກບັນຊີເງິນຄັງ */
export const cancelLoanPayment = async (req: Request<{ id: string }>, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const row = await LoanPayment.findByPk(Number(req.params.id), { transaction: t, lock: t.LOCK.UPDATE });
    if (!row || Number(row.status) !== ACTIVE) throw new GlError("ບໍ່ພົບລາຍການ ຫຼື ຍົກເລີກແລ້ວ");
    const loan = await Loan.findByPk(row.loan_id, { transaction: t });
    const actorId = Number(actorOf(req)) || null;
    await reverseSource("LOAN_PAYMENT", row._uuid, t, actorId);
    const total = round2(num(row.principal) + num(row.interest) + num(row.fee) + num(row.penalty));
    // ຄ່າປັບທີ່ການຈ່າຍນີ້ຕັດ → ກັບມາຄ້າງ
    await LoanPenalty.destroy({ where: { payment_id: row._uuid }, transaction: t });
    const account: any = await TreasuryAccount.findByPk(row.treasury_account_id, { transaction: t, lock: t.LOCK.UPDATE });
    if (account) {
      const borrowed = !loan || isBorrowed(loan);
      if (!borrowed) takeOut(account, total);
      await moveBalance(account, {
        direction: borrowed ? MOVE_IN : MOVE_OUT, amount: total, source: "LOAN_PAYMENT_CANCEL", sourceId: row._uuid, docNumber: row.number,
        description: `ຍົກເລີກ ${row.number ?? ""}`.trim(), actorId,
      }, t);
    }
    await row.update({ status: CANCELLED, updatedAt: new Date() }, { transaction: t });
    // ສັນຍາທີ່ການຈ່າຍນີ້ປິດໄວ້ → ເປີດຄືນ
    if (loan?.closed_date && num(row.principal) > 0) await loan.update({ closed_date: null, close_reason: null } as any, { transaction: t });
    await t.commit();
    res.status(200).json({ message: "Successfully cancelled loan payment" });
  } catch (error) {
    await t.rollback();
    fail(res, error, "Error cancelling loan payment");
  }
};

// ================= ດອກເບ້ຍຄ້າງທ້າຍເດືອນ

/**
 * ດອກເບ້ຍຄ້າງ ນ ທ້າຍເດືອນ ຕໍ່ເງິນກູ້ = ດອກທີ່ເກີດແລ້ວຮອດທ້າຍເດືອນ − ດອກທີ່ຈ່າຍແລ້ວ (ລວມງວດກ່ອນເຂົ້າລະບົບ).
 * ຂ້າມເງິນກູ້ທີ່ຍັງບໍ່ເຂົ້າບັນຊີ, ຈ່າຍຕົ້ນທຶນໝົດແລ້ວ ຫຼື ຈ່າຍດອກລ່ວງໜ້າ
 */
export const computeAccruals = async (month: string, t?: Transaction) => {
  const end = monthEnd(month);
  const loans = (await Loan.findAll({ where: { status: ACTIVE }, order: [["loan_code", "ASC"]], transaction: t })).filter((l) => bookedOn(l) <= end);
  if (!loans.length) return [];
  const [installments, payments] = await Promise.all([
    LoanInstallment.findAll({ where: { loan_id: loans.map((l) => l._uuid) }, transaction: t }),
    LoanPayment.findAll({ where: { loan_id: loans.map((l) => l._uuid), status: ACTIVE, pay_date: { [Op.lte]: end } }, transaction: t }),
  ]);
  const out: { loan: Loan; earned: number; paid: number; accrued: number; rate: number; lak: number }[] = [];
  for (const loan of loans) {
    const stored: StoredInstallment[] = installments.filter((r) => r.loan_id === loan._uuid).map((r) => ({
      no: r.no, due_date: String(r.due_date), principal: num(r.principal), interest: num(r.interest), settled: Number(r.settled) === 1,
    }));
    const paid = payments.filter((p) => p.loan_id === loan._uuid);
    const settled = stored.filter((r) => r.settled);
    const outstanding = round2(num(loan.principal) - settled.reduce((n, r) => n + r.principal, 0) - paid.reduce((n, p) => n + num(p.principal), 0));
    if (outstanding <= 0.004) continue;
    const earned = earnedInterest(String(loan.start_date), stored, end);
    const paidInterest = round2(settled.reduce((n, r) => n + r.interest, 0) + paid.reduce((n, p) => n + num(p.interest), 0));
    const accrued = roundTo(earned - paidInterest, await currencyDecimals(loan.currency_id, t));
    if (accrued <= 0) continue;
    const rate = await rateOf(loan.currency_id, end, t as Transaction);
    out.push({ loan, earned, paid: paidInterest, accrued, rate, lak: round2(accrued * rate) });
  }
  return out;
};

const latestAccrual = async (t?: Transaction) => {
  const row: any = await LoanAccrual.findOne({ order: [["period", "DESC"]], attributes: ["period"], transaction: t });
  return row ? String(row.period) : null;
};

const activeAccrualEntry = (sourceType: "LOAN_ACCRUAL" | "LOAN_ACCRUAL_REV", month: string, t?: Transaction) =>
  JournalEntry.findOne({ where: { source_type: sourceType, source_id: month, reversal_of: null, reversed_by: null }, transaction: t });

/** POST /loan/accrual-preview { month } — ຍອດທີ່ຈະລົງ ຫຼື ທີ່ລົງແລ້ວ */
export const previewAccrual = async (req: Request, res: Response) => {
  try {
    if (!(await glReady())) return notReady(res);
    const month = parseMonth(req.body?.month);
    const entry: any = await activeAccrualEntry("LOAN_ACCRUAL", month);
    const currencies = await currencyMap();
    let rows: any[];
    if (entry) {
      const saved = await LoanAccrual.findAll({ where: { period: month } });
      const loans = new Map((await Loan.findAll({ where: { _uuid: saved.map((s) => s.loan_id) } })).map((l) => [l._uuid, l]));
      rows = saved.map((s) => {
        const loan = loans.get(s.loan_id);
        return { loan_id: s.loan_id, loan_code: loan?.loan_code, counterparty: loan?.counterparty, direction: loan?.direction, accrued: num(s.amount),
          currency: currencies.get(Number(loan?.currency_id))?.name ?? null };
      });
    } else {
      rows = (await computeAccruals(month)).map((r) => ({
        loan_id: r.loan._uuid, loan_code: r.loan.loan_code, counterparty: r.loan.counterparty, direction: r.loan.direction,
        earned: r.earned, paid: r.paid, accrued: r.accrued, rate: r.rate, lak: r.lak, currency: currencies.get(Number(r.loan.currency_id))?.name ?? null,
      }));
    }
    const reversal: any = entry ? await activeAccrualEntry("LOAN_ACCRUAL_REV", month) : null;
    res.status(200).json({
      month,
      posted: entry ? { entry_number: entry.entry_number, entry_date: entry.entry_date, total: Number(entry.total_debit),
        reversal_number: reversal?.entry_number ?? null, reversal_date: reversal?.entry_date ?? null } : null,
      latest: await latestAccrual(),
      rows,
      payable: round2(rows.filter((r) => Number(r.direction) !== LENT).reduce((n, r) => n + (r.lak ?? 0), 0)),
      receivable: round2(rows.filter((r) => Number(r.direction) === LENT).reduce((n, r) => n + (r.lak ?? 0), 0)),
    });
  } catch (error) {
    fail(res, error, "Error previewing interest accrual");
  }
};

/** ກັບໃບດອກເບ້ຍຄ້າງຂອງເດືອນ (ທັງໃບທ້າຍເດືອນ ແລະ ໃບກັບຄືນຕົ້ນເດືອນຖັດໄປ) ແລ້ວລຶບແຖວ */
const undoAccrualMonth = async (month: string, t: Transaction, actorId: number | null) => {
  for (const type of ["LOAN_ACCRUAL_REV", "LOAN_ACCRUAL"] as const) {
    const entry: any = await activeAccrualEntry(type, month, t);
    if (entry) await reverseEntry(entry, t, { actorId, description: `ຍົກເລີກດອກເບ້ຍຄ້າງ ${moment(month).format("MM/YYYY")}` });
  }
  await LoanAccrual.destroy({ where: { period: month }, transaction: t });
};

/**
 * POST /loan/accrue { month } — ລົງດອກເບ້ຍຄ້າງທ້າຍເດືອນ (ໃບດຽວ) + ໃບກັບຄືນວັນທີ 1 ເດືອນຖັດໄປ.
 * ລົງຊ້ຳເດືອນລ່າສຸດໄດ້ (ກັບຂອງເກົ່າແລ້ວຄິດໃໝ່); ເດືອນກ່ອນເດືອນລ່າສຸດລົງບໍ່ໄດ້
 */
export const runAccrual = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    if (!(await glReady(t))) {
      await t.rollback();
      return notReady(res);
    }
    const month = parseMonth(req.body?.month);
    const date = monthEnd(month);
    if (date > moment().utcOffset("+07:00").endOf("month").format("YYYY-MM-DD")) throw new GlError("ຄິດດອກເບ້ຍຄ້າງເດືອນທີ່ຍັງບໍ່ເຖິງບໍ່ໄດ້");
    await assertOpenPeriod(date, t);
    await assertOpenPeriod(nextMonthStart(month), t);
    const latest = await latestAccrual(t);
    if (latest && month < latest) throw new GlError(`ຄິດດອກເບ້ຍຄ້າງຮອດ ${moment(latest).format("MM/YYYY")} ແລ້ວ — ຄິດເດືອນກ່ອນໜ້ານັ້ນບໍ່ໄດ້`);
    const actorId = Number(actorOf(req)) || null;
    if (latest === month) await undoAccrualMonth(month, t, actorId);

    const rows = await computeAccruals(month, t);
    if (!rows.length) throw new GlError("ບໍ່ມີດອກເບ້ຍຄ້າງໃນເດືອນນີ້");
    const lines: DraftLine[] = [];
    for (const r of rows) {
      const borrowed = isBorrowed(r.loan);
      const label = `${r.loan.loan_code} ${r.loan.counterparty}`;
      const interestAccount = r.loan.interest_account_id ?? (await roleAccountId(borrowed ? "INTEREST_EXPENSE" : "INTEREST_INCOME", t));
      const accruedAccount = r.loan.accrued_account_id ?? (await roleAccountId(borrowed ? "INTEREST_PAYABLE" : "INTEREST_RECEIVABLE", t));
      lines.push(
        { accountId: borrowed ? interestAccount : accruedAccount, side: DEBIT, amount: r.lak, description: label },
        { accountId: borrowed ? accruedAccount : interestAccount, side: CREDIT, amount: r.lak, description: label },
      );
    }
    const title = moment(month).format("MM/YYYY");
    const entry: any = await postEntry({
      date, sourceType: "LOAN_ACCRUAL", sourceId: month, reference: `ACR-${month}`, description: `ດອກເບ້ຍຄ້າງ ${title}`, lines, actorId,
    }, t);
    const reversal: any = await postEntry({
      date: nextMonthStart(month), sourceType: "LOAN_ACCRUAL_REV", sourceId: month, reference: `ACR-${month}-R`,
      description: `ກັບດອກເບ້ຍຄ້າງ ${title} (ຕົ້ນເດືອນຖັດໄປ — ດອກທີ່ຈ່າຍຈິງລົງຕອນຈ່າຍ)`,
      lines: lines.map((l) => ({ ...l, side: l.side === DEBIT ? CREDIT : DEBIT })), actorId,
    }, t);
    await LoanAccrual.bulkCreate(rows.map((r) => ({
      loan_id: r.loan._uuid, period: month, amount: r.accrued, entry_id: entry._uuid, reversal_id: reversal._uuid,
    })), { transaction: t });
    await t.commit();
    res.status(200).json({
      message: "Successfully posted interest accrual",
      data: { entry_number: entry.entry_number, reversal_number: reversal.entry_number, total: round2(rows.reduce((n, r) => n + r.lak, 0)) },
    });
  } catch (error) {
    await t.rollback();
    fail(res, error, "Error posting interest accrual");
  }
};

/** DELETE /loan/accrue/:month — ຍົກເລີກສະເພາະເດືອນລ່າສຸດທີ່ຄິດ */
export const undoAccrual = async (req: Request<{ month: string }>, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const month = parseMonth(req.params.month);
    if ((await latestAccrual(t)) !== month) throw new GlError("ຍົກເລີກໄດ້ສະເພາະເດືອນລ່າສຸດທີ່ຄິດດອກເບ້ຍຄ້າງ");
    await assertOpenPeriod(monthEnd(month), t);
    await undoAccrualMonth(month, t, Number(actorOf(req)) || null);
    await t.commit();
    res.status(200).json({ message: "Successfully removed interest accrual" });
  } catch (error) {
    await t.rollback();
    fail(res, error, "Error removing interest accrual");
  }
};

/** GET /loan/accrual-runs — ເດືອນທີ່ຄິດດອກເບ້ຍຄ້າງແລ້ວ (ໃໝ່ສຸດກ່ອນ) */
export const getAccrualRuns = async (_req: Request, res: Response) => {
  try {
    const rows = await sequelize.query<any>(
      `SELECT a.period, COUNT(*) AS loans, MAX(e.entry_number) AS entry_number, MAX(e.total_debit) AS total,
              MAX(r.entry_number) AS reversal_number
       FROM tbl_loan_accrual a
       LEFT JOIN tbl_journal_entry e ON e._uuid = a.entry_id
       LEFT JOIN tbl_journal_entry r ON r._uuid = a.reversal_id
       GROUP BY a.period ORDER BY a.period DESC`,
      { type: QueryTypes.SELECT }
    );
    res.status(200).json({ data: rows.map((r) => ({ ...r, total: round2(Number(r.total)), loans: Number(r.loans) })) });
  } catch (error) {
    fail(res, error, "Error getting accrual runs");
  }
};

/** ມີເງິນກູ້ທີ່ຕ້ອງຄິດດອກເບ້ຍຄ້າງເດືອນນີ້ບໍ (ລາຍການກວດກ່ອນປິດງວດ) */
export const hasAccrualToPost = async (month: string) => (await computeAccruals(month)).length > 0;

