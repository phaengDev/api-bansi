"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.classOf = exports.daysOverdueAt = exports.splitAmount = exports.spreadOldestFirst = exports.penaltiesOf = void 0;
const moment_1 = __importDefault(require("moment"));
const loanSchedule_1 = require("./loanSchedule");
const days = (from, to) => (0, moment_1.default)(to).diff((0, moment_1.default)(from), "days");
const plusDays = (date, n) => (0, moment_1.default)(date).add(n, "days").format("YYYY-MM-DD");
/** ຍອດຄ້າງຂອງແຕ່ລະງວດ ຫຼັງການຈ່າຍທີ່ລົງວັນທີ ≤ date */
const duesAfter = (rows, startDate, payments, date, base) => {
    const upTo = payments.filter((p) => p.pay_date <= date);
    const principal = upTo.reduce((n, p) => n + p.principal, 0);
    const interest = upTo.reduce((n, p) => n + p.interest, 0);
    return new Map((0, loanSchedule_1.allocatePaid)((0, loanSchedule_1.withPeriodStart)(startDate, rows), principal, interest)
        .map((r) => [r.no, r.settled ? 0 : base === 2 ? r.due_principal : r.due_principal + r.due_interest]));
};
/**
 * ຄ່າປັບຂອງແຕ່ລະງວດ ຮອດວັນທີ asOf (ບໍ່ລວມມື້ asOf — ຈ່າຍມື້ນັ້ນ = ບໍ່ຄິດມື້ນັ້ນ)
 */
const penaltiesOf = (terms, startDate, rows, payments, asOf, decimals) => {
    const sorted = [...payments].sort((a, b) => a.pay_date.localeCompare(b.pay_date));
    const dates = [...new Set(sorted.map((p) => p.pay_date))];
    const cache = new Map();
    const dueOn = (date) => {
        if (!cache.has(date))
            cache.set(date, duesAfter(rows, startDate, sorted, date, terms.base));
        return cache.get(date);
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
                if (b <= from)
                    continue;
                accrued += (dueOn(a).get(r.no) ?? 0) * (terms.rate / 100) * days(a, b);
            }
        }
        return {
            no: r.no,
            due_date: r.due_date,
            days_late: Math.max(0, days(r.due_date, lateUntil)),
            base: settledOn ? 0 : dueOn(asOf).get(r.no) ?? 0,
            accrued: (0, loanSchedule_1.roundTo)(accrued, decimals),
        };
    }).filter((p) => p.days_late > 0 || p.accrued > 0);
};
exports.penaltiesOf = penaltiesOf;
/** ແບ່ງຈຳນວນ (ຈ່າຍ ຫຼື ຍົກເວັ້ນ) ໃສ່ຄ່າປັບຄ້າງຂອງງວດເກົ່າສຸດກ່ອນ → [{ no, amount }] */
const spreadOldestFirst = (due, amount, decimals) => {
    let left = (0, loanSchedule_1.roundTo)(amount, decimals);
    const out = [];
    for (const row of [...due].sort((a, b) => a.no - b.no)) {
        if (left <= 0)
            break;
        const take = (0, loanSchedule_1.roundTo)(Math.min(left, row.due), decimals);
        if (take > 0)
            out.push({ no: row.no, amount: take });
        left = (0, loanSchedule_1.roundTo)(left - take, decimals);
    }
    return out;
};
exports.spreadOldestFirst = spreadOldestFirst;
/**
 * ແບ່ງເງິນທີ່ຮັບ: ຄ່າປັບກ່ອນ → ແລ້ວແຕ່ລະງວດ (ເກົ່າສຸດກ່ອນ) ດອກເບ້ຍ → ຕົ້ນທຶນ. dues = ງວດທີ່ຍັງຄ້າງ (ລຽງຕາມເລກງວດ)
 */
const splitAmount = (amount, penaltyDue, dues, decimals) => {
    let left = (0, loanSchedule_1.roundTo)(amount, decimals);
    const take = (want) => {
        const v = (0, loanSchedule_1.roundTo)(Math.max(0, Math.min(left, want)), decimals);
        left = (0, loanSchedule_1.roundTo)(left - v, decimals);
        return v;
    };
    const penalty = take(penaltyDue);
    let interest = 0;
    let principal = 0;
    for (const d of dues) {
        interest += take(d.interest);
        principal += take(d.principal);
    }
    return { penalty, interest: (0, loanSchedule_1.roundTo)(interest, decimals), principal: (0, loanSchedule_1.roundTo)(principal, decimals), left };
};
exports.splitAmount = splitAmount;
/**
 * ມື້ກາຍກຳນົດຂອງງວດເກົ່າສຸດທີ່ຍັງຄ້າງ ณ ວັນທີ date (ການຈ່າຍທີ່ລົງວັນທີ ≤ date) — 0 = ບໍ່ກາຍ.
 * ໃຊ້ຈັດຊັ້ນໜີ້ທ້າຍເດືອນ ແລະ ຢຸດຄິດດອກເບ້ຍຄ້າງຂອງໜີ້ NPL
 */
const daysOverdueAt = (startDate, rows, payments, date) => {
    const upTo = payments.filter((p) => p.pay_date <= date);
    const allocated = (0, loanSchedule_1.allocatePaid)((0, loanSchedule_1.withPeriodStart)(startDate, rows), upTo.reduce((n, p) => n + p.principal, 0), upTo.reduce((n, p) => n + p.interest, 0));
    const oldest = allocated.find((r) => !r.settled && r.due_date < date && (r.due_principal > 0.004 || r.due_interest > 0.004));
    return oldest ? days(oldest.due_date, date) : 0;
};
exports.daysOverdueAt = daysOverdueAt;
/** ເກນຈັດຊັ້ນໜີ້ (tbl_loan_class_rule) ທີ່ກົງກັບມື້ກາຍກຳນົດ — ບໍ່ພົບ = ຊັ້ນທຳອິດ */
const classOf = (rules, daysOverdue) => rules.find((r) => daysOverdue >= Number(r.min_days) && (r.max_days === null || daysOverdue <= Number(r.max_days))) ?? rules[0];
exports.classOf = classOf;
