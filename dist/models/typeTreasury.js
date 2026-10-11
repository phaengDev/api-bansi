"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
const currencyModel_1 = __importDefault(require("./currencyModel"));
const typeAcount_1 = __importDefault(require("./typeAcount"));
class TypeTreasury extends sequelize_1.Model {
}
TypeTreasury.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    typeId: sequelize_1.DataTypes.INTEGER,
    currencyId: sequelize_1.DataTypes.INTEGER,
    treasury_code: sequelize_1.DataTypes.STRING,
    treasury_name: sequelize_1.DataTypes.STRING,
    description: sequelize_1.DataTypes.STRING,
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
    modelName: "TypeTreasury",
    tableName: "tbl_type_treasury",
    timestamps: true,
});
TypeTreasury.belongsTo(currencyModel_1.default, { foreignKey: "currencyId", as: "currency" });
TypeTreasury.belongsTo(typeAcount_1.default, { foreignKey: "typeId", as: "types" });
(0, autoSync_1.autoSync)(TypeTreasury);
exports.default = TypeTreasury;
