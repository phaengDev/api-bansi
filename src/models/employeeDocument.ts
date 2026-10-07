import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";
import Employee from "./employee";

/**
 * ເອກະສານຄັດຕິດຂອງພະນັກງານ (ສັນຍາ, ບັດປະຈຳຕົວ…) — file_name = ຊື່ໄຟລ໌ໃນ src/private/employee-docs
 * (ບໍ່ຢູ່ໃຕ້ /image), original_name = ຊື່ເດີມຕອນອັບໂຫຼດ ໃຊ້ຕອນດາວໂຫຼດ
 */
class EmployeeDocument extends Model {
  public _uuid!: number;
  public employee_id!: number;
  public file_name!: string;
  public original_name!: string;
  public mime_type!: string | null;
  public file_size!: number;
  public createdbyid!: number | null;
  public createdAt!: Date;
  public updatedAt!: Date;
}

EmployeeDocument.init(
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
    file_name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    original_name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    mime_type: DataTypes.STRING(100),
    file_size: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    createdbyid: DataTypes.INTEGER,
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
    modelName: "EmployeeDocument",
    tableName: "tbl_employee_document",
    timestamps: true
  }
);

Employee.hasMany(EmployeeDocument, { foreignKey: "employee_id", as: "documents" });

autoSync(EmployeeDocument);
export default EmployeeDocument;
