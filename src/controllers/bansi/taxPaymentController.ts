import { Request, Response } from "express";
import { Op, QueryTypes, Transaction } from "sequelize";
import moment from "moment";
import sequelize from "../../config/database";
import { TaxPayment } from "../../models/taxRecords";
import TreasuryAccount from "../../models/treasuryAcount";
import TypeTreasury from "../../models/typeTreasury";
import Currency from "../../models/currencyModel";
import Banks from "../../models/bankModel";
import { CREDIT, DEBIT, DraftLine, GlError, glReady, isBaseCurrency, postEntry, reverseSource, roleAccountId, round2 } from "./glCore";
import { treasurySide } from "./glPosting";
import { MOVE_IN, MOVE_OUT, moveBalance } from "./accountMovement";
import { featureOn, isSimpleMode } from "./accountSettingController";
import { actorOf, sendError, toDateOnly } from "./bansiHelpers";
import { todayLao } from "./journalHelpers";

/**
 * ນຳສົ່ງອາກອນໃຫ້ລັດ (ສະເພາະບັນຊີແບບຄົບຕາມມາດຕະຖານ) — ຍອດຄ້າງຈ່າຍຄິດຈາກສະໝຸດບັນຊີ ຮອດວັນທີສິ້ນງວດ:
 * - ອາກອນມູນຄ່າເພີ່ມ: ຂາອອກ (ມີ − ໜີ້ ຂອງ VAT_OUTPUT) − ຂາເຂົ້າ (ໜີ້ − ມີ ຂອງ VAT_INPUT). ຈ່າຍ = ໜີ້ ຂາອອກ (ຂາເຂົ້າ + ຍອດຈ່າຍ)
 *   / ມີ ຂາເຂົ້າ / ມີ ເງິນ — ຂາເຂົ້າຖືກຫັກອອກໝົດ, ຂາອອກທີ່ຍັງບໍ່ຈ່າຍ (ຈ່າຍບາງສ່ວນ) ຍັງຄ້າງ. ຂາເຂົ້າຫຼາຍກວ່າ = ບໍ່ມີຕ້ອງຈ່າຍ (ຍົກໄປ)
 * - ອື່ນໆ: ຍອດມີ ຂອງບັນຊີຄ້າງຈ່າຍ → ໜີ້ ຄ້າງຈ່າຍ / ມີ ເງິນ
 * ເງິນອອກຈາກບັນຊີເງິນຄັງສະກຸນກີບ (ຍອດໃຊ້ໄດ້ຕ້ອງພໍ) ແລະ ຂຶ້ນໃນປະຫວັດການເຄື່ອນໄຫວຂອງບັນຊີ
 */

const VAT = 1;
const PIT = 2;
const SSO = 3;
const WHT = 4;
const PROFIT = 5;
const ACTIVE = 1;
const CANCELLED = 2;

/** ປະເພດອາກອນ → ບັນຊີຄ້າງຈ່າຍ (ບົດບາດຂອງຜັງບັນຊີ) + ຊື່ໃນຄຳອະທິບາຍ */
const KINDS: Record<number, { role: string; name: string; feature?: "use_vat" | "use_withholding" }> = {
  [VAT]: { role: "VAT_OUTPUT", name: "ອາກອນມູນຄ່າເພີ່ມ", feature: "use_vat" },
  [PIT]: { role: "PIT_PAYABLE", name: "ອາກອນລາຍໄດ້ເງິນເດືອນ" },
  [SSO]: { role: "SSO_PAYABLE", name: "ປະກັນສັງຄົມ" },
  [WHT]: { role: "WHT_PAYABLE", name: "ອາກອນຫັກ ນ ທີ່ຈ່າຍ", feature: "use_withholding" },
  [PROFIT]: { role: "PROFIT_TAX_PAYABLE", name: "ອາກອນກຳໄລ" },
};

const fail = (res: Response, error: unknown, fallback: string) => {
  if (error instanceof GlError) {
    res.status(400).json({ message: error.message });
    return;
  }
  sendError(res, error, fallback);
};

/** ບັນຊີຂອງບົດບາດ — ຍັງບໍ່ຜູກ = null (ບໍ່ throw) */
const roleOrNull = async (role: string, t: Transaction) => {
  try {
    return await roleAccountId(role, t);
  } catch {
    return null;
  }
};

/** ຍອດ (ມີ − ໜີ້) ຂອງບັນຊີ ຮອດວັນທີ — ລາຍການທີ່ກັບແລ້ວ ຫັກກັນເອງໃນຍອດ */
const creditBalance = async (accountId: number, end: string, t: Transaction) => {
  const [row] = await sequelize.query<{ total: string | null }>(
    `SELECT SUM(l.credit - l.debit) AS total FROM tbl_journal_line l JOIN tbl_journal_entry e ON e._uuid = l.entry_id
     WHERE l.account_id = :accountId AND e.entry_date <= :end`,
    { type: QueryTypes.SELECT, replacements: { accountId, end }, transaction: t }
  );
  return round2(Number(row?.total) || 0);
};

type Outstanding = { kind: number; account_id: number | null; payable: number; vat_output?: number; vat_input?: number; ready: boolean };

/**
 * ການນຳສົ່ງທີ່ຈ່າຍຫຼັງວັນທີ end ສຳລັບງວດທີ່ສິ້ນສຸດກ່ອນ/ໃນວັນທີ end — ຍອດຂອງສະໝຸດບັນຊີຮອດ end ຍັງບໍ່ລວມ (ລົງວັນທີຈ່າຍ)
 * ຈຶ່ງຕ້ອງຫັກອອກ ບໍ່ດັ່ງນັ້ນງວດດຽວກັນຈະຈ່າຍຊ້ຳໄດ້ (ເຊັ່ນ ອາກອນເດືອນ 10 ຈ່າຍວັນທີ 12/11)
 */
const paidLater = async (kind: number, end: string, t: Transaction) => {
  const [row] = await sequelize.query<{ amount: string | null; vat_output: string | null; vat_input: string | null }>(
    `SELECT SUM(amount) AS amount, SUM(vat_output) AS vat_output, SUM(vat_input) AS vat_input FROM tbl_tax_payment
     WHERE status = :active AND tax_kind = :kind AND period_end <= :end AND pay_date > :end`,
    { type: QueryTypes.SELECT, replacements: { active: ACTIVE, kind, end }, transaction: t }
  );
  return { amount: round2(Number(row?.amount) || 0), output: round2(Number(row?.vat_output) || 0), input: round2(Number(row?.vat_input) || 0) };
};

/** ຍອດຄ້າງຈ່າຍຂອງປະເພດອາກອນ ສຳລັບງວດທີ່ສິ້ນສຸດວັນທີ end */
const outstandingOf = async (kind: number, end: string, t: Transaction): Promise<Outstanding> => {
  const later = await paidLater(kind, end, t);
  if (kind === VAT) {
    const [outId, inId] = await Promise.all([roleOrNull("VAT_OUTPUT", t), roleOrNull("VAT_INPUT", t)]);
    if (!outId || !inId) return { kind, account_id: outId, payable: 0, vat_output: 0, vat_input: 0, ready: false };
    const output = round2((await creditBalance(outId, end, t)) - later.output);
    const input = round2(-(await creditBalance(inId, end, t)) - later.input);
    return { kind, account_id: outId, payable: round2(output - input), vat_output: output, vat_input: input, ready: true };
  }
  const accountId = await roleOrNull(KINDS[kind].role, t);
  if (!accountId) return { kind, account_id: null, payable: 0, ready: false };
  return { kind, account_id: accountId, payable: round2((await creditBalance(accountId, end, t)) - later.amount), ready: true };
};

/** ປະເພດອາກອນທີ່ບໍລິສັດໃຊ້ (ຕາມຟັງຊັນທີ່ເປີດ) */
const kindsInUse = async (t?: Transaction) => {
  const list: number[] = [];
  for (const [key, kind] of Object.entries(KINDS)) {
    if (!kind.feature || (await featureOn(kind.feature, t))) list.push(Number(key));
  }
  return list;
};

/** ກວດກ່ອນທຸກຄຳຂໍ: ແບບຄົບຕາມມາດຕະຖານ + ເປີດໃຊ້ລະບົບບັນຊີຄູ່ແລ້ວ */
const guard = async (res: Response) => {
  if (await isSimpleMode()) {
    res.status(400).json({ message: "ບໍລິສັດໃຊ້ບັນຊີແບບທຳມະດາ — ບໍ່ມີການນຳສົ່ງອາກອນໃນລະບົບ" });
    return false;
  }
  if (!(await glReady())) {
    res.status(503).json({ message: "ຍັງບໍ່ໄດ້ເປີດໃຊ້ລະບົບບັນຊີຄູ່", notReady: true });
    return false;
  }
  return true;
};

const accountInclude = [
  {
    model: TreasuryAccount, as: "account", attributes: ["_uuid", "account_code", "acountName", "acount_number"],
    include: [{ model: Banks, as: "banks", attributes: ["abbr", "name_la"] }],
  },
];

/** POST /tax-payment/outstanding { date? } — ຍອດຄ້າງຈ່າຍທຸກປະເພດທີ່ໃຊ້ ຮອດວັນທີ (ຕັ້ງຕົ້ນ = ມື້ນີ້) */
export const getTaxOutstanding = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    if (!(await guard(res))) return void (await t.rollback());
    const end = toDateOnly(req.body?.date) ?? todayLao();
    const kinds = await kindsInUse(t);
    const data = [];
    for (const kind of kinds) data.push(await outstandingOf(kind, end, t));
    await t.commit();
    res.status(200).json({ date: end, data });
  } catch (error) {
    await t.rollback();
    fail(res, error, "Error getting tax outstanding");
  }
};

/** POST /tax-payment/fetch { start_date?, end_date? } — ປະຫວັດການນຳສົ່ງ (ໃໝ່ສຸດກ່ອນ) */
export const getTaxPayments = async (req: Request, res: Response) => {
  try {
    if (!(await guard(res))) return;
    const start = toDateOnly(req.body?.start_date);
    const end = toDateOnly(req.body?.end_date);
    const where: any = {};
    if (start || end) where.pay_date = { ...(start ? { [Op.gte]: start } : {}), ...(end ? { [Op.lte]: end } : {}) };
    const rows = await TaxPayment.findAll({ where, include: accountInclude as any, order: [["pay_date", "DESC"], ["_uuid", "DESC"]] });
    res.status(200).json({ data: rows });
  } catch (error) {
    fail(res, error, "Error getting tax payments");
  }
};

/**
 * POST /tax-payment/create { tax_kind, period_end, pay_date, treasury_account_id, amount?, reference?, note? } —
 * amount ບໍ່ສົ່ງ = ຍອດຄ້າງທັງໝົດ; ຈ່າຍບາງສ່ວນໄດ້ ແຕ່ບໍ່ເກີນຍອດຄ້າງ
 */
export const createTaxPayment = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    if (!(await guard(res))) return void (await t.rollback());
    const body = req.body || {};
    const kind = Number(body.tax_kind);
    if (!(await kindsInUse(t)).includes(kind)) throw new GlError("ປະເພດອາກອນບໍ່ຖືກຕ້ອງ ຫຼື ບໍລິສັດບໍ່ໄດ້ເປີດໃຊ້");
    const today = todayLao();
    const periodEnd = toDateOnly(body.period_end);
    const payDate = toDateOnly(body.pay_date);
    if (!periodEnd || !payDate) throw new GlError("ກະລຸນາເລືອກງວດ ແລະ ວັນທີຈ່າຍ");
    if (periodEnd > today || payDate > today) throw new GlError("ວັນທີຕ້ອງບໍ່ເກີນມື້ນີ້");
    if (payDate < periodEnd) throw new GlError("ວັນທີຈ່າຍຕ້ອງບໍ່ກ່ອນວັນທີສິ້ນງວດ");

    const due = await outstandingOf(kind, periodEnd, t);
    if (!due.ready) throw new GlError(`ຍັງບໍ່ໄດ້ຜູກບັນຊີ ${KINDS[kind].name} — ຕັ້ງຢູ່ ຜັງບັນຊີ → ຜູກບັນຊີ`);
    if (!(due.payable > 0)) throw new GlError(`ບໍ່ມີ${KINDS[kind].name}ຄ້າງຈ່າຍ ຮອດວັນທີ ${moment(periodEnd).format("DD/MM/YYYY")}`);
    const asked = body.amount === undefined || body.amount === null || body.amount === "" ? due.payable : round2(Number(body.amount));
    if (!(asked > 0)) throw new GlError("ຈຳນວນເງິນຕ້ອງຫຼາຍກວ່າ 0");
    if (asked > due.payable + 0.004) throw new GlError(`ຈ່າຍເກີນຍອດຄ້າງ (₭ ${due.payable.toLocaleString("en-US")})`);
    const amount = round2(Math.min(asked, due.payable));

    const accountId = Number(body.treasury_account_id);
    const account: any = Number.isInteger(accountId) ? await TreasuryAccount.findByPk(accountId, { transaction: t, lock: t.LOCK.UPDATE }) : null;
    if (!account || Number(account.status) !== 1) throw new GlError("ກະລຸນາເລືອກບັນຊີທີ່ຈ່າຍເງິນ (ໃຊ້ງານຢູ່)");
    const type: any = await TypeTreasury.findByPk(account.type_treasuryid, {
      include: [{ model: Currency, as: "currency", attributes: ["_id", "name"] }], transaction: t,
    });
    if (!isBaseCurrency(type?.currency)) throw new GlError("ນຳສົ່ງອາກອນໄດ້ສະເພາະບັນຊີສະກຸນກີບ (LAK)");
    if ((Number(account.balance_treasury) || 0) < amount) throw new GlError("ຍອດເງິນທີ່ໃຊ້ໄດ້ຂອງບັນຊີບໍ່ພໍ");

    const actorId = Number(actorOf(req)) || null;
    const vatInput = kind === VAT ? round2(due.vat_input ?? 0) : 0;
    const vatOutput = kind === VAT ? round2(vatInput + amount) : 0;
    const row = await TaxPayment.create({
      tax_kind: kind, period_end: periodEnd, pay_date: payDate, treasury_account_id: account._uuid, amount,
      vat_output: vatOutput, vat_input: vatInput,
      reference: String(body.reference ?? "").trim().slice(0, 100) || null,
      note: String(body.note ?? "").trim().slice(0, 255) || null,
      status: ACTIVE, created_by: actorId,
    }, { transaction: t });
    const number = `TAX-${moment(payDate).format("YYYYMM")}-${String(row._uuid).padStart(4, "0")}`;
    await row.update({ number }, { transaction: t });

    const description = `ນຳສົ່ງ${KINDS[kind].name} ຮອດ ${moment(periodEnd).format("DD/MM/YYYY")}${row.reference ? ` (${row.reference})` : ""}`;
    const cash = await treasurySide(account._uuid, payDate, t);
    const lines: DraftLine[] = kind === VAT
      ? [
        { accountId: due.account_id!, side: DEBIT, amount: vatOutput },
        // ຂາເຂົ້າຖືກຫັກອອກໝົດ — ຍອດຕິດລົບ (ມີ > ໜີ້) ກາຍເປັນຝັ່ງໜີ້ເອງ (buildLines ກັບຝັ່ງໃຫ້); 0 = ບໍ່ມີແຖວ
        { accountId: (await roleOrNull("VAT_INPUT", t))!, side: CREDIT, amount: vatInput },
      ]
      : [{ accountId: due.account_id!, side: DEBIT, amount }];
    lines.push({ accountId: cash.accountId, side: CREDIT, amount, currencyId: cash.currencyId, rate: cash.rate, treasuryAccountId: account._uuid });
    await postEntry({ date: payDate, sourceType: "TAX_PAYMENT", sourceId: row._uuid, reference: number, description, lines, actorId }, t);
    await moveBalance(account, {
      direction: MOVE_OUT, amount, source: "TAX_PAYMENT", sourceId: row._uuid, docNumber: number, date: payDate, description, actorId,
    }, t);
    await t.commit();
    res.status(200).json({ message: "Successfully recorded tax payment", data: row });
  } catch (error) {
    await t.rollback();
    fail(res, error, "Error recording tax payment");
  }
};

/** PUT /tax-payment/cancel/:id — ຍົກເລີກ: ກັບລາຍການບັນຊີ ແລະ ເງິນກັບເຂົ້າບັນຊີ */
export const cancelTaxPayment = async (req: Request<{ id: string }>, res: Response) => {
  const t = await sequelize.transaction();
  try {
    if (!(await guard(res))) return void (await t.rollback());
    const row: any = await TaxPayment.findByPk(Number(req.params.id), { transaction: t, lock: t.LOCK.UPDATE });
    if (!row || Number(row.status) !== ACTIVE) throw new GlError("ບໍ່ພົບລາຍການ ຫຼື ຍົກເລີກແລ້ວ");
    const actorId = Number(actorOf(req)) || null;
    await reverseSource("TAX_PAYMENT", row._uuid, t, actorId);
    const account: any = await TreasuryAccount.findByPk(row.treasury_account_id, { transaction: t, lock: t.LOCK.UPDATE });
    if (account) {
      await moveBalance(account, {
        direction: MOVE_IN, amount: Number(row.amount), source: "TAX_PAYMENT_CANCEL", sourceId: row._uuid, docNumber: row.number,
        description: `ຍົກເລີກນຳສົ່ງອາກອນ ${row.number ?? ""}`.trim(), actorId,
      }, t);
    }
    await row.update({ status: CANCELLED, updatedAt: new Date() }, { transaction: t });
    await t.commit();
    res.status(200).json({ message: "Successfully cancelled tax payment" });
  } catch (error) {
    await t.rollback();
    fail(res, error, "Error cancelling tax payment");
  }
};
