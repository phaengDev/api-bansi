"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
const payroll_1 = __importDefault(require("./payroll"));
/**
 * ເງິນເດືອນລາຍຄົນຂອງໃບເງິນເດືອນ (UNIQUE payroll_id + employee_id). ຊື່/ພະແນກ/ບັນຊີທະນາຄານ ເກັບເປັນສຳເນົາ
 * ຕອນສ້າງ/ຄິດໄລ່ໃໝ່ (ໃບທີ່ຈ່າຍແລ້ວບໍ່ປ່ຽນຕາມຂໍ້ມູນພະນັກງານ). ສູດຢູ່ controllers/hr/payrollRules.ts:
 * ເງິນເດືອນຕາມວັນເຮັດວຽກ (base_pay) − ຫັກຂາດວຽກ − ຫັກມາຊ້າ + ເງິນອຸດໜູນ + ລ່ວງເວລາ + ໂບນັດ = gross;
 * net = gross − ປກສ ພະນັກງານ − ອາກອນ − ຫັກອື່ນ. ລ່ວງເວລາ (overtime) ຄິດຈາກບັນທຶກ OT (overtime_mode 1) ຫຼື ປ້ອນເອງ (0).
 * deduction_mode / sso_mode / tax_mode = ນະໂຍບາຍສະເພາະຄົນຂອງແຕ່ລະກຸ່ມການຫັກ:
 * 1 ຕາມບໍລິສັດ, 3 ຫັກສະເໝີ, 2 ບໍ່ຫັກ, 0 ປ້ອນເອງ (MODE_* ໃນ payrollRules.ts)
 */
class PayrollLine extends sequelize_1.Model {
}
/** ສ້າງໃໝ່ທຸກຖັນ — Sequelize ແກ້ object ຂອງ attribute (field), ໃຊ້ object ດຽວກັນຫຼາຍຖັນ = ທຸກຖັນຊີ້ໄປຖັນທຳອິດ */
const money = () => ({ type: sequelize_1.DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0 });
const count = () => ({ type: sequelize_1.DataTypes.INTEGER, allowNull: false, defaultValue: 0 });
const mode = () => ({ type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1 });
PayrollLine.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    payroll_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    employee_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    emp_code: {
        type: sequelize_1.DataTypes.STRING(30),
        allowNull: false
    },
    employee_name: {
        type: sequelize_1.DataTypes.STRING(200),
        allowNull: false
    },
    department_name: sequelize_1.DataTypes.STRING(150),
    position_name: sequelize_1.DataTypes.STRING(150),
    bank_name: sequelize_1.DataTypes.STRING(100),
    bank_account_no: sequelize_1.DataTypes.STRING(50),
    bank_account_name: sequelize_1.DataTypes.STRING(150),
    basic_salary: money(),
    workdays: count(),
    employed_days: count(),
    present_days: count(),
    leave_days: count(),
    unpaid_days: count(),
    absent_days: count(),
    late_days: count(),
    late_minutes: count(),
    base_pay: money(),
    absence_deduction: money(),
    late_deduction: money(),
    allowance: money(),
    overtime: money(),
    // ຊົ່ວໂມງ OT ຂອງເດືອນ (tbl_overtime) ແລະ ຊົ່ວໂມງຄູນອັດຕາ (Σ ຊົ່ວໂມງ × % ÷ 100) ຕອນສ້າງ/ຄິດໄລ່ໃໝ່
    ot_hours: { type: sequelize_1.DataTypes.DECIMAL(8, 2), allowNull: false, defaultValue: 0 },
    ot_weighted_hours: { type: sequelize_1.DataTypes.DECIMAL(8, 2), allowNull: false, defaultValue: 0 },
    // OT ທີ່ກຳນົດເງິນເອງ (ຕໍ່ຊົ່ວໂມງ × ຊົ່ວໂມງ + ເໝົາຈ່າຍ) — ບວກເພີ່ມຈາກສ່ວນທີ່ຄິດຕາມອັດຕາ
    ot_fixed_amount: { type: sequelize_1.DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0 },
    // 1 ຄິດຈາກບັນທຶກ OT, 0 ປ້ອນເອງ — ຄ່າເລີ່ມຕົ້ນຂອງຖັນ 0: ແຖວທີ່ມີກ່ອນມີບັນທຶກ OT ຍັງເປັນຈຳນວນທີ່ປ້ອນໄວ້; ແຖວໃໝ່ = 1
    overtime_mode: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
    bonus: money(),
    gross: money(),
    sso_base: money(),
    sso_employee: money(),
    sso_employer: money(),
    taxable: money(),
    tax: money(),
    other_deduction: money(),
    net: money(),
    deduction_mode: mode(),
    sso_mode: mode(),
    tax_mode: mode(),
    note: sequelize_1.DataTypes.STRING(255),
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
    modelName: "PayrollLine",
    tableName: "tbl_payroll_line",
    timestamps: true
});
payroll_1.default.hasMany(PayrollLine, { foreignKey: "payroll_id", as: "lines", constraints: false });
PayrollLine.belongsTo(payroll_1.default, { foreignKey: "payroll_id", as: "payroll", constraints: false });
(0, autoSync_1.autoSync)(PayrollLine, { rename: { deduction_auto: "deduction_mode", sso_auto: "sso_mode", tax_auto: "tax_mode" } });
exports.default = PayrollLine;
