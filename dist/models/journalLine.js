"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
const chartAccount_1 = __importDefault(require("./chartAccount"));
/**
 * ແຖວຂອງໃບບັນທຶກບັນຊີ (tbl_journal_line) — debit/credit ເປັນສະກຸນຫຼັກ (LAK);
 * amount_currency = ຈຳນວນສະກຸນເດີມ (+ ໜີ້ / − ມີ) ຕາມ exchange_rate.
 * ຕາຕະລາງສ້າງດ້ວຍ autoSync; index ໃສ່ໃຫ້ຕອນເປີດ server (controllers/bansi/glSeed.ts)
 */
class JournalLine extends sequelize_1.Model {
}
JournalLine.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    entry_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    line_no: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    account_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    description: sequelize_1.DataTypes.STRING(255),
    debit: {
        type: sequelize_1.DataTypes.DECIMAL(18, 2),
        allowNull: false, defaultValue: 0
    },
    credit: {
        type: sequelize_1.DataTypes.DECIMAL(18, 2),
        allowNull: false, defaultValue: 0
    },
    currency_id: sequelize_1.DataTypes.INTEGER,
    amount_currency: {
        type: sequelize_1.DataTypes.DECIMAL(18, 2),
        allowNull: false, defaultValue: 0
    },
    exchange_rate: {
        type: sequelize_1.DataTypes.DECIMAL(16, 4),
        allowNull: false, defaultValue: 1
    },
    treasury_account_id: sequelize_1.DataTypes.INTEGER,
    createdAt: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: false, defaultValue: sequelize_1.DataTypes.NOW
    },
    updatedAt: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: false, defaultValue: sequelize_1.DataTypes.NOW
    },
}, {
    sequelize: database_1.default,
    modelName: "JournalLine",
    tableName: "tbl_journal_line",
    timestamps: true,
});
JournalLine.belongsTo(chartAccount_1.default, {
    foreignKey: "account_id", as: "account",
    constraints: false
});
(0, autoSync_1.autoSync)(JournalLine);
exports.default = JournalLine;
