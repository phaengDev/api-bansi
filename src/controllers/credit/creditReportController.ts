import { Request, Response } from "express";
import { Op } from "sequelize";
import moment from "moment";
import Loan, { LoanPayment } from "../../models/loan";
import TreasuryAccount from "../../models/treasuryAcount";
import Employee from "../../models/employee";
import { LoanCustomer, LoanProduct, LoanWriteoff } from "../../models/loanCredit";
import { GlError, glReady, round2 } from "../bansi/glCore";
import { toDateOnly } from "../bansi/bansiHelpers";
import { todayLao } from "../bansi/journalHelpers";
import { currencyMap, fail } from "../bansi/loanController";
import { portfolioAt } from "./riskController";
import { userNames } from "./creditPenalty";

/**
 * ລາຍງານສິນເຊື່ອ — GET /credit/report/:type
 *  portfolio ?as_of     ສັນຍາທີ່ຍັງຄ້າງ ພ້ອມມື້ກາຍກຳນົດ, ຊັ້ນໜີ້ ແລະ ເງິນແຮ (ຄາດຄະເນ)
 *  disbursements ?from&to   ການປ່ອຍກູ້ (ລວມສັນຍາທີ່ອອກຈາກການປັບໂຄງສ້າງ)
 *  collections ?from&to     ການຮັບຊຳລະ ແຍກ ຕົ້ນ / ດອກ / ຄ່າປັບ / ຄ່າທຳນຽມ
 *  writeoffs                ໜີ້ສູນ ແລະ ຍອດເກັບຄືນ
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
    throw new GlError("ບໍ່ພົບລາຍງານ");
  } catch (error) {
    fail(res, error, "Error getting credit report");
  }
};
