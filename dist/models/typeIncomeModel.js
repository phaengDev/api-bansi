"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
class FinanceCategories extends sequelize_1.Model {
}
FinanceCategories.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    type_code: sequelize_1.DataTypes.STRING,
    type_name: sequelize_1.DataTypes.STRING,
    typestatus: sequelize_1.DataTypes.INTEGER,
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
    tableName: "tbl_finance_categories",
    modelName: "FinanceCategories",
    timestamps: true
});
(0, autoSync_1.autoSync)(FinanceCategories);
exports.default = FinanceCategories;
