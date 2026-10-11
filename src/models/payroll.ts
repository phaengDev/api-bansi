import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";
import TreasuryAccount from "./treasuryAcount";

/**
 * ໃບເງິນເດືອນປະຈຳເດືອນ — 1 ໃບ ຕໍ່ ເດືອນ (UNIQUE period "YYYY-MM"), ລາຍຄົນຢູ່ tbl_payroll_line.
 * status: 1 ຮ່າງ (ແກ້ໄຂ/ຄິດໄລ່ໃໝ່ໄດ້), 2 ຈ່າຍແລ້ວ — ຈ່າຍ = ເງິນອອກຈາກ account_id (moveBalance "PAYROLL")
 * + ລົງບັນຊີຄູ່ (source "PAYROLL"); ຍົກເລີກການຈ່າຍ = ຄືນເງິນ + ກັບລາຍການ ແລ້ວກັບເປັນຮ່າງ.
 * total_* = ຜົນລວມຂອງທຸກແຖວ (ຄິດໃໝ່ທຸກຄັ້ງທີ່ແຖວປ່ຽນ)
 */
class Payroll extends Model {
  public _uuid!: number;
  public period!: string;
  public workdays!: number;
  public status!: number;
  public employees!: number;
  public total_base!: string;
  public total_attendance_deduction!: string;
  public total_additions!: string;
  public total_gross!: string;
  public total_sso_employee!: string;
  public total_sso_employer!: string;
  public total_tax!: string;
  public total_other_deduction!: string;
  public total_net!: string;
  public number!: string | null;
  public pay_date!: string | null;
  public account_id!: number | null;
  public description!: string | null;
  public createdbyid!: number | null;
  public paidbyid!: number | null;
  public paidAt!: Date | null;
  public createdAt!: Date;
  public updatedAt!: Date;
}

/** ສ້າງໃໝ່ທຸກຖັນ — Sequelize ແກ້ object ຂອງ attribute (field), ໃຊ້ object ດຽວກັນຫຼາຍຖັນ = ທຸກຖັນຊີ້ໄປຖັນທຳອິດ */
const money = () => ({ type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0 });

Payroll.init(
  {
    _uuid: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    period: {
      type: DataTypes.STRING(7),
      allowNull: false
    },
    workdays: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    status: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1
    },
    employees: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    total_base: money(),
    total_attendance_deduction: money(),
    total_additions: money(),
    total_gross: money(),
    total_sso_employee: money(),
    total_sso_employer: money(),
    total_tax: money(),
    total_other_deduction: money(),
    total_net: money(),
    number: DataTypes.STRING(30),
    pay_date: DataTypes.DATEONLY,
    account_id: DataTypes.INTEGER,
    description: DataTypes.STRING(255),
    createdbyid: DataTypes.INTEGER,
    paidbyid: DataTypes.INTEGER,
    paidAt: DataTypes.DATE,
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
    modelName: "Payroll",
    tableName: "tbl_payroll",
    timestamps: true
  }
);

Payroll.belongsTo(TreasuryAccount, { foreignKey: "account_id", as: "account", constraints: false });

autoSync(Payroll);
export default Payroll;
