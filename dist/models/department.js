"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
/** ພະແນກ — executive = 1: ຂັ້ນບໍລິຫານ (ຄະນະບໍລິຫານ) ຄຸມທຸກພະແນກ — ຢູ່ເທິງສຸດຂອງໂຄງຮ່າງ, ບໍ່ນັບເປັນພະແນກ.
 * ລະຫັດບໍ່ຊ້ຳ (UNIQUE depart_code). ຕຳແໜ່ງເປັນລາຍຊື່ກາງ (tbl_position) ບໍ່ຂຶ້ນກັບພະແນກ. status 1 ໃຊ້ງານ, 0 ປິດ */
class Department extends sequelize_1.Model {
}
Department.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    depart_code: {
        type: sequelize_1.DataTypes.STRING(30),
        allowNull: false
    },
    depart_name: {
        type: sequelize_1.DataTypes.STRING(150),
        allowNull: false
    },
    description: sequelize_1.DataTypes.STRING(255),
    executive: {
        type: sequelize_1.DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 0
    },
    sort: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    status: {
        type: sequelize_1.DataTypes.INTEGER,
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
    modelName: "Department",
    tableName: "tbl_department",
    timestamps: true
});
(0, autoSync_1.autoSync)(Department);
exports.default = Department;
