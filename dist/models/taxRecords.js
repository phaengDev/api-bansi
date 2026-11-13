"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WithholdingTax = exports.ProfitTax = void 0;
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
const money = () => ({ type: sequelize_1.DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0 });
const stamps = () => ({
    createdAt: { type: sequelize_1.DataTypes.DATE, defaultValue: sequelize_1.DataTypes.NOW },
    updatedAt: { type: sequelize_1.DataTypes.DATE, defaultValue: sequelize_1.DataTypes.NOW },
});
/**
 * ການຄິດອາກອນກຳໄລຂອງປີການເງິນ (ແຖວດຽວຕໍ່ປີ): ກຳໄລກ່ອນອາກອນ (ຈາກສະໝຸດບັນຊີ ຕອນຄິດ) + ລາຍຈ່າຍທີ່ບໍ່ຫັກໄດ້ − ລາຍຮັບທີ່ບໍ່ຕ້ອງເສຍ
 * = ກຳໄລເສຍອາກອນ × ອັດຕາ. ລົງບັນຊີ PROFIT_TAX (source_id FY-{fiscal_id}): ໜີ້ ລາຍຈ່າຍອາກອນກຳໄລ / ມີ ອາກອນກຳໄລຄ້າງຈ່າຍ
 */
class ProfitTax extends sequelize_1.Model {
}
exports.ProfitTax = ProfitTax;
ProfitTax.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    fiscal_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    profit_before_tax: money(),
    add_back: money(),
    deduction: money(),
    rate: {
        type: sequelize_1.DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 20
    },
    taxable: money(),
    tax: money(),
    entry_date: sequelize_1.DataTypes.DATEONLY,
    note: sequelize_1.DataTypes.STRING(255),
    created_by: sequelize_1.DataTypes.INTEGER,
    ...stamps(),
}, { sequelize: database_1.default,
    modelName: "ProfitTax",
    tableName: "tbl_profit_tax",
    timestamps: true });
/**
 * ອາກອນຫັກ ນ ທີ່ຈ່າຍ — ແຕ່ລະຄັ້ງທີ່ຫັກອາກອນໄວ້ຈາກການຈ່າຍ (ຜູ້ໃຫ້ບໍລິການຕ່າງປະເທດ, ເງິນປັນຜົນ, ດອກເບ້ຍ…).
 * ລົງບັນຊີ WHT (source_id = _uuid): ໜີ້ debit_account (ລາຍຈ່າຍ ຫຼື ເຈົ້າໜີ້) / ມີ ອາກອນຫັກ ນ ທີ່ຈ່າຍ ຄ້າງນຳສົ່ງ.
 * income_type: 1 ບໍລິການຈາກຕ່າງປະເທດ, 2 ເງິນປັນຜົນ, 3 ດອກເບ້ຍ, 4 ຄ່າລິຂະສິດ, 5 ຄ່າເຊົ່າ, 9 ອື່ນໆ. status 1 ໃຊ້, 2 ຍົກເລີກ
 */
class WithholdingTax extends sequelize_1.Model {
}
exports.WithholdingTax = WithholdingTax;
WithholdingTax.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    wht_date: {
        type: sequelize_1.DataTypes.DATEONLY,
        allowNull: false
    },
    payee_name: {
        type: sequelize_1.DataTypes.STRING(200),
        allowNull: false
    },
    payee_tax_id: sequelize_1.DataTypes.STRING(50),
    income_type: {
        type: sequelize_1.DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 1
    },
    gross_amount: money(),
    rate: {
        type: sequelize_1.DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0
    },
    wht_amount: money(),
    reference: sequelize_1.DataTypes.STRING(100),
    debit_account_id: sequelize_1.DataTypes.INTEGER,
    note: sequelize_1.DataTypes.STRING(255),
    status: {
        type: sequelize_1.DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 1
    },
    created_by: sequelize_1.DataTypes.INTEGER,
    ...stamps(),
}, { sequelize: database_1.default,
    modelName: "WithholdingTax",
    tableName: "tbl_withholding_tax",
    timestamps: true
});
(0, autoSync_1.autoSync)(ProfitTax);
(0, autoSync_1.autoSync)(WithholdingTax);
