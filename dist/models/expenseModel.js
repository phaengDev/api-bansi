"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
const typeIncomeModel_1 = __importDefault(require("./typeIncomeModel"));
const treasuryAcount_1 = __importDefault(require("./treasuryAcount"));
const expenseItemModel_1 = __importDefault(require("./expenseItemModel"));
const userModel_1 = __importDefault(require("./userModel"));
const bankModel_1 = __importDefault(require("./bankModel"));
const partner_1 = __importDefault(require("./partner"));
/**
 * ລາຍຈ່າຍ — ສ່ວນຫົວ (1 ແຖວຕໍ່ໃບຈ່າຍ); ລາຍການຍ່ອຍຢູ່ tbl_expense_items (expense_id).
 * ບັນທຶກແລ້ວເງິນອອກຈາກ "ຍອດໃຊ້ໄດ້" (balance_treasury) ຂອງບັນຊີທີ່ຈ່າຍທັນທີ (ຜ່ານ moveBalance),
 * ຍົກເລີກ (status 2) = ຄືນເງິນເຂົ້າບັນຊີ. ຖັນເງິນ: subtotal = ລວມທຸກລາຍການ, tax = ອາກອນ,
 * balance_expense = ຍອດຈ່າຍອອກແທ້. pay_type ມາຈາກໝວດຂອງບັນຊີທີ່ຈ່າຍ: 1 = ເງິນສົດ (ໝວດ 101), 2 = ເງິນໂອນ
 */
class Expenses extends sequelize_1.Model {
}
Expenses.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    number: sequelize_1.DataTypes.STRING(50),
    expense_date: {
        type: sequelize_1.DataTypes.DATEONLY,
        allowNull: false,
    },
    expense_title: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false,
    },
    type_expense_fk: sequelize_1.DataTypes.INTEGER,
    payee_name: sequelize_1.DataTypes.STRING,
    bill_no: sequelize_1.DataTypes.STRING(100),
    type_acountid: sequelize_1.DataTypes.INTEGER,
    acount_id_fk: sequelize_1.DataTypes.INTEGER,
    pay_type: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
    },
    payee_bank_id: sequelize_1.DataTypes.INTEGER,
    payee_account_number: sequelize_1.DataTypes.STRING(100),
    partner_id: sequelize_1.DataTypes.INTEGER,
    subtotal: {
        type: sequelize_1.DataTypes.DECIMAL(16, 2),
        allowNull: false,
        defaultValue: 0,
    },
    tax: {
        type: sequelize_1.DataTypes.DECIMAL(16, 2),
        allowNull: false,
        defaultValue: 0,
    },
    balance_expense: {
        type: sequelize_1.DataTypes.DECIMAL(16, 2),
        allowNull: false,
        defaultValue: 0,
    },
    description: sequelize_1.DataTypes.STRING(500),
    file_doct: sequelize_1.DataTypes.STRING,
    status: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
    },
    createdbyid: sequelize_1.DataTypes.INTEGER,
    createdAt: {
        type: sequelize_1.DataTypes.DATE,
        defaultValue: sequelize_1.DataTypes.NOW,
    },
    updatedAt: {
        type: sequelize_1.DataTypes.DATE,
        defaultValue: sequelize_1.DataTypes.NOW,
    },
}, {
    sequelize: database_1.default,
    modelName: "Expenses",
    tableName: "tbl_expenses",
    timestamps: true,
});
Expenses.belongsTo(typeIncomeModel_1.default, { foreignKey: "type_expense_fk", as: "typeout" });
Expenses.belongsTo(treasuryAcount_1.default, { foreignKey: "acount_id_fk", as: "acount" });
Expenses.belongsTo(userModel_1.default, { foreignKey: "createdbyid", as: "user" });
Expenses.belongsTo(bankModel_1.default, { foreignKey: "payee_bank_id", as: "payeeBank" });
Expenses.belongsTo(partner_1.default, { foreignKey: "partner_id", as: "partner", constraints: false });
Expenses.hasMany(expenseItemModel_1.default, { foreignKey: "expense_id", as: "items" });
(0, autoSync_1.autoSync)(Expenses);
exports.default = Expenses;
