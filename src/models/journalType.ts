import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";

/**
 * ປະເພດປຶ້ມບັນຊີ (journal) — journal_kind: 1 ລາຍວັນທົ່ວໄປ, 2 ລາຍຮັບ, 3 ລາຍຈ່າຍ, 4 ເງິນສົດ, 5 ທະນາຄານ,
 * 6 ປັບປຸງ/ປິດບັນຊີ. ເອກະສານແຕ່ລະໃບຈະຖືກບັນທຶກລົງປຶ້ມໃດປຶ້ມໜຶ່ງ
 */
class JournalType extends Model {
  public _uuid!: number;
  public journal_code!: string;
  public name!: string;
  public journal_kind!: number;
  public description!: string | null;
  public status!: number;
  public createdAt!: Date;
  public updatedAt!: Date;
}

JournalType.init(
  {
    _uuid: {
      type: DataTypes.INTEGER,
      primaryKey: true
    },
    journal_code: {
      type: DataTypes.STRING(20),
      allowNull: false
    },
    name: {
      type: DataTypes.STRING(150),
      allowNull: false
    },
    journal_kind: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    description: DataTypes.STRING(255),
    status: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
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
    modelName: "JournalType",
    tableName: "tbl_journal_type",
    timestamps: true
  }
);
autoSync(JournalType);
export default JournalType;
