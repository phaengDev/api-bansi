"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
const treasuryAcount_1 = __importDefault(require("./treasuryAcount"));
/**
 * ໃບເງິນເດືອນປະຈຳເດືອນ — 1 ໃບ ຕໍ່ ເດືອນ (UNIQUE period "YYYY-MM"), ລາຍຄົນຢູ່ tbl_payroll_line.
 * status: 1 ຮ່າງ (ແກ້ໄຂ/ຄິດໄລ່ໃໝ່ໄດ້), 2 ຈ່າຍແລ້ວ — ຈ່າຍ = ເງິນອອກຈາກ account_id (moveBalance "PAYROLL")
 * + ລົງບັນຊີຄູ່ (source "PAYROLL"); ຍົກເລີກການຈ່າຍ = ຄືນເງິນ + ກັບລາຍການ ແລ້ວກັບເປັນຮ່າງ.
 * total_* = ຜົນລວມຂອງທຸກແຖວ (ຄິດໃໝ່ທຸກຄັ້ງທີ່ແຖວປ່ຽນ)
 */
class Payroll extends sequelize_1.Model {
}
/** ສ້າງໃໝ່ທຸກຖັນ — Sequelize ແກ້ object ຂອງ attribute (field), ໃຊ້ object ດຽວກັນຫຼາຍຖັນ = ທຸກຖັນຊີ້ໄປຖັນທຳອິດ */
const money = () => ({ type: sequelize_1.DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0 });
Payroll.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    period: {
        type: sequelize_1.DataTypes.STRING(7),
        allowNull: false
    },
    workdays: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    status: {
        type: sequelize_1.DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 1
    },
    employees: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    total_base: money(),
    total_attendance_deduction: money(),
    total_additions: money(),
    total_gross: money(),
    total_sso_employee: money(),
    total_sso_employer: money(),
    total_tax: money(),
    total_other_deduction: money(),
    total_net: money(),
    number: sequelize_1.DataTypes.STRING(30),
    pay_date: sequelize_1.DataTypes.DATEONLY,
    account_id: sequelize_1.DataTypes.INTEGER,
    description: sequelize_1.DataTypes.STRING(255),
    createdbyid: sequelize_1.DataTypes.INTEGER,
    paidbyid: sequelize_1.DataTypes.INTEGER,
    paidAt: sequelize_1.DataTypes.DATE,
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
    modelName: "Payroll",
    tableName: "tbl_payroll",
    timestamps: true
});
Payroll.belongsTo(treasuryAcount_1.default, { foreignKey: "account_id", as: "account", constraints: false });
(0, autoSync_1.autoSync)(Payroll);
exports.default = Payroll;
