import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";
import ChartAccount from "./chartAccount";

/**
 * ແຖວຂອງໃບບັນທຶກບັນຊີ (tbl_journal_line) — debit/credit ເປັນສະກຸນຫຼັກ (LAK);
 * amount_currency = ຈຳນວນສະກຸນເດີມ (+ ໜີ້ / − ມີ) ຕາມ exchange_rate.
 * ຕາຕະລາງສ້າງດ້ວຍ autoSync; index ໃສ່ໃຫ້ຕອນເປີດ server (controllers/bansi/glSeed.ts)
 */
class JournalLine extends Model {
  public _uuid!: number;
  public entry_id!: number;
  public line_no!: number;
  public account_id!: number;
  public description!: string | null;
  public debit!: string;
  public credit!: string;
  public currency_id!: number | null;
  public amount_currency!: string;
  public exchange_rate!: string;
  public treasury_account_id!: number | null;
  public createdAt!: Date;
  public updatedAt!: Date;
}

JournalLine.init(
  {
    _uuid: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    entry_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    line_no: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    account_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    description: DataTypes.STRING(255),
    debit: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false, defaultValue: 0
    },
    credit: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false, defaultValue: 0
    },
    currency_id: DataTypes.INTEGER,
    amount_currency: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false, defaultValue: 0
    },
    exchange_rate: {
      type: DataTypes.DECIMAL(16, 4),
      allowNull: false, defaultValue: 1
    },
    treasury_account_id: DataTypes.INTEGER,
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false, defaultValue: DataTypes.NOW
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false, defaultValue: DataTypes.NOW
    },
  },
  {
    sequelize,
    modelName: "JournalLine",
    tableName: "tbl_journal_line",
    timestamps: true,
  }
);

JournalLine.belongsTo(ChartAccount, {
  foreignKey: "account_id", as: "account",
  constraints: false
});

autoSync(JournalLine);
export default JournalLine;
