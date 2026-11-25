"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
/**
 * ລາຍຈ່າຍປະຈຳເດືອນ (ຄ່າເຊົ່າ, ຄ່າໄຟ, ອິນເຕີເນັດ…) — ແມ່ແບບທີ່ສ້າງຈາກລາຍຈ່າຍທີ່ເຄີຍບັນທຶກ: ປະເພດ, ບັນຊີທີ່ຈ່າຍ, ຜູ້ຮັບ,
 * ລາຍການ (items JSON [{ name, qty, unit, price }]) ແລະ ວັນທີທີ່ຄົບກຳນົດແຕ່ລະເດືອນ. ບໍ່ບັນທຶກເງິນອອກເອງ —
 * ຜູ້ໃຊ້ກົດ "ບັນທຶກເດືອນນີ້" ແລ້ວກວດຈຳນວນເອງ (ຄ່າໄຟປ່ຽນທຸກເດືອນ); ລາຍຈ່າຍທີ່ບັນທຶກຈາກແມ່ແບບມີ recurring_id
 */
class ExpenseRecurring extends sequelize_1.Model {
}
ExpenseRecurring.init({
    _uuid: { type: sequelize_1.DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    title: { type: sequelize_1.DataTypes.STRING(150), allowNull: false },
    day_of_month: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    sub_category_id: { type: sequelize_1.DataTypes.INTEGER, allowNull: false },
    acount_id_fk: { type: sequelize_1.DataTypes.INTEGER, allowNull: false },
    partner_id: sequelize_1.DataTypes.INTEGER,
    payee_name: sequelize_1.DataTypes.STRING(150),
    payee_bank_id: sequelize_1.DataTypes.INTEGER,
    payee_account_number: sequelize_1.DataTypes.STRING(50),
    items: { type: sequelize_1.DataTypes.TEXT, allowNull: false },
    amount: { type: sequelize_1.DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
    description: sequelize_1.DataTypes.TEXT,
    status: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    createdbyid: sequelize_1.DataTypes.INTEGER,
    createdAt: { type: sequelize_1.DataTypes.DATE, allowNull: false, defaultValue: sequelize_1.DataTypes.NOW },
    updatedAt: { type: sequelize_1.DataTypes.DATE, allowNull: false, defaultValue: sequelize_1.DataTypes.NOW },
}, { sequelize: database_1.default, modelName: "ExpenseRecurring", tableName: "tbl_expense_recurring", timestamps: false });
(0, autoSync_1.autoSync)(ExpenseRecurring);
exports.default = ExpenseRecurring;
