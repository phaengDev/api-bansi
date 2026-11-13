"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
/**
 * ກະທົບຍອດທະນາຄານ — ແຕ່ລະຄັ້ງທີ່ທຽບໃບແຈ້ງຍອດ (statement) ຂອງບັນຊີເງິນຄັງ ກັບ ສະໝຸດບັນຊີ:
 * statement_balance = ຍອດໃນໃບແຈ້ງຍອດ ນ statement_date (ສະກຸນຂອງບັນຊີ); ແຖວສະໝຸດບັນຊີທີ່ຕິກວ່າກົງ
 * ຖືກໝາຍ tbl_journal_line.reconciliation_id. book_balance = ຍອດໃນລະບົບ ນ ວັນດຽວກັນ (ສ່ວນຕ່າງ = ລາຍການທີ່ຍັງບໍ່ຜ່ານທະນາຄານ)
 */
class BankReconciliation extends sequelize_1.Model {
}
BankReconciliation.init({
    _uuid: { type: sequelize_1.DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    treasury_account_id: { type: sequelize_1.DataTypes.INTEGER, allowNull: false },
    statement_date: { type: sequelize_1.DataTypes.DATEONLY, allowNull: false },
    statement_balance: { type: sequelize_1.DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
    book_balance: { type: sequelize_1.DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
    cleared_count: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    note: sequelize_1.DataTypes.STRING(255),
    created_by: sequelize_1.DataTypes.INTEGER,
    createdAt: { type: sequelize_1.DataTypes.DATE, defaultValue: sequelize_1.DataTypes.NOW },
    updatedAt: { type: sequelize_1.DataTypes.DATE, defaultValue: sequelize_1.DataTypes.NOW },
}, { sequelize: database_1.default, modelName: "BankReconciliation", tableName: "tbl_bank_reconciliation", timestamps: true });
(0, autoSync_1.autoSync)(BankReconciliation);
exports.default = BankReconciliation;
