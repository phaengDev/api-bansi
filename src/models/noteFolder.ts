import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";

/**
 * ໂຟນເດີໂນດຂອງພະນັກງານ (app → ເມນູ "ໂນດ") — ຈັດກຸ່ມໂນດ (tbl_note.folder_id); ເຫັນ / ແກ້ໄດ້ສະເພາະເຈົ້າຂອງ.
 * ລຶບໂຟນເດີ = ໂນດຂ້າງໃນຍ້າຍອອກມາຢູ່ນອກ (folder_id = null), ບໍ່ລຶບໂນດ
 */
class NoteFolder extends Model {
  public _uuid!: number;
  public employee_id!: number;
  public name!: string;
  public createdAt!: Date;
  public updatedAt!: Date;
}

NoteFolder.init(
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
    name: {
      type: DataTypes.STRING(100),
      allowNull: false
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
    modelName: "NoteFolder",
    tableName: "tbl_note_folder",
    timestamps: true,
    indexes: [{ fields: ["employee_id"] }],
  }
);

autoSync(NoteFolder);

export default NoteFolder;
