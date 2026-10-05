import { Request, Response } from "express";
import { Op, QueryTypes } from "sequelize";
import JournalEntry from "../../models/journalEntry";
import JournalLine from "../../models/journalLine";
import ChartAccount from "../../models/chartAccount";
import Users from "../../models/userModel";
import { actorOf, decodeId, sendError, toDateOnly } from "./bansiHelpers";
import { todayLao } from "./journalHelpers";
import { CREDIT, DEBIT, DraftLine, GlError, glReady, postEntry, rateOf, reverseEntry, round2 } from "./glCore";

/**
 * ສະໝຸດບັນຊີ (tbl_journal_entry + tbl_journal_line): ລາຍການໃບບັນທຶກ, ບັນທຶກທົ່ວໄປ (MANUAL),
 * ກັບລາຍການ ແລະ ຍອດຕາມບັນຊີ (ງົບທົດລອງ / ໃບສະຫຼຸບຊັບສົມບັດ / ປຶ້ມບັນຊີໃຫຍ່)
 */

const notReady = (res: Response) =>
  res.status(503).json({ message: "ຍັງບໍ່ໄດ້ສ້າງຕາຕະລາງບັນຊີຄູ່ — ແລ່ນ sql/create_gl_accounting.sql ກ່ອນ", notReady: true });

const fail = (res: Response, error: unknown, fallback: string) => {
  if (error instanceof GlError) {
    res.status(400).json({ message: error.message });
    return;
  }
  sendError(res, error, fallback);
};

/** ຊ່ວງວັນທີຈາກ body — ບໍ່ສົ່ງ end = ມື້ນີ້ */
const rangeOf = (body: any) => ({
  start: toDateOnly(body?.start_date),
  end: toDateOnly(body?.end_date) ?? todayLao(),
});

const lineInclude = {
  model: JournalLine,
  as: "lines",
  include: [{ model: ChartAccount, as: "account", attributes: ["_uuid", "account_code", "name_la", "name_en", "name_cn", "account_group"] }],
};

/**
 * POST /journal-entry/fetch { start_date?, end_date?, source_type?, account_id?, keyword? } —
 * ໃບບັນທຶກຕາມວັນທີ (ໃໝ່ສຸດກ່ອນ) ພ້ອມແຖວ ແລະ ບັນຊີ
 */
export const getJournalEntries = async (req: Request, res: Response) => {
  try {
    if (!(await glReady())) return notReady(res);
    const body = req.body || {};
    const { start, end } = rangeOf(body);
    const where: any = { entry_date: { ...(start ? { [Op.gte]: start } : {}), [Op.lte]: end } };
    if (body.source_type) where.source_type = String(body.source_type);
    const keyword = String(body.keyword ?? "").trim();
    if (keyword) {
      where[Op.or] = [
        { entry_number: { [Op.like]: `%${keyword}%` } },
        { reference: { [Op.like]: `%${keyword}%` } },
        { description: { [Op.like]: `%${keyword}%` } },
      ];
    }
    if (body.account_id) {
      const ids = await JournalLine.findAll({ where: { account_id: Number(body.account_id) }, attributes: ["entry_id"], raw: true });
      where._uuid = [...new Set(ids.map((r: any) => Number(r.entry_id)))];
    }
    const rows = await JournalEntry.findAll({
      where,
      order: [["entry_date", "DESC"], ["_uuid", "DESC"]],
      include: [lineInclude],
    });
    const userIds = [...new Set(rows.map((r: any) => Number(r.created_by)).filter(Boolean))];
    const users: any[] = userIds.length ? await Users.findAll({ where: { user_uuid: userIds }, attributes: ["user_uuid", "user_name"] }) : [];
    const data = rows.map((r: any) => {
      const plain = r.get({ plain: true });
      plain.lines.sort((a: any, b: any) => a.line_no - b.line_no);
      return { ...plain, user: users.find((u) => Number(u.user_uuid) === Number(r.created_by)) ?? null };
    });
    res.status(200).json({ data, total: data.length });
  } catch (error) {
    sendError(res, error, "Error getting journal entries");
  }
};

/**
 * POST /journal-entry/create — ບັນທຶກທົ່ວໄປ
 * { entry_date, reference?, description?, currency_id?, exchange_rate?, lines: [{ account_id, debit, credit, description? }] }
 * ທຸກແຖວເປັນສະກຸນດຽວກັນ (currency_id; ບໍ່ສົ່ງ = LAK); ແຕ່ລະແຖວມີໜີ້ ຫຼື ມີ ຢ່າງໃດຢ່າງໜຶ່ງ; ໜີ້ລວມ = ມີລວມ
 */
export const createJournalEntry = async (req: Request, res: Response) => {
  const t = await JournalEntry.sequelize!.transaction();
  try {
    if (!(await glReady(t))) {
      await t.rollback();
      return notReady(res);
    }
    const body = req.body || {};
    const date = toDateOnly(body.entry_date) ?? todayLao();
    if (date > todayLao()) throw new GlError("ວັນທີຕ້ອງບໍ່ເກີນມື້ນີ້");
    const items: any[] = Array.isArray(body.lines) ? body.lines : [];
    const currencyId = body.currency_id ? Number(body.currency_id) : null;
    const rate = Number(body.exchange_rate) > 0 ? Number(body.exchange_rate) : await rateOf(currencyId, date, t);

    const lines: DraftLine[] = [];
    let debit = 0;
    let credit = 0;
    items.forEach((item, i) => {
      const dr = round2(Number(item?.debit) || 0);
      const cr = round2(Number(item?.credit) || 0);
      if (!dr && !cr) return;
      if (dr < 0 || cr < 0) throw new GlError(`ແຖວ ${i + 1}: ຈຳນວນຕ້ອງບໍ່ຕິດລົບ`);
      if (dr && cr) throw new GlError(`ແຖວ ${i + 1}: ໃສ່ໄດ້ຝັ່ງໜີ້ ຫຼື ຝັ່ງມີ ຢ່າງໃດຢ່າງໜຶ່ງ`);
      if (!item?.account_id) throw new GlError(`ແຖວ ${i + 1}: ກະລຸນາເລືອກບັນຊີ`);
      debit += dr;
      credit += cr;
      lines.push({
        accountId: Number(item.account_id),
        side: dr ? DEBIT : CREDIT,
        amount: dr || cr,
        currencyId,
        rate,
        description: String(item?.description ?? "").trim() || null,
      });
    });
    if (round2(debit) !== round2(credit)) throw new GlError("ຍອດໜີ້ ແລະ ຍອດມີ ບໍ່ເທົ່າກັນ");

    const entry = await postEntry({
      date,
      sourceType: "MANUAL",
      reference: String(body.reference ?? "").trim() || null,
      description: String(body.description ?? "").trim() || null,
      lines,
      actorId: Number(actorOf(req)) || null,
    }, t);
    await t.commit();
    res.status(200).json({ message: "Successfully created journal entry", data: entry });
  } catch (error) {
    await t.rollback();
    fail(res, error, "Error creating journal entry");
  }
};

/**
 * PUT /journal-entry/reverse/:id { date?, description? } — ກັບລາຍການບັນທຶກທົ່ວໄປ.
 * ໃບທີ່ລົງຈາກເອກະສານ (ລາຍຮັບ, ລາຍຈ່າຍ …) ຕ້ອງຍົກເລີກທີ່ເອກະສານ
 */
export const reverseJournalEntry = async (req: Request<{ id: string }>, res: Response) => {
  const t = await JournalEntry.sequelize!.transaction();
  try {
    if (!(await glReady(t))) {
      await t.rollback();
      return notReady(res);
    }
    const entry: any = await JournalEntry.findByPk(decodeId(req), { transaction: t, lock: t.LOCK.UPDATE });
    if (!entry) throw new GlError("ບໍ່ພົບໃບບັນທຶກ");
    if (entry.source_type !== "MANUAL") throw new GlError("ໃບນີ້ລົງຈາກເອກະສານ — ຍົກເລີກທີ່ເອກະສານຕົ້ນທາງແທນ");
    const date = req.body?.date ? toDateOnly(req.body.date) : null;
    if (req.body?.date && !date) throw new GlError("ວັນທີບໍ່ຖືກຕ້ອງ");
    if (date && date > todayLao()) throw new GlError("ວັນທີຕ້ອງບໍ່ເກີນມື້ນີ້");
    const reversal = await reverseEntry(entry, t, {
      date: date ?? undefined,
      actorId: Number(actorOf(req)) || null,
      description: String(req.body?.description ?? "").trim() || undefined,
    });
    await t.commit();
    res.status(200).json({ message: "Successfully reversed journal entry", data: reversal });
  } catch (error) {
    await t.rollback();
    fail(res, error, "Error reversing journal entry");
  }
};

/**
 * POST /gl/balances { start_date?, end_date? } — ຍອດຕໍ່ບັນຊີ (LAK):
 * opening = ໜີ້ − ມີ ກ່ອນ start_date, debit/credit = ໃນຊ່ວງ, closing = opening + debit − credit.
 * ບໍ່ສົ່ງ start_date = ທຸກຢ່າງເຖິງ end_date ຢູ່ໃນຊ່ວງ (ໃຊ້ກັບໃບສະຫຼຸບຊັບສົມບັດ)
 */
export const getGlBalances = async (req: Request, res: Response) => {
  try {
    if (!(await glReady())) return notReady(res);
    const { start, end } = rangeOf(req.body);
    const rows = await JournalEntry.sequelize!.query<{ account_id: number; opening: string; debit: string; credit: string }>(
      `SELECT l.account_id,
        SUM(CASE WHEN :start IS NOT NULL AND e.entry_date < :start THEN l.debit - l.credit ELSE 0 END) AS opening,
        SUM(CASE WHEN :start IS NULL OR e.entry_date >= :start THEN l.debit ELSE 0 END) AS debit,
        SUM(CASE WHEN :start IS NULL OR e.entry_date >= :start THEN l.credit ELSE 0 END) AS credit
       FROM tbl_journal_line l
       JOIN tbl_journal_entry e ON e._uuid = l.entry_id
       WHERE e.entry_date <= :end
       GROUP BY l.account_id`,
      { type: QueryTypes.SELECT, replacements: { start, end } }
    );
    const data = rows.map((r) => {
      const opening = round2(Number(r.opening));
      const debit = round2(Number(r.debit));
      const credit = round2(Number(r.credit));
      return { account_id: Number(r.account_id), opening, debit, credit, closing: round2(opening + debit - credit) };
    });
    res.status(200).json({ data, start_date: start, end_date: end });
  } catch (error) {
    sendError(res, error, "Error getting GL balances");
  }
};

/**
 * POST /gl/ledger { account_id, start_date?, end_date? } — ປຶ້ມບັນຊີໃຫຍ່ຂອງບັນຊີດຽວ:
 * ຍອດຍົກມາ (ໜີ້ − ມີ ກ່ອນ start_date) + ທຸກແຖວໃນຊ່ວງ ລຽງຕາມວັນທີ ພ້ອມຍອດສະສົມ
 */
export const getGlLedger = async (req: Request, res: Response) => {
  try {
    if (!(await glReady())) return notReady(res);
    const accountId = Number(req.body?.account_id);
    if (!accountId) throw new GlError("ກະລຸນາເລືອກບັນຊີ");
    const { start, end } = rangeOf(req.body);
    const [opening] = await JournalEntry.sequelize!.query<{ balance: string }>(
      `SELECT COALESCE(SUM(l.debit - l.credit), 0) AS balance
       FROM tbl_journal_line l JOIN tbl_journal_entry e ON e._uuid = l.entry_id
       WHERE l.account_id = :accountId AND :start IS NOT NULL AND e.entry_date < :start`,
      { type: QueryTypes.SELECT, replacements: { accountId, start } }
    );
    const lines = await JournalEntry.sequelize!.query<any>(
      `SELECT l._uuid, l.line_no, l.description AS line_description, l.debit, l.credit, l.currency_id,
              l.amount_currency, l.exchange_rate, l.treasury_account_id,
              e._uuid AS entry_id, e.entry_number, e.entry_date, e.source_type, e.source_id, e.reference,
              e.description, e.reversal_of, e.reversed_by
       FROM tbl_journal_line l JOIN tbl_journal_entry e ON e._uuid = l.entry_id
       WHERE l.account_id = :accountId AND e.entry_date <= :end AND (:start IS NULL OR e.entry_date >= :start)
       ORDER BY e.entry_date ASC, e._uuid ASC, l.line_no ASC`,
      { type: QueryTypes.SELECT, replacements: { accountId, start, end } }
    );
    let running = round2(Number(opening?.balance));
    const data = lines.map((l: any) => {
      running = round2(running + Number(l.debit) - Number(l.credit));
      return { ...l, debit: Number(l.debit), credit: Number(l.credit), amount_currency: Number(l.amount_currency), balance: running };
    });
    res.status(200).json({ opening: round2(Number(opening?.balance)), closing: running, data, start_date: start, end_date: end });
  } catch (error) {
    fail(res, error, "Error getting ledger");
  }
};
