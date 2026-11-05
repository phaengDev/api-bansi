"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
const employee_1 = __importDefault(require("./employee"));
const treasuryAcount_1 = __importDefault(require("./treasuryAcount"));
/**
 * ເງິນເບີກລ່ວງໜ້າຂອງພະນັກງານ (ສະກຸນກີບ). ພະນັກງານຂໍຜ່ານ app ຫຼື HR ບັນທຶກແທນ → HR ອະນຸມັດ → ຈ່າຍເງິນ
 * (ເງິນອອກຈາກ account_id + ລົງບັນຊີ ໜີ້ ເງິນລ່ວງໜ້າພະນັກງານ) → ຫັກຄືນຈາກເງິນເດືອນທຸກເດືອນ ຫຼື ຮັບຄືນເປັນເງິນສົດ.
 * status: 1 ລໍຖ້າອະນຸມັດ, 2 ອະນຸມັດແລ້ວ (ລໍຖ້າຈ່າຍເງິນ), 3 ຈ່າຍແລ້ວ (ກຳລັງຫັກຄືນ), 4 ຄືນຄົບແລ້ວ, 5 ປະຕິເສດ, 6 ຍົກເລີກ.
 * requested_amount = ຍອດທີ່ຂໍ, amount = ຍອດທີ່ອະນຸມັດ; monthly_deduction = ຫັກຕໍ່ເດືອນ, start_period = ເດືອນທຳອິດທີ່ຫັກ "YYYY-MM";
 * repaid = ຍອດທີ່ຄືນແລ້ວ (ຜົນລວມຂອງ tbl_salary_advance_repayment). source: 1 app ພະນັກງານ, 2 HR ບັນທຶກແທນ
 */
class SalaryAdvance extends sequelize_1.Model {
}
/** ສ້າງໃໝ່ທຸກຖັນ — Sequelize ແກ້ object ຂອງ attribute (field), ໃຊ້ object ດຽວກັນຫຼາຍຖັນ = ທຸກຖັນຊີ້ໄປຖັນທຳອິດ */
const money = () => ({ type: sequelize_1.DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0 });
SalaryAdvance.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    number: sequelize_1.DataTypes.STRING(30),
    employee_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    requested_amount: money(),
    amount: money(),
    installments: {
        type: sequelize_1.DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 1
    },
    monthly_deduction: money(),
    start_period: {
        type: sequelize_1.DataTypes.STRING(7),
        allowNull: false
    },
    reason: {
        type: sequelize_1.DataTypes.STRING(255),
        allowNull: false
    },
    repaid: money(),
    status: {
        type: sequelize_1.DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 1
    },
    source: {
        type: sequelize_1.DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 1
    },
    account_id: sequelize_1.DataTypes.INTEGER,
    pay_date: sequelize_1.DataTypes.DATEONLY,
    paidbyid: sequelize_1.DataTypes.INTEGER,
    paidAt: sequelize_1.DataTypes.DATE,
    review_note: sequelize_1.DataTypes.STRING(255),
    reviewedbyid: sequelize_1.DataTypes.INTEGER,
    reviewedAt: sequelize_1.DataTypes.DATE,
    settledAt: sequelize_1.DataTypes.DATE,
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
    modelName: "SalaryAdvance",
    tableName: "tbl_salary_advance",
    timestamps: true
});
SalaryAdvance.belongsTo(employee_1.default, { foreignKey: "employee_id", as: "employee", constraints: false });
SalaryAdvance.belongsTo(treasuryAcount_1.default, { foreignKey: "account_id", as: "account", constraints: false });
(0, autoSync_1.autoSync)(SalaryAdvance);
exports.default = SalaryAdvance;
