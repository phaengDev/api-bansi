import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";
import FiscalYear from "./fiscalYear";
import FinanceCategories from "./typeIncomeModel";
import BudgetMonth from "./budgetMonth";

/**
 * ງົບປະມານລາຍຈ່າຍ — ໜຶ່ງໝວດລາຍຈ່າຍ (tbl_finance_categories typestatus 2) ມີໄດ້ແຖວດຽວຕໍ່ປີການເງິນ
 * (UNIQUE fiscal_id + category_id). amount = ງົບທັງປີ ເປັນສະກຸນຫຼັກ (LAK); is_monthly 1 = ແບ່ງລາຍເດືອນ
 * (tbl_budget_month) ແລະ amount = ຜົນລວມຂອງທຸກເດືອນ. ຍອດໃຊ້ຈິງຄິດຈາກລາຍຈ່າຍທຸກເທື່ອ ບໍ່ເກັບໄວ້
 */
class Budget extends Model {
  public _uuid!: number;
  public fiscal_id!: number;
  public category_id!: number;
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
Budget.hasMany(BudgetMonth, { foreignKey: "budget_id", as: "months" });

autoSync(Budget);
export default Budget;
