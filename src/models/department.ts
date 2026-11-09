import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";

/** ພະແນກ — executive = 1: ຂັ້ນບໍລິຫານ (ຄະນະບໍລິຫານ) ຄຸມທຸກພະແນກ — ຢູ່ເທິງສຸດຂອງໂຄງຮ່າງ, ບໍ່ນັບເປັນພະແນກ.
 * ລະຫັດບໍ່ຊ້ຳ (UNIQUE depart_code). ຕຳແໜ່ງເປັນລາຍຊື່ກາງ (tbl_position) ບໍ່ຂຶ້ນກັບພະແນກ. status 1 ໃຊ້ງານ, 0 ປິດ */
class Department extends Model {
  public _uuid!: number;
  public depart_code!: string;
  public depart_name!: string;
  public description!: string | null;
  public executive!: number;
  public sort!: number;
  public status!: number;
  public createdAt!: Date;
  public updatedAt!: Date;
}

Department.init(
  {
    _uuid: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    depart_code: {
      type: DataTypes.STRING(30),
      allowNull: false
    },
    depart_name: {
      type: DataTypes.STRING(150),
      allowNull: false
    },
    description: DataTypes.STRING(255),
    executive: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 0
    },
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
    modelName: "Department",
    tableName: "tbl_department",
    timestamps: true
  }
);

autoSync(Department);
export default Department;
