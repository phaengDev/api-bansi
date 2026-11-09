import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";
import Employee from "./employee";

/**
 * ປະຫວັດຫຍໍ້ຂອງພະນັກງານ — kind 1 ປະສົບການເຮັດວຽກ · 2 ການສຶກສາ · 3 ການຝຶກອົບຮົມ.
 * title = ບ່ອນເຮັດວຽກ / ສະຖາບັນ / ຫຼັກສູດ, end_date null = ຍັງເຮັດຢູ່ (ປັດຈຸບັນ),
 * ໄຟລ໌ໃບຢັ້ງຢືນ (ຖ້າມີ) ເກັບຄືເອກະສານພະນັກງານ (src/private/employee-docs)
 */
class EmployeeResume extends Model {
  public _uuid!: number;
  public employee_id!: number;
  public kind!: number;
  public title!: string;
  public subtitle!: string | null;
  public start_date!: string | null;
  public end_date!: string | null;
  public description!: string | null;
  public file_name!: string | null;
  public original_name!: string | null;
  public mime_type!: string | null;
  public file_size!: number | null;
  public createdbyid!: number | null;
}

EmployeeResume.init(
  {
    _uuid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    employee_id: { type: DataTypes.INTEGER, allowNull: false },
    kind: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    title: { type: DataTypes.STRING(200), allowNull: false },
    subtitle: DataTypes.STRING(200),
    start_date: DataTypes.DATEONLY,
    end_date: DataTypes.DATEONLY,
    description: DataTypes.TEXT,
    file_name: DataTypes.STRING(255),
    original_name: DataTypes.STRING(255),
    mime_type: DataTypes.STRING(100),
    file_size: DataTypes.INTEGER,
    createdbyid: DataTypes.INTEGER,
    createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  { sequelize, modelName: "EmployeeResume", tableName: "tbl_employee_resume", timestamps: true }
);

Employee.hasMany(EmployeeResume, { foreignKey: "employee_id", as: "resumes" });

autoSync(EmployeeResume);
export default EmployeeResume;
