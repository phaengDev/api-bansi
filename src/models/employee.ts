import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";
import Department from "./department";
import Position from "./position";
import HrOption from "./hrOption";
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
  /** ຫົວໜ້າ (ລາຍງານຕໍ່ພະນັກງານຄົນນີ້) — ໂຄງຮ່າງການຈັດຕັ້ງ; null = ສູງສຸດ / ຍັງບໍ່ກຳນົດ */
  public reports_to_id!: number | null;
  // ---- ຂໍ້ມູນເພີ່ມເຕີມ (ບໍ່ບັງຄັບ — ບໍລິສັດທີ່ບໍ່ໃຊ້ ປະໄວ້ຫວ່າງ) ----
  public nationality!: string | null;
  public ethnicity!: string | null;
  public religion!: string | null;
  public birth_place!: string | null;
  public blood_type!: string | null;
  public id_card_no!: string | null;
  public id_card_expiry!: string | null;
  public passport_no!: string | null;
  public passport_expiry!: string | null;
  public sso_no!: string | null;
  /** 1 ໂສດ · 2 ແຕ່ງງານ · 3 ຢ່າຮ້າງ · 4 ໝ້າຍ */
  public marital_status!: number | null;
  public spouse_name!: string | null;
  public spouse_birthday!: string | null;
  public spouse_phone!: string | null;
  public children!: number | null;
  public education_level_id!: number | null;
  public education_field!: string | null;
  public education_school!: string | null;
  public graduation_year!: number | null;
  public emergency_name!: string | null;
  public emergency_relation!: string | null;
  public emergency_phone!: string | null;
  public home_distance_km!: string | null;
  public employee_type_id!: number | null;
  public contract_no!: string | null;
  public contract_fixed_term!: number;
  public contract_end!: string | null;
  public probation_end!: string | null;
  /** 1 ເງິນເດືອນຄົງທີ່ · 2 ຄ່າແຮງລາຍຊົ່ວໂມງ */
  public wage_type!: number;
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
    reports_to_id: DataTypes.INTEGER,
    nationality: DataTypes.STRING(60),
    ethnicity: DataTypes.STRING(60),
    religion: DataTypes.STRING(60),
    birth_place: DataTypes.STRING(150),
    blood_type: DataTypes.STRING(5),
    id_card_no: DataTypes.STRING(50),
    id_card_expiry: DataTypes.DATEONLY,
    passport_no: DataTypes.STRING(50),
    passport_expiry: DataTypes.DATEONLY,
    sso_no: DataTypes.STRING(50),
    marital_status: DataTypes.TINYINT,
    spouse_name: DataTypes.STRING(150),
    spouse_birthday: DataTypes.DATEONLY,
    spouse_phone: DataTypes.STRING(30),
    children: DataTypes.INTEGER,
    education_level_id: DataTypes.INTEGER,
    education_field: DataTypes.STRING(150),
    education_school: DataTypes.STRING(150),
    graduation_year: DataTypes.INTEGER,
    emergency_name: DataTypes.STRING(150),
    emergency_relation: DataTypes.STRING(60),
    emergency_phone: DataTypes.STRING(30),
    home_distance_km: DataTypes.DECIMAL(7, 1),
    employee_type_id: DataTypes.INTEGER,
    contract_no: DataTypes.STRING(50),
    contract_fixed_term: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
    contract_end: DataTypes.DATEONLY,
    probation_end: DataTypes.DATEONLY,
    wage_type: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
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
Employee.belongsTo(Employee, { foreignKey: "reports_to_id", as: "reportsTo", constraints: false });
Employee.belongsTo(HrOption, { foreignKey: "employee_type_id", as: "employeeType", constraints: false });
Employee.belongsTo(HrOption, { foreignKey: "education_level_id", as: "educationLevel", constraints: false });
Employee.belongsTo(District, { foreignKey: "district_id", as: "district" });
Employee.belongsTo(Banks, { foreignKey: "bank_id", as: "bank", constraints: false });

autoSync(Employee);
export default Employee;
