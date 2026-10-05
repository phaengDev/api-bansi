import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";

/**
 * ລາຍການຍ່ອຍຂອງລາຍຈ່າຍ (ສ່ວນລາຍລະອຽດ) — ຫຼາຍແຖວຕໍ່ 1 ໃບຈ່າຍ (expense_id → tbl_expenses._uuid).
 * amount = quantity × unit_price − discount (backend ຄິດເອງ ບໍ່ເຊື່ອຄ່າຈາກໜ້າເວັບ).
 * quantity ເປັນທົດສະນິຍົມໄດ້ (ເຊັ່ນ 1.5 ກິໂລ)
 */
class ExpenseItems extends Model {
  public _uuid!: number;
  public expense_id!: number;
  public line_no!: number;
  public item_name!: string;
  public quantity!: string;
  public unit!: string | null;
  public unit_price!: string;
  public discount!: string;
  public amount!: string;
  public createdAt!: Date;
  public updatedAt!: Date;
}

ExpenseItems.init(
  {
    _uuid: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    expense_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    line_no: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    item_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    quantity: {
      type: DataTypes.DECIMAL(12, 3),
      allowNull: false,
    },
    unit: DataTypes.STRING(50),
    unit_price: {
      type: DataTypes.DECIMAL(16, 2),
      allowNull: false,
    },
    discount: {
      type: DataTypes.DECIMAL(16, 2),
      allowNull: false,
      defaultValue: 0,
    },
    amount: {
      type: DataTypes.DECIMAL(16, 2),
      allowNull: false,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    modelName: "ExpenseItems",
    tableName: "tbl_expense_items",
    timestamps: true,
  }
);

autoSync(ExpenseItems);
export default ExpenseItems;
