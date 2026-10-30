import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";

/**
 * ລາຍຮັບ / ລາຍຈ່າຍ / ໂອນ ຂອງບັນຊີເງິນສ່ວນຕົວ (app) — ເຫັນສະເພາະຂອງຕົນເອງ. ສະກຸນ = ສະກຸນຂອງບັນຊີ (ບໍ່ແປງຄ່າ —
 * ລາຍງານແຍກຕາມສະກຸນ). transfer = ໂອນຈາກ account_id (amount, ສະກຸນບັນຊີຕົ້ນທາງ) ໄປ to_account_id (to_amount,
 * ສະກຸນບັນຊີປາຍທາງ — ແລກເງິນ = ຄົນລະຈຳນວນ), category_id 0, ບໍ່ນັບເປັນລາຍຮັບ-ລາຍຈ່າຍ.
 * account_id null = ລາຍການກ່ອນມີບັນຊີ (ບໍ່ລະບຸບັນຊີ). photo = ຮູບໃບບິນ (private/money-receipts, ເປີດຜ່ານ API ເທົ່ານັ້ນ).
 * source "PAYROLL" = ລາຍການທີ່ລະບົບເຄີຍເພີ່ມຕອນ HR ຈ່າຍເງິນເດືອນ (ເລີກແລ້ວ — ພະນັກງານບັນທຶກເອງ)
 */
class MoneyEntry extends Model {
  public _uuid!: number;
  public employee_id!: number;
  public kind!: string;
  public account_id!: number | null;
  public category_id!: number;
  public amount!: string;
  public to_account_id!: number | null;
  public to_amount!: string | null;
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
    /** income ລາຍຮັບ, expense ລາຍຈ່າຍ (ຕາມໝວດ), transfer ໂອນລະຫວ່າງບັນຊີ */
    kind: {
      type: DataTypes.STRING(10),
      allowNull: false
    },
    /** ບັນຊີ (ລາຍຮັບເຂົ້າ / ລາຍຈ່າຍອອກ / ໂອນອອກ) — null = ກ່ອນມີບັນຊີ */
    account_id: DataTypes.INTEGER,
    /** ໂອນ = 0 */
    category_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    amount: {
      type: DataTypes.DECIMAL(16, 2),
      allowNull: false
    },
    /** ໂອນ: ບັນຊີປາຍທາງ ແລະ ຈຳນວນທີ່ເຂົ້າ (ສະກຸນຂອງປາຍທາງ) */
    to_account_id: DataTypes.INTEGER,
    to_amount: DataTypes.DECIMAL(16, 2),
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
    indexes: [{ fields: ["employee_id", "entry_date"] }, { fields: ["account_id"] }, { fields: ["to_account_id"] }],
  }
);

autoSync(MoneyEntry);
export default MoneyEntry;
