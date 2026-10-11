"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
const typeTreasury_1 = __importDefault(require("./typeTreasury"));
const bankModel_1 = __importDefault(require("./bankModel"));
class TreasuryAccount extends sequelize_1.Model {
}
TreasuryAccount.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    type_treasuryid: sequelize_1.DataTypes.INTEGER,
    bankId: sequelize_1.DataTypes.INTEGER || null,
    acountName: sequelize_1.DataTypes.STRING,
    acount_number: sequelize_1.DataTypes.STRING,
    balance_treasury: sequelize_1.DataTypes.INTEGER,
    balance_unable: sequelize_1.DataTypes.INTEGER,
    status: {
        type: sequelize_1.DataTypes.INTEGER,
        defaultValue: 1
    },
    createdAt: {
        type: sequelize_1.DataTypes.DATE,
        defaultValue: sequelize_1.DataTypes.NOW
    },
    updatedAt: {
        type: sequelize_1.DataTypes.DATE,
        defaultValue: sequelize_1.DataTypes.NOW
    }
}, {
    sequelize: database_1.default,
    modelName: "TreasuryAccount",
    tableName: "tbl_treasury_account",
    timestamps: true,
});
TreasuryAccount.belongsTo(typeTreasury_1.default, { foreignKey: "type_treasuryid", as: "treasury" });
TreasuryAccount.belongsTo(bankModel_1.default, { foreignKey: "bankId", as: "banks" });
(0, autoSync_1.autoSync)(TreasuryAccount);
exports.default = TreasuryAccount;
