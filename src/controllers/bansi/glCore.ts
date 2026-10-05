import { Op, QueryTypes, Transaction } from "sequelize";
import moment from "moment";
import sequelize from "../../config/database";
import ChartAccount from "../../models/chartAccount";
import GlMapping from "../../models/glMapping";
import JournalEntry from "../../models/journalEntry";
import JournalLine from "../../models/journalLine";
import FiscalYear from "../../models/fiscalYear";
import ExchangeRate from "../../models/exchangeRate";
import Currency from "../../models/currencyModel";
import { issueDocNumber } from "./docNumberingController";

/**
 * ແກນຂອງລະບົບບັນຊີຄູ່ (double-entry): ຜັງບັນຊີ 5 ກຸ່ມ, ການຜູກບັນຊີ, ອັດຕາແລກປ່ຽນ, ການລັອກງວດ
 * ແລະ ການລົງ/ກັບລາຍການໃບບັນທຶກ. ຍອດ debit/credit ເປັນສະກຸນຫຼັກ (LAK) ທຸກແຖວ.
 * ຕາຕະລາງສ້າງດ້ວຍ sql/create_gl_accounting.sql — ຍັງບໍ່ແລ່ນ (glReady() = false) ລາຍຮັບ/ລາຍຈ່າຍ ເຮັດວຽກຄືເກົ່າ
 */

export const DEBIT = 1;
export const CREDIT = 2;
export const BASE_CURRENCY = "LAK";

/** ກຸ່ມ → ຝັ່ງປົກກະຕິ: ຊັບສິນ/ລາຍຈ່າຍ = ໜີ້, ໜີ້ສິນ/ທຶນ/ລາຍຮັບ = ມີ */
export const GROUP_SIDE: Record<number, number> = { 1: DEBIT, 2: CREDIT, 3: CREDIT, 4: CREDIT, 5: DEBIT };

/** ໝວດຍ່ອຍໃນໃບລາຍງານ ທີ່ແຕ່ລະກຸ່ມໃຊ້ໄດ້ */
export const TYPES_BY_GROUP: Record<number, string[]> = {
  1: ["CASH", "RECEIVABLE", "CURRENT_ASSET", "FIXED_ASSET", "NONCURRENT_ASSET"],
  2: ["PAYABLE", "CURRENT_LIABILITY", "NONCURRENT_LIABILITY"],
  3: ["EQUITY"],
  4: ["REVENUE", "OTHER_INCOME"],
  5: ["COST_OF_SALES", "EXPENSE", "OTHER_EXPENSE", "TAX_EXPENSE"],
};

/** ບົດບາດຂອງລະບົບ → ກຸ່ມທີ່ບັນຊີຕ້ອງຢູ່ + ຊື່ສຳລັບຂໍ້ຄວາມ error */
export const ROLES: Record<string, { groups: number[]; label: string }> = {
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
};

/** error ທີ່ສົ່ງກັບໃຫ້ຜູ້ໃຊ້ເປັນ 400 (ຂໍ້ມູນ/ການຕັ້ງຄ່າບໍ່ຄົບ) */
export class GlError extends Error {}

/** ໃຊ້ໃນ catch ຂອງເອກະສານ: GlError → ຕອບ 400 ແລ້ວຄືນ true; ອື່ນໆ ຄືນ false ໃຫ້ຜູ້ເອີ້ນຈັດການຕໍ່ */
export const replyGlError = (res: { status: (code: number) => { json: (body: unknown) => unknown } }, error: unknown) => {
  if (!(error instanceof GlError)) return false;
  res.status(400).json({ message: error.message });
  return true;
};

export const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const fmtDate = (date: string) => moment(date).format("DD/MM/YYYY");

// ---- ຕາຕະລາງພ້ອມບໍ່ (ກວດເທື່ອດຽວ; ຍັງບໍ່ພ້ອມກໍ່ກວດຄືນທຸກ 60 ວິນາທີ) ----
let ready = false;
let checkedAt = 0;
export const glReady = async (t?: Transaction) => {
  if (ready) return true;
  if (Date.now() - checkedAt < 60_000) return false;
  checkedAt = Date.now();
  const rows = await sequelize.query<{ n: number }>(
    "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() " +
      "AND table_name IN ('tbl_chart_account','tbl_gl_mapping','tbl_journal_entry','tbl_journal_line')",
    { type: QueryTypes.SELECT, transaction: t }
  );
  ready = Number(rows[0]?.n) === 4;
  return ready;
};

// ---- ອັດຕາແລກປ່ຽນ: ສະກຸນຫຼັກ = 1, ອື່ນໆ = ອັດຕາຫຼ້າສຸດທີ່ rate_date ≤ ວັນທີ (ບໍ່ມີ → tbl_currency.reate) ----
export const isBaseCurrency = (currency: any) => !currency || String(currency.name ?? "").toUpperCase() === BASE_CURRENCY;

export const rateOf = async (currencyId: number | null | undefined, date: string, t: Transaction) => {
  if (!currencyId) return 1;
  const currency: any = await Currency.findByPk(currencyId, { transaction: t });
  if (isBaseCurrency(currency)) return 1;
  const row: any = await ExchangeRate.findOne({
    where: { currencyId, status: 1, rate_date: { [Op.lte]: date } },
    order: [["rate_date", "DESC"], ["createdAt", "DESC"]],
    transaction: t,
  });
  const rate = Number(row?.rate) || Number(currency?.reate) || 0;
  if (!(rate > 0)) throw new GlError(`ຍັງບໍ່ມີອັດຕາແລກປ່ຽນຂອງ ${currency?.name ?? currencyId} — ຕັ້ງຢູ່ ຕັ້ງຄ່າບັນຊີ → ອັດຕາແລກປ່ຽນ`);
  return rate;
};

// ---- ລັອກງວດ: ລົງ/ແກ້ລາຍການໃນປີການເງິນທີ່ປິດແລ້ວບໍ່ໄດ້ ----
export const closedFiscalOf = (date: string, t?: Transaction) =>
  FiscalYear.findOne({
    where: { status: 2, start_date: { [Op.lte]: date }, end_date: { [Op.gte]: date } },
    transaction: t,
  });

export const assertOpenPeriod = async (date: string, t: Transaction) => {
  const closed: any = await closedFiscalOf(date, t);
  if (closed) throw new GlError(`ວັນທີ ${fmtDate(date)} ຢູ່ໃນປີການເງິນ ${closed.fiscal_code} ທີ່ປິດບັນຊີແລ້ວ`);
};

// ---- ການຜູກບັນຊີ ----
const mappedAccountId = async (sourceType: string, sourceKey: string | number, t: Transaction) => {
  const row: any = await GlMapping.findOne({
    where: { source_type: sourceType, source_key: String(sourceKey) },
    transaction: t,
  });
  return row ? Number(row.account_id) : null;
};

export const roleAccountId = async (role: keyof typeof ROLES | string, t: Transaction) => {
  const id = await mappedAccountId("ROLE", role, t);
  if (!id) throw new GlError(`ຍັງບໍ່ໄດ້ກຳນົດບັນຊີ "${ROLES[role]?.label ?? role}" — ຕັ້ງຢູ່ ຜັງບັນຊີ → ຜູກບັນຊີ`);
  return id;
};

/** ປະເພດລາຍຮັບ (kind 1) / ລາຍຈ່າຍ (kind 2) → ບັນຊີທີ່ຜູກ ຫຼື ບັນຊີເລີ່ມຕົ້ນ */
export const categoryAccountId = async (categoryId: number | null | undefined, kind: 1 | 2, t: Transaction) =>
  (categoryId ? await mappedAccountId("FINANCE_CATEGORY", categoryId, t) : null) ??
  roleAccountId(kind === 1 ? "DEFAULT_REVENUE" : "DEFAULT_EXPENSE", t);

/** ບັນຊີເງິນຄັງ → ບັນຊີທີ່ຜູກ ຫຼື ເງິນສົດ/ເງິນຝາກ ເລີ່ມຕົ້ນ ຕາມໝວດຂອງບັນຊີ */
export const treasuryAccountId = async (treasuryId: number, isCash: boolean, t: Transaction) =>
  (await mappedAccountId("TREASURY_ACCOUNT", treasuryId, t)) ?? roleAccountId(isCash ? "DEFAULT_CASH" : "DEFAULT_BANK", t);

// ---- ການລົງບັນຊີ ----

/** ແຖວຮ່າງ — amount ເປັນສະກຸນເດີມ (> 0), side = ໜີ້/ມີ */
export type DraftLine = {
  accountId: number;
  side: typeof DEBIT | typeof CREDIT;
  amount: number;
  currencyId?: number | null;
  rate?: number;
  treasuryAccountId?: number | null;
  description?: string | null;
};

export type EntryInput = {
  date: string;
  sourceType: string;
  sourceId?: string | number | null;
  reference?: string | null;
  description?: string | null;
  lines: DraftLine[];
  actorId?: number | null;
};

/** ເລກທີໃບບັນທຶກ — ຮູບແບບຂອງ doc_code JOURNAL (ຕັ້ງຄ່າ → ເລກທີເອກະສານ) ຫຼື JV-YYYY-00001 */
const nextEntryNumber = async (date: string, t: Transaction) => {
  const issued = await issueDocNumber("JOURNAL", t);
  if (issued?.number) return issued.number;
  const prefix = `JV-${moment(date).format("YYYY")}-`;
  const last: any = await JournalEntry.findOne({
    where: { entry_number: { [Op.like]: `${prefix}%` } },
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
const buildLines = async (input: EntryInput, t: Transaction) => {
  const lines = input.lines.filter((l) => round2(l.amount) !== 0);
  if (lines.length < 2) throw new GlError("ໃບບັນທຶກຕ້ອງມີຢ່າງໜ້ອຍ 2 ແຖວ");

  const ids = [...new Set(lines.map((l) => Number(l.accountId)))];
  const accounts: any[] = await ChartAccount.findAll({ where: { _uuid: ids }, transaction: t });
  for (const id of ids) {
    const account = accounts.find((a) => Number(a._uuid) === id);
    if (!account) throw new GlError(`ບໍ່ພົບບັນຊີ #${id} ໃນຜັງບັນຊີ`);
    if (Number(account.status) !== 1) throw new GlError(`ບັນຊີ ${account.account_code} ${account.name_la} ປິດໃຊ້ງານແລ້ວ`);
    if (Number(account.is_postable) !== 1) throw new GlError(`ບັນຊີ ${account.account_code} ${account.name_la} ເປັນບັນຊີຫົວ — ລົງລາຍການບໍ່ໄດ້`);
  }

  const rows = lines.map((l, i) => {
    const amount = round2(Math.abs(l.amount));
    const side = l.amount < 0 ? (l.side === DEBIT ? CREDIT : DEBIT) : l.side;
    const rate = Number(l.rate) > 0 ? Number(l.rate) : 1;
    const base = round2(amount * rate);
    return {
      line_no: i + 1,
      account_id: Number(l.accountId),
      description: l.description ?? null,
      debit: side === DEBIT ? base : 0,
      credit: side === CREDIT ? base : 0,
      currency_id: l.currencyId ?? null,
      amount_currency: side === DEBIT ? amount : -amount,
      exchange_rate: rate,
      treasury_account_id: l.treasuryAccountId ?? null,
    };
  });

  const debit = round2(rows.reduce((n, r) => n + r.debit, 0));
  const credit = round2(rows.reduce((n, r) => n + r.credit, 0));
  const diff = round2(debit - credit);
  if (diff !== 0) {
    // ຍອມໃຫ້ຕ່າງໄດ້ສະເພາະເສດປັດຂອງແຖວທີ່ແປງສະກຸນ (≤ 0.01 ຕໍ່ແຖວ) — ແຖວ LAK ລ້ວນຕ້ອງເທົ່າກັນພໍດີ
    const fxLines = rows.filter((r) => r.exchange_rate !== 1).length;
    if (Math.abs(diff) > 0.01 * fxLines + 1e-9) throw new GlError("ຍອດໜີ້ ແລະ ຍອດມີ ບໍ່ເທົ່າກັນ");
    const smaller = diff > 0 ? "credit" : "debit";
    const target = rows.filter((r) => r[smaller] > 0).sort((a, b) => b[smaller] - a[smaller])[0];
    target[smaller] = round2(target[smaller] + Math.abs(diff));
  }
  const total = round2(rows.reduce((n, r) => n + r.debit, 0));
  return { rows, total };
};

/** ສ້າງໃບບັນທຶກໃໝ່ */
export const postEntry = async (input: EntryInput, t: Transaction) => {
  await assertOpenPeriod(input.date, t);
  const { rows, total } = await buildLines(input, t);
  const entry: any = await JournalEntry.create(
    {
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
    },
    { transaction: t }
  );
  await JournalLine.bulkCreate(rows.map((r) => ({ ...r, entry_id: entry._uuid })), { transaction: t });
  return entry;
};

/** ໃບທີ່ຍັງມີຜົນຂອງເອກະສານ (ບໍ່ແມ່ນໃບກັບລາຍການ ແລະ ຍັງບໍ່ຖືກກັບ) */
export const activeEntryOf = (sourceType: string, sourceId: string | number, t: Transaction) =>
  JournalEntry.findOne({
    where: { source_type: sourceType, source_id: String(sourceId), reversal_of: null, reversed_by: null },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });

/**
 * ລົງບັນຊີໃຫ້ເອກະສານ — ມີໃບຢູ່ແລ້ວ (ແກ້ເອກະສານ) ປ່ຽນວັນທີ/ແຖວໃນໃບເດີມ (ເລກທີຄືເກົ່າ), ບໍ່ມີ → ສ້າງໃໝ່
 */
export const postSource = async (input: EntryInput & { sourceId: string | number }, t: Transaction) => {
  const existing: any = await activeEntryOf(input.sourceType, input.sourceId, t);
  if (!existing) return postEntry(input, t);
  await assertOpenPeriod(existing.entry_date, t);
  await assertOpenPeriod(input.date, t);
  const { rows, total } = await buildLines(input, t);
  await JournalLine.destroy({ where: { entry_id: existing._uuid }, transaction: t });
  await existing.update(
    {
      entry_date: input.date,
      reference: input.reference ?? null,
      description: input.description ?? null,
      total_debit: total,
      total_credit: total,
      updatedAt: new Date(),
    },
    { transaction: t }
  );
  await JournalLine.bulkCreate(rows.map((r) => ({ ...r, entry_id: existing._uuid })), { transaction: t });
  return existing;
};

/**
 * ກັບລາຍການ — ໃບໃໝ່ທີ່ສະຫຼັບໜີ້/ມີ ຂອງໃບເດີມ. ວັນທີ: ບໍ່ສົ່ງ = ວັນທີຂອງໃບເດີມ ຖ້າງວດຍັງເປີດ, ປິດແລ້ວ = ມື້ນີ້
 */
export const reverseEntry = async (entry: any, t: Transaction, options: { date?: string; actorId?: number | null; description?: string } = {}) => {
  if (entry.reversed_by) throw new GlError(`ໃບ ${entry.entry_number} ຖືກກັບລາຍການແລ້ວ`);
  if (entry.reversal_of) throw new GlError(`ໃບ ${entry.entry_number} ເປັນໃບກັບລາຍການ — ກັບຊ້ຳບໍ່ໄດ້`);
  const date = options.date ?? ((await closedFiscalOf(entry.entry_date, t)) ? moment().utcOffset("+07:00").format("YYYY-MM-DD") : entry.entry_date);
  await assertOpenPeriod(date, t);
  const lines: any[] = await JournalLine.findAll({ where: { entry_id: entry._uuid }, order: [["line_no", "ASC"]], transaction: t });
  const reversal: any = await JournalEntry.create(
    {
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
    },
    { transaction: t }
  );
  await JournalLine.bulkCreate(
    lines.map((l) => ({
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
    })),
    { transaction: t }
  );
  await entry.update({ reversed_by: reversal._uuid, updatedAt: new Date() }, { transaction: t });
  return reversal;
};

/** ກັບລາຍການຂອງເອກະສານ (ຍົກເລີກລາຍຮັບ/ລາຍຈ່າຍ) — ບໍ່ມີໃບ (ລົງກ່ອນເປີດລະບົບ) ກໍ່ຂ້າມ */
export const reverseSource = async (sourceType: string, sourceId: string | number, t: Transaction, actorId?: number | null) => {
  const entry = await activeEntryOf(sourceType, sourceId, t);
  return entry ? reverseEntry(entry, t, { actorId }) : null;
};
