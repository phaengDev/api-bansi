import { Transaction } from "sequelize";
import moment from "moment";
import Incomes from "../../models/incomeModel";
import Expenses from "../../models/expenseModel";
import TransferMoney from "../../models/transferMoney";
import TreasuryAccount from "../../models/treasuryAcount";
import TypeTreasury from "../../models/typeTreasury";
import JournalEntry from "../../models/journalEntry";
import JournalLine from "../../models/journalLine";
import { BUSINESS_OFFSET, isCashAccount } from "./journalHelpers";
import {
  CREDIT, DEBIT, DraftLine, GlError, activeEntryOf, categoryAccountId, glReady, postSource, rateOf,
  reverseSource, roleAccountId, round2, treasuryAccountId,
} from "./glCore";

/**
 * ກົດການລົງບັນຊີອັດຕະໂນມັດຂອງເອກະສານ (source_type → ແຖວໜີ້/ມີ):
 * - INCOME:   ໜີ້ ເງິນສົດ/ທະນາຄານ (ຍອດເຂົ້າ)         / ມີ ລາຍຮັບ (ຍອດກ່ອນອາກອນ) + ມີ ອາກອນຂາອອກ
 * - EXPENSE:  ໜີ້ ລາຍຈ່າຍ (ຍອດກ່ອນອາກອນ) + ໜີ້ ອາກອນຂາເຂົ້າ / ມີ ເງິນສົດ/ທະນາຄານ (ຍອດຈ່າຍ)
 * - TRANSFER: ໜີ້ ບັນຊີຮັບ                             / ມີ ບັນຊີໂອນອອກ
 * - OPENING:  ໜີ້ ເງິນສົດ/ທະນາຄານ (ຍອດເລີ່ມຕົ້ນຕອນເປີດບັນຊີເງິນຄັງ) / ມີ ທຶນຍອດຍົກມາ — source_id "TA-{id}"
 * ຍອດຍົກມາຕົ້ນປີ (tbl_opening_balance) ເປັນພຽງພາບຖ່າຍຂອງຍອດທີ່ຍົກມາຈາກປີກ່ອນ ຈຶ່ງບໍ່ລົງບັນຊີ (ລົງແລ້ວຈະນັບຊ້ຳ).
 * ທຸກຟັງຊັນບໍ່ເຮັດຫຍັງ ຖ້າຍັງບໍ່ໄດ້ສ້າງຕາຕະລາງ (glReady)
 */

const ACTIVE = 1;

/** ບັນຊີເງິນຄັງ → { ບັນຊີໃນຜັງ, ສະກຸນ, ອັດຕາ } ຕາມວັນທີ */
const treasurySide = async (treasuryId: number, date: string, t: Transaction) => {
  const account: any = await TreasuryAccount.findByPk(treasuryId, {
    include: [{ model: TypeTreasury, as: "treasury", attributes: ["_uuid", "currencyId"] }],
    transaction: t,
  });
  if (!account) throw new GlError(`ບໍ່ພົບບັນຊີເງິນຄັງ #${treasuryId}`);
  const currencyId = account.treasury?.currencyId ?? null;
  return {
    accountId: await treasuryAccountId(account._uuid, await isCashAccount(account, t), t),
    currencyId,
    rate: await rateOf(currencyId, date, t),
    name: account.acountName as string,
  };
};

/** ວັນທີທຸລະກິດ (ລາວ) ຂອງ createdAt — ເອກະສານທີ່ບໍ່ມີຖັນວັນທີ (ໂອນເງິນ) ຫຼື ແຖວເກົ່າ */
const laoDateOf = (value: Date | string) => moment(value).utcOffset(BUSINESS_OFFSET).format("YYYY-MM-DD");

export const postIncome = async (row: any, t: Transaction, actorId?: number | null) => {
  if (!(await glReady(t))) return null;
  const date = row.income_date || laoDateOf(row.createdAt);
  const cash = await treasurySide(Number(row.acount_id_fk), date, t);
  const total = round2(Number(row.balance_income));
  const tax = round2(Number(row.tax) || 0);
  const common = { currencyId: cash.currencyId, rate: cash.rate };
  const lines: DraftLine[] = [
    { ...common, accountId: cash.accountId, side: DEBIT, amount: total, treasuryAccountId: Number(row.acount_id_fk) },
    { ...common, accountId: await categoryAccountId(row.type_incom_fk, 1, t), side: CREDIT, amount: round2(total - tax) },
  ];
  if (tax) lines.push({ ...common, accountId: await roleAccountId("VAT_OUTPUT", t), side: CREDIT, amount: tax });
  return postSource({
    date, sourceType: "INCOME", sourceId: row._uuid, reference: row.number, description: row.incom_title, lines, actorId,
  }, t);
};

export const postExpense = async (row: any, t: Transaction, actorId?: number | null) => {
  if (!(await glReady(t))) return null;
  const date = row.expense_date || laoDateOf(row.createdAt);
  const cash = await treasurySide(Number(row.acount_id_fk), date, t);
  const total = round2(Number(row.balance_expense));
  const tax = round2(Number(row.tax) || 0);
  const common = { currencyId: cash.currencyId, rate: cash.rate };
  const lines: DraftLine[] = [
    { ...common, accountId: await categoryAccountId(row.type_expense_fk, 2, t), side: DEBIT, amount: round2(total - tax) },
  ];
  if (tax) lines.push({ ...common, accountId: await roleAccountId("VAT_INPUT", t), side: DEBIT, amount: tax });
  lines.push({ ...common, accountId: cash.accountId, side: CREDIT, amount: total, treasuryAccountId: Number(row.acount_id_fk) });
  return postSource({
    date, sourceType: "EXPENSE", sourceId: row._uuid, reference: row.number, description: row.expense_title, lines, actorId,
  }, t);
};

export const postTransfer = async (row: any, t: Transaction, actorId?: number | null) => {
  if (!(await glReady(t))) return null;
  const date = laoDateOf(row.createdAt);
  const amount = round2(Number(row.balance_transfer));
  const from = await treasurySide(Number(row.account_outid), date, t);
  const to = await treasurySide(Number(row.account_inid), date, t);
  return postSource({
    date,
    sourceType: "TRANSFER",
    sourceId: row._uuid,
    description: row.description || `ໂອນເງິນ ${from.name} → ${to.name}`,
    lines: [
      { accountId: to.accountId, side: DEBIT, amount, currencyId: to.currencyId, rate: to.rate, treasuryAccountId: Number(row.account_inid) },
      { accountId: from.accountId, side: CREDIT, amount, currencyId: from.currencyId, rate: from.rate, treasuryAccountId: Number(row.account_outid) },
    ],
    actorId,
  }, t);
};

/** source_id ຂອງໃບຍອດເລີ່ມຕົ້ນຂອງບັນຊີເງິນຄັງ */
export const accountOpeningId = (treasuryId: number) => `TA-${treasuryId}`;

/**
 * ຍອດເລີ່ມຕົ້ນຂອງບັນຊີເງິນຄັງ (ສະກຸນຂອງບັນຊີ) — ໜີ້ ເງິນສົດ/ທະນາຄານ / ມີ ທຶນຍອດຍົກມາ (ຕິດລົບ = ສະຫຼັບຝັ່ງ).
 * ລົງໃໝ່ທັງໃບທຸກເທື່ອ (postSource); ຍອດ 0 = ກັບລາຍການໃບເກົ່າ (ຖ້າມີ)
 */
export const postAccountOpening = async (treasuryId: number, amount: number, date: string, t: Transaction, actorId?: number | null) => {
  if (!(await glReady(t))) return null;
  const value = round2(amount);
  if (!value) return reverseSource("OPENING", accountOpeningId(treasuryId), t, actorId);
  const cash = await treasurySide(treasuryId, date, t);
  return postSource({
    date,
    sourceType: "OPENING",
    sourceId: accountOpeningId(treasuryId),
    description: `ຍອດເລີ່ມຕົ້ນ — ${cash.name}`,
    lines: [
      { accountId: cash.accountId, side: DEBIT, amount: value, currencyId: cash.currencyId, rate: cash.rate, treasuryAccountId: treasuryId },
      { accountId: await roleAccountId("OPENING_EQUITY", t), side: CREDIT, amount: round2(value * cash.rate) },
    ],
    actorId,
  }, t);
};

/**
 * ກະທົບຍອດບັນຊີເງິນຄັງກັບສະໝຸດບັນຊີ: ຍອດເລີ່ມຕົ້ນ = ຍອດປັດຈຸບັນ (ໃຊ້ໄດ້ + ຄ້າງ) − ທຸກແຖວທີ່ລົງແລ້ວຂອງບັນຊີນີ້
 * (ບໍ່ນັບໃບຍອດເລີ່ມຕົ້ນເອງ) — ຫຼັງລົງເອກະສານຄົບ ຍອດເງິນສົດ/ທະນາຄານໃນບັນຊີ = ຍອດໃນບັນຊີເງິນຄັງພໍດີ.
 * ວັນທີ = ວັນເປີດບັນຊີ; ປີນັ້ນປິດແລ້ວ = ມື້ນີ້
 */
const reconcileAccountOpening = async (account: any, t: Transaction, actorId?: number | null) => {
  const ownOpening: any = await activeEntryOf("OPENING", accountOpeningId(account._uuid), t);
  const lines: any[] = await JournalLine.findAll({
    where: { treasury_account_id: account._uuid },
    attributes: ["entry_id", "amount_currency"],
    transaction: t,
  });
  const posted = lines
    .filter((l) => !ownOpening || Number(l.entry_id) !== Number(ownOpening._uuid))
    .reduce((n, l) => n + Number(l.amount_currency), 0);
  const current = (Number(account.balance_treasury) || 0) + (Number(account.balance_unable) || 0);
  const opening = round2(current - posted);
  if (!opening && !ownOpening) return false;
  const created = account.createdAt ? laoDateOf(account.createdAt) : moment().utcOffset(BUSINESS_OFFSET).format("YYYY-MM-DD");
  const today = moment().utcOffset(BUSINESS_OFFSET).format("YYYY-MM-DD");
  const date = ownOpening?.entry_date ?? (created > today ? today : created);
  try {
    await postAccountOpening(account._uuid, opening, date, t, actorId);
  } catch (error) {
    // ປີຂອງວັນເປີດບັນຊີປິດແລ້ວ → ລົງເປັນມື້ນີ້ແທນ (ຍອດປັດຈຸບັນຍັງຖືກ)
    if (!(error instanceof GlError) || ownOpening) throw error;
    await postAccountOpening(account._uuid, opening, today, t, actorId);
  }
  return true;
};

/**
 * ລົງບັນຊີຍ້ອນຫຼັງໃຫ້ເອກະສານທີ່ມີກ່ອນເປີດລະບົບ (ສະເພາະທີ່ໃຊ້ງານ ແລະ ຍັງບໍ່ມີໃບ) — ແຕ່ລະເອກະສານຄົນລະ transaction:
 * ອັນທີ່ລົ້ມເຫຼວ (ເຊັ່ນ ປີປິດແລ້ວ, ບໍ່ມີອັດຕາ) ບໍ່ກະທົບອັນອື່ນ ແລະ ລາຍງານກັບ
 */
export const rebuildFromDocuments = async (actorId?: number | null) => {
  const sequelize = JournalEntry.sequelize!;
  if (!(await glReady())) throw new GlError("ຍັງບໍ່ໄດ້ສ້າງຕາຕະລາງບັນຊີຄູ່ — ແລ່ນ sql/create_gl_accounting.sql ກ່ອນ");

  const result = { posted: 0, skipped: 0, failed: [] as { source: string; message: string }[] };
  const run = async (sourceType: string, id: number, label: string, post: (t: Transaction) => Promise<unknown>) => {
    const t = await sequelize.transaction();
    try {
      if (await activeEntryOf(sourceType, id, t)) {
        await t.rollback();
        result.skipped++;
        return;
      }
      await post(t);
      await t.commit();
      result.posted++;
    } catch (error) {
      await t.rollback();
      result.failed.push({ source: label, message: (error as Error)?.message ?? String(error) });
    }
  };

  const incomes: any[] = await Incomes.findAll({ where: { status: ACTIVE }, order: [["_uuid", "ASC"]] });
  for (const row of incomes) await run("INCOME", row._uuid, row.number ?? `INCOME #${row._uuid}`, (t) => postIncome(row, t, actorId));

  const expenses: any[] = await Expenses.findAll({ where: { status: ACTIVE }, order: [["_uuid", "ASC"]] });
  for (const row of expenses) await run("EXPENSE", row._uuid, row.number ?? `EXPENSE #${row._uuid}`, (t) => postExpense(row, t, actorId));

  const transfers: any[] = await TransferMoney.findAll({ where: { status: ACTIVE }, order: [["_uuid", "ASC"]] });
  for (const row of transfers) await run("TRANSFER", row._uuid, `TRANSFER #${row._uuid}`, (t) => postTransfer(row, t, actorId));

  // ສຸດທ້າຍ: ຍອດເລີ່ມຕົ້ນຂອງແຕ່ລະບັນຊີເງິນຄັງ ໃຫ້ຍອດໃນສະໝຸດບັນຊີກົງກັບຍອດປັດຈຸບັນ (ຄິດໃໝ່ທຸກເທື່ອ)
  const accounts: any[] = await TreasuryAccount.findAll({ order: [["_uuid", "ASC"]] });
  for (const account of accounts) {
    const t = await sequelize.transaction();
    try {
      const changed = await reconcileAccountOpening(account, t, actorId);
      await t.commit();
      if (changed) result.posted++;
    } catch (error) {
      await t.rollback();
      result.failed.push({ source: account.acountName ?? `ACCOUNT #${account._uuid}`, message: (error as Error)?.message ?? String(error) });
    }
  }

  return result;
};
