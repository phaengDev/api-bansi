"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoanAccrual = exports.LoanPayment = exports.LoanInstallment = void 0;
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
/**
 * ເງິນກູ້ (controllers/bansi/loanController):
 * - direction 1 = ເງິນກູ້ຢືມ (ບໍລິສັດເປັນໜີ້ — ໜີ້ສິນ, ດອກເບ້ຍຈ່າຍ), 2 = ເງິນໃຫ້ກູ້ (ບໍລິສັດເປັນເຈົ້າໜີ້ — ຊັບສິນ, ດອກເບ້ຍຮັບ)
 * - method: 1 ຜ່ອນເທົ່າກັນທຸກງວດ (ດອກຫຼຸດຕາມຍອດ), 2 ຕົ້ນທຶນເທົ່າກັນ + ດອກຕາມຍອດຄົງເຫຼືອ, 3 ດອກເບ້ຍຄົງທີ່ (ຄິດຈາກຍອດກູ້),
 *   4 ຈ່າຍດອກທຸກງວດ ຕົ້ນທຶນງວດສຸດທ້າຍ. day_basis: 1 = ເດືອນລະ 1/12 ຂອງອັດຕາຕໍ່ປີ, 2 = ຕາມຈຳນວນວັນແທ້ / 365
 * - frequency_months = ຈ່າຍທຸກຈັກເດືອນ (1, 3, 6, 12); term = ຈຳນວນງວດ
 * - start_mode: 1 = ຮັບ/ຈ່າຍເງິນກູ້ຜ່ານບັນຊີເງິນຄັງ (treasury_account_id) ວັນທີ start_date,
 *   2 = ຍອດຍົກມາ (ເງິນກູ້ເກົ່າ): ງວດທີ່ຄົບກຳນົດຮອດ opening_date ຖືວ່າຈ່າຍແລ້ວ, ຍອດຄົງເຫຼືອລົງຄູ່ກັບ ທຶນຍອດຍົກມາ
 * - ຍອດ (principal, ງວດ, ການຈ່າຍ) ເປັນສະກຸນຂອງເງິນກູ້ (currency_id null = ກີບ); status: 1 ໃຊ້ງານ (ປິດ = ຈ່າຍຕົ້ນທຶນຄົບ ຄິດເອົາ)
 */
class Loan extends sequelize_1.Model {
}
const money = () => ({ type: sequelize_1.DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0 });
Loan.init({
    _uuid: { type: sequelize_1.DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    loan_code: { type: sequelize_1.DataTypes.STRING(30), allowNull: false },
    direction: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    counterparty: { type: sequelize_1.DataTypes.STRING(200), allowNull: false },
    // ---- ສິນເຊື່ອ (sql/credit_system.sql) — ລູກຄ້າ, ຜະລິດຕະພັນ, ຄຳຮ້ອງ, ພະນັກງານສິນເຊື່ອ (tbl_employee) ----
    customer_id: sequelize_1.DataTypes.INTEGER,
    product_id: sequelize_1.DataTypes.INTEGER,
    application_id: sequelize_1.DataTypes.INTEGER,
    officer_id: sequelize_1.DataTypes.INTEGER,
    contract_no: sequelize_1.DataTypes.STRING(100),
    currency_id: sequelize_1.DataTypes.INTEGER,
    principal: money(),
    annual_rate: { type: sequelize_1.DataTypes.DECIMAL(9, 4), allowNull: false, defaultValue: 0 },
    method: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    day_basis: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    frequency_months: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    /** ຈ່າຍທຸກຈັກມື້ (7 ອາທິດ, 14 ສອງອາທິດ, 1 ທຸກມື້) — null = ນັບເປັນເດືອນ (frequency_months) */
    frequency_days: sequelize_1.DataTypes.INTEGER,
    term: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, defaultValue: 12 },
    start_date: { type: sequelize_1.DataTypes.DATEONLY, allowNull: false },
    first_due_date: { type: sequelize_1.DataTypes.DATEONLY, allowNull: false },
    start_mode: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    treasury_account_id: sequelize_1.DataTypes.INTEGER,
    opening_date: sequelize_1.DataTypes.DATEONLY,
    loan_account_id: { type: sequelize_1.DataTypes.INTEGER, allowNull: false },
    interest_account_id: sequelize_1.DataTypes.INTEGER,
    accrued_account_id: sequelize_1.DataTypes.INTEGER,
    purpose: sequelize_1.DataTypes.STRING(255),
    note: sequelize_1.DataTypes.STRING(255),
    status: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    created_by: sequelize_1.DataTypes.INTEGER,
    createdAt: { type: sequelize_1.DataTypes.DATE, defaultValue: sequelize_1.DataTypes.NOW },
    updatedAt: { type: sequelize_1.DataTypes.DATE, defaultValue: sequelize_1.DataTypes.NOW },
    /** ຄ່າທຳນຽມເປີດສິນເຊື່ອ — ຫັກຈາກເງິນທີ່ຈ່າຍໃຫ້ລູກຄ້າຕອນປ່ອຍກູ້ */
    upfront_fee: money(),
    /** ຄ່າປັບຊ້າ % ຕໍ່ວັນ; penalty_base 1 = ຍອດງວດທີ່ຄ້າງ (ຕົ້ນ+ດອກ), 2 = ສະເພາະຕົ້ນທຶນທີ່ຄ້າງ; ເລີ່ມຫຼັງຜ່ອນຜັນ grace_days ວັນ */
    penalty_rate: { type: sequelize_1.DataTypes.DECIMAL(9, 4), allowNull: false, defaultValue: 0 },
    penalty_base: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    grace_days: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    /** ຊັ້ນໜີ້ 1–5 (A–E) ແລະ ວັນເລີຍກຳນົດ ຕອນຈັດຊັ້ນລ່າສຸດ */
    loan_class: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    days_overdue: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    /** ປິດສັນຍາ: 1 ຈ່າຍຄົບ, 2 ປິດກ່ອນກຳນົດ, 3 ປັບໂຄງສ້າງ (ໄປສັນຍາໃໝ່), 4 ຕັດໜີ້ສູນ */
    closed_date: sequelize_1.DataTypes.DATEONLY,
    close_reason: sequelize_1.DataTypes.TINYINT,
}, { sequelize: database_1.default, modelName: "Loan", tableName: "tbl_loan", timestamps: true });
/**
 * ຕາຕະລາງຜ່ອນ — ແຖວລະງວດ (ສ້າງຈາກເງື່ອນໄຂຂອງເງິນກູ້, ສ້າງໃໝ່ເມື່ອແກ້ເງື່ອນໄຂ ກ່ອນມີການຈ່າຍ).
 * settled = 1: ງວດທີ່ຈ່າຍກ່ອນເຂົ້າລະບົບ (ຍອດຍົກມາ) — ບໍ່ມີແຖວຈ່າຍ
 */
class LoanInstallment extends sequelize_1.Model {
}
exports.LoanInstallment = LoanInstallment;
LoanInstallment.init({
    _uuid: { type: sequelize_1.DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    loan_id: { type: sequelize_1.DataTypes.INTEGER, allowNull: false },
    no: { type: sequelize_1.DataTypes.INTEGER, allowNull: false },
    due_date: { type: sequelize_1.DataTypes.DATEONLY, allowNull: false },
    principal: money(),
    interest: money(),
    /** ຍອດຕົ້ນທຶນຄົງເຫຼືອຫຼັງງວດນີ້ */
    balance: money(),
    settled: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
}, { sequelize: database_1.default, modelName: "LoanInstallment", tableName: "tbl_loan_installment", timestamps: false });
/** ການຈ່າຍ (ເງິນກູ້ຢືມ) / ຮັບ (ເງິນໃຫ້ກູ້) ຄືນ — ຕົ້ນທຶນ + ດອກເບ້ຍ + ຄ່າທຳນຽມ/ຄ່າປັບ ຜ່ານບັນຊີເງິນຄັງ; status 2 = ຍົກເລີກ */
class LoanPayment extends sequelize_1.Model {
}
exports.LoanPayment = LoanPayment;
LoanPayment.init({
    _uuid: { type: sequelize_1.DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    loan_id: { type: sequelize_1.DataTypes.INTEGER, allowNull: false },
    number: sequelize_1.DataTypes.STRING(40),
    pay_date: { type: sequelize_1.DataTypes.DATEONLY, allowNull: false },
    treasury_account_id: { type: sequelize_1.DataTypes.INTEGER, allowNull: false },
    principal: money(),
    interest: money(),
    fee: money(),
    /** ຄ່າປັບຊ້າທີ່ຮັບ; payment_type 1 ຕາມງວດ, 2 ຈ່າຍລ່ວງໜ້າບາງສ່ວນ, 3 ປິດບັນຊີກ່ອນກຳນົດ */
    penalty: money(),
    payment_type: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    reference: sequelize_1.DataTypes.STRING(100),
    note: sequelize_1.DataTypes.STRING(255),
    status: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    created_by: sequelize_1.DataTypes.INTEGER,
    createdAt: { type: sequelize_1.DataTypes.DATE, defaultValue: sequelize_1.DataTypes.NOW },
    updatedAt: { type: sequelize_1.DataTypes.DATE, defaultValue: sequelize_1.DataTypes.NOW },
}, { sequelize: database_1.default, modelName: "LoanPayment", tableName: "tbl_loan_payment", timestamps: true });
/**
 * ດອກເບ້ຍຄ້າງ ນ ທ້າຍເດືອນ ຕໍ່ເງິນກູ້ (period = YYYY-MM) — entry_id = ໃບ LOAN_ACCRUAL (ທ້າຍເດືອນ),
 * reversal_id = ໃບ LOAN_ACCRUAL_REV (ວັນທີ 1 ເດືອນຖັດໄປ) ຂອງເດືອນນັ້ນ
 */
class LoanAccrual extends sequelize_1.Model {
}
exports.LoanAccrual = LoanAccrual;
LoanAccrual.init({
    _uuid: { type: sequelize_1.DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    loan_id: { type: sequelize_1.DataTypes.INTEGER, allowNull: false },
    period: { type: sequelize_1.DataTypes.STRING(7), allowNull: false },
    amount: money(),
    entry_id: sequelize_1.DataTypes.INTEGER,
    reversal_id: sequelize_1.DataTypes.INTEGER,
}, { sequelize: database_1.default, modelName: "LoanAccrual", tableName: "tbl_loan_accrual", timestamps: false });
(0, autoSync_1.autoSync)(Loan);
(0, autoSync_1.autoSync)(LoanInstallment);
(0, autoSync_1.autoSync)(LoanPayment);
(0, autoSync_1.autoSync)(LoanAccrual);
exports.default = Loan;
