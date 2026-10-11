"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
const treasuryAcount_1 = __importDefault(require("./treasuryAcount"));
class TransferMoney extends sequelize_1.Model {
}
TransferMoney.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    account_outid: sequelize_1.DataTypes.INTEGER,
    balance_out: sequelize_1.DataTypes.DECIMAL(14, 2),
    account_inid: sequelize_1.DataTypes.INTEGER,
    balance_in: sequelize_1.DataTypes.DECIMAL(14, 2),
    balance_transfer: sequelize_1.DataTypes.DECIMAL(14, 2),
    description: sequelize_1.DataTypes.STRING,
    createby: sequelize_1.DataTypes.STRING,
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
    }
}, {
    sequelize: database_1.default,
    modelName: "TransferMoney",
    tableName: "tbl_transfer_money",
    timestamps: true,
});
// Sync the model
// try {
//     TransferMoney.sync({ force: false });
// } catch (error) {
//     console.error("Error syncing TransferMoney model:", error);
// }
TransferMoney.belongsTo(treasuryAcount_1.default, { foreignKey: "account_outid", as: "acounts" });
TransferMoney.belongsTo(treasuryAcount_1.default, { foreignKey: "account_inid", as: "acounte" });
(0, autoSync_1.autoSync)(TransferMoney);
exports.default = TransferMoney;
