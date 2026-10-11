"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
/**
 * ງົບປະມານແຕ່ລະເດືອນ ຂອງງົບທີ່ແບ່ງລາຍເດືອນ (tbl_budget.is_monthly 1) — period = "YYYY-MM"
 * ພາຍໃນປີການເງິນຂອງງົບ (UNIQUE budget_id + period). ເດືອນທີ່ບໍ່ມີແຖວ = ງົບ 0
 */
class BudgetMonth extends sequelize_1.Model {
}
BudgetMonth.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    budget_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    period: {
        type: sequelize_1.DataTypes.STRING(7),
        allowNull: false
    },
    amount: {
        type: sequelize_1.DataTypes.DECIMAL(16, 2),
        allowNull: false,
        defaultValue: 0
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
    modelName: "BudgetMonth",
    tableName: "tbl_budget_month",
    timestamps: true
});
(0, autoSync_1.autoSync)(BudgetMonth);
exports.default = BudgetMonth;
