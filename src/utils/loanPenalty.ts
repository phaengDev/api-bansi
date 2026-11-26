import moment from "moment";
import { allocatePaid, roundTo, withPeriodStart, type StoredInstallment } from "./loanSchedule";

/**
 * ຄ່າປັບກາຍກຳນົດ ແລະ ການແບ່ງເງິນທີ່ຮັບ (ລະບົບສິນເຊື່ອ). ບໍ່ແຕະ DB — ໃຊ້ໄດ້ທັງ API ແລະ ການທົດສອບ.
 *
 * ຄ່າປັບ: ແຕ່ລະງວດທີ່ກາຍກຳນົດ ຄິດເປັນລາຍວັນ = ຍອດທີ່ຍັງຄ້າງຂອງງວດນັ້ນ × ອັດຕາ % ຕໍ່ວັນ, ເລີ່ມນັບຫຼັງມື້ຜ່ອນຜັນ
 * (ຄົບກຳນົດ 1/12 ຜ່ອນຜັນ 3 ມື້ → ຄິດແຕ່ 4/12). ຈ່າຍບາງສ່ວນ = ຍອດຄ້າງຫຼຸດລົງແຕ່ມື້ຈ່າຍ (ການຈ່າຍຕັດງວດເກົ່າສຸດກ່ອນ).
 * ຍອດຄ້າງ: base 1 = ຕົ້ນ + ດອກ ຂອງງວດ, 2 = ສະເພາະຕົ້ນທຶນ.
 */

export type PenaltyTerms = { rate: number; base: number; grace: number };
export type PaidRow = { pay_date: string; principal: number; interest: number };

export type InstallmentPenalty = {
  no: number;
  due_date: string;
  /** ມື້ກາຍກຳນົດ (ຮອດມື້ຈ່າຍຄົບ ຫຼື asOf) */
  days_late: number;
  /** ຍອດທີ່ຄິດຄ່າປັບຢູ່ດຽວນີ້ */
  base: number;
  /** ຄ່າປັບທີ່ເກີດຂຶ້ນທັງໝົດຮອດ asOf */
  accrued: number;
};

const days = (from: string, to: string) => moment(to).diff(moment(from), "days");
const plusDays = (date: string, n: number) => moment(date).add(n, "days").format("YYYY-MM-DD");

/** ຍອດຄ້າງຂອງແຕ່ລະງວດ ຫຼັງການຈ່າຍທີ່ລົງວັນທີ ≤ date */
const duesAfter = (rows: StoredInstallment[], startDate: string, payments: PaidRow[], date: string, base: number) => {
  const upTo = payments.filter((p) => p.pay_date <= date);
  const principal = upTo.reduce((n, p) => n + p.principal, 0);
  const interest = upTo.reduce((n, p) => n + p.interest, 0);
  return new Map(allocatePaid(withPeriodStart(startDate, rows), principal, interest)
    .map((r) => [r.no, r.settled ? 0 : base === 2 ? r.due_principal : r.due_principal + r.due_interest]));
};

/**
 * ຄ່າປັບຂອງແຕ່ລະງວດ ຮອດວັນທີ asOf (ບໍ່ລວມມື້ asOf — ຈ່າຍມື້ນັ້ນ = ບໍ່ຄິດມື້ນັ້ນ)
 */
export const penaltiesOf = (terms: PenaltyTerms, startDate: string, rows: StoredInstallment[], payments: PaidRow[], asOf: string, decimals: number): InstallmentPenalty[] => {
  const sorted = [...payments].sort((a, b) => a.pay_date.localeCompare(b.pay_date));
  const dates = [...new Set(sorted.map((p) => p.pay_date))];
  const cache = new Map<string, Map<number, number>>();
  const dueOn = (date: string) => {
    if (!cache.has(date)) cache.set(date, duesAfter(rows, startDate, sorted, date, terms.base));
    return cache.get(date)!;
  };
  return rows.filter((r) => !r.settled && r.due_date < asOf).map((r) => {
    // ມື້ຈ່າຍຄົບ (ຍອດຄ້າງເປັນ 0) — ຖ້າບໍ່ມີ = ຍັງຄ້າງຮອດ asOf
    const settledOn = [r.due_date, ...dates.filter((d) => d > r.due_date && d <= asOf)]
      .find((d) => (dueOn(d).get(r.no) ?? 0) <= 0.004) ?? null;
    const lateUntil = settledOn ?? asOf;
    let accrued = 0;
    if (terms.rate > 0) {
      const from = plusDays(r.due_date, Math.max(0, terms.grace));
      // ຊ່ວງ [a, b) ລະຫວ່າງມື້ຈ່າຍ — ຍອດຄ້າງຄົງທີ່ໃນແຕ່ລະຊ່ວງ
      const cuts = [from, ...dates.filter((d) => d > from && d < lateUntil), lateUntil].filter((d, i, all) => i === 0 || d > all[i - 1]);
      for (let i = 0; i + 1 < cuts.length; i += 1) {
        const a = cuts[i];
        const b = cuts[i + 1];
        if (b <= from) continue;
        accrued += (dueOn(a).get(r.no) ?? 0) * (terms.rate / 100) * days(a, b);
      }
    }
    return {
      no: r.no,
      due_date: r.due_date,
      days_late: Math.max(0, days(r.due_date, lateUntil)),
      base: settledOn ? 0 : dueOn(asOf).get(r.no) ?? 0,
      accrued: roundTo(accrued, decimals),
    };
  }).filter((p) => p.days_late > 0 || p.accrued > 0);
};

/** ແບ່ງຈຳນວນ (ຈ່າຍ ຫຼື ຍົກເວັ້ນ) ໃສ່ຄ່າປັບຄ້າງຂອງງວດເກົ່າສຸດກ່ອນ → [{ no, amount }] */
export const spreadOldestFirst = (due: { no: number; due: number }[], amount: number, decimals: number) => {
  let left = roundTo(amount, decimals);
  const out: { no: number; amount: number }[] = [];
  for (const row of [...due].sort((a, b) => a.no - b.no)) {
    if (left <= 0) break;
    const take = roundTo(Math.min(left, row.due), decimals);
    if (take > 0) out.push({ no: row.no, amount: take });
    left = roundTo(left - take, decimals);
  }
  return out;
};

export type Split = { penalty: number; interest: number; principal: number };

/**
 * ແບ່ງເງິນທີ່ຮັບ: ຄ່າປັບກ່ອນ → ແລ້ວແຕ່ລະງວດ (ເກົ່າສຸດກ່ອນ) ດອກເບ້ຍ → ຕົ້ນທຶນ. dues = ງວດທີ່ຍັງຄ້າງ (ລຽງຕາມເລກງວດ)
 */
export const splitAmount = (amount: number, penaltyDue: number, dues: { interest: number; principal: number }[], decimals: number): Split & { left: number } => {
  let left = roundTo(amount, decimals);
  const take = (want: number) => {
    const v = roundTo(Math.max(0, Math.min(left, want)), decimals);
    left = roundTo(left - v, decimals);
    return v;
  };
  const penalty = take(penaltyDue);
  let interest = 0;
  let principal = 0;
  for (const d of dues) {
    interest += take(d.interest);
    principal += take(d.principal);
  }
  return { penalty, interest: roundTo(interest, decimals), principal: roundTo(principal, decimals), left };
};

/**
 * ມື້ກາຍກຳນົດຂອງງວດເກົ່າສຸດທີ່ຍັງຄ້າງ ณ ວັນທີ date (ການຈ່າຍທີ່ລົງວັນທີ ≤ date) — 0 = ບໍ່ກາຍ.
 * ໃຊ້ຈັດຊັ້ນໜີ້ທ້າຍເດືອນ ແລະ ຢຸດຄິດດອກເບ້ຍຄ້າງຂອງໜີ້ NPL
 */
export const daysOverdueAt = (startDate: string, rows: StoredInstallment[], payments: PaidRow[], date: string) => {
  const upTo = payments.filter((p) => p.pay_date <= date);
  const allocated = allocatePaid(withPeriodStart(startDate, rows), upTo.reduce((n, p) => n + p.principal, 0), upTo.reduce((n, p) => n + p.interest, 0));
  const oldest = allocated.find((r) => !r.settled && r.due_date < date && (r.due_principal > 0.004 || r.due_interest > 0.004));
  return oldest ? days(oldest.due_date, date) : 0;
};

/** ເກນຈັດຊັ້ນໜີ້ (tbl_loan_class_rule) ທີ່ກົງກັບມື້ກາຍກຳນົດ — ບໍ່ພົບ = ຊັ້ນທຳອິດ */
export const classOf = <R extends { min_days: number; max_days: number | null }>(rules: R[], daysOverdue: number) =>
  rules.find((r) => daysOverdue >= Number(r.min_days) && (r.max_days === null || daysOverdue <= Number(r.max_days))) ?? rules[0];
