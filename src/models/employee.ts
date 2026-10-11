import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";
import Department from "./department";
import Position from "./position";
import District from "./district";
import Banks from "./bankModel";

/**
 * ພະນັກງານ — ລະຫັດບໍ່ຊ້ຳ (UNIQUE emp_code, ບໍ່ປ້ອນ = ອອກໃຫ້ EMP-0001…). gender 1 ຊາຍ, 2 ຍິງ;
 * work_status 1 ເຮັດວຽກ, 2 ລາອອກ (end_date = ວັນລາອອກ). bank_* = ບັນຊີຮັບເງິນເດືອນ (ໂອນທ້າຍເດືອນ).
 * ທີ່ຢູ່ເກັບແຕ່ district_id + village — ແຂວງເອົາຈາກ tbl_district.province_id (ຄືຂໍ້ມູນບໍລິສັດ).
 * app ພະນັກງານ: ເບີໂທ (20 + 8 ຕົວເລກ, UNIQUE) = ຊື່ເຂົ້າລະບົບ, app_password = bcrypt (ສ້າງພະນັກງານ = "123",
 * must_change_password = 1 ຈົນກວ່າຈະປ່ຽນ). app_password ບໍ່ຖືກອ່ານໂດຍຄ່າເລີ່ມຕົ້ນ (defaultScope) — ໃຊ້ scope "withPassword"
 * ຮູບ (profile) ຢູ່ uploads/employee,
 * ເອກະສານຄັດຕິດຢູ່ tbl_employee_document (ໄຟລ໌ເກັບນອກ uploads — ດາວໂຫຼດຜ່ານ API ທີ່ login ແລ້ວເທົ່ານັ້ນ)
 */
class Employee extends Model {
  public _uuid!: number;
  public emp_code!: string;
  public profile!: string | null;
  public first_name!: string;
  public last_name!: string | null;
  public gender!: number;
  public birthday!: string | null;
  public phone!: string | null;
  public email!: string | null;
  public app_password!: string | null;
  public must_change_password!: number;
  public department_id!: number;
  public position_id!: number | null;
  public start_date!: string | null;
  public end_date!: string | null;
  public work_status!: number;
  public basic_salary!: string;
  public bank_id!: number | null;
  public bank_account_name!: string | null;
  public bank_account_no!: string | null;
  public district_id!: number | null;
  public village!: string | null;
  public description!: string | null;
  public password!: string;
  public status!: number;
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
    app_password: DataTypes.STRING(100),
    must_change_password: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1
    },
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
    district_id: DataTypes.INTEGER,
    village: DataTypes.STRING(150),
    profile: DataTypes.STRING,
    description: DataTypes.STRING(500),
    password: DataTypes.STRING(255),
    createdbyid: DataTypes.INTEGER,
    status: {
      type: DataTypes.TINYINT,
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
    modelName: "Employee",
    tableName: "tbl_employee",
    timestamps: true,
    // hash ລະຫັດຜ່ານບໍ່ອອກໄປກັບຂໍ້ມູນພະນັກງານ — login / ປ່ຽນລະຫັດໃຊ້ Employee.scope("withPassword")
    defaultScope: { attributes: { exclude: ["app_password"] } },
    scopes: { withPassword: { attributes: { include: ["app_password"] } } }
  }
);

Employee.belongsTo(Department, { foreignKey: "department_id", as: "department" });
Employee.belongsTo(Position, { foreignKey: "position_id", as: "position" });
Employee.belongsTo(District, { foreignKey: "district_id", as: "district" });
Employee.belongsTo(Banks, { foreignKey: "bank_id", as: "bank", constraints: false });

autoSync(Employee);
export default Employee;
