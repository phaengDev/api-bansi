"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
/**
 * ຕັ້ງຄ່າເງິນເດືອນ (ແຖວດຽວ) — ນະໂຍບາຍເປີດ/ປິດ (sso_enabled, tax_enabled, deduct_absent, deduct_late: 0 = ບໍ່ຫັກ),
 * ປະກັນສັງຄົມ (% ພະນັກງານ / % ບໍລິສັດ / ເພດານເງິນເດືອນ), ຂັ້ນອາກອນລາຍໄດ້ (JSON
 * [{ upto, rate }] ຂັ້ນສຸດທ້າຍ upto = null), ເງິນເດືອນສູງສຸດທີ່ຄ່າລ່ວງເວລາບໍ່ເສຍອາກອນ (0 = ເສຍທຸກຄົນ),
 * ນາທີຜ່ອນຜັນມາຊ້າ/ອອກກ່ອນ ແລະ ຫັກຂາດວຽກ/ມາຊ້າ ອັດຕະໂນມັດ ຫຼື ບໍ່; ຄ່າລ່ວງເວລາ (OT): ຊົ່ວໂມງເຮັດວຽກຕໍ່ມື້
 * (ຄິດຄ່າແຮງຕໍ່ຊົ່ວໂມງ) ແລະ % ຂອງຄ່າແຮງຕໍ່ຊົ່ວໂມງ ຕາມປະເພດ OT (tbl_overtime.kind). ຍັງບໍ່ມີແຖວ = ໃຊ້ຄ່າເລີ່ມຕົ້ນ (hr/payrollRules.ts)
 */
class PayrollSetting extends sequelize_1.Model {
}
PayrollSetting.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    sso_enabled: {
        type: sequelize_1.DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 1
    },
    sso_employee_rate: {
        type: sequelize_1.DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 5.5
    },
    sso_employer_rate: {
        type: sequelize_1.DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 6
    },
    sso_salary_cap: {
        type: sequelize_1.DataTypes.DECIMAL(16, 2),
        allowNull: false,
        defaultValue: 4500000
    },
    tax_enabled: {
        type: sequelize_1.DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 1
    },
    tax_brackets: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: false
    },
    ot_tax_free_salary: {
        type: sequelize_1.DataTypes.DECIMAL(16, 2),
        allowNull: false,
        defaultValue: 3000000
    },
    late_grace_minutes: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    deduct_absent: {
        type: sequelize_1.DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 1
    },
    deduct_late: {
        type: sequelize_1.DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 1
    },
    ot_hours_per_day: {
        type: sequelize_1.DataTypes.DECIMAL(4, 2),
        allowNull: false,
        defaultValue: 8
    },
    ot_rate_normal: {
        type: sequelize_1.DataTypes.DECIMAL(6, 2),
        allowNull: false,
        defaultValue: 150
    },
    ot_rate_night: {
        type: sequelize_1.DataTypes.DECIMAL(6, 2),
        allowNull: false,
        defaultValue: 200
    },
    ot_rate_dayoff: {
        type: sequelize_1.DataTypes.DECIMAL(6, 2),
        allowNull: false,
        defaultValue: 250
    },
    ot_rate_dayoff_night: {
        type: sequelize_1.DataTypes.DECIMAL(6, 2),
        allowNull: false,
        defaultValue: 300
    },
    updatedbyid: sequelize_1.DataTypes.INTEGER,
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
    modelName: "PayrollSetting",
    tableName: "tbl_payroll_setting",
    timestamps: true
});
(0, autoSync_1.autoSync)(PayrollSetting);
exports.default = PayrollSetting;
