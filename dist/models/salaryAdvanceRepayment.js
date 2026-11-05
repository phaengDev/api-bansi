"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
const salaryAdvance_1 = __importDefault(require("./salaryAdvance"));
const treasuryAcount_1 = __importDefault(require("./treasuryAcount"));
/**
 * ການຄືນເງິນເບີກລ່ວງໜ້າ — kind 1 ຫັກຈາກເງິນເດືອນ (payroll_id + period: ສ້າງຕອນຈ່າຍເງິນເດືອນ, ລຶບຕອນຍົກເລີກການຈ່າຍ),
 * 2 ຮັບຄືນເປັນເງິນສົດ/ໂອນ (account_id: ເງິນເຂົ້າບັນຊີເງິນຄັງ + ລົງບັນຊີ "ADVANCE_REPAY")
 */
class SalaryAdvanceRepayment extends sequelize_1.Model {
}
SalaryAdvanceRepayment.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    advance_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    employee_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    kind: {
        type: sequelize_1.DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 1
    },
    amount: {
        type: sequelize_1.DataTypes.DECIMAL(16, 2),
        allowNull: false,
        defaultValue: 0
    },
    repay_date: {
        type: sequelize_1.DataTypes.DATEONLY,
        allowNull: false
    },
    period: sequelize_1.DataTypes.STRING(7),
    payroll_id: sequelize_1.DataTypes.INTEGER,
    account_id: sequelize_1.DataTypes.INTEGER,
    note: sequelize_1.DataTypes.STRING(255),
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
    modelName: "SalaryAdvanceRepayment",
    tableName: "tbl_salary_advance_repayment",
    timestamps: true
});
salaryAdvance_1.default.hasMany(SalaryAdvanceRepayment, { foreignKey: "advance_id", as: "repayments", constraints: false });
SalaryAdvanceRepayment.belongsTo(salaryAdvance_1.default, { foreignKey: "advance_id", as: "advance", constraints: false });
SalaryAdvanceRepayment.belongsTo(treasuryAcount_1.default, { foreignKey: "account_id", as: "account", constraints: false });
(0, autoSync_1.autoSync)(SalaryAdvanceRepayment);
exports.default = SalaryAdvanceRepayment;
