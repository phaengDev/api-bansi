"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
const currencyModel_1 = __importDefault(require("./currencyModel"));
/**
 * ປະຫວັດອັດຕາແລກປ່ຽນ (1 ໜ່ວຍສະກຸນເງິນ = rate ກີບ) — ອັດຕາຫຼ້າສຸດຕາມ rate_date ຖືກຂຽນກັບໄປ tbl_currency.reate
 * ເພື່ອໃຫ້ໜ້າອື່ນທີ່ອ່ານ reate ຢູ່ແລ້ວໃຊ້ຕໍ່ໄດ້
 */
class ExchangeRate extends sequelize_1.Model {
}
ExchangeRate.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true
    },
    currencyId: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    rate: {
        type: sequelize_1.DataTypes.DECIMAL(16, 4),
        allowNull: false
    },
    rate_date: {
        type: sequelize_1.DataTypes.DATEONLY,
        allowNull: false
    },
    description: sequelize_1.DataTypes.STRING(255),
    createby: sequelize_1.DataTypes.STRING(100),
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
}, { sequelize: database_1.default,
    modelName: "ExchangeRate",
    tableName: "tbl_exchange_rate",
    timestamps: true });
ExchangeRate.belongsTo(currencyModel_1.default, {
    foreignKey: "currencyId", as: "currency"
});
(0, autoSync_1.autoSync)(ExchangeRate);
exports.default = ExchangeRate;
