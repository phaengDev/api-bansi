import type Loan from "../../models/loan";
import type { LoanPayment } from "../../models/loan";
import type { LoanPenalty } from "../../models/loanCredit";
import { penaltiesOf } from "../../utils/loanPenalty";
import { roundTo, type StoredInstallment } from "../../utils/loanSchedule";

/** tbl_loan_penalty.status */
export const PENALTY_PAID = 2;
export const PENALTY_WAIVED = 3;

const num = (v: unknown) => Number(v) || 0;

/**
 * ຄ່າປັບຂອງສັນຍາ ຮອດ asOf: ແຕ່ລະງວດ ເກີດຂຶ້ນ (accrued) − ຈ່າຍແລ້ວ − ຍົກເວັ້ນ = ຄ້າງ (due).
 * payments = ການຊຳລະທີ່ໃຊ້ງານ (ບໍ່ລວມທີ່ຍົກເລີກ), ledger = ແຖວ tbl_loan_penalty ຂອງສັນຍາ
 */
export const penaltyState = (loan: Loan, stored: StoredInstallment[], payments: LoanPayment[], ledger: LoanPenalty[], asOf: string, decimals: number) => {
  const terms = { rate: num(loan.penalty_rate), base: Number(loan.penalty_base) === 2 ? 2 : 1, grace: Math.max(0, num(loan.grace_days)) };
  const paidRows = payments.map((p) => ({ pay_date: String(p.pay_date), principal: num(p.principal), interest: num(p.interest) }));
  const rows = penaltiesOf(terms, String(loan.start_date), stored, paidRows, asOf, decimals).map((r) => {
    const mine = ledger.filter((x) => x.installment_no === r.no);
    const paid = roundTo(mine.filter((x) => Number(x.status) === PENALTY_PAID).reduce((n, x) => n + num(x.amount), 0), decimals);
    const waived = roundTo(mine.filter((x) => Number(x.status) === PENALTY_WAIVED).reduce((n, x) => n + num(x.waived_amount), 0), decimals);
    return { ...r, paid, waived, due: roundTo(Math.max(0, r.accrued - paid - waived), decimals) };
  });
  const sum = (pick: (r: (typeof rows)[number]) => number) => roundTo(rows.reduce((n, r) => n + pick(r), 0), decimals);
  return {
    rows,
    accrued: sum((r) => r.accrued),
    paid: sum((r) => r.paid),
    waived: sum((r) => r.waived),
    due: sum((r) => r.due),
    /** ມື້ກາຍກຳນົດຂອງງວດເກົ່າສຸດທີ່ຍັງຄ້າງ (0 = ບໍ່ກາຍ) — ໃຊ້ຈັດອາຍຸໜີ້ / PAR */
    days_overdue: rows.filter((r) => r.base > 0.004).reduce((n, r) => Math.max(n, r.days_late), 0),
  };
};

/** ກຸ່ມອາຍຸໜີ້ (ມື້ກາຍກຳນົດ) */
export const AGING = [
  { key: "current", min: 0, max: 0 },
  { key: "d1_30", min: 1, max: 30 },
  { key: "d31_60", min: 31, max: 60 },
  { key: "d61_90", min: 61, max: 90 },
  { key: "d91_180", min: 91, max: 180 },
  { key: "d180", min: 181, max: Infinity },
] as const;
export const agingOf = (daysOverdue: number) => AGING.find((b) => daysOverdue >= b.min && daysOverdue <= b.max)!.key;
