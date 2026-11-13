import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";

/**
 * ຕຳແໜ່ງ — ລາຍຊື່ກາງຂອງທັງບໍລິສັດ (ພິມເທື່ອດຽວ ໃຊ້ໄດ້ທຸກພະແນກ), ຊື່ບໍ່ຊ້ຳ.
 * level = Level 1, 2, 3… (1 = ສູງສຸດ, ບໍ່ຈຳກັດຈຳນວນຂັ້ນ; null = ຍັງບໍ່ກຳນົດ) — ໃຊ້ແນະນຳ "ຫົວໜ້າສາຍງານ"
 * ໃນຟອມພະນັກງານ ແລະ ລຽງໂຄງຮ່າງ. ຫົວໜ້າສາຍງານຕົວຈິງຢູ່ tbl_employee.reports_to_id.
 * ຕຳແໜ່ງທີ່ເຄີຍມີພະນັກງານ ລຶບບໍ່ໄດ້ — ປິດ (status 0) ແທນ.
 * ຕຳແໜ່ງບໍ່ຂຶ້ນກັບພະແນກ (ຖັນ department_id ເກົ່າ ລຶບອອກຈາກ DB ແລ້ວ 2026-11-13); ພະແນກຂອງຄົນຢູ່ tbl_employee.department_id
 */
class Position extends Model {
  public _uuid!: number;
  public position_name!: string;
  public level!: number | null;
  public sort!: number;
  public status!: number;
  public createdAt!: Date;
  public updatedAt!: Date;
}

Position.init(
  {
    _uuid: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    position_name: {
      type: DataTypes.STRING(150),
      allowNull: false
    },
    level: DataTypes.INTEGER,
    sort: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
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
    modelName: "Position",
    tableName: "tbl_position",
    timestamps: true
  }
);

autoSync(Position);

export default Position;
