"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
const employee_1 = __importDefault(require("./employee"));
/**
 * ປະຫວັດຫຍໍ້ຂອງພະນັກງານ — kind 1 ປະສົບການເຮັດວຽກ · 2 ການສຶກສາ · 3 ການຝຶກອົບຮົມ.
 * title = ບ່ອນເຮັດວຽກ / ສະຖາບັນ / ຫຼັກສູດ, end_date null = ຍັງເຮັດຢູ່ (ປັດຈຸບັນ),
 * ໄຟລ໌ໃບຢັ້ງຢືນ (ຖ້າມີ) ເກັບຄືເອກະສານພະນັກງານ (src/private/employee-docs)
 */
class EmployeeResume extends sequelize_1.Model {
}
EmployeeResume.init({
    _uuid: { type: sequelize_1.DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    employee_id: { type: sequelize_1.DataTypes.INTEGER, allowNull: false },
    kind: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    title: { type: sequelize_1.DataTypes.STRING(200), allowNull: false },
    subtitle: sequelize_1.DataTypes.STRING(200),
    start_date: sequelize_1.DataTypes.DATEONLY,
    end_date: sequelize_1.DataTypes.DATEONLY,
    description: sequelize_1.DataTypes.TEXT,
    file_name: sequelize_1.DataTypes.STRING(255),
    original_name: sequelize_1.DataTypes.STRING(255),
    mime_type: sequelize_1.DataTypes.STRING(100),
    file_size: sequelize_1.DataTypes.INTEGER,
    createdbyid: sequelize_1.DataTypes.INTEGER,
    createdAt: { type: sequelize_1.DataTypes.DATE, defaultValue: sequelize_1.DataTypes.NOW },
    updatedAt: { type: sequelize_1.DataTypes.DATE, defaultValue: sequelize_1.DataTypes.NOW },
}, { sequelize: database_1.default, modelName: "EmployeeResume", tableName: "tbl_employee_resume", timestamps: true });
employee_1.default.hasMany(EmployeeResume, { foreignKey: "employee_id", as: "resumes" });
(0, autoSync_1.autoSync)(EmployeeResume);
exports.default = EmployeeResume;
