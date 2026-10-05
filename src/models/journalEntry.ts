import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";
import JournalLine from "./journalLine";

/**
 * ໃບບັນທຶກບັນຊີ (tbl_journal_entry) — ລາຍຮັບ/ລາຍຈ່າຍ/ໂອນ/ຍອດຍົກມາ ລົງໃຫ້ເອງ (source_type + source_id),
 * MANUAL = ບັນທຶກທົ່ວໄປ. ບໍ່ລຶບ: ຍົກເລີກ = ໃບກັບລາຍການ (reversal_of) ແລະ ໝາຍໃບເດີມ reversed_by.
 * ຕາຕະລາງສ້າງດ້ວຍ autoSync; index ໃສ່ໃຫ້ຕອນເປີດ server (controllers/bansi/glSeed.ts)
 */
class JournalEntry extends Model {
  public _uuid!: number;
  public entry_number!: string;
  public entry_date!: string;
  public source_type!: string;
  public source_id!: string | null;
  public reference!: string | null;
  public description!: string | null;
  public total_debit!: string;
  public total_credit!: string;
  public reversal_of!: number | null;
  public reversed_by!: number | null;
  public status!: number;
  public created_by!: number | null;
  public createdAt!: Date;
  public updatedAt!: Date;
}

JournalEntry.init(
  {
    _uuid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    entry_number: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    entry_date: { type: DataTypes.DATEONLY, allowNull: false },
    source_type: { type: DataTypes.STRING(30), allowNull: false },
    source_id: DataTypes.STRING(50),
    reference: DataTypes.STRING(100),
    description: DataTypes.STRING(500),
    total_debit: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
    total_credit: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
    reversal_of: DataTypes.INTEGER,
    reversed_by: DataTypes.INTEGER,
    status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    created_by: DataTypes.INTEGER,
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: "JournalEntry",
    tableName: "tbl_journal_entry",
    timestamps: true,
  }
);

JournalEntry.hasMany(JournalLine, { foreignKey: "entry_id", as: "lines", constraints: false });

autoSync(JournalEntry);
export default JournalEntry;
