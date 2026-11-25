import moment from "moment";

/**
 * ຄິດຕາຕະລາງຜ່ອນ ແລະ ດອກເບ້ຍຄ້າງຂອງເງິນກູ້ (ບໍ່ແຕະຖານຂໍ້ມູນ — ໃຊ້ທັງຕອນສະແດງຕົວຢ່າງໃນຟອມ ແລະ ຕອນບັນທຶກ)
 *
 * ວິທີ (method):
 *  1 ຜ່ອນເທົ່າກັນທຸກງວດ — ຍອດຈ່າຍຕໍ່ງວດຄົງທີ່ (PMT), ດອກ = ຍອດຄົງເຫຼືອ × ອັດຕາ, ຕົ້ນທຶນ = ຍອດຈ່າຍ − ດອກ
 *  2 ຕົ້ນທຶນເທົ່າກັນ — ຕົ້ນທຶນ = ຍອດກູ້ ÷ ຈຳນວນງວດ, ດອກ = ຍອດຄົງເຫຼືອ × ອັດຕາ (ຍອດຈ່າຍຫຼຸດລົງທຸກງວດ)
 *  3 ດອກເບ້ຍຄົງທີ່ (flat) — ດອກທຸກງວດຄິດຈາກຍອດກູ້ເດີມ, ຕົ້ນທຶນເທົ່າກັນ
 *  4 ຈ່າຍດອກທຸກງວດ, ຕົ້ນທຶນທັງໝົດງວດສຸດທ້າຍ
 * ອັດຕາຕໍ່ງວດ: day_basis 1 = ອັດຕາຕໍ່ປີ × ເດືອນຕໍ່ງວດ ÷ 12; 2 = ອັດຕາຕໍ່ປີ × ຈຳນວນວັນແທ້ຂອງງວດ ÷ 365
 * (ຍອດຈ່າຍຄົງທີ່ຂອງວິທີ 1 ຄິດຈາກອັດຕາຕໍ່ເດືອນສະເໝີ). ທຸກຍອດປັດຕາມທົດສະນິຍົມຂອງສະກຸນ (ກີບ = ຈຳນວນເຕັມ, ອື່ນ 2 ຕຳແໜ່ງ —
 * ຍອດບັນຊີເງິນຄັງເກັບເປັນຈຳນວນເຕັມ), ງວດສຸດທ້າຍຮັບເສດໃຫ້ຕົ້ນທຶນໝົດພໍດີ
 */

/** ທົດສະນິຍົມຂອງສະກຸນ — ກີບບໍ່ມີເສດ */
export const decimalsOf = (currencyName: string | null | undefined) => (String(currencyName ?? "LAK").toUpperCase() === "LAK" ? 0 : 2);
export const roundTo = (n: number, decimals: number) => {
  const f = 10 ** decimals;
  return Math.round((Number(n) || 0) * f) / f;
};

export const METHODS = { ANNUITY: 1, EQUAL_PRINCIPAL: 2, FLAT: 3, BULLET: 4 } as const;
export const DAY_BASIS = { MONTHLY: 1, ACTUAL_365: 2 } as const;
export const FREQUENCIES = [1, 3, 6, 12];

export type ScheduleTerms = {
  principal: number;
  annual_rate: number;
  method: number;
  day_basis: number;
  frequency_months: number;
  term: number;
  start_date: string;
  first_due_date: string;
};

export type ScheduleRow = {
  no: number;
  /** ວັນເລີ່ມນັບດອກຂອງງວດ (ງວດກ່ອນຄົບກຳນົດ ຫຼື ວັນທີກູ້) */
  period_start: string;
  due_date: string;
  days: number;
  principal: number;
  interest: number;
  payment: number;
  /** ຍອດຕົ້ນທຶນຄົງເຫຼືອຫຼັງງວດນີ້ */
  balance: number;
};

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const daysBetween = (from: string, to: string) => Math.max(0, moment(to).diff(moment(from), "days"));

/** ວັນຄົບກຳນົດ — ນັບຈາກງວດທຳອິດທຸກເທື່ອ (31/01 → 28/02 → 31/03, ບໍ່ເລື່ອນ) */
export const dueDates = (firstDue: string, term: number, frequency: number) =>
  Array.from({ length: term }, (_, i) => moment(firstDue).add(i * frequency, "months").format("YYYY-MM-DD"));

export const buildSchedule = (terms: ScheduleTerms, decimals = 2): ScheduleRow[] => {
  const rd = (n: number) => roundTo(n, decimals);
  const P = rd(terms.principal);
  const n = Math.max(1, Math.round(terms.term));
  const freq = Math.max(1, Math.round(terms.frequency_months));
  const yearly = (Number(terms.annual_rate) || 0) / 100;
  const periodic = (yearly * freq) / 12;
  const dates = dueDates(terms.first_due_date, n, freq);
  const level = periodic > 0 ? (P * periodic) / (1 - Math.pow(1 + periodic, -n)) : P / n;

  const rows: ScheduleRow[] = [];
  let balance = P;
  dates.forEach((due, i) => {
    const start = i === 0 ? terms.start_date : dates[i - 1];
    const days = daysBetween(start, due);
    const last = i === n - 1;
    const rateOf = (base: number) => (Number(terms.day_basis) === DAY_BASIS.ACTUAL_365 ? (base * yearly * days) / 365 : base * periodic);
    let interest: number;
    let principal: number;
    switch (Number(terms.method)) {
      case METHODS.EQUAL_PRINCIPAL:
        interest = rateOf(balance);
        principal = last ? balance : P / n;
        break;
      case METHODS.FLAT:
        interest = rateOf(P);
        principal = last ? balance : P / n;
        break;
      case METHODS.BULLET:
        interest = rateOf(balance);
        principal = last ? balance : 0;
        break;
      default:
        interest = rateOf(balance);
        principal = last ? balance : Math.max(0, level - interest);
    }
    interest = rd(interest);
    principal = rd(Math.min(balance, principal));
    balance = rd(balance - principal);
    rows.push({ no: i + 1, period_start: start, due_date: due, days, principal, interest, payment: rd(principal + interest), balance });
  });
  return rows;
};

/** ກວດເງື່ອນໄຂ — ຂໍ້ຄວາມ error ຫຼື null */
export const termsError = (terms: ScheduleTerms) => {
  if (!(terms.principal > 0)) return "ຍອດເງິນກູ້ຕ້ອງຫຼາຍກວ່າ 0";
  if (!(terms.annual_rate >= 0 && terms.annual_rate <= 100)) return "ອັດຕາດອກເບ້ຍຕໍ່ປີ ຕ້ອງ 0–100%";
  if (!Object.values(METHODS).includes(Number(terms.method) as any)) return "ກະລຸນາເລືອກວິທີຄິດດອກເບ້ຍ";
  if (!FREQUENCIES.includes(Number(terms.frequency_months))) return "ກະລຸນາເລືອກໄລຍະຈ່າຍ (1, 3, 6, 12 ເດືອນ)";
  if (!(terms.term >= 1 && terms.term <= 600)) return "ຈຳນວນງວດ ຕ້ອງ 1–600";
  if (!terms.start_date || !terms.first_due_date) return "ກະລຸນາເລືອກວັນທີກູ້ ແລະ ວັນຄົບກຳນົດງວດທຳອິດ";
  if (terms.first_due_date <= terms.start_date) return "ງວດທຳອິດຕ້ອງຫຼັງວັນທີກູ້";
  return null;
};

/** ງວດທີ່ເກັບໃນຖານ + ວັນເລີ່ມນັບດອກ (ງວດກ່ອນ / ວັນທີກູ້) */
export type StoredInstallment = { no: number; due_date: string; principal: number; interest: number; settled: boolean };

export const withPeriodStart = (startDate: string, rows: StoredInstallment[]) =>
  [...rows].sort((a, b) => a.no - b.no).map((row, i, sorted) => ({ ...row, period_start: i === 0 ? startDate : sorted[i - 1].due_date }));

/**
 * ດອກເບ້ຍທີ່ເກີດຂຶ້ນແລ້ວ ຮອດວັນທີ asOf (ລວມມື້ນັ້ນ) — ດອກຂອງແຕ່ລະງວດກະຈາຍເທົ່າກັນທຸກມື້ຂອງງວດ
 */
export const earnedInterest = (startDate: string, rows: StoredInstallment[], asOf: string) =>
  r2(withPeriodStart(startDate, rows).reduce((sum, row) => {
    if (asOf >= row.due_date) return sum + row.interest;
    if (asOf <= row.period_start) return sum;
    const total = daysBetween(row.period_start, row.due_date);
    return total > 0 ? sum + (row.interest * daysBetween(row.period_start, asOf)) / total : sum;
  }, 0));

/**
 * ສະຖານະຂອງແຕ່ລະງວດ — ຍອດທີ່ຈ່າຍແລ້ວ (ລວມງວດທີ່ຈ່າຍກ່ອນເຂົ້າລະບົບ) ຕັດໃສ່ງວດເກົ່າສຸດກ່ອນ (ຕົ້ນທຶນ ແລະ ດອກ ແຍກກັນ)
 */
export const allocatePaid = <R extends StoredInstallment>(rows: R[], paidPrincipal: number, paidInterest: number) => {
  let principalLeft = r2(paidPrincipal + rows.filter((r) => r.settled).reduce((n, r) => n + r.principal, 0));
  let interestLeft = r2(paidInterest + rows.filter((r) => r.settled).reduce((n, r) => n + r.interest, 0));
  return [...rows].sort((a, b) => a.no - b.no).map((row) => {
    const paid_principal = r2(Math.min(row.principal, Math.max(0, principalLeft)));
    const paid_interest = r2(Math.min(row.interest, Math.max(0, interestLeft)));
    principalLeft = r2(principalLeft - paid_principal);
    interestLeft = r2(interestLeft - paid_interest);
    return { ...row, paid_principal, paid_interest, due_principal: r2(row.principal - paid_principal), due_interest: r2(row.interest - paid_interest) };
  });
};
