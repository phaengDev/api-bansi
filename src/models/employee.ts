import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";
import Department from "./department";
import Position from "./position";
import Province from "./province";
import District from "./district";
import Banks from "./bankModel";

/**
 * ພະນັກງານ — ລະຫັດບໍ່ຊ້ຳ (UNIQUE emp_code, ບໍ່ປ້ອນ = ອອກໃຫ້ EMP-0001…). gender 1 ຊາຍ, 2 ຍິງ;
 * work_status 1 ເຮັດວຽກ, 2 ລາອອກ (end_date = ວັນລາອອກ). bank_* = ບັນຊີຮັບເງິນເດືອນ (ໂອນທ້າຍເດືອນ).
 * ຮູບ (profile) ຢູ່ uploads/employee,
 * ເອກະສານຄັດຕິດຢູ່ tbl_employee_document (ໄຟລ໌ເກັບນອກ uploads — ດາວໂຫຼດຜ່ານ API ທີ່ login ແລ້ວເທົ່ານັ້ນ)
 */
class Employee extends Model {
  public _uuid!: number;
  public emp_code!: string;
  public first_name!: string;
  public last_name!: string | null;
  public gender!: number;
  public birthday!: string | null;
  public phone!: string | null;
  public email!: string | null;
  public department_id!: number;
  public position_id!: number | null;
  public start_date!: string | null;
  public end_date!: string | null;
  public work_status!: number;
  public basic_salary!: string;
  public bank_id!: number | null;
  public bank_account_name!: string | null;
  public bank_account_no!: string | null;
  public province_id!: number | null;
  public district_id!: number | null;
  public village!: string | null;
  public profile!: string | null;
  public description!: string | null;
  public createdbyid!: number | null;
  public createdAt!: Date;
  public updatedAt!: Date;
}

Employee.init(
  {
    _uuid: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    emp_code: {
      type: DataTypes.STRING(30),
      allowNull: false
    },
    first_name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    last_name: DataTypes.STRING(100),
    gender: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1
    },
    birthday: DataTypes.DATEONLY,
    phone: DataTypes.STRING(30),
    email: DataTypes.STRING(150),
    department_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    position_id: DataTypes.INTEGER,
    start_date: DataTypes.DATEONLY,
    end_date: DataTypes.DATEONLY,
    work_status: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1
    },
    basic_salary: {
      type: DataTypes.DECIMAL(16, 2),
      allowNull: false,
      defaultValue: 0
    },
    bank_id: DataTypes.INTEGER,
    bank_account_name: DataTypes.STRING(150),
    bank_account_no: DataTypes.STRING(50),
    province_id: DataTypes.INTEGER,
    district_id: DataTypes.INTEGER,
    village: DataTypes.STRING(150),
    profile: DataTypes.STRING,
    description: DataTypes.STRING(500),
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
    modelName: "Employee",
    tableName: "tbl_employee",
    timestamps: true
  }
);

Employee.belongsTo(Department, { foreignKey: "department_id", as: "department" });
Employee.belongsTo(Position, { foreignKey: "position_id", as: "position" });
Employee.belongsTo(Province, { foreignKey: "province_id", as: "province" });
Employee.belongsTo(District, { foreignKey: "district_id", as: "district" });
Employee.belongsTo(Banks, { foreignKey: "bank_id", as: "bank", constraints: false });

autoSync(Employee);
export default Employee;
