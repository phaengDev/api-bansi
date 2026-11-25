import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";

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
class Loan extends Model {
  declare _uuid: number;
  declare loan_code: string;
  declare direction: number;
  declare counterparty: string;
  declare contract_no: string | null;
  declare currency_id: number | null;
  declare principal: string;
  declare annual_rate: string;
  declare method: number;
  declare day_basis: number;
  declare frequency_months: number;
  declare term: number;
  declare start_date: string;
  declare first_due_date: string;
  declare start_mode: number;
  declare treasury_account_id: number | null;
  declare opening_date: string | null;
  declare loan_account_id: number;
  declare interest_account_id: number | null;
  declare accrued_account_id: number | null;
  declare purpose: string | null;
  declare note: string | null;
  declare status: number;
  declare created_by: number | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

const money = () => ({ type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0 });

Loan.init(
  {
    _uuid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    loan_code: { type: DataTypes.STRING(30), allowNull: false },
    direction: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    counterparty: { type: DataTypes.STRING(200), allowNull: false },
    contract_no: DataTypes.STRING(100),
    currency_id: DataTypes.INTEGER,
    principal: money(),
    annual_rate: { type: DataTypes.DECIMAL(9, 4), allowNull: false, defaultValue: 0 },
    method: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    day_basis: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    frequency_months: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    term: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 12 },
    start_date: { type: DataTypes.DATEONLY, allowNull: false },
    first_due_date: { type: DataTypes.DATEONLY, allowNull: false },
    start_mode: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    treasury_account_id: DataTypes.INTEGER,
    opening_date: DataTypes.DATEONLY,
    loan_account_id: { type: DataTypes.INTEGER, allowNull: false },
    interest_account_id: DataTypes.INTEGER,
    accrued_account_id: DataTypes.INTEGER,
    purpose: DataTypes.STRING(255),
    note: DataTypes.STRING(255),
    status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    created_by: DataTypes.INTEGER,
    createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  { sequelize, modelName: "Loan", tableName: "tbl_loan", timestamps: true }
);

/**
 * ຕາຕະລາງຜ່ອນ — ແຖວລະງວດ (ສ້າງຈາກເງື່ອນໄຂຂອງເງິນກູ້, ສ້າງໃໝ່ເມື່ອແກ້ເງື່ອນໄຂ ກ່ອນມີການຈ່າຍ).
 * settled = 1: ງວດທີ່ຈ່າຍກ່ອນເຂົ້າລະບົບ (ຍອດຍົກມາ) — ບໍ່ມີແຖວຈ່າຍ
 */
export class LoanInstallment extends Model {
  declare _uuid: number;
  declare loan_id: number;
  declare no: number;
  declare due_date: string;
  declare principal: string;
  declare interest: string;
  declare balance: string;
  declare settled: number;
}

LoanInstallment.init(
  {
    _uuid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    loan_id: { type: DataTypes.INTEGER, allowNull: false },
    no: { type: DataTypes.INTEGER, allowNull: false },
    due_date: { type: DataTypes.DATEONLY, allowNull: false },
    principal: money(),
    interest: money(),
    /** ຍອດຕົ້ນທຶນຄົງເຫຼືອຫຼັງງວດນີ້ */
    balance: money(),
    settled: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
  },
  { sequelize, modelName: "LoanInstallment", tableName: "tbl_loan_installment", timestamps: false }
);

/** ການຈ່າຍ (ເງິນກູ້ຢືມ) / ຮັບ (ເງິນໃຫ້ກູ້) ຄືນ — ຕົ້ນທຶນ + ດອກເບ້ຍ + ຄ່າທຳນຽມ/ຄ່າປັບ ຜ່ານບັນຊີເງິນຄັງ; status 2 = ຍົກເລີກ */
export class LoanPayment extends Model {
  declare _uuid: number;
  declare loan_id: number;
  declare number: string | null;
  declare pay_date: string;
  declare treasury_account_id: number;
  declare principal: string;
  declare interest: string;
  declare fee: string;
  declare reference: string | null;
  declare note: string | null;
  declare status: number;
  declare created_by: number | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

LoanPayment.init(
  {
    _uuid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    loan_id: { type: DataTypes.INTEGER, allowNull: false },
    number: DataTypes.STRING(40),
    pay_date: { type: DataTypes.DATEONLY, allowNull: false },
    treasury_account_id: { type: DataTypes.INTEGER, allowNull: false },
    principal: money(),
    interest: money(),
    fee: money(),
    reference: DataTypes.STRING(100),
    note: DataTypes.STRING(255),
    status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    created_by: DataTypes.INTEGER,
    createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  { sequelize, modelName: "LoanPayment", tableName: "tbl_loan_payment", timestamps: true }
);

/**
 * ດອກເບ້ຍຄ້າງ ນ ທ້າຍເດືອນ ຕໍ່ເງິນກູ້ (period = YYYY-MM) — entry_id = ໃບ LOAN_ACCRUAL (ທ້າຍເດືອນ),
 * reversal_id = ໃບ LOAN_ACCRUAL_REV (ວັນທີ 1 ເດືອນຖັດໄປ) ຂອງເດືອນນັ້ນ
 */
export class LoanAccrual extends Model {
  declare _uuid: number;
  declare loan_id: number;
  declare period: string;
  declare amount: string;
  declare entry_id: number | null;
  declare reversal_id: number | null;
}

LoanAccrual.init(
  {
    _uuid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    loan_id: { type: DataTypes.INTEGER, allowNull: false },
    period: { type: DataTypes.STRING(7), allowNull: false },
    amount: money(),
    entry_id: DataTypes.INTEGER,
    reversal_id: DataTypes.INTEGER,
  },
  { sequelize, modelName: "LoanAccrual", tableName: "tbl_loan_accrual", timestamps: false }
);

autoSync(Loan);
autoSync(LoanInstallment);
autoSync(LoanPayment);
autoSync(LoanAccrual);
export default Loan;
