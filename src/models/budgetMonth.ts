import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";

/**
 * ງົບປະມານແຕ່ລະເດືອນ ຂອງງົບທີ່ແບ່ງລາຍເດືອນ (tbl_budget.is_monthly 1) — period = "YYYY-MM"
 * ພາຍໃນປີການເງິນຂອງງົບ (UNIQUE budget_id + period). ເດືອນທີ່ບໍ່ມີແຖວ = ງົບ 0
 */
class BudgetMonth extends Model {
  public _uuid!: number;
  public budget_id!: number;
  public period!: string;
  public amount!: string;
  public createdAt!: Date;
  public updatedAt!: Date;
}

BudgetMonth.init(
  {
    _uuid: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    budget_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    period: {
      type: DataTypes.STRING(7),
      allowNull: false
    },
    amount: {
      type: DataTypes.DECIMAL(16, 2),
      allowNull: false,
      defaultValue: 0
    },
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
    modelName: "BudgetMonth",
    tableName: "tbl_budget_month",
    timestamps: true
  }
);

autoSync(BudgetMonth);
export default BudgetMonth;
