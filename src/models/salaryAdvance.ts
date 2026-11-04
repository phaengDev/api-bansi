import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";
import Employee from "./employee";
import TreasuryAccount from "./treasuryAcount";

/**
 * ເງິນເບີກລ່ວງໜ້າຂອງພະນັກງານ (ສະກຸນກີບ). ພະນັກງານຂໍຜ່ານ app ຫຼື HR ບັນທຶກແທນ → HR ອະນຸມັດ → ຈ່າຍເງິນ
 * (ເງິນອອກຈາກ account_id + ລົງບັນຊີ ໜີ້ ເງິນລ່ວງໜ້າພະນັກງານ) → ຫັກຄືນຈາກເງິນເດືອນທຸກເດືອນ ຫຼື ຮັບຄືນເປັນເງິນສົດ.
 * status: 1 ລໍຖ້າອະນຸມັດ, 2 ອະນຸມັດແລ້ວ (ລໍຖ້າຈ່າຍເງິນ), 3 ຈ່າຍແລ້ວ (ກຳລັງຫັກຄືນ), 4 ຄືນຄົບແລ້ວ, 5 ປະຕິເສດ, 6 ຍົກເລີກ.
 * requested_amount = ຍອດທີ່ຂໍ, amount = ຍອດທີ່ອະນຸມັດ; monthly_deduction = ຫັກຕໍ່ເດືອນ, start_period = ເດືອນທຳອິດທີ່ຫັກ "YYYY-MM";
 * repaid = ຍອດທີ່ຄືນແລ້ວ (ຜົນລວມຂອງ tbl_salary_advance_repayment). source: 1 app ພະນັກງານ, 2 HR ບັນທຶກແທນ
 */
class SalaryAdvance extends Model {
  public _uuid!: number;
  public number!: string | null;
  public employee_id!: number;
  public requested_amount!: string;
  public amount!: string;
  public installments!: number;
  public monthly_deduction!: string;
  public start_period!: string;
  public reason!: string;
  public repaid!: string;
  public status!: number;
  public source!: number;
  public account_id!: number | null;
  public pay_date!: string | null;
  public paidbyid!: number | null;
  public paidAt!: Date | null;
  public review_note!: string | null;
  public reviewedbyid!: number | null;
  public reviewedAt!: Date | null;
  public settledAt!: Date | null;
  public createdbyid!: number | null;
  public createdAt!: Date;
  public updatedAt!: Date;
}

/** ສ້າງໃໝ່ທຸກຖັນ — Sequelize ແກ້ object ຂອງ attribute (field), ໃຊ້ object ດຽວກັນຫຼາຍຖັນ = ທຸກຖັນຊີ້ໄປຖັນທຳອິດ */
const money = () => ({ type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0 });

SalaryAdvance.init(
  {
    _uuid: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    number: DataTypes.STRING(30),
    employee_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    requested_amount: money(),
    amount: money(),
    installments: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1
    },
    monthly_deduction: money(),
    start_period: {
      type: DataTypes.STRING(7),
      allowNull: false
    },
    reason: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    repaid: money(),
    status: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1
    },
    source: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1
    },
    account_id: DataTypes.INTEGER,
    pay_date: DataTypes.DATEONLY,
    paidbyid: DataTypes.INTEGER,
    paidAt: DataTypes.DATE,
    review_note: DataTypes.STRING(255),
    reviewedbyid: DataTypes.INTEGER,
    reviewedAt: DataTypes.DATE,
    settledAt: DataTypes.DATE,
    createdbyid: DataTypes.INTEGER,
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
  },
  {
    sequelize,
    modelName: "SalaryAdvance",
    tableName: "tbl_salary_advance",
    timestamps: true
  }
);

SalaryAdvance.belongsTo(Employee, { foreignKey: "employee_id", as: "employee", constraints: false });
SalaryAdvance.belongsTo(TreasuryAccount, { foreignKey: "account_id", as: "account", constraints: false });

autoSync(SalaryAdvance);
export default SalaryAdvance;
