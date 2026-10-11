"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
/**
 * ຜັງບັນຊີ (tbl_chart_account) — ກຸ່ມ 1 ຊັບສິນ, 2 ໜີ້ສິນ, 3 ທຶນ, 4 ລາຍຮັບ, 5 ລາຍຈ່າຍ.
 * is_postable 0 = ບັນຊີຫົວ (ລວມຍອດລູກ, ລົງລາຍການບໍ່ໄດ້). normal_side 1 ໜີ້ (Dr), 2 ມີ (Cr).
 * ຕາຕະລາງສ້າງດ້ວຍ autoSync; index + ຜັງບັນຊີເລີ່ມຕົ້ນ ໃສ່ໃຫ້ຕອນເປີດ server (controllers/bansi/glSeed.ts)
 */
class ChartAccount extends sequelize_1.Model {
}
ChartAccount.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    account_code: {
        type: sequelize_1.DataTypes.STRING(20),
        allowNull: false,
        unique: true
    },
    name_la: {
        type: sequelize_1.DataTypes.STRING(200),
        allowNull: false
    },
    name_en: {
        type: sequelize_1.DataTypes.STRING(200),
        allowNull: true
    },
    name_cn: {
        type: sequelize_1.DataTypes.STRING(200),
        allowNull: true
    },
    parent_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: true
    },
    account_group: {
        type: sequelize_1.DataTypes.TINYINT,
        allowNull: false
    },
    account_type: {
        type: sequelize_1.DataTypes.STRING(30),
        allowNull: false
    },
    normal_side: {
        type: sequelize_1.DataTypes.TINYINT,
        allowNull: false
    },
    is_postable: {
        type: sequelize_1.DataTypes.TINYINT,
        allowNull: false, defaultValue: 1
    },
    currency_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: true
    },
    is_system: {
        type: sequelize_1.DataTypes.TINYINT,
        allowNull: false, defaultValue: 0
    },
    description: {
        type: sequelize_1.DataTypes.STRING(255),
        allowNull: true
    },
    status: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
    },
    createdAt: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize_1.DataTypes.NOW
    },
    updatedAt: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize_1.DataTypes.NOW
    },
}, {
    sequelize: database_1.default,
    modelName: "ChartAccount",
    tableName: "tbl_chart_account",
    timestamps: true,
});
(0, autoSync_1.autoSync)(ChartAccount);
exports.default = ChartAccount;
