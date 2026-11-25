"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.allocatePaid = exports.earnedInterest = exports.withPeriodStart = exports.termsError = exports.buildSchedule = exports.dueDates = exports.FREQUENCIES = exports.DAY_BASIS = exports.METHODS = exports.roundTo = exports.decimalsOf = void 0;
const moment_1 = __importDefault(require("moment"));
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
const decimalsOf = (currencyName) => (String(currencyName ?? "LAK").toUpperCase() === "LAK" ? 0 : 2);
exports.decimalsOf = decimalsOf;
const roundTo = (n, decimals) => {
    const f = 10 ** decimals;
    return Math.round((Number(n) || 0) * f) / f;
};
exports.roundTo = roundTo;
exports.METHODS = { ANNUITY: 1, EQUAL_PRINCIPAL: 2, FLAT: 3, BULLET: 4 };
exports.DAY_BASIS = { MONTHLY: 1, ACTUAL_365: 2 };
exports.FREQUENCIES = [1, 3, 6, 12];
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const daysBetween = (from, to) => Math.max(0, (0, moment_1.default)(to).diff((0, moment_1.default)(from), "days"));
/** ວັນຄົບກຳນົດ — ນັບຈາກງວດທຳອິດທຸກເທື່ອ (31/01 → 28/02 → 31/03, ບໍ່ເລື່ອນ) */
const dueDates = (firstDue, term, frequency) => Array.from({ length: term }, (_, i) => (0, moment_1.default)(firstDue).add(i * frequency, "months").format("YYYY-MM-DD"));
exports.dueDates = dueDates;
const buildSchedule = (terms, decimals = 2) => {
    const rd = (n) => (0, exports.roundTo)(n, decimals);
    const P = rd(terms.principal);
    const n = Math.max(1, Math.round(terms.term));
    const freq = Math.max(1, Math.round(terms.frequency_months));
    const yearly = (Number(terms.annual_rate) || 0) / 100;
    const periodic = (yearly * freq) / 12;
    const dates = (0, exports.dueDates)(terms.first_due_date, n, freq);
    const level = periodic > 0 ? (P * periodic) / (1 - Math.pow(1 + periodic, -n)) : P / n;
    const rows = [];
    let balance = P;
    dates.forEach((due, i) => {
        const start = i === 0 ? terms.start_date : dates[i - 1];
        const days = daysBetween(start, due);
        const last = i === n - 1;
        const rateOf = (base) => (Number(terms.day_basis) === exports.DAY_BASIS.ACTUAL_365 ? (base * yearly * days) / 365 : base * periodic);
        let interest;
        let principal;
        switch (Number(terms.method)) {
            case exports.METHODS.EQUAL_PRINCIPAL:
                interest = rateOf(balance);
                principal = last ? balance : P / n;
                break;
            case exports.METHODS.FLAT:
                interest = rateOf(P);
                principal = last ? balance : P / n;
                break;
            case exports.METHODS.BULLET:
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
exports.buildSchedule = buildSchedule;
/** ກວດເງື່ອນໄຂ — ຂໍ້ຄວາມ error ຫຼື null */
const termsError = (terms) => {
    if (!(terms.principal > 0))
        return "ຍອດເງິນກູ້ຕ້ອງຫຼາຍກວ່າ 0";
    if (!(terms.annual_rate >= 0 && terms.annual_rate <= 100))
        return "ອັດຕາດອກເບ້ຍຕໍ່ປີ ຕ້ອງ 0–100%";
    if (!Object.values(exports.METHODS).includes(Number(terms.method)))
        return "ກະລຸນາເລືອກວິທີຄິດດອກເບ້ຍ";
    if (!exports.FREQUENCIES.includes(Number(terms.frequency_months)))
        return "ກະລຸນາເລືອກໄລຍະຈ່າຍ (1, 3, 6, 12 ເດືອນ)";
    if (!(terms.term >= 1 && terms.term <= 600))
        return "ຈຳນວນງວດ ຕ້ອງ 1–600";
    if (!terms.start_date || !terms.first_due_date)
        return "ກະລຸນາເລືອກວັນທີກູ້ ແລະ ວັນຄົບກຳນົດງວດທຳອິດ";
    if (terms.first_due_date <= terms.start_date)
        return "ງວດທຳອິດຕ້ອງຫຼັງວັນທີກູ້";
    return null;
};
exports.termsError = termsError;
const withPeriodStart = (startDate, rows) => [...rows].sort((a, b) => a.no - b.no).map((row, i, sorted) => ({ ...row, period_start: i === 0 ? startDate : sorted[i - 1].due_date }));
exports.withPeriodStart = withPeriodStart;
/**
 * ດອກເບ້ຍທີ່ເກີດຂຶ້ນແລ້ວ ຮອດວັນທີ asOf (ລວມມື້ນັ້ນ) — ດອກຂອງແຕ່ລະງວດກະຈາຍເທົ່າກັນທຸກມື້ຂອງງວດ
 */
const earnedInterest = (startDate, rows, asOf) => r2((0, exports.withPeriodStart)(startDate, rows).reduce((sum, row) => {
    if (asOf >= row.due_date)
        return sum + row.interest;
    if (asOf <= row.period_start)
        return sum;
    const total = daysBetween(row.period_start, row.due_date);
    return total > 0 ? sum + (row.interest * daysBetween(row.period_start, asOf)) / total : sum;
}, 0));
exports.earnedInterest = earnedInterest;
/**
 * ສະຖານະຂອງແຕ່ລະງວດ — ຍອດທີ່ຈ່າຍແລ້ວ (ລວມງວດທີ່ຈ່າຍກ່ອນເຂົ້າລະບົບ) ຕັດໃສ່ງວດເກົ່າສຸດກ່ອນ (ຕົ້ນທຶນ ແລະ ດອກ ແຍກກັນ)
 */
const allocatePaid = (rows, paidPrincipal, paidInterest) => {
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
exports.allocatePaid = allocatePaid;
