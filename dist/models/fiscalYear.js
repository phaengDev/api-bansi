"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
/** ປີການເງິນ — ມີປີປັດຈຸບັນ (is_current) ໄດ້ປີດຽວ; status 1 = ເປີດ, 2 = ປິດບັນຊີແລ້ວ (ລັອກຍອດຍົກມາ) */
class FiscalYear extends sequelize_1.Model {
}
FiscalYear.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true
    },
    fiscal_code: {
        type: sequelize_1.DataTypes.STRING(20),
        allowNull: false
    },
    fiscal_name: sequelize_1.DataTypes.STRING(150),
    start_date: {
        type: sequelize_1.DataTypes.DATEONLY,
        allowNull: false
    },
    end_date: {
        type: sequelize_1.DataTypes.DATEONLY,
        allowNull: false
    },
    is_current: {
        type: sequelize_1.DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 0
    },
    status: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
    },
    closed_at: sequelize_1.DataTypes.DATE,
    closed_by: sequelize_1.DataTypes.STRING(100),
    description: sequelize_1.DataTypes.STRING(255),
    createby: sequelize_1.DataTypes.STRING(100),
    createdAt: {
        type: sequelize_1.DataTypes.DATE,
        defaultValue: sequelize_1.DataTypes.NOW
    },
    updatedAt: {
        type: sequelize_1.DataTypes.DATE,
        defaultValue: sequelize_1.DataTypes.NOW
    },
}, { sequelize: database_1.default, modelName: "FiscalYear", tableName: "tbl_fiscal_year", timestamps: true });
(0, autoSync_1.autoSync)(FiscalYear);
exports.default = FiscalYear;
