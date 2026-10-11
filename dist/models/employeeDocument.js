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
 * ເອກະສານຄັດຕິດຂອງພະນັກງານ (ສັນຍາ, ບັດປະຈຳຕົວ…) — file_name = ຊື່ໄຟລ໌ໃນ src/private/employee-docs
 * (ບໍ່ຢູ່ໃຕ້ /image), original_name = ຊື່ເດີມຕອນອັບໂຫຼດ ໃຊ້ຕອນດາວໂຫຼດ
 */
class EmployeeDocument extends sequelize_1.Model {
}
EmployeeDocument.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    employee_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    file_name: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false
    },
    original_name: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false
    },
    mime_type: sequelize_1.DataTypes.STRING(100),
    file_size: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    createdbyid: sequelize_1.DataTypes.INTEGER,
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
    modelName: "EmployeeDocument",
    tableName: "tbl_employee_document",
    timestamps: true
});
employee_1.default.hasMany(EmployeeDocument, { foreignKey: "employee_id", as: "documents" });
(0, autoSync_1.autoSync)(EmployeeDocument);
exports.default = EmployeeDocument;
