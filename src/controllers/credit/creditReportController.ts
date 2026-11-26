import { Request, Response } from "express";
import { Op } from "sequelize";
import moment from "moment";
import Loan, { LoanInstallment, LoanPayment } from "../../models/loan";
import JournalEntry from "../../models/journalEntry";
import JournalLine from "../../models/journalLine";
import TreasuryAccount from "../../models/treasuryAcount";
import Employee from "../../models/employee";
import {
  LoanApplication, LoanApproval, LoanClassRule, LoanClassification, LoanCollection, LoanCustomer, LoanNotice, LoanPenalty, LoanProduct, LoanRestructure, LoanWriteoff,
} from "../../models/loanCredit";
import { GlError, glReady, roleAccountId, round2 } from "../bansi/glCore";
import { toDateOnly } from "../bansi/bansiHelpers";
import { todayLao } from "../bansi/journalHelpers";
import { currencyMap, fail, installmentsOf, paymentsOf, summarize } from "../bansi/loanController";
import { closedSpecially } from "./creditPenalty";
import { portfolioAt } from "./riskController";
import { userNames } from "./creditPenalty";

/**
 * ລາຍງານສິນເຊື່ອ — GET /credit/report/:type
 *  portfolio ?as_of     ສັນຍາທີ່ຍັງຄ້າງ ພ້ອມມື້ກາຍກຳນົດ, ຊັ້ນໜີ້ ແລະ ເງິນແຮ (ຄາດຄະເນ)
 *  disbursements ?from&to   ການປ່ອຍກູ້ (ລວມສັນຍາທີ່ອອກຈາກການປັບໂຄງສ້າງ)
 *  collections ?from&to     ການຮັບຊຳລະ ແຍກ ຕົ້ນ / ດອກ / ຄ່າປັບ / ຄ່າທຳນຽມ
 *  writeoffs                ໜີ້ສູນ ແລະ ຍອດເກັບຄືນ
 *  cancelled ?from&to       ການຊຳລະທີ່ຍົກເລີກ, ຄຳຮ້ອງທີ່ປະຕິເສດ / ຍົກເລີກ, ການຕັດໜີ້ສູນ / ປັບໂຄງສ້າງ ທີ່ຍົກເລີກ
 *  waivers ?from&to         ການຍົກເວັ້ນຄ່າປັບ
 *  restructures ?from&to    ການປັບໂຄງສ້າງໜີ້
 *  income ?from&to          ລາຍຮັບ ແລະ ກຳໄລຂອງສິນເຊື່ອ ລາຍເດືອນ (ດອກ + ຄ່າທຳນຽມ + ຄ່າປັບ + ເກັບຄືນ − ເງິນແຮ / ໜີ້ສູນ)
 *  due ?from&to             ກຳນົດເກັບເງິນ: ງວດທີ່ຄົບກຳນົດໃນຊ່ວງ (ຍອດທີ່ຍັງບໍ່ໄດ້ຮັບ)
 *  applications ?from&to    ຄຳຮ້ອງ ແລະ ການອະນຸມັດ (ຂັ້ນ, ຜູ້ອະນຸມັດ, ຈັກມື້ຈຶ່ງຕັດສິນ)
 *  followups ?from&to       ບັນທຶກການຕິດຕາມ ແລະ ແຈ້ງເຕືອນ
 *  classes ?from&to (YYYY-MM)  ປະຫວັດຈັດຊັ້ນໜີ້ ແລະ ເງິນແຮ ລາຍເດືອນ
 */

const num = (v: unknown) => Number(v) || 0;
const ACTIVE = 1;

const lookups = async (customerIds: (number | null)[], productIds: (number | null)[], officerIds: (number | null)[]) => {
  const [customers, products, officers] = await Promise.all([
    LoanCustomer.findAll({ where: { _uuid: [...new Set(customerIds.filter(Boolean))] as number[] }, attributes: ["_uuid", "customer_code", "full_name", "phone"], raw: true }),
    LoanProduct.findAll({ where: { _uuid: [...new Set(productIds.filter(Boolean))] as number[] }, attributes: ["_uuid", "product_code", "name_la"], raw: true }),
    Employee.findAll({ where: { _uuid: [...new Set(officerIds.filter(Boolean))] as number[] }, attributes: ["_uuid", "first_name", "last_name"], raw: true }),
  ]);
  return {
    customer: (id: number | null) => (customers as any[]).find((c) => c._uuid === id) ?? null,
    product: (id: number | null) => (products as any[]).find((p) => p._uuid === id)?.name_la ?? null,
    officer: (id: number | null) => {
      const e: any = (officers as any[]).find((o) => o._uuid === id);
      return e ? [e.first_name, e.last_name].filter(Boolean).join(" ") : null;
    },
  };
};

const rangeOf = (req: Request) => {
  const today = todayLao();
  const from = toDateOnly(req.query.from) ?? moment(today).startOf("month").format("YYYY-MM-DD");
  const to = toDateOnly(req.query.to) ?? today;
  if (from > to) throw new GlError("ວັນທີເລີ່ມຕ້ອງບໍ່ຫຼັງວັນທີສິ້ນສຸດ");
  return { from, to };
};

export const getCreditReport = async (req: Request<{ type: string }>, res: Response) => {
  try {
    if (!(await glReady())) throw new GlError("ຍັງບໍ່ໄດ້ເປີດໃຊ້ລະບົບບັນຊີຄູ່");
    const type = req.params.type;

    if (type === "portfolio") {
      const asOf = toDateOnly(req.query.as_of) ?? todayLao();
      const { rows } = await portfolioAt(asOf);
      const look = await lookups(rows.map((r) => r.customer_id), rows.map((r) => r.product_id), rows.map((r) => r.officer_id));
      res.status(200).json({
        as_of: asOf,
        data: rows.map((r) => {
          const c = look.customer(r.customer_id);
          return {
            loan_id: r.loan_id, loan_code: r.loan_code, customer_code: c?.customer_code ?? null, customer: c?.full_name ?? r.counterparty, phone: c?.phone ?? null,
            product: look.product(r.product_id), officer: look.officer(r.officer_id), currency: r.currency,
            start_date: r.start_date, maturity: r.maturity, annual_rate: r.annual_rate, principal: r.principal, outstanding: r.outstanding,
            overdue_principal: r.overdue_principal, overdue_interest: r.overdue_interest, days_overdue: r.days_overdue,
            class_code: r.class_code, is_npl: r.is_npl, provision_rate: r.provision_rate, provision_amount: r.provision_amount,
          };
        }).sort((a, b) => b.days_overdue - a.days_overdue || a.loan_code.localeCompare(b.loan_code)),
      });
      return;
    }

    if (type === "disbursements") {
      const { from, to } = rangeOf(req);
      const [loans, currencies] = await Promise.all([
        Loan.findAll({ where: { customer_id: { [Op.ne]: null }, status: ACTIVE, start_date: { [Op.between]: [from, to] } }, order: [["start_date", "ASC"], ["loan_code", "ASC"]] }),
        currencyMap(),
      ]);
      const look = await lookups(loans.map((l) => l.customer_id), loans.map((l) => l.product_id), loans.map((l) => l.officer_id));
      res.status(200).json({
        from, to,
        data: loans.map((l) => {
          const c = look.customer(l.customer_id);
          const cur = currencies.get(Number(l.currency_id));
          return {
            loan_id: l._uuid, loan_code: l.loan_code, date: l.start_date, customer_code: c?.customer_code ?? null, customer: c?.full_name ?? l.counterparty,
            product: look.product(l.product_id), officer: look.officer(l.officer_id), currency: cur ? { name: cur.name, genus: cur.genus } : null,
            principal: num(l.principal), upfront_fee: num(l.upfront_fee), net: round2(num(l.principal) - num(l.upfront_fee)),
            annual_rate: Number(l.annual_rate), term: l.term, restructured: !l.application_id,
          };
        }),
      });
      return;
    }

    if (type === "collections") {
      const { from, to } = rangeOf(req);
      const credit = await Loan.findAll({ where: { customer_id: { [Op.ne]: null } }, attributes: ["_uuid", "loan_code", "counterparty", "customer_id", "currency_id", "close_reason"] });
      const payments = credit.length ? await LoanPayment.findAll({
        where: { loan_id: credit.map((l) => l._uuid), status: ACTIVE, pay_date: { [Op.between]: [from, to] } }, order: [["pay_date", "ASC"], ["_uuid", "ASC"]],
      }) : [];
      const [look, names, treasuries, currencies, writeoffs] = await Promise.all([
        lookups(credit.map((l) => l.customer_id), [], []),
        userNames(payments.map((p) => p.created_by)),
        TreasuryAccount.findAll({ where: { _uuid: [...new Set(payments.map((p) => p.treasury_account_id))] }, attributes: ["_uuid", "acountName"], raw: true }),
        currencyMap(),
        LoanWriteoff.findAll({ where: { status: ACTIVE }, attributes: ["loan_id", "writeoff_date"], raw: true }),
      ]);
      res.status(200).json({
        from, to,
        data: payments.map((p) => {
          const loan = credit.find((l) => l._uuid === p.loan_id)!;
          const c = look.customer(loan.customer_id);
          const cur = currencies.get(Number(loan.currency_id));
          const wo: any = (writeoffs as any[]).find((w) => w.loan_id === loan._uuid);
          return {
            payment_id: p._uuid, number: p.number, date: p.pay_date, loan_id: loan._uuid, loan_code: loan.loan_code,
            customer_code: c?.customer_code ?? null, customer: c?.full_name ?? loan.counterparty, currency: cur ? { name: cur.name, genus: cur.genus } : null,
            principal: num(p.principal), interest: num(p.interest), penalty: num(p.penalty), fee: num(p.fee),
            total: round2(num(p.principal) + num(p.interest) + num(p.penalty) + num(p.fee)), payment_type: p.payment_type,
            recovery: !!wo && String(p.pay_date) >= String(wo.writeoff_date),
            account: (treasuries as any[]).find((a) => a._uuid === p.treasury_account_id)?.acountName ?? null,
            reference: p.reference, by: names.get(Number(p.created_by)) ?? null,
          };
        }),
      });
      return;
    }

    if (type === "writeoffs") {
      const rows = await LoanWriteoff.findAll({ where: { status: ACTIVE }, order: [["writeoff_date", "DESC"]] });
      const loans = await Loan.findAll({ where: { _uuid: rows.map((r) => r.loan_id) }, attributes: ["_uuid", "loan_code", "counterparty", "customer_id", "currency_id"] });
      const [look, names, currencies] = await Promise.all([lookups(loans.map((l) => l.customer_id), [], []), userNames(rows.map((r) => r.approved_by)), currencyMap()]);
      res.status(200).json({
        data: rows.map((r) => {
          const loan = loans.find((l) => l._uuid === r.loan_id);
          const c = look.customer(loan?.customer_id ?? null);
          const cur = currencies.get(Number(loan?.currency_id));
          const total = round2(num(r.principal) + num(r.interest) + num(r.penalty));
          return {
            _uuid: r._uuid, loan_id: r.loan_id, loan_code: loan?.loan_code ?? null, date: r.writeoff_date, customer_code: c?.customer_code ?? null,
            customer: c?.full_name ?? loan?.counterparty ?? null, currency: cur ? { name: cur.name, genus: cur.genus } : null,
            principal: num(r.principal), interest: num(r.interest), penalty: num(r.penalty), total, recovered: num(r.recovered_amount),
            remaining: round2(total - num(r.recovered_amount)), reason: r.reason, by: names.get(Number(r.approved_by)) ?? null,
          };
        }),
      });
      return;
    }
    if (type === "cancelled") {
      const { from, to } = rangeOf(req);
      const start = new Date(`${from}T00:00:00`);
      const end = new Date(`${to}T23:59:59`);
      const credit = await Loan.findAll({ where: { customer_id: { [Op.ne]: null } }, attributes: ["_uuid", "loan_code", "counterparty", "customer_id", "currency_id"], paranoid: false } as any);
      const ids = credit.map((l) => l._uuid);
      const [payments, apps, writeoffs, restructures] = await Promise.all([
        ids.length ? LoanPayment.findAll({ where: { loan_id: ids, status: 2, updatedAt: { [Op.between]: [start, end] } } }) : [],
        LoanApplication.findAll({ where: { status: [4, 6], updatedAt: { [Op.between]: [start, end] } } }),
        LoanWriteoff.findAll({ where: { status: 2, updatedAt: { [Op.between]: [start, end] } } }),
        LoanRestructure.findAll({ where: { status: 2, updatedAt: { [Op.between]: [start, end] } } }),
      ]);
      // ຜູ້ຍົກເລີກການຊຳລະ = ຜູ້ສ້າງໃບກັບລາຍການ (reversal) ຂອງໃບຊຳລະນັ້ນ
      const originals = payments.length ? await JournalEntry.findAll({ where: { source_type: "LOAN_PAYMENT", source_id: payments.map((p) => String(p._uuid)), reversal_of: null }, attributes: ["_uuid", "source_id", "reversed_by"] }) : [];
      const reversals = originals.length ? await JournalEntry.findAll({ where: { _uuid: originals.map((e) => e.reversed_by).filter(Boolean) as number[] }, attributes: ["_uuid", "created_by", "entry_number"] }) : [];
      // ສະເພາະການຕັດສິນ (decision 1–3) — ແຖວ "ສົ່ງໃຫ້ພິຈາລະນາ" (4) ບໍ່ແມ່ນຜູ້ປະຕິເສດ
      const approvals = apps.length ? await LoanApproval.findAll({ where: { application_id: apps.map((a) => a._uuid), decision: [1, 2, 3] }, order: [["_uuid", "DESC"]] }) : [];
      const look = await lookups([...credit.map((l) => l.customer_id), ...apps.map((a) => a.customer_id)], [], []);
      const names = await userNames([...reversals.map((r) => r.created_by), ...approvals.map((a) => a.approver_id), ...writeoffs.map((w) => w.created_by), ...restructures.map((r) => r.created_by)]);
      const loanOf = (id: number | null) => credit.find((l) => l._uuid === id);
      const rows = [
        ...payments.map((p) => {
          const loan = loanOf(p.loan_id);
          const orig = originals.find((e) => e.source_id === String(p._uuid));
          const rev = reversals.find((r) => r._uuid === orig?.reversed_by);
          return {
            kind: "payment", date: p.updatedAt, doc: p.number, loan_id: p.loan_id, loan_code: loan?.loan_code ?? null, customer: look.customer(loan?.customer_id ?? null)?.full_name ?? loan?.counterparty ?? null,
            amount: round2(num(p.principal) + num(p.interest) + num(p.fee) + num(p.penalty)), reason: p.note, ref: rev?.entry_number ?? null, by: names.get(Number(rev?.created_by)) ?? null,
          };
        }),
        ...apps.map((a) => {
          const last = approvals.find((x) => x.application_id === a._uuid);
          return {
            kind: Number(a.status) === 4 ? "rejected" : "app_cancelled", date: a.updatedAt, doc: a.application_no, loan_id: null, loan_code: null,
            customer: look.customer(a.customer_id)?.full_name ?? null, amount: num(a.requested_amount),
            reason: Number(a.status) === 4 ? a.reject_reason : a.note, ref: null, by: Number(a.status) === 4 ? names.get(Number(last?.approver_id)) ?? null : null,
          };
        }),
        ...writeoffs.map((w) => {
          const loan = loanOf(w.loan_id);
          return { kind: "writeoff_undone", date: (w as any).updatedAt, doc: loan?.loan_code ?? null, loan_id: w.loan_id, loan_code: loan?.loan_code ?? null,
            customer: look.customer(loan?.customer_id ?? null)?.full_name ?? null, amount: num(w.principal), reason: w.reason, ref: null, by: names.get(Number(w.created_by)) ?? null };
        }),
        ...restructures.map((r) => {
          const loan = loanOf(r.loan_id);
          return { kind: "restructure_undone", date: (r as any).updatedAt, doc: loan?.loan_code ?? null, loan_id: r.loan_id, loan_code: loan?.loan_code ?? null,
            customer: look.customer(loan?.customer_id ?? null)?.full_name ?? null, amount: num(r.old_outstanding), reason: r.reason, ref: null, by: names.get(Number(r.created_by)) ?? null };
        }),
      ].sort((a, b) => String(b.date).localeCompare(String(a.date)));
      res.status(200).json({ from, to, data: rows });
      return;
    }

    if (type === "waivers") {
      const { from, to } = rangeOf(req);
      const rows = await LoanPenalty.findAll({ where: { status: 3, calc_date: { [Op.between]: [from, to] } }, order: [["calc_date", "DESC"], ["_uuid", "DESC"]] });
      const loans = await Loan.findAll({ where: { _uuid: [...new Set(rows.map((r) => r.loan_id))] }, attributes: ["_uuid", "loan_code", "counterparty", "customer_id"] });
      const [look, names] = await Promise.all([lookups(loans.map((l) => l.customer_id), [], []), userNames(rows.map((r) => r.waived_by))]);
      res.status(200).json({
        from, to,
        data: rows.map((r) => {
          const loan = loans.find((l) => l._uuid === r.loan_id);
          return {
            _uuid: r._uuid, date: r.calc_date, loan_id: r.loan_id, loan_code: loan?.loan_code ?? null, customer: look.customer(loan?.customer_id ?? null)?.full_name ?? loan?.counterparty ?? null,
            installment_no: r.installment_no, days_late: r.days_late, amount: num(r.waived_amount), reason: r.waive_reason, by: names.get(Number(r.waived_by)) ?? null,
          };
        }),
      });
      return;
    }

    if (type === "restructures") {
      const { from, to } = rangeOf(req);
      const rows = await LoanRestructure.findAll({ where: { status: ACTIVE, restructure_date: { [Op.between]: [from, to] } }, order: [["restructure_date", "DESC"]] });
      const loans = await Loan.findAll({ where: { _uuid: [...new Set(rows.flatMap((r) => [r.loan_id, r.new_loan_id]).filter(Boolean) as number[])] }, attributes: ["_uuid", "loan_code", "counterparty", "customer_id"] });
      const [look, names] = await Promise.all([lookups(loans.map((l) => l.customer_id), [], []), userNames(rows.map((r) => r.approved_by))]);
      res.status(200).json({
        from, to,
        data: rows.map((r) => {
          const old = loans.find((l) => l._uuid === r.loan_id);
          const fresh = loans.find((l) => l._uuid === r.new_loan_id);
          return {
            _uuid: r._uuid, date: r.restructure_date, loan_id: r.new_loan_id ?? r.loan_id, loan_code: old?.loan_code ?? null, new_code: fresh?.loan_code ?? null,
            customer: look.customer(old?.customer_id ?? null)?.full_name ?? old?.counterparty ?? null,
            old_outstanding: num(r.old_outstanding), capitalized: num(r.capitalized_interest), principal: round2(num(r.old_outstanding) + num(r.capitalized_interest)),
            rates: `${Number(r.old_rate)}% → ${Number(r.new_rate)}%`, terms: `${r.old_term} → ${r.new_term}`, reason: r.reason, by: names.get(Number(r.approved_by)) ?? null,
          };
        }),
      });
      return;
    }

    if (type === "income") {
      const { from, to } = rangeOf(req);
      const credit = await Loan.findAll({ where: { customer_id: { [Op.ne]: null }, status: ACTIVE } });
      const ids = credit.map((l) => l._uuid);
      const [payments, writeoffs, expenseId] = await Promise.all([
        ids.length ? LoanPayment.findAll({ where: { loan_id: ids, status: ACTIVE, pay_date: { [Op.between]: [from, to] } } }) : [],
        LoanWriteoff.findAll({ where: { status: ACTIVE }, attributes: ["loan_id", "writeoff_date"], raw: true }),
        roleAccountId("LOAN_PROVISION_EXPENSE", undefined as any).catch(() => null),
      ]);
      // ຄ່າໃຊ້ຈ່າຍເງິນແຮ / ໜີ້ສູນ (ບັນຊີ 5250) ຈາກປຶ້ມ — ຕາມວັນທີລາຍການ
      const lines = expenseId ? await JournalLine.findAll({ where: { account_id: expenseId }, attributes: ["entry_id", "debit", "credit"] }) : [];
      const entries = lines.length ? await JournalEntry.findAll({ where: { _uuid: [...new Set(lines.map((l) => l.entry_id))], entry_date: { [Op.between]: [from, to] } }, attributes: ["_uuid", "entry_date"] }) : [];
      const months: string[] = [];
      for (let m = moment(from).startOf("month"); m.isSameOrBefore(moment(to), "month"); m.add(1, "month")) months.push(m.format("YYYY-MM"));
      const recoveryOf = (p: LoanPayment) => (writeoffs as any[]).some((w) => w.loan_id === p.loan_id && String(p.pay_date) >= String(w.writeoff_date));
      const data = months.map((m) => {
        const pays = payments.filter((p) => String(p.pay_date).slice(0, 7) === m);
        const normal = pays.filter((p) => !recoveryOf(p));
        const disbursed = credit.filter((l) => String(l.start_date).slice(0, 7) === m && String(l.start_date) >= from && String(l.start_date) <= to);
        const interest = round2(normal.reduce((n, p) => n + num(p.interest), 0));
        const fees = round2(disbursed.reduce((n, l) => n + num(l.upfront_fee), 0) + normal.reduce((n, p) => n + num(p.fee), 0));
        const penalty = round2(normal.reduce((n, p) => n + num(p.penalty), 0));
        const recovery = round2(pays.filter(recoveryOf).reduce((n, p) => n + num(p.principal) + num(p.interest), 0));
        const ids = new Set(entries.filter((e) => String(e.entry_date).slice(0, 7) === m).map((e) => e._uuid));
        const expense = round2(lines.filter((l) => ids.has(l.entry_id)).reduce((n, l) => n + num(l.debit) - num(l.credit), 0));
        const income = round2(interest + fees + penalty + recovery);
        return { month: m, interest, fees, penalty, recovery, income, provision: expense, profit: round2(income - expense) };
      });
      res.status(200).json({ from, to, data });
      return;
    }

    if (type === "due") {
      const today = todayLao();
      const from = toDateOnly(req.query.from) ?? today;
      const to = toDateOnly(req.query.to) ?? moment(today).add(30, "days").format("YYYY-MM-DD");
      const loans = (await Loan.findAll({ where: { customer_id: { [Op.ne]: null }, status: ACTIVE } })).filter((l) => !closedSpecially(l));
      const ids = loans.map((l) => l._uuid);
      const [due, payments] = await Promise.all([
        ids.length ? LoanInstallment.findAll({ where: { loan_id: ids, due_date: { [Op.between]: [from, to] } }, attributes: ["loan_id"], raw: true }) : [],
        ids.length ? LoanPayment.findAll({ where: { loan_id: ids, status: ACTIVE } }) : [],
      ]);
      const withDue = loans.filter((l) => (due as any[]).some((d) => d.loan_id === l._uuid));
      const look = await lookups(withDue.map((l) => l.customer_id), withDue.map((l) => l.product_id), withDue.map((l) => l.officer_id));
      const currencies = await currencyMap();
      const rows: any[] = [];
      for (const loan of withDue) {
        const { rows: schedule } = summarize(loan, await installmentsOf(loan._uuid), paymentsOf(payments.filter((p) => p.loan_id === loan._uuid)));
        const c = look.customer(loan.customer_id);
        const cur = currencies.get(Number(loan.currency_id));
        for (const r of schedule.filter((x) => x.due_date >= from && x.due_date <= to && (x.due_principal > 0.004 || x.due_interest > 0.004))) {
          rows.push({
            loan_id: loan._uuid, loan_code: loan.loan_code, date: r.due_date, no: r.no, customer_code: c?.customer_code ?? null, customer: c?.full_name ?? loan.counterparty,
            phone: c?.phone ?? null, product: look.product(loan.product_id), officer: look.officer(loan.officer_id), currency: cur ? { name: cur.name, genus: cur.genus } : null,
            principal: r.due_principal, interest: r.due_interest, total: round2(r.due_principal + r.due_interest), late: r.due_date < today,
          });
        }
      }
      res.status(200).json({ from, to, data: rows.sort((a, b) => a.date.localeCompare(b.date) || a.loan_code.localeCompare(b.loan_code)) });
      return;
    }

    if (type === "applications") {
      const { from, to } = rangeOf(req);
      const apps = await LoanApplication.findAll({ where: { apply_date: { [Op.between]: [from, to] } }, order: [["apply_date", "DESC"], ["_uuid", "DESC"]] });
      const approvals = apps.length ? await LoanApproval.findAll({ where: { application_id: apps.map((a) => a._uuid), decision: [1, 2, 3] }, order: [["_uuid", "ASC"]] }) : [];
      const [look, names] = await Promise.all([
        lookups(apps.map((a) => a.customer_id), apps.map((a) => a.product_id), apps.map((a) => a.officer_id)),
        userNames([...approvals.map((a) => a.approver_id), ...apps.map((a) => a.created_by)]),
      ]);
      const STATUS = ["", "draft", "pending", "approved", "rejected", "disbursed", "cancelled"];
      res.status(200).json({
        from, to,
        data: apps.map((a) => {
          const mine = approvals.filter((x) => x.application_id === a._uuid);
          const last = mine[mine.length - 1];
          return {
            _uuid: a._uuid, application_no: a.application_no, date: a.apply_date, customer: look.customer(a.customer_id)?.full_name ?? null,
            product: look.product(a.product_id), officer: look.officer(a.officer_id), requested: num(a.requested_amount),
            approved: a.approved_amount === null ? null : num(a.approved_amount), status: STATUS[Number(a.status)] ?? "draft",
            approvers: mine.filter((x) => Number(x.decision) === 1).map((x) => names.get(Number(x.approver_id))).filter(Boolean).join(", "),
            decided: last ? moment(last.decided_at).format("YYYY-MM-DD") : null,
            days: last ? Math.max(0, moment(last.decided_at).startOf("day").diff(moment(a.apply_date), "days")) : null,
            by: names.get(Number(a.created_by)) ?? null, reason: a.reject_reason,
          };
        }),
      });
      return;
    }

    if (type === "followups") {
      const { from, to } = rangeOf(req);
      const start = new Date(`${from}T00:00:00`);
      const end = new Date(`${to}T23:59:59`);
      const [logs, notices] = await Promise.all([
        LoanCollection.findAll({ where: { contact_date: { [Op.between]: [start, end] } }, order: [["contact_date", "DESC"]] }),
        LoanNotice.findAll({ where: { sent_at: { [Op.between]: [start, end] } }, order: [["sent_at", "DESC"]] }),
      ]);
      const loans = await Loan.findAll({ where: { _uuid: [...new Set([...logs.map((l) => l.loan_id), ...notices.map((n) => n.loan_id)])] }, attributes: ["_uuid", "loan_code", "counterparty", "customer_id"] });
      const [look, names] = await Promise.all([lookups(loans.map((l) => l.customer_id), [], []), userNames(logs.map((l) => l.created_by))]);
      const who = (loanId: number) => {
        const loan = loans.find((l) => l._uuid === loanId);
        return { loan_code: loan?.loan_code ?? null, customer: look.customer(loan?.customer_id ?? null)?.full_name ?? loan?.counterparty ?? null };
      };
      res.status(200).json({
        from, to,
        data: [
          ...logs.map((l) => ({ kind: "contact", date: l.contact_date, loan_id: l.loan_id, ...who(l.loan_id), method: l.method, result: l.result,
            promise_date: l.promise_date, promise_amount: num(l.promise_amount), note: l.note, by: names.get(Number(l.created_by)) ?? null })),
          ...notices.map((n) => ({ kind: "notice", date: n.sent_at, loan_id: n.loan_id, ...who(n.loan_id), method: 2, result: null,
            promise_date: null, promise_amount: 0, note: n.message, by: n.phone })),
        ].sort((a, b) => String(b.date).localeCompare(String(a.date))),
      });
      return;
    }

    if (type === "classes") {
      const to = String(req.query.to ?? moment(todayLao()).subtract(1, "month").format("YYYY-MM")).slice(0, 7);
      const from = String(req.query.from ?? moment(to, "YYYY-MM").subtract(11, "months").format("YYYY-MM")).slice(0, 7);
      const [rows, rules] = await Promise.all([
        LoanClassification.findAll({ where: { period: { [Op.between]: [from, to] } }, attributes: ["period", "loan_class", "outstanding", "provision_amount"], raw: true }),
        LoanClassRule.findAll({ order: [["loan_class", "ASC"]] }),
      ]);
      const periods = [...new Set((rows as any[]).map((r) => r.period))].sort().reverse();
      res.status(200).json({
        from, to,
        data: periods.map((p) => {
          const list = (rows as any[]).filter((r) => r.period === p);
          const total = round2(list.reduce((n, r) => n + num(r.outstanding), 0));
          const byClass = Object.fromEntries(rules.map((rule) => [rule.class_code, round2(list.filter((r) => r.loan_class === rule.loan_class).reduce((n, r) => n + num(r.outstanding), 0))]));
          const npl = round2(list.filter((r) => rules.find((x) => x.loan_class === r.loan_class)?.is_npl).reduce((n, r) => n + num(r.outstanding), 0));
          return {
            period: p, contracts: list.length, total, ...byClass, npl, npl_ratio: total > 0 ? round2((npl / total) * 100) : 0,
            provision: round2(list.reduce((n, r) => n + num(r.provision_amount), 0)),
          };
        }),
      });
      return;
    }
    throw new GlError("ບໍ່ພົບລາຍງານ");
  } catch (error) {
    fail(res, error, "Error getting credit report");
  }
};
