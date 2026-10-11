"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
const fiscalYear_1 = __importDefault(require("./fiscalYear"));
const typeIncomeModel_1 = __importDefault(require("./typeIncomeModel"));
const budgetMonth_1 = __importDefault(require("./budgetMonth"));
/**
 * ງົບປະມານລາຍຈ່າຍ — ໜຶ່ງໝວດລາຍຈ່າຍ (tbl_finance_categories typestatus 2) ມີໄດ້ແຖວດຽວຕໍ່ປີການເງິນ
 * (UNIQUE fiscal_id + category_id). amount = ງົບທັງປີ ເປັນສະກຸນຫຼັກ (LAK); is_monthly 1 = ແບ່ງລາຍເດືອນ
 * (tbl_budget_month) ແລະ amount = ຜົນລວມຂອງທຸກເດືອນ. ຍອດໃຊ້ຈິງຄິດຈາກລາຍຈ່າຍທຸກເທື່ອ ບໍ່ເກັບໄວ້
 */
class Budget extends sequelize_1.Model {
}
Budget.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    fiscal_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    category_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    amount: {
        type: sequelize_1.DataTypes.DECIMAL(16, 2),
        allowNull: false,
        defaultValue: 0
    },
    is_monthly: {
        type: sequelize_1.DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 0
    },
    description: sequelize_1.DataTypes.STRING(255),
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
    modelName: "Budget",
    tableName: "tbl_budget",
    timestamps: true
});
Budget.belongsTo(fiscalYear_1.default, { foreignKey: "fiscal_id", as: "fiscal" });
Budget.belongsTo(typeIncomeModel_1.default, { foreignKey: "category_id", as: "category" });
Budget.hasMany(budgetMonth_1.default, { foreignKey: "budget_id", as: "months" });
(0, autoSync_1.autoSync)(Budget);
exports.default = Budget;
