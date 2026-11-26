"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.userNames = exports.specialSummary = exports.closedSpecially = exports.agingOf = exports.AGING = exports.penaltyState = exports.PENALTY_WAIVED = exports.PENALTY_PAID = void 0;
const loanPenalty_1 = require("../../utils/loanPenalty");
const loanSchedule_1 = require("../../utils/loanSchedule");
const userModel_1 = __importDefault(require("../../models/userModel"));
/** tbl_loan_penalty.status */
exports.PENALTY_PAID = 2;
exports.PENALTY_WAIVED = 3;
const num = (v) => Number(v) || 0;
/**
 * ຄ່າປັບຂອງສັນຍາ ຮອດ asOf: ແຕ່ລະງວດ ເກີດຂຶ້ນ (accrued) − ຈ່າຍແລ້ວ − ຍົກເວັ້ນ = ຄ້າງ (due).
 * payments = ການຊຳລະທີ່ໃຊ້ງານ (ບໍ່ລວມທີ່ຍົກເລີກ), ledger = ແຖວ tbl_loan_penalty ຂອງສັນຍາ
 */
const penaltyState = (loan, stored, payments, ledger, asOf, decimals) => {
    const terms = { rate: num(loan.penalty_rate), base: Number(loan.penalty_base) === 2 ? 2 : 1, grace: Math.max(0, num(loan.grace_days)) };
    const paidRows = payments.map((p) => ({ pay_date: String(p.pay_date), principal: num(p.principal), interest: num(p.interest) }));
    const rows = (0, loanPenalty_1.penaltiesOf)(terms, String(loan.start_date), stored, paidRows, asOf, decimals).map((r) => {
        const mine = ledger.filter((x) => x.installment_no === r.no);
        const paid = (0, loanSchedule_1.roundTo)(mine.filter((x) => Number(x.status) === exports.PENALTY_PAID).reduce((n, x) => n + num(x.amount), 0), decimals);
        const waived = (0, loanSchedule_1.roundTo)(mine.filter((x) => Number(x.status) === exports.PENALTY_WAIVED).reduce((n, x) => n + num(x.waived_amount), 0), decimals);
        return { ...r, paid, waived, due: (0, loanSchedule_1.roundTo)(Math.max(0, r.accrued - paid - waived), decimals) };
    });
    const sum = (pick) => (0, loanSchedule_1.roundTo)(rows.reduce((n, r) => n + pick(r), 0), decimals);
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
exports.penaltyState = penaltyState;
/** ກຸ່ມອາຍຸໜີ້ (ມື້ກາຍກຳນົດ) */
exports.AGING = [
    { key: "current", min: 0, max: 0 },
    { key: "d1_30", min: 1, max: 30 },
    { key: "d31_60", min: 31, max: 60 },
    { key: "d61_90", min: 61, max: 90 },
    { key: "d91_180", min: 91, max: 180 },
    { key: "d180", min: 181, max: Infinity },
];
const agingOf = (daysOverdue) => exports.AGING.find((b) => daysOverdue >= b.min && daysOverdue <= b.max).key;
exports.agingOf = agingOf;
/** ປິດແບບພິເສດ: 3 ປັບໂຄງສ້າງ (ຍອດຍ້າຍໄປສັນຍາໃໝ່), 4 ຕັດໜີ້ສູນ (ຍອດອອກຈາກປຶ້ມ) — ບໍ່ນັບເປັນໜີ້ຄ້າງອີກ */
const closedSpecially = (loan) => [3, 4].includes(Number(loan.close_reason));
exports.closedSpecially = closedSpecially;
/** ສະຫຼຸບຂອງສັນຍາທີ່ປິດແບບພິເສດ: ປິດແລ້ວ, ບໍ່ມີຍອດຄ້າງ / ງວດຕໍ່ໄປ / ກາຍກຳນົດ */
const specialSummary = (summary) => ({ ...summary, outstanding: 0, closed: true, next: null, overdue_count: 0, overdue_amount: 0 });
exports.specialSummary = specialSummary;
/** ຊື່ຜູ້ໃຊ້ (ຜູ້ອະນຸມັດ, ຜູ້ບັນທຶກ) ຕາມ user_uuid */
const userNames = async (ids) => {
    const wanted = [...new Set(ids.map(Number).filter(Boolean))];
    if (!wanted.length)
        return new Map();
    const rows = (await userModel_1.default.findAll({ where: { user_uuid: wanted }, attributes: ["user_uuid", "user_name"], raw: true }));
    return new Map(rows.map((u) => [Number(u.user_uuid), u.user_name]));
};
exports.userNames = userNames;
