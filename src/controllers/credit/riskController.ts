import { Request, Response } from "express";
import { Op, Transaction } from "sequelize";
import moment from "moment";
import sequelize from "../../config/database";
import Loan, { LoanAccrual, LoanInstallment, LoanPayment } from "../../models/loan";
import JournalEntry from "../../models/journalEntry";
import JournalLine from "../../models/journalLine";
import {
  LoanClassRule, LoanClassification, LoanCollateral, LoanGuarantor, LoanPenalty, LoanRestructure, LoanWriteoff,
} from "../../models/loanCredit";
import { CREDIT, DEBIT, GlError, glReady, postEntry, rateOf, reverseSource, roleAccountId, round2, type DraftLine } from "../bansi/glCore";
import { actorOf, toDateOnly } from "../bansi/bansiHelpers";
import { todayLao } from "../bansi/journalHelpers";
import {
  LENT, baseCurrencyId, currencyDecimals, currencyMap, fail, installmentsOf, monthEnd, nextCode, parseMonth, paymentsOf,
  recordLoanPayment, summarize, writeInstallments,
} from "../bansi/loanController";
import { buildSchedule, decimalsOf, roundTo, termsError } from "../../utils/loanSchedule";
import { classOf, daysOverdueAt } from "../../utils/loanPenalty";
import { penaltyState, userNames } from "./creditPenalty";

/**
 * ລະບົບສິນເຊື່ອ ໄລຍະ 3: ຈັດຊັ້ນໜີ້ + ເງິນແຮທ້າຍເດືອນ, ຕັດໜີ້ສູນ / ເກັບຄືນ, ປັບໂຄງສ້າງໜີ້.
 * ເງິນແຮ: ຍອດທີ່ຄວນມີ (ຕົ້ນທຶນຄ້າງ × % ຂອງຊັ້ນ) ທຽບກັບຍອດຈິງຂອງບັນຊີ 1186 ໃນປຶ້ມ (ແຕ່ລະສະກຸນ) — ລົງສະເພາະສ່ວນຕ່າງ
 * (ໜີ້ 5250 / ມີ 1186 ເພີ່ມ, ກົງກັນຂ້າມເມື່ອຫຼຸດ) ສະນັ້ນການຕັດໜີ້ສູນ ແລະ ການປັບດ້ວຍມືຢູ່ນຳກັນໄດ້ສະເໝີ
 */

const ACTIVE = 1;
const CLOSE_PAID = 1;
const CLOSE_EARLY = 2;
const CLOSE_RESTRUCTURED = 3;
const CLOSE_WRITTEN_OFF = 4;
const num = (v: unknown) => Number(v) || 0;
const paidRows = (rows: LoanPayment[]) => rows.map((p) => ({ pay_date: String(p.pay_date), principal: num(p.principal), interest: num(p.interest) }));

const contractOf = async (id: number, t?: Transaction, lock = false) => {
  const loan = await Loan.findByPk(id, { transaction: t, ...(lock && t ? { lock: t.LOCK.UPDATE } : {}) });
  if (!loan || !loan.customer_id) throw new GlError("ບໍ່ພົບສັນຍາສິນເຊື່ອ");
  return loan;
};

/** ຍອດຂອງບັນຊີເງິນແຮ (1186) ໃນສະກຸນ currencyId ຮອດວັນທີ date — ຍອດຝັ່ງມີ (ບວກ) */
const allowanceBalance = async (accountId: number, currencyId: number, date: string, t?: Transaction) => {
  const base = await baseCurrencyId(t);
  const lines = await JournalLine.findAll({ where: { account_id: accountId }, attributes: ["entry_id", "currency_id", "amount_currency"], transaction: t });
  if (!lines.length) return 0;
  const entries = new Set((await JournalEntry.findAll({
    where: { _uuid: [...new Set(lines.map((l) => l.entry_id))], entry_date: { [Op.lte]: date } }, attributes: ["_uuid"], transaction: t,
  })).map((e: any) => Number(e._uuid)));
  return round2(-lines
    .filter((l) => entries.has(Number(l.entry_id)) && Number(l.currency_id ?? base) === Number(currencyId))
    .reduce((n, l) => n + num(l.amount_currency), 0));
};

/** ສະຖານະຂອງສັນຍາ ณ ວັນທີ: ຕົ້ນທຶນຄ້າງ, ຕົ້ນ / ດອກ ທີ່ກາຍກຳນົດ, ມື້ກາຍກຳນົດ */
const positionAt = (loan: Loan, stored: Awaited<ReturnType<typeof installmentsOf>>, payments: LoanPayment[], date: string) => {
  const upTo = payments.filter((p) => String(p.pay_date) <= date);
  const { rows, summary } = summarize(loan, stored, paymentsOf(upTo), moment(date).add(1, "day").format("YYYY-MM-DD"));
  const due = rows.filter((r) => !r.settled && r.due_date <= date);
  return {
    outstanding: summary.outstanding,
    overdue_principal: round2(due.reduce((n, r) => n + r.due_principal, 0)),
    overdue_interest: round2(due.reduce((n, r) => n + r.due_interest, 0)),
    days_overdue: daysOverdueAt(String(loan.start_date), stored, paidRows(upTo), date),
    rows,
  };
};

// ================= ຈັດຊັ້ນໜີ້ ແລະ ເງິນແຮ ທ້າຍເດືອນ

/**
 * ສັນຍາທີ່ຍັງຄ້າງ ณ ວັນທີ end ພ້ອມຊັ້ນ ແລະ ເງິນແຮ — ໃຊ້ຮ່ວມ: ຈັດຊັ້ນທ້າຍເດືອນ ແລະ ລາຍງານພອດໂຟລິໂອ
 */
export const portfolioAt = async (end: string, t?: Transaction) => {
  const [loans, rules, currencies] = await Promise.all([
    Loan.findAll({ where: { direction: LENT, customer_id: { [Op.ne]: null }, status: ACTIVE, start_date: { [Op.lte]: end } }, order: [["loan_code", "ASC"]], transaction: t }),
    LoanClassRule.findAll({ order: [["loan_class", "ASC"]], transaction: t }),
    currencyMap(),
  ]);
  const open = loans.filter((l) => !(l.closed_date && String(l.closed_date) <= end));
  if (!open.length || !rules.length) return { end, rows: [] as any[], rules };
  const ids = open.map((l) => l._uuid);
  const [installments, payments] = await Promise.all([
    LoanInstallment.findAll({ where: { loan_id: ids }, order: [["loan_id", "ASC"], ["no", "ASC"]], transaction: t }),
    LoanPayment.findAll({ where: { loan_id: ids, status: ACTIVE, pay_date: { [Op.lte]: end } }, transaction: t }),
  ]);
  const rows = open.map((loan) => {
    const stored = installments.filter((r) => r.loan_id === loan._uuid).map((r) => ({
      no: r.no, due_date: String(r.due_date), principal: num(r.principal), interest: num(r.interest), settled: Number(r.settled) === 1,
    }));
    const pos = positionAt(loan, stored, payments.filter((p) => p.loan_id === loan._uuid), end);
    const rule = classOf(rules, pos.days_overdue);
    const currency = currencies.get(Number(loan.currency_id));
    const decimals = decimalsOf(currency?.name);
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
      provision_amount: roundTo((pos.outstanding * Number(rule.provision_rate)) / 100, decimals),
    };
  }).filter((r) => r.outstanding > 0.004);
  return { end, rows, rules };
};

/** ສັນຍາທີ່ຍັງຄ້າງ ณ ທ້າຍເດືອນ */
const classifyMonth = (month: string, t?: Transaction) => portfolioAt(monthEnd(month), t);

/** ຍອດເງິນແຮ: ຄວນມີ vs ມີໃນປຶ້ມ ຕໍ່ສະກຸນ */
const allowanceDeltas = async (rows: any[], end: string, t?: Transaction) => {
  const accountId = await roleAccountId("LOAN_ALLOWANCE", t as Transaction);
  const byCurrency = new Map<number, { currency: any; target: number }>();
  for (const r of rows) {
    const cur = byCurrency.get(r.currency_id) ?? { currency: r.currency, target: 0 };
    cur.target = round2(cur.target + r.provision_amount);
    byCurrency.set(r.currency_id, cur);
  }
  const out = [];
  for (const [currencyId, v] of byCurrency) {
    const balance = await allowanceBalance(accountId, currencyId, end, t);
    out.push({ currency_id: currencyId, currency: v.currency, target: v.target, balance, delta: round2(v.target - balance) });
  }
  return { accountId, deltas: out };
};

const latestPeriod = async (t?: Transaction) => {
  const row: any = await LoanClassification.findOne({ order: [["period", "DESC"]], attributes: ["period"], transaction: t });
  return row ? String(row.period) : null;
};

/**
 * GET /credit/classification?period=YYYY-MM — ລົງແລ້ວ = ແຖວທີ່ບັນທຶກໄວ້; ຍັງບໍ່ລົງ = ຄິດໃໝ່ (ຕົວຢ່າງ).
 * ສະຫຼຸບຕາມຊັ້ນ, NPL ratio, ເງິນແຮທີ່ຄວນມີ / ມີແລ້ວ / ຕ້ອງລົງເພີ່ມ
 */
export const getClassification = async (req: Request, res: Response) => {
  try {
    if (!(await glReady())) throw new GlError("ຍັງບໍ່ໄດ້ເປີດໃຊ້ລະບົບບັນຊີຄູ່");
    const month = parseMonth(req.query.period ?? moment(todayLao()).subtract(1, "month").format("YYYY-MM"));
    const saved = await LoanClassification.findAll({ where: { period: month } });
    const latest = await latestPeriod();
    let rows: any[];
    let rules = await LoanClassRule.findAll({ order: [["loan_class", "ASC"]] });
    const end = monthEnd(month);
    const entry: any = saved.length ? await JournalEntry.findOne({ where: { source_type: "LOAN_PROVISION", source_id: month, reversal_of: null, reversed_by: null } }) : null;
    if (saved.length) {
      const loans = new Map((await Loan.findAll({ where: { _uuid: saved.map((s) => s.loan_id) } })).map((l) => [l._uuid, l]));
      const currencies = await currencyMap();
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
    } else {
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
        outstanding: round2(list.reduce((n, r) => n + r.outstanding, 0)), provision: round2(list.reduce((n, r) => n + r.provision_amount, 0)),
      };
    });
    const total = round2(rows.reduce((n, r) => n + r.outstanding, 0));
    const npl = round2(rows.filter((r) => r.is_npl).reduce((n, r) => n + r.outstanding, 0));
    res.status(200).json({
      data: {
        period: month, end, posted: !!entry, entry_number: entry?.entry_number ?? null, latest,
        can_post: !saved.length && (!latest || month > latest) && end < todayLao(),
        can_undo: saved.length > 0 && latest === month,
        rows: rows.sort((a, b) => b.days_overdue - a.days_overdue || String(a.loan_code).localeCompare(String(b.loan_code))),
        summary, allowance: deltas, total, npl, npl_ratio: total > 0 ? round2((npl / total) * 100) : 0,
      },
    });
  } catch (error) {
    fail(res, error, "Error getting classification");
  }
};

/** POST /credit/classification { period } — ບັນທຶກຜົນຈັດຊັ້ນ + ລົງບັນຊີເງິນແຮ (ສ່ວນຕ່າງ) ວັນທີທ້າຍເດືອນ */
export const postClassification = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    if (!(await glReady(t))) throw new GlError("ຍັງບໍ່ໄດ້ເປີດໃຊ້ລະບົບບັນຊີຄູ່");
    const month = parseMonth(req.body?.period);
    const end = monthEnd(month);
    if (end >= todayLao()) throw new GlError("ຈັດຊັ້ນໄດ້ຫຼັງສິ້ນເດືອນແລ້ວ");
    const latest = await latestPeriod(t);
    if (latest && month <= latest) throw new GlError(`ຈັດຊັ້ນເດືອນ ${latest} ແລ້ວ — ຍົກເລີກເດືອນຫຼ້າສຸດກ່ອນ ຈຶ່ງເຮັດຄືນໄດ້`);
    const { rows } = await classifyMonth(month, t);
    if (!rows.length) throw new GlError("ບໍ່ມີສັນຍາທີ່ຍັງຄ້າງ ณ ທ້າຍເດືອນນີ້");
    const { accountId, deltas } = await allowanceDeltas(rows, end, t);
    const actorId = Number(actorOf(req)) || null;
    let entryId: number | null = null;
    const lines: DraftLine[] = [];
    const expense = await roleAccountId("LOAN_PROVISION_EXPENSE", t);
    for (const d of deltas.filter((x) => Math.abs(x.delta) > 0.004)) {
      const rate = await rateOf(d.currency_id, end, t);
      const up = d.delta > 0;
      lines.push(
        { accountId: expense, side: up ? DEBIT : CREDIT, amount: Math.abs(d.delta), currencyId: d.currency_id, rate, description: `ເງິນແຮໜີ້ສົງໄສຈະສູນ ${month}` },
        { accountId, side: up ? CREDIT : DEBIT, amount: Math.abs(d.delta), currencyId: d.currency_id, rate, description: `ເງິນແຮໜີ້ສົງໄສຈະສູນ ${month}` },
      );
    }
    if (lines.length) {
      const entry: any = await postEntry({
        date: end, sourceType: "LOAN_PROVISION", sourceId: month, reference: `PRV-${month}`,
        description: `ຈັດຊັ້ນໜີ້ ແລະ ເງິນແຮ ${moment(month, "YYYY-MM").format("MM/YYYY")}`, lines, actorId,
      }, t);
      entryId = entry?._uuid ?? null;
    }
    await LoanClassification.bulkCreate(rows.map((r) => ({
      period: month, loan_id: r.loan_id, days_overdue: r.days_overdue, outstanding: r.outstanding,
      overdue_principal: r.overdue_principal, overdue_interest: r.overdue_interest, loan_class: r.loan_class,
      provision_rate: r.provision_rate, provision_amount: r.provision_amount, entry_id: entryId,
    })) as any, { transaction: t });
    for (const r of rows) await Loan.update({ loan_class: r.loan_class, days_overdue: r.days_overdue } as any, { where: { _uuid: r.loan_id }, transaction: t });
    await t.commit();
    res.status(200).json({ message: "Successfully posted classification", data: { period: month, contracts: rows.length, deltas } });
  } catch (error) {
    await t.rollback();
    fail(res, error, "Error posting classification");
  }
};

/** DELETE /credit/classification/:period — ຍົກເລີກເດືອນຫຼ້າສຸດ (ກັບລາຍການບັນຊີ, ລຶບຜົນ) */
export const undoClassification = async (req: Request<{ period: string }>, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const month = parseMonth(req.params.period);
    if ((await latestPeriod(t)) !== month) throw new GlError("ຍົກເລີກໄດ້ສະເພາະເດືອນຫຼ້າສຸດ");
    await reverseSource("LOAN_PROVISION", month, t, Number(actorOf(req)) || null);
    await LoanClassification.destroy({ where: { period: month }, transaction: t });
    // ຊັ້ນປັດຈຸບັນຂອງສັນຍາ = ເດືອນກ່ອນໜ້າ (ຖ້າມີ)
    const prev = await latestPeriod(t);
    const prevRows = prev ? await LoanClassification.findAll({ where: { period: prev }, transaction: t }) : [];
    await Loan.update({ loan_class: 1, days_overdue: 0 } as any, { where: { customer_id: { [Op.ne]: null } }, transaction: t });
    for (const r of prevRows) await Loan.update({ loan_class: r.loan_class, days_overdue: r.days_overdue } as any, { where: { _uuid: r.loan_id }, transaction: t });
    await t.commit();
    res.status(200).json({ message: "Successfully undid classification" });
  } catch (error) {
    await t.rollback();
    fail(res, error, "Error undoing classification");
  }
};

/** ເດືອນທີ່ຈັດຊັ້ນແລ້ວ (ໃຊ້ໃນລາຍການກວດປິດເດືອນ) */
export const provisionPosted = async (month: string) => (await LoanClassification.count({ where: { period: month } })) > 0;
/** ມີສັນຍາສິນເຊື່ອທີ່ຍັງຄ້າງ ณ ທ້າຍເດືອນ (ຕ້ອງຈັດຊັ້ນກ່ອນປິດເດືອນ) */
export const hasProvisionToPost = async (month: string) => (await classifyMonth(month)).rows.length > 0;

// ================= ຕັດໜີ້ສູນ / ເກັບຄືນ

/**
 * POST /credit/contract/:id/writeoff { date, reason } — ຕັດຕົ້ນທຶນທີ່ຄ້າງອອກ: ໜີ້ 1186 (ເງິນແຮທີ່ມີ) + 5250 (ສ່ວນທີ່ເກີນ)
 * / ມີ ບັນຊີເງິນໃຫ້ກູ້. ດອກເບ້ຍ ແລະ ຄ່າປັບທີ່ຄ້າງ ບັນທຶກໄວ້ຕິດຕາມ (ບໍ່ໄດ້ຢູ່ໃນປຶ້ມ). ສັນຍາປິດ (close_reason 4)
 */
export const writeOffContract = async (req: Request<{ id: string }>, res: Response) => {
  const t = await sequelize.transaction();
  try {
    if (!(await glReady(t))) throw new GlError("ຍັງບໍ່ໄດ້ເປີດໃຊ້ລະບົບບັນຊີຄູ່");
    const loan = await contractOf(Number(req.params.id), t, true);
    if (loan.closed_date) throw new GlError("ສັນຍານີ້ປິດແລ້ວ");
    const date = toDateOnly(req.body?.date) ?? todayLao();
    if (date > todayLao()) throw new GlError("ວັນທີຕ້ອງບໍ່ເກີນມື້ນີ້");
    const reason = String(req.body?.reason ?? "").trim().slice(0, 255);
    if (!reason) throw new GlError("ກະລຸນາບອກເຫດຜົນທີ່ຕັດໜີ້ສູນ");
    const payments = await LoanPayment.findAll({ where: { loan_id: loan._uuid, status: ACTIVE }, transaction: t });
    if (payments.some((p) => String(p.pay_date) > date)) throw new GlError("ມີການຊຳລະຫຼັງວັນທີນີ້ — ເລືອກວັນທີໃຫ້ບໍ່ກ່ອນການຊຳລະຄັ້ງຫຼ້າສຸດ");
    const stored = await installmentsOf(loan._uuid, t);
    const pos = positionAt(loan, stored, payments, date);
    if (!(pos.outstanding > 0)) throw new GlError("ບໍ່ມີຕົ້ນທຶນຄ້າງ");
    const decimals = await currencyDecimals(loan.currency_id, t);
    const ledger = await LoanPenalty.findAll({ where: { loan_id: loan._uuid }, transaction: t });
    const penalty = penaltyState(loan, stored, payments, ledger, date, decimals).due;
    const allowanceId = await roleAccountId("LOAN_ALLOWANCE", t);
    const available = Math.max(0, await allowanceBalance(allowanceId, Number(loan.currency_id), date, t));
    const fromAllowance = roundTo(Math.min(pos.outstanding, available), decimals);
    const actorId = Number(actorOf(req)) || null;
    const row = await LoanWriteoff.create({
      loan_id: loan._uuid, writeoff_date: date, principal: pos.outstanding, interest: pos.overdue_interest, penalty,
      reason, approved_by: actorId, status: ACTIVE, created_by: actorId,
    } as any, { transaction: t });
    const rate = await rateOf(loan.currency_id, date, t);
    const common = { currencyId: loan.currency_id, rate };
    const label = `${loan.loan_code} ${loan.counterparty}`;
    const entry: any = await postEntry({
      date, sourceType: "LOAN_WRITEOFF", sourceId: row._uuid, reference: `WO-${loan.loan_code}`, description: `ຕັດໜີ້ສູນ ${label} — ${reason}`, actorId,
      lines: [
        { ...common, accountId: allowanceId, side: DEBIT, amount: fromAllowance, description: `${label} · ໃຊ້ເງິນແຮ` },
        { ...common, accountId: await roleAccountId("LOAN_PROVISION_EXPENSE", t), side: DEBIT, amount: roundTo(pos.outstanding - fromAllowance, decimals), description: `${label} · ສ່ວນທີ່ເກີນເງິນແຮ` },
        { ...common, accountId: loan.loan_account_id, side: CREDIT, amount: pos.outstanding, description: `${label} · ຕັດຕົ້ນທຶນ` },
      ],
    }, t);
    await row.update({ entry_id: entry?._uuid ?? null }, { transaction: t });
    const npl: any = await LoanClassRule.findOne({ order: [["loan_class", "DESC"]], transaction: t });
    await loan.update({ closed_date: date, close_reason: CLOSE_WRITTEN_OFF, loan_class: npl?.loan_class ?? 5, days_overdue: pos.days_overdue } as any, { transaction: t });
    await t.commit();
    res.status(200).json({ message: "Successfully wrote off", data: { _uuid: row._uuid, principal: pos.outstanding, from_allowance: fromAllowance } });
  } catch (error) {
    await t.rollback();
    fail(res, error, "Error writing off contract");
  }
};

/** DELETE /credit/writeoff/:id — ຍົກເລີກການຕັດໜີ້ສູນ (ຍັງບໍ່ມີການເກັບຄືນ) */
export const undoWriteOff = async (req: Request<{ id: string }>, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const row = await LoanWriteoff.findByPk(Number(req.params.id), { transaction: t, lock: t.LOCK.UPDATE });
    if (!row || Number(row.status) !== ACTIVE) throw new GlError("ບໍ່ພົບການຕັດໜີ້ສູນ");
    if (num(row.recovered_amount) > 0) throw new GlError("ມີການເກັບຄືນແລ້ວ — ຍົກເລີກການເກັບຄືນກ່ອນ");
    const loan = await contractOf(row.loan_id, t, true);
    await reverseSource("LOAN_WRITEOFF", row._uuid, t, Number(actorOf(req)) || null);
    await row.update({ status: 2, updatedAt: new Date() } as any, { transaction: t });
    await loan.update({ closed_date: null, close_reason: null } as any, { transaction: t });
    await t.commit();
    res.status(200).json({ message: "Successfully undid write-off" });
  } catch (error) {
    await t.rollback();
    fail(res, error, "Error undoing write-off");
  }
};

/** POST /credit/contract/:id/recover { pay_date, treasury_account_id, amount, reference?, note? } — ເກັບຄືນໜີ້ສູນ → 4250 */
export const recoverContract = async (req: Request<{ id: string }>, res: Response) => {
  const t = await sequelize.transaction();
  try {
    if (!(await glReady(t))) throw new GlError("ຍັງບໍ່ໄດ້ເປີດໃຊ້ລະບົບບັນຊີຄູ່");
    const loan = await contractOf(Number(req.params.id), t, true);
    const row = await LoanWriteoff.findOne({ where: { loan_id: loan._uuid, status: ACTIVE }, transaction: t, lock: t.LOCK.UPDATE });
    if (!row || Number(loan.close_reason) !== CLOSE_WRITTEN_OFF) throw new GlError("ສັນຍານີ້ບໍ່ໄດ້ຕັດເປັນໜີ້ສູນ");
    const date = toDateOnly(req.body?.pay_date);
    if (!date) throw new GlError("ກະລຸນາເລືອກວັນທີ");
    if (date < String(row.writeoff_date)) throw new GlError("ວັນທີຕ້ອງບໍ່ກ່ອນວັນທີຕັດໜີ້ສູນ");
    const decimals = await currencyDecimals(loan.currency_id, t);
    const amount = roundTo(num(req.body?.amount), decimals);
    if (!(amount > 0)) throw new GlError("ກະລຸນາປ້ອນຈຳນວນເງິນ");
    const left = round2(num(row.principal) + num(row.interest) + num(row.penalty) - num(row.recovered_amount));
    if (amount > left + 0.004) throw new GlError(`ເກີນຍອດທີ່ຕັດໄປ (ຍັງເຫຼືອ ${left.toLocaleString("en-US")})`);
    // ຕົ້ນທຶນກ່ອນ (ເທົ່າທີ່ຍັງຄ້າງໃນສັນຍາ) ສ່ວນເກີນ = ດອກເບ້ຍ / ຄ່າປັບ — ທັງໝົດເຂົ້າ 4250
    const payments = await LoanPayment.findAll({ where: { loan_id: loan._uuid, status: ACTIVE }, transaction: t });
    const { summary } = summarize(loan, await installmentsOf(loan._uuid, t), paymentsOf(payments));
    const principal = roundTo(Math.min(amount, summary.outstanding), decimals);
    const { row: payment, number } = await recordLoanPayment(loan, {
      date, treasuryId: Number(req.body?.treasury_account_id), principal, interest: roundTo(amount - principal, decimals), fee: 0,
      recovery: true, reference: req.body?.reference, note: req.body?.note ?? "ເກັບຄືນໜີ້ສູນ",
    }, t, Number(actorOf(req)) || null);
    await row.update({ recovered_amount: round2(num(row.recovered_amount) + amount), updatedAt: new Date() } as any, { transaction: t });
    await t.commit();
    res.status(200).json({ message: "Successfully recorded recovery", data: { _uuid: payment._uuid, number } });
  } catch (error) {
    await t.rollback();
    fail(res, error, "Error recording recovery");
  }
};

// ================= ປັບໂຄງສ້າງໜີ້

/**
 * POST /credit/contract/:id/restructure { date, reason, annual_rate, term, first_due_date, method?, capitalize_interest?, note? }
 * ປິດສັນຍາເດີມ (close_reason 3) ແລະ ອອກສັນຍາໃໝ່ = ຕົ້ນທຶນຄ້າງ (+ ດອກເບ້ຍທີ່ກາຍກຳນົດ ຖ້າເລືອກລວມ) ດ້ວຍເງື່ອນໄຂໃໝ່;
 * ບໍ່ມີເງິນເຂົ້າ-ອອກ: ໜີ້ ເງິນໃຫ້ກູ້ (ສັນຍາໃໝ່) / ມີ ເງິນໃຫ້ກູ້ (ສັນຍາເດີມ) + ມີ ດອກເບ້ຍຮັບ (ທີ່ລວມເຂົ້າຕົ້ນທຶນ).
 * ຄ່າປັບຕ້ອງຮັບ ຫຼື ຍົກເວັ້ນກ່ອນ; ຫຼັກຊັບ ແລະ ຜູ້ຄ້ຳ ຍ້າຍໄປສັນຍາໃໝ່
 */
export const restructureContract = async (req: Request<{ id: string }>, res: Response) => {
  const t = await sequelize.transaction();
  try {
    if (!(await glReady(t))) throw new GlError("ຍັງບໍ່ໄດ້ເປີດໃຊ້ລະບົບບັນຊີຄູ່");
    const old = await contractOf(Number(req.params.id), t, true);
    if (old.closed_date) throw new GlError("ສັນຍານີ້ປິດແລ້ວ");
    const body = req.body ?? {};
    const date = toDateOnly(body.date) ?? todayLao();
    if (date > todayLao()) throw new GlError("ວັນທີຕ້ອງບໍ່ເກີນມື້ນີ້");
    const reason = String(body.reason ?? "").trim().slice(0, 255);
    if (!reason) throw new GlError("ກະລຸນາບອກເຫດຜົນທີ່ປັບໂຄງສ້າງ");
    const payments = await LoanPayment.findAll({ where: { loan_id: old._uuid, status: ACTIVE }, transaction: t });
    if (payments.some((p) => String(p.pay_date) > date)) throw new GlError("ມີການຊຳລະຫຼັງວັນທີນີ້ — ເລືອກວັນທີໃຫ້ບໍ່ກ່ອນການຊຳລະຄັ້ງຫຼ້າສຸດ");
    const stored = await installmentsOf(old._uuid, t);
    const decimals = await currencyDecimals(old.currency_id, t);
    const ledger = await LoanPenalty.findAll({ where: { loan_id: old._uuid }, transaction: t });
    const penaltyDue = penaltyState(old, stored, payments, ledger, date, decimals).due;
    if (penaltyDue > 0) throw new GlError(`ຍັງມີຄ່າປັບຄ້າງ ${penaltyDue.toLocaleString("en-US")} — ຮັບຊຳລະ ຫຼື ຍົກເວັ້ນກ່ອນ`);
    const pos = positionAt(old, stored, payments, date);
    if (!(pos.outstanding > 0)) throw new GlError("ບໍ່ມີຕົ້ນທຶນຄ້າງ");
    const capitalized = body.capitalize_interest ? roundTo(pos.overdue_interest, decimals) : 0;
    const principal = roundTo(pos.outstanding + capitalized, decimals);
    const terms = {
      principal, annual_rate: Number(body.annual_rate), method: Number(body.method) || Number(old.method), day_basis: Number(old.day_basis),
      frequency_months: Number(old.frequency_months) || 1, frequency_days: Number(old.frequency_days) || null, term: Math.round(Number(body.term) || 0),
      start_date: date, first_due_date: toDateOnly(body.first_due_date) ?? "",
    };
    const error = termsError(terms);
    if (error) throw new GlError(error);
    buildSchedule(terms, decimals);
    const actorId = Number(actorOf(req)) || null;
    const fresh = await Loan.create({
      loan_code: await nextCode(t, "CR-", 6), direction: LENT, counterparty: old.counterparty,
      customer_id: old.customer_id, product_id: old.product_id, application_id: null, officer_id: old.officer_id,
      contract_no: old.contract_no, currency_id: old.currency_id, principal, annual_rate: terms.annual_rate, method: terms.method,
      day_basis: terms.day_basis, frequency_months: terms.frequency_months, frequency_days: terms.frequency_days, term: terms.term,
      start_date: date, first_due_date: terms.first_due_date, start_mode: 1, treasury_account_id: null,
      loan_account_id: old.loan_account_id, interest_account_id: old.interest_account_id,
      purpose: `ປັບໂຄງສ້າງຈາກ ${old.loan_code}`, note: String(body.note ?? "").trim().slice(0, 255) || null,
      status: ACTIVE, created_by: actorId, upfront_fee: 0,
      penalty_rate: Number(old.penalty_rate), penalty_base: old.penalty_base, grace_days: old.grace_days,
      loan_class: old.loan_class, days_overdue: 0,
    } as any, { transaction: t });
    await writeInstallments(fresh, t);
    const row = await LoanRestructure.create({
      loan_id: old._uuid, new_loan_id: fresh._uuid, restructure_date: date, reason,
      old_outstanding: pos.outstanding, old_rate: Number(old.annual_rate), old_term: old.term, capitalized_interest: capitalized,
      new_rate: terms.annual_rate, new_term: terms.term, new_first_due_date: terms.first_due_date,
      approved_by: actorId, note: fresh.note, status: ACTIVE, created_by: actorId,
    } as any, { transaction: t });
    const rate = await rateOf(old.currency_id, date, t);
    const common = { currencyId: old.currency_id, rate };
    const lines: DraftLine[] = [
      { ...common, accountId: fresh.loan_account_id, side: DEBIT, amount: principal, description: `${fresh.loan_code} · ຕົ້ນທຶນສັນຍາໃໝ່` },
      { ...common, accountId: old.loan_account_id, side: CREDIT, amount: pos.outstanding, description: `${old.loan_code} · ປິດຕົ້ນທຶນສັນຍາເດີມ` },
    ];
    if (capitalized > 0) {
      lines.push({ ...common, accountId: old.interest_account_id ?? (await roleAccountId("INTEREST_INCOME", t)), side: CREDIT, amount: capitalized, description: `${old.loan_code} · ດອກເບ້ຍລວມເຂົ້າຕົ້ນທຶນ` });
    }
    await postEntry({
      date, sourceType: "LOAN_RESTRUCTURE", sourceId: row._uuid, reference: `RS-${old.loan_code}`,
      description: `ປັບໂຄງສ້າງໜີ້ ${old.loan_code} → ${fresh.loan_code} ${old.counterparty} — ${reason}`, lines, actorId,
    }, t);
    await LoanCollateral.update({ loan_id: fresh._uuid }, { where: { loan_id: old._uuid }, transaction: t });
    await LoanGuarantor.update({ loan_id: fresh._uuid }, { where: { loan_id: old._uuid }, transaction: t });
    await old.update({ closed_date: date, close_reason: CLOSE_RESTRUCTURED } as any, { transaction: t });
    await t.commit();
    res.status(200).json({ message: "Successfully restructured", data: { _uuid: row._uuid, loan_id: fresh._uuid, loan_code: fresh.loan_code, principal } });
  } catch (error) {
    await t.rollback();
    fail(res, error, "Error restructuring contract");
  }
};

/** DELETE /credit/restructure/:id — ຍົກເລີກການປັບໂຄງສ້າງ (ສັນຍາໃໝ່ຍັງບໍ່ມີການຊຳລະ / ດອກເບ້ຍຄ້າງ) */
export const undoRestructure = async (req: Request<{ id: string }>, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const row = await LoanRestructure.findByPk(Number(req.params.id), { transaction: t, lock: t.LOCK.UPDATE });
    if (!row || Number(row.status) !== ACTIVE) throw new GlError("ບໍ່ພົບການປັບໂຄງສ້າງ");
    const fresh = row.new_loan_id ? await Loan.findByPk(row.new_loan_id, { transaction: t, lock: t.LOCK.UPDATE }) : null;
    if (fresh) {
      if (await LoanPayment.count({ where: { loan_id: fresh._uuid, status: ACTIVE }, transaction: t })) throw new GlError(`${fresh.loan_code} ມີການຊຳລະແລ້ວ — ຍົກເລີກການຊຳລະກ່ອນ`);
      if (await LoanAccrual.count({ where: { loan_id: fresh._uuid }, transaction: t })) throw new GlError(`ຄິດດອກເບ້ຍຄ້າງຂອງ ${fresh.loan_code} ແລ້ວ — ຍົກເລີກເດືອນນັ້ນກ່ອນ`);
      if (await LoanRestructure.count({ where: { loan_id: fresh._uuid, status: ACTIVE }, transaction: t })) throw new GlError(`${fresh.loan_code} ຖືກປັບໂຄງສ້າງຕໍ່ແລ້ວ`);
    }
    const old = await contractOf(row.loan_id, t, true);
    await reverseSource("LOAN_RESTRUCTURE", row._uuid, t, Number(actorOf(req)) || null);
    if (fresh) {
      await LoanCollateral.update({ loan_id: old._uuid }, { where: { loan_id: fresh._uuid }, transaction: t });
      await LoanGuarantor.update({ loan_id: old._uuid }, { where: { loan_id: fresh._uuid }, transaction: t });
      await LoanInstallment.destroy({ where: { loan_id: fresh._uuid }, transaction: t });
      await LoanPenalty.destroy({ where: { loan_id: fresh._uuid }, transaction: t });
      await LoanPayment.destroy({ where: { loan_id: fresh._uuid }, transaction: t });
      await fresh.destroy({ transaction: t });
    }
    await old.update({ closed_date: null, close_reason: null } as any, { transaction: t });
    await row.update({ status: 2, updatedAt: new Date() } as any, { transaction: t });
    await t.commit();
    res.status(200).json({ message: "Successfully undid restructure" });
  } catch (error) {
    await t.rollback();
    fail(res, error, "Error undoing restructure");
  }
};

/** ຂໍ້ມູນການປິດພິເສດ ຂອງສັນຍາ (ລາຍລະອຽດສັນຍາ): ຕັດໜີ້ສູນ, ປັບໂຄງສ້າງ (ຈາກ / ເປັນ) */
export const closureOf = async (loan: Loan) => {
  const [writeoff, from, into] = await Promise.all([
    LoanWriteoff.findOne({ where: { loan_id: loan._uuid, status: ACTIVE } }),
    LoanRestructure.findOne({ where: { new_loan_id: loan._uuid, status: ACTIVE } }),
    LoanRestructure.findOne({ where: { loan_id: loan._uuid, status: ACTIVE } }),
  ]);
  const codes = new Map((await Loan.findAll({
    where: { _uuid: [from?.loan_id, into?.new_loan_id].filter(Boolean) as number[] }, attributes: ["_uuid", "loan_code"],
  })).map((l) => [l._uuid, l.loan_code]));
  const names = await userNames([writeoff?.approved_by, from?.approved_by, into?.approved_by]);
  const present = (r: LoanRestructure | null, otherId: number | null | undefined) => r && {
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

export { CLOSE_EARLY, CLOSE_PAID, CLOSE_RESTRUCTURED, CLOSE_WRITTEN_OFF };
