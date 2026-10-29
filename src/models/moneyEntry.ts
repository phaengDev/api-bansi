import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";

/**
 * ລາຍຮັບ-ລາຍຈ່າຍສ່ວນຕົວຂອງພະນັກງານ (app) — ເຫັນສະເພາະຂອງຕົນເອງ. ສະກຸນເງິນ LAK / THB / USD (ບໍ່ແປງຄ່າ — ລາຍງານແຍກຕາມສະກຸນ).
 * photo = ຮູບໃບບິນ (ໄຟລ໌ຢູ່ private/money-receipts, ເປີດຜ່ານ API ທີ່ login ແລ້ວເທົ່ານັ້ນ).
 * source "PAYROLL" + source_id = ໃບເງິນເດືອນ: ລະບົບເພີ່ມເອງຕອນ HR ຈ່າຍເງິນເດືອນ, ລຶບເອງຕອນຍົກເລີກການຈ່າຍ
 */
class MoneyEntry extends Model {
  public _uuid!: number;
  public employee_id!: number;
  public kind!: string;
  public category_id!: number;
  public amount!: string;
  public currency!: string;
  public entry_date!: string;
  public note!: string | null;
  public photo!: string | null;
  public source!: string | null;
  public source_id!: number | null;
  public createdAt!: Date;
  public updatedAt!: Date;
}

MoneyEntry.init(
  {
    _uuid: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    employee_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    /** income ລາຍຮັບ, expense ລາຍຈ່າຍ (ຕາມໝວດ) */
    kind: {
      type: DataTypes.STRING(10),
      allowNull: false
    },
    category_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    amount: {
      type: DataTypes.DECIMAL(16, 2),
      allowNull: false
    },
    currency: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: "LAK"
    },
    entry_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    note: DataTypes.STRING(500),
    photo: DataTypes.STRING(100),
    source: DataTypes.STRING(20),
    source_id: DataTypes.INTEGER,
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
    modelName: "MoneyEntry",
    tableName: "tbl_money_entry",
    timestamps: true,
    indexes: [{ fields: ["employee_id", "entry_date"] }, { fields: ["source", "source_id"] }],
  }
);

autoSync(MoneyEntry);
export default MoneyEntry;
