"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
const department_1 = __importDefault(require("./department"));
const position_1 = __importDefault(require("./position"));
const district_1 = __importDefault(require("./district"));
const bankModel_1 = __importDefault(require("./bankModel"));
/**
 * ພະນັກງານ — ລະຫັດບໍ່ຊ້ຳ (UNIQUE emp_code, ບໍ່ປ້ອນ = ອອກໃຫ້ EMP-0001…). gender 1 ຊາຍ, 2 ຍິງ;
 * work_status 1 ເຮັດວຽກ, 2 ລາອອກ (end_date = ວັນລາອອກ). bank_* = ບັນຊີຮັບເງິນເດືອນ (ໂອນທ້າຍເດືອນ).
 * ທີ່ຢູ່ເກັບແຕ່ district_id + village — ແຂວງເອົາຈາກ tbl_district.province_id (ຄືຂໍ້ມູນບໍລິສັດ).
 * app ພະນັກງານ: ເບີໂທ (20 + 8 ຕົວເລກ, UNIQUE) = ຊື່ເຂົ້າລະບົບ, app_password = bcrypt (ສ້າງພະນັກງານ = "123",
 * must_change_password = 1 ຈົນກວ່າຈະປ່ຽນ). app_password ບໍ່ຖືກອ່ານໂດຍຄ່າເລີ່ມຕົ້ນ (defaultScope) — ໃຊ້ scope "withPassword"
 * ຮູບ (profile) ຢູ່ uploads/employee,
 * ເອກະສານຄັດຕິດຢູ່ tbl_employee_document (ໄຟລ໌ເກັບນອກ uploads — ດາວໂຫຼດຜ່ານ API ທີ່ login ແລ້ວເທົ່ານັ້ນ)
 */
class Employee extends sequelize_1.Model {
}
Employee.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    emp_code: {
        type: sequelize_1.DataTypes.STRING(30),
        allowNull: false
    },
    first_name: {
        type: sequelize_1.DataTypes.STRING(100),
        allowNull: false
    },
    last_name: sequelize_1.DataTypes.STRING(100),
    gender: {
        type: sequelize_1.DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 1
    },
    birthday: sequelize_1.DataTypes.DATEONLY,
    phone: sequelize_1.DataTypes.STRING(30),
    email: sequelize_1.DataTypes.STRING(150),
    app_password: sequelize_1.DataTypes.STRING(100),
    must_change_password: {
        type: sequelize_1.DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 1
    },
    department_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    position_id: sequelize_1.DataTypes.INTEGER,
    start_date: sequelize_1.DataTypes.DATEONLY,
    end_date: sequelize_1.DataTypes.DATEONLY,
    work_status: {
        type: sequelize_1.DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 1
    },
    basic_salary: {
        type: sequelize_1.DataTypes.DECIMAL(16, 2),
        allowNull: false,
        defaultValue: 0
    },
    bank_id: sequelize_1.DataTypes.INTEGER,
    bank_account_name: sequelize_1.DataTypes.STRING(150),
    bank_account_no: sequelize_1.DataTypes.STRING(50),
    district_id: sequelize_1.DataTypes.INTEGER,
    village: sequelize_1.DataTypes.STRING(150),
    profile: sequelize_1.DataTypes.STRING,
    description: sequelize_1.DataTypes.STRING(500),
    password: sequelize_1.DataTypes.STRING(255),
    createdbyid: sequelize_1.DataTypes.INTEGER,
    status: {
        type: sequelize_1.DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 1
    },
    createdAt: {
        type: sequelize_1.DataTypes.DATE,
        defaultValue: sequelize_1.DataTypes.NOW
    },
    updatedAt: {
        type: sequelize_1.DataTypes.DATE,
        defaultValue: sequelize_1.DataTypes.NOW
    },
}, {
    sequelize: database_1.default,
    modelName: "Employee",
    tableName: "tbl_employee",
    timestamps: true,
    // hash ລະຫັດຜ່ານບໍ່ອອກໄປກັບຂໍ້ມູນພະນັກງານ — login / ປ່ຽນລະຫັດໃຊ້ Employee.scope("withPassword")
    defaultScope: { attributes: { exclude: ["app_password"] } },
    scopes: { withPassword: { attributes: { include: ["app_password"] } } }
});
Employee.belongsTo(department_1.default, { foreignKey: "department_id", as: "department" });
Employee.belongsTo(position_1.default, { foreignKey: "position_id", as: "position" });
Employee.belongsTo(district_1.default, { foreignKey: "district_id", as: "district" });
Employee.belongsTo(bankModel_1.default, { foreignKey: "bank_id", as: "bank", constraints: false });
(0, autoSync_1.autoSync)(Employee);
exports.default = Employee;
