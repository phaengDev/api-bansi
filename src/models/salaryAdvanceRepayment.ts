import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";
import SalaryAdvance from "./salaryAdvance";
import TreasuryAccount from "./treasuryAcount";

/**
 * ການຄືນເງິນເບີກລ່ວງໜ້າ — kind 1 ຫັກຈາກເງິນເດືອນ (payroll_id + period: ສ້າງຕອນຈ່າຍເງິນເດືອນ, ລຶບຕອນຍົກເລີກການຈ່າຍ),
 * 2 ຮັບຄືນເປັນເງິນສົດ/ໂອນ (account_id: ເງິນເຂົ້າບັນຊີເງິນຄັງ + ລົງບັນຊີ "ADVANCE_REPAY")
 */
class SalaryAdvanceRepayment extends Model {
  public _uuid!: number;
  public advance_id!: number;
  public employee_id!: number;
  public kind!: number;
  public amount!: string;
  public repay_date!: string;
  public period!: string | null;
  public payroll_id!: number | null;
  public account_id!: number | null;
  public note!: string | null;
  public createdbyid!: number | null;
  public createdAt!: Date;
  public updatedAt!: Date;
}

SalaryAdvanceRepayment.init(
  {
    _uuid: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    advance_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    employee_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    kind: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1
    },
    amount: {
      type: DataTypes.DECIMAL(16, 2),
      allowNull: false,
      defaultValue: 0
    },
    repay_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    period: DataTypes.STRING(7),
    payroll_id: DataTypes.INTEGER,
    account_id: DataTypes.INTEGER,
    note: DataTypes.STRING(255),
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
    modelName: "SalaryAdvanceRepayment",
    tableName: "tbl_salary_advance_repayment",
    timestamps: true
  }
);

SalaryAdvance.hasMany(SalaryAdvanceRepayment, { foreignKey: "advance_id", as: "repayments", constraints: false });
SalaryAdvanceRepayment.belongsTo(SalaryAdvance, { foreignKey: "advance_id", as: "advance", constraints: false });
SalaryAdvanceRepayment.belongsTo(TreasuryAccount, { foreignKey: "account_id", as: "account", constraints: false });

autoSync(SalaryAdvanceRepayment);
export default SalaryAdvanceRepayment;
