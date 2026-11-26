import { Request, Response } from "express";
import { Op, Transaction } from "sequelize";
import moment from "moment";
import sequelize from "../../config/database";
import Loan, { LoanPayment } from "../../models/loan";
import { LoanCollection, LoanNotice, LoanPenalty, LoanProduct } from "../../models/loanCredit";
import { GlError, glReady, round2 } from "../bansi/glCore";
import { actorOf, toDateOnly } from "../bansi/bansiHelpers";
import { todayLao } from "../bansi/journalHelpers";
import { currencyDecimals, fail, installmentsOf, paymentsOf, recordLoanPayment, summarize } from "../bansi/loanController";
import { pnlOf } from "../bansi/taxReportController";
import { roundTo } from "../../utils/loanSchedule";
import { spreadOldestFirst, splitAmount } from "../../utils/loanPenalty";
import { AGING, PENALTY_PAID, PENALTY_WAIVED, penaltyState } from "./creditPenalty";
import { contractsWithSummary, userNames } from "./creditController";

/**
 * ລະບົບສິນເຊື່ອ ໄລຍະ 2: ຮັບຊຳລະ (ຄ່າປັບ → ດອກເບ້ຍ → ຕົ້ນທຶນ, ປິດບັນຊີກ່ອນກຳນົດ), ຍົກເວັ້ນຄ່າປັບ, ລາຍການຕິດຕາມໜີ້ + ອາຍຸໜີ້,
 * ບັນທຶກການຕິດຕາມ ແລະ ພາບລວມ (ປ່ອຍກູ້, ລາຍຮັບ, ກຳໄລ, PAR)
 */

const ACTIVE = 1;
const PAY_REGULAR = 1;
const PAY_PREPAY = 2;
const PAY_OFF = 3;
const num = (v: unknown) => Number(v) || 0;
const daysBetween = (a: string, b: string) => Math.max(0, moment(b).diff(moment(a), "days"));

const contractOf = async (id: number, t?: Transaction, lock = false) => {
  const loan = await Loan.findByPk(id, { transaction: t, ...(lock && t ? { lock: t.LOCK.UPDATE } : {}) });
  if (!loan || !loan.customer_id) throw new GlError("ບໍ່ພົບສັນຍາສິນເຊື່ອ");
  return loan;
};

/**
 * ຍອດທີ່ຕ້ອງຈ່າຍ ณ ວັນທີ date: ຄ່າປັບຄ້າງ, ງວດທີ່ຍັງຄ້າງ, ງວດຕໍ່ໄປ, ຄົບກຳນົດແລ້ວທັງໝົດ ແລະ ປິດບັນຊີ
 * (ດອກເບ້ຍຮອດມື້ນັ້ນ + ຕົ້ນທຶນທັງໝົດ + ຄ່າທຳນຽມປິດກ່ອນກຳນົດ % ຂອງຕົ້ນທຶນທີ່ຈ່າຍກ່ອນກຳນົດ)
 */
const quoteOf = async (loan: Loan, date: string, t?: Transaction) => {
  const decimals = await currencyDecimals(loan.currency_id, t);
  const stored = await installmentsOf(loan._uuid, t);
  const active = (await LoanPayment.findAll({ where: { loan_id: loan._uuid, status: ACTIVE }, transaction: t })).filter((p) => String(p.pay_date) <= date);
  const ledger = await LoanPenalty.findAll({ where: { loan_id: loan._uuid }, transaction: t });
  const { rows, summary } = summarize(loan, stored, paymentsOf(active), date);
  const penalty = penaltyState(loan, stored, active, ledger, date, decimals);
  const open = rows.filter((r) => !r.settled && (r.due_principal > 0.004 || r.due_interest > 0.004));
  const dueRows = open.filter((r) => r.due_date <= date);
  const sum = (list: typeof open, pick: (r: (typeof open)[number]) => number) => roundTo(list.reduce((n, r) => n + pick(r), 0), decimals);
  const product = loan.product_id ? await LoanProduct.findByPk(loan.product_id, { transaction: t }) : null;

  // ປິດບັນຊີ: ດອກເບ້ຍຂອງງວດທີ່ຄົບກຳນົດແລ້ວ + ດອກເບ້ຍຂອງງວດປັດຈຸບັນ ຕາມມື້ທີ່ຜ່ານໄປ
  const current = open.find((r) => r.due_date > date);
  const currentInterest = current
    ? roundTo(Math.min(current.due_interest, Math.max(0,
      (current.interest * daysBetween(current.period_start, date)) / Math.max(1, daysBetween(current.period_start, current.due_date)) - current.paid_interest)), decimals)
    : 0;
  const prepaidPrincipal = sum(open.filter((r) => r.due_date > date), (r) => r.due_principal);
  const prepayFee = prepaidPrincipal > 0 ? roundTo((prepaidPrincipal * num(product?.prepayment_fee_rate)) / 100, decimals) : 0;
  const payoff = {
    penalty: penalty.due,
    interest: roundTo(sum(dueRows, (r) => r.due_interest) + currentInterest, decimals),
    principal: summary.outstanding,
    fee: prepayFee,
  };
  const next = open[0] ?? null;
  return {
    decimals, summary, penalty, open,
    /** ຕົ້ນທຶນທີ່ຄົບກຳນົດແລ້ວ + ງວດຕໍ່ໄປ (ຈ່າຍລ່ວງໜ້າງວດຕໍ່ໄປ ຍັງນັບເປັນຕາມງວດ) */
    regularPrincipal: sum([...new Set([...dueRows, ...(next ? [next] : [])])], (r) => r.due_principal),
    lastDue: stored.reduce((m, r) => (r.due_date > m ? r.due_date : m), ""),
    presets: {
      next: next ? roundTo(penalty.due + next.due_interest + next.due_principal, decimals) : 0,
      due: roundTo(penalty.due + sum(dueRows.length ? dueRows : open.slice(0, 1), (r) => r.due_interest + r.due_principal), decimals),
      payoff: roundTo(payoff.penalty + payoff.interest + payoff.principal + payoff.fee, decimals),
    },
    payoff,
    next: next && { no: next.no, due_date: next.due_date, interest: next.due_interest, principal: next.due_principal },
    due_count: dueRows.length,
  };
};

type Quote = Awaited<ReturnType<typeof quoteOf>>;

/** ແບ່ງຈຳນວນເງິນ (ຫຼື ປິດບັນຊີ) → ຄ່າປັບ / ດອກເບ້ຍ / ຕົ້ນທຶນ / ຄ່າທຳນຽມ + ປະເພດການຈ່າຍ */
const splitOf = (q: Quote, amount: number, payoff: boolean, date: string) => {
  const payoffTotal = q.presets.payoff;
  // ພິມຍອດເທົ່າກັບປິດບັນຊີ = ປິດບັນຊີ (ບໍ່ດັ່ງນັ້ນຈະໄປຕັດດອກເບ້ຍຂອງງວດອະນາຄົດແທນຕົ້ນທຶນ)
  if (payoff || Math.abs(amount - payoffTotal) < 0.5) {
    return { ...q.payoff, total: payoffTotal, payment_type: date < q.lastDue ? PAY_OFF : PAY_REGULAR, outstanding_after: 0 };
  }
  if (!(amount > 0)) throw new GlError("ກະລຸນາປ້ອນຈຳນວນເງິນທີ່ຮັບ");
  if (amount > payoffTotal) throw new GlError(`ຈຳນວນເກີນຍອດປິດບັນຊີ (${payoffTotal.toLocaleString("en-US")}) — ເລືອກ ປິດບັນຊີ`);
  const split = splitAmount(amount, q.penalty.due, q.open.map((r) => ({ interest: r.due_interest, principal: r.due_principal })), q.decimals);
  return {
    penalty: split.penalty, interest: split.interest, principal: split.principal, fee: 0,
    total: roundTo(amount, q.decimals),
    payment_type: split.principal > q.regularPrincipal + 0.004 ? PAY_PREPAY : PAY_REGULAR,
    outstanding_after: round2(Math.max(0, q.summary.outstanding - split.principal)),
  };
};

/** POST /credit/contract/:id/quote { pay_date?, amount?, payoff? } — ຍອດທີ່ຄວນຮັບ + ການແບ່ງ (ສະແດງໃນຟອມກ່ອນບັນທຶກ) */
export const quoteContract = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const loan = await contractOf(Number(req.params.id));
    const date = toDateOnly(req.body?.pay_date) ?? todayLao();
    const q = await quoteOf(loan, date);
    const amount = num(req.body?.amount);
    let split = null;
    let error = null;
    try {
      if (amount > 0 || req.body?.payoff) split = splitOf(q, amount, !!req.body?.payoff, date);
    } catch (e) {
      error = (e as Error).message;
    }
    res.status(200).json({
      data: {
        date, penalty_due: q.penalty.due, penalty_rows: q.penalty.rows, days_overdue: q.penalty.days_overdue,
        outstanding: q.summary.outstanding, presets: q.presets, payoff: q.payoff, next: q.next, due_count: q.due_count, split, error,
      },
    });
  } catch (error) {
    fail(res, error, "Error quoting contract");
  }
};

/**
 * POST /credit/contract/:id/collect { pay_date, treasury_account_id, amount, payoff?, reference?, note? } — ຮັບຊຳລະ:
 * ແບ່ງໂດຍລະບົບ (ຄ່າປັບກ່ອນ), ລົງບັນຊີ / ເງິນເຂົ້າບັນຊີເງິນຄັງ (recordLoanPayment), ຄ່າປັບທີ່ຕັດ → tbl_loan_penalty
 */
export const collectContract = async (req: Request<{ id: string }>, res: Response) => {
  const t = await sequelize.transaction();
  try {
    if (!(await glReady(t))) throw new GlError("ຍັງບໍ່ໄດ້ເປີດໃຊ້ລະບົບບັນຊີຄູ່");
    const loan = await contractOf(Number(req.params.id), t, true);
    const body = req.body ?? {};
    const date = toDateOnly(body.pay_date);
    if (!date) throw new GlError("ກະລຸນາເລືອກວັນທີ");
    if (Number(loan.close_reason) === 4) throw new GlError("ສັນຍານີ້ຕັດເປັນໜີ້ສູນແລ້ວ — ໃຊ້ ເກັບຄືນໜີ້ສູນ");
    if (Number(loan.close_reason) === 3) throw new GlError("ສັນຍານີ້ຖືກປັບໂຄງສ້າງເປັນສັນຍາໃໝ່ແລ້ວ — ຮັບຊຳລະຢູ່ສັນຍາໃໝ່");
    const q = await quoteOf(loan, date, t);
    if (q.summary.closed && !(q.penalty.due > 0)) throw new GlError("ສັນຍານີ້ຈ່າຍຄົບແລ້ວ");
    // ການຈ່າຍທີ່ລົງວັນທີຫຼັງມື້ນີ້ຂອງການຮັບ ຈະເຮັດໃຫ້ຄ່າປັບທີ່ຄິດໄວ້ບໍ່ຖືກ
    if (await LoanPayment.count({ where: { loan_id: loan._uuid, status: ACTIVE, pay_date: { [Op.gt]: date } }, transaction: t })) {
      throw new GlError("ມີການຊຳລະທີ່ລົງວັນທີຫຼັງວັນທີນີ້ແລ້ວ — ເລືອກວັນທີໃຫ້ບໍ່ກ່ອນການຊຳລະຄັ້ງຫຼ້າສຸດ");
    }
    const split = splitOf(q, num(body.amount), !!body.payoff, date);
    const actorId = Number(actorOf(req)) || null;
    const { row, number } = await recordLoanPayment(loan, {
      date, treasuryId: Number(body.treasury_account_id), principal: split.principal, interest: split.interest, fee: split.fee,
      penalty: split.penalty, paymentType: split.payment_type, reference: body.reference, note: body.note,
    }, t, actorId);
    if (split.penalty > 0) {
      const rows = q.penalty.rows.filter((r) => r.due > 0);
      await LoanPenalty.bulkCreate(spreadOldestFirst(rows, split.penalty, q.decimals).map((part) => {
        const r = rows.find((x) => x.no === part.no)!;
        return {
          loan_id: loan._uuid, installment_no: part.no, calc_date: date, days_late: r.days_late, base_amount: r.base,
          rate: num(loan.penalty_rate), amount: part.amount, payment_id: row._uuid, status: PENALTY_PAID,
        };
      }) as any, { transaction: t });
    }
    if (split.outstanding_after <= 0.004 && !loan.closed_date) {
      await loan.update({ closed_date: date, close_reason: split.payment_type === PAY_OFF ? 2 : 1 } as any, { transaction: t });
    }
    await t.commit();
    res.status(200).json({ message: "Successfully collected", data: { _uuid: row._uuid, number, ...split } });
  } catch (error) {
    await t.rollback();
    fail(res, error, "Error collecting payment");
  }
};

/** POST /credit/contract/:id/waive { amount, reason } — ຍົກເວັ້ນຄ່າປັບ (ບັນທຶກຜູ້ອະນຸມັດ + ເຫດຜົນ), ຕັດງວດເກົ່າສຸດກ່ອນ */
export const waivePenalty = async (req: Request<{ id: string }>, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const loan = await contractOf(Number(req.params.id), t, true);
    if ([3, 4].includes(Number(loan.close_reason))) throw new GlError("ສັນຍານີ້ປິດແລ້ວ");
    const reason = String(req.body?.reason ?? "").trim().slice(0, 255);
    if (!reason) throw new GlError("ກະລຸນາບອກເຫດຜົນທີ່ຍົກເວັ້ນ");
    const today = todayLao();
    const q = await quoteOf(loan, today, t);
    const amount = roundTo(num(req.body?.amount), q.decimals);
    if (!(amount > 0)) throw new GlError("ກະລຸນາປ້ອນຈຳນວນທີ່ຍົກເວັ້ນ");
    if (amount > q.penalty.due + 0.004) throw new GlError(`ຍົກເວັ້ນໄດ້ບໍ່ເກີນຄ່າປັບຄ້າງ (${q.penalty.due.toLocaleString("en-US")})`);
    const rows = q.penalty.rows.filter((r) => r.due > 0);
    const actorId = Number(actorOf(req)) || null;
    await LoanPenalty.bulkCreate(spreadOldestFirst(rows, amount, q.decimals).map((part) => {
      const r = rows.find((x) => x.no === part.no)!;
      return {
        loan_id: loan._uuid, installment_no: part.no, calc_date: today, days_late: r.days_late, base_amount: r.base, rate: num(loan.penalty_rate),
        amount: part.amount, waived_amount: part.amount, waived_by: actorId, waive_reason: reason, status: PENALTY_WAIVED,
      };
    }) as any, { transaction: t });
    await t.commit();
    res.status(200).json({ message: "Successfully waived penalty" });
  } catch (error) {
    await t.rollback();
    fail(res, error, "Error waiving penalty");
  }
};

/** DELETE /credit/penalty/:id — ຍົກເລີກການຍົກເວັ້ນ (ຄ່າປັບກັບມາຄ້າງ) */
export const undoWaiver = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const row = await LoanPenalty.findByPk(Number(req.params.id));
    if (!row || Number(row.status) !== PENALTY_WAIVED) throw new GlError("ບໍ່ພົບການຍົກເວັ້ນ");
    await row.destroy();
    res.status(200).json({ message: "Successfully removed waiver" });
  } catch (error) {
    fail(res, error, "Error removing waiver");
  }
};

// ================= ຕິດຕາມໜີ້

/** GET /credit/collections — ສັນຍາທີ່ຍັງຜ່ອນ: ກາຍກຳນົດ (ອາຍຸໜີ້), ຄົບກຳນົດມື້ນີ້, ຄ່າປັບຄ້າງ, ການຕິດຕາມຫຼ້າສຸດ / ນັດຈ່າຍ */
export const getCollections = async (_req: Request, res: Response) => {
  try {
    if (!(await glReady())) throw new GlError("ຍັງບໍ່ໄດ້ເປີດໃຊ້ລະບົບບັນຊີຄູ່");
    const contracts = (await contractsWithSummary({})).filter((c: any) => !c.closed || c.penalty_due > 0);
    const ids = contracts.map((c: any) => c._uuid);
    const logs = ids.length ? await LoanCollection.findAll({ where: { loan_id: ids }, order: [["contact_date", "DESC"], ["_uuid", "DESC"]] }) : [];
    const notices = ids.length ? await LoanNotice.findAll({ where: { loan_id: ids }, order: [["sent_at", "DESC"], ["_uuid", "DESC"]], attributes: ["loan_id", "sent_at", "channel", "notice_type"] }) : [];
    const names = await userNames(logs.map((l) => l.created_by));
    res.status(200).json({
      data: contracts.map((c: any) => {
        const last = logs.find((l) => l.loan_id === c._uuid);
        return {
          ...c,
          last_contact: last ? { ...last.get({ plain: true }), promise_amount: num(last.promise_amount), by: names.get(Number(last.created_by)) ?? null } : null,
          contacts: logs.filter((l) => l.loan_id === c._uuid).length,
          last_notice: notices.find((n) => n.loan_id === c._uuid)?.sent_at ?? null,
        };
      }),
      today: todayLao(),
    });
  } catch (error) {
    fail(res, error, "Error getting collections");
  }
};

/** POST /credit/collection { loan_id, method, result, promise_date?, promise_amount?, note?, contact_date? } — ບັນທຶກການຕິດຕາມ */
export const createCollection = async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const loan = await contractOf(Number(body.loan_id));
    const method = [1, 2, 3, 4, 5].includes(Number(body.method)) ? Number(body.method) : 1;
    const result = [1, 2, 3, 4].includes(Number(body.result)) ? Number(body.result) : 1;
    const promise = toDateOnly(body.promise_date);
    if (result === 1 && !promise) throw new GlError("ກະລຸນາເລືອກວັນທີນັດຈ່າຍ");
    if (promise && promise < todayLao()) throw new GlError("ວັນນັດຈ່າຍຕ້ອງບໍ່ກ່ອນມື້ນີ້");
    const row = await LoanCollection.create({
      loan_id: loan._uuid, contact_date: body.contact_date ? new Date(body.contact_date) : new Date(), method, result,
      officer_id: Number(body.officer_id) || loan.officer_id || null,
      promise_date: result === 1 ? promise : null, promise_amount: result === 1 ? roundTo(num(body.promise_amount), 2) : 0,
      note: String(body.note ?? "").trim().slice(0, 500) || null, created_by: Number(actorOf(req)) || null,
    } as any);
    res.status(200).json({ message: "Successfully saved follow-up", data: row });
  } catch (error) {
    fail(res, error, "Error saving follow-up");
  }
};

/** DELETE /credit/collection/:id */
export const deleteCollection = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const row = await LoanCollection.findByPk(Number(req.params.id));
    if (!row) throw new GlError("ບໍ່ພົບລາຍການ");
    await row.destroy();
    res.status(200).json({ message: "Successfully deleted follow-up" });
  } catch (error) {
    fail(res, error, "Error deleting follow-up");
  }
};

// ================= ພາບລວມ

/**
 * GET /credit/dashboard?from&to — ຕາມສະກຸນເງິນ: ພອດໂຟລິໂອ (ຍອດຄ້າງ, ສັນຍາ, ລູກຄ້າ), PAR 1/30/90, ອາຍຸໜີ້,
 * ຊ່ວງເວລາ (ປ່ອຍກູ້, ຮັບຄືນ, ລາຍຮັບ = ດອກເບ້ຍ + ຄ່າທຳນຽມ + ຄ່າປັບ), 12 ເດືອນ, ຕາມຜະລິດຕະພັນ, ກາຍກຳນົດຫຼາຍສຸດ;
 * company = ກຳໄລຂອງບໍລິສັດຈາກບັນຊີ (ລາຍຮັບ − ລາຍຈ່າຍ ທັງໝົດ) ໃນຊ່ວງດຽວກັນ
 */
export const getDashboard = async (req: Request, res: Response) => {
  try {
    if (!(await glReady())) throw new GlError("ຍັງບໍ່ໄດ້ເປີດໃຊ້ລະບົບບັນຊີຄູ່");
    const today = todayLao();
    const from = toDateOnly(req.query.from) ?? moment(today).startOf("month").format("YYYY-MM-DD");
    const to = toDateOnly(req.query.to) ?? today;
    if (from > to) throw new GlError("ວັນທີເລີ່ມຕ້ອງບໍ່ຫຼັງວັນທີສິ້ນສຸດ");
    const contracts: any[] = await contractsWithSummary({});
    const ids = contracts.map((c) => c._uuid);
    const monthStart = moment(to).startOf("month").subtract(11, "months").format("YYYY-MM-DD");
    const [payments, waivers, pnl] = await Promise.all([
      ids.length ? LoanPayment.findAll({ where: { loan_id: ids, status: ACTIVE, pay_date: { [Op.gte]: from < monthStart ? from : monthStart, [Op.lte]: to } } }) : [],
      ids.length ? LoanPenalty.findAll({ where: { loan_id: ids, status: PENALTY_WAIVED, calc_date: { [Op.between]: [from, to] } } }) : [],
      pnlOf(from, to),
    ]);
    const months = Array.from({ length: 12 }, (_, i) => moment(monthStart).add(i, "months").format("YYYY-MM"));
    const currencies = new Map<string, any>();
    for (const c of contracts) {
      const key = c.currency?.name ?? "LAK";
      if (!currencies.has(key)) currencies.set(key, { currency: c.currency, contracts: [] as any[] });
      currencies.get(key).contracts.push(c);
    }
    const r = (n: number) => round2(n);
    const data = [...currencies.values()].map(({ currency, contracts: list }) => {
      const idSet = new Set(list.map((c: any) => c._uuid));
      const pays = payments.filter((p) => idSet.has(p.loan_id));
      const inPeriod = pays.filter((p) => String(p.pay_date) >= from && String(p.pay_date) <= to);
      const open = list.filter((c: any) => !c.closed);
      const outstanding = r(open.reduce((n: number, c: any) => n + c.outstanding, 0));
      const par = (days: number) => {
        const amount = r(open.filter((c: any) => c.days_overdue >= days).reduce((n: number, c: any) => n + c.outstanding, 0));
        return { amount, rate: outstanding > 0 ? r((amount / outstanding) * 100) : 0, contracts: open.filter((c: any) => c.days_overdue >= days).length };
      };
      const disbursed = list.filter((c: any) => c.start_date >= from && c.start_date <= to);
      const collected = {
        principal: r(inPeriod.reduce((n, p) => n + num(p.principal), 0)),
        interest: r(inPeriod.reduce((n, p) => n + num(p.interest), 0)),
        fee: r(inPeriod.reduce((n, p) => n + num(p.fee), 0)),
        penalty: r(inPeriod.reduce((n, p) => n + num(p.penalty), 0)),
      };
      const upfront = r(disbursed.reduce((n: number, c: any) => n + num(c.upfront_fee), 0));
      const byMonth = (m: string) => {
        const p = pays.filter((x) => String(x.pay_date).slice(0, 7) === m);
        const d = list.filter((c: any) => String(c.start_date).slice(0, 7) === m);
        return {
          month: m,
          disbursed: r(d.reduce((n: number, c: any) => n + c.principal, 0)),
          collected: r(p.reduce((n, x) => n + num(x.principal) + num(x.interest) + num(x.fee) + num(x.penalty), 0)),
          income: r(p.reduce((n, x) => n + num(x.interest) + num(x.fee) + num(x.penalty), 0) + d.reduce((n: number, c: any) => n + num(c.upfront_fee), 0)),
        };
      };
      const products = new Map<string, { name: string; contracts: number; outstanding: number; overdue: number }>();
      for (const c of open) {
        const key = c.product?.name ?? "—";
        const row = products.get(key) ?? { name: key, contracts: 0, outstanding: 0, overdue: 0 };
        row.contracts += 1;
        row.outstanding = r(row.outstanding + c.outstanding);
        if (c.days_overdue > 0) row.overdue = r(row.overdue + c.outstanding);
        products.set(key, row);
      }
      return {
        currency,
        portfolio: {
          contracts: open.length,
          customers: new Set(open.map((c: any) => c.customer_id)).size,
          outstanding,
          overdue_amount: r(open.reduce((n: number, c: any) => n + c.overdue_amount, 0)),
          penalty_due: r(list.reduce((n: number, c: any) => n + (c.penalty_due ?? 0), 0)),
          disbursed_total: r(list.reduce((n: number, c: any) => n + c.principal, 0)),
          closed: list.length - open.length,
        },
        par: { par1: par(1), par30: par(30), par90: par(90) },
        aging: AGING.map((b) => {
          const rows = open.filter((c: any) => c.aging === b.key);
          return { key: b.key, contracts: rows.length, outstanding: r(rows.reduce((n: number, c: any) => n + c.outstanding, 0)) };
        }),
        period: {
          disbursed: { contracts: disbursed.length, amount: r(disbursed.reduce((n: number, c: any) => n + c.principal, 0)), upfront_fee: upfront },
          collected: { ...collected, total: r(collected.principal + collected.interest + collected.fee + collected.penalty) },
          income: {
            interest: collected.interest, fees: r(upfront + collected.fee), penalty: collected.penalty,
            total: r(collected.interest + upfront + collected.fee + collected.penalty),
          },
          waived: r(waivers.filter((w) => idSet.has(w.loan_id)).reduce((n, w) => n + num(w.waived_amount), 0)),
        },
        months: months.map(byMonth),
        products: [...products.values()].sort((a, b) => b.outstanding - a.outstanding),
        top_overdue: open.filter((c: any) => c.days_overdue > 0).sort((a: any, b: any) => b.days_overdue - a.days_overdue).slice(0, 8)
          .map((c: any) => ({ _uuid: c._uuid, loan_code: c.loan_code, customer: c.customer, days_overdue: c.days_overdue, overdue_amount: c.overdue_amount, outstanding: c.outstanding, penalty_due: c.penalty_due })),
      };
    }).sort((a, b) => b.portfolio.outstanding - a.portfolio.outstanding);
    res.status(200).json({ data, from, to, company: pnl });
  } catch (error) {
    fail(res, error, "Error getting credit dashboard");
  }
};
