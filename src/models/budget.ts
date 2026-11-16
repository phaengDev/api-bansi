import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";
import FiscalYear from "./fiscalYear";
import FinanceCategories from "./typeIncomeModel";
import BudgetMonth from "./budgetMonth";
import FinanceSubCategory from "./financeSubCategory";

/**
 * ງົບປະມານລາຍຈ່າຍ — ຕັ້ງໃຫ້ທັງປະເພດລາຍຈ່າຍ (sub_category_id null) ຫຼື ແຍກຕາມປະເພດຍ່ອຍ (tbl_finance_subcategory),
 * ໃນປະເພດດຽວກັນ ໃຊ້ໄດ້ແບບດຽວ (budgetController ກວດ) — UNIQUE fiscal_id + category_id + sub_category_id. amount = ງົບທັງປີ ເປັນສະກຸນຫຼັກ (LAK); is_monthly 1 = ແບ່ງລາຍເດືອນ
 * (tbl_budget_month) ແລະ amount = ຜົນລວມຂອງທຸກເດືອນ. ຍອດໃຊ້ຈິງຄິດຈາກລາຍຈ່າຍທຸກເທື່ອ ບໍ່ເກັບໄວ້
 */
class Budget extends Model {
  public _uuid!: number;
  public fiscal_id!: number;
  public category_id!: number;
  /** null = ງົບທັງປະເພດ (ທຸກປະເພດຍ່ອຍ) */
  public sub_category_id!: number | null;
  public amount!: string;
  public is_monthly!: number;
  public description!: string | null;
  public createdbyid!: number | null;
  public createdAt!: Date;
  public updatedAt!: Date;
}

Budget.init(
  {
    _uuid: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    fiscal_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    category_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    sub_category_id: DataTypes.INTEGER,
    amount: {
      type: DataTypes.DECIMAL(16, 2),
      allowNull: false,
      defaultValue: 0
    },
    is_monthly: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 0
    },
    description: DataTypes.STRING(255),
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
    modelName: "Budget",
    tableName: "tbl_budget",
    timestamps: true
  }
);

Budget.belongsTo(FiscalYear, { foreignKey: "fiscal_id", as: "fiscal" });
Budget.belongsTo(FinanceCategories, { foreignKey: "category_id", as: "category" });
Budget.belongsTo(FinanceSubCategory, { foreignKey: "sub_category_id", as: "sub", constraints: false });
Budget.hasMany(BudgetMonth, { foreignKey: "budget_id", as: "months" });

autoSync(Budget);
export default Budget;
