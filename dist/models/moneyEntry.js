"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
/**
 * ລາຍຮັບ-ລາຍຈ່າຍສ່ວນຕົວຂອງພະນັກງານ (app) — ເຫັນສະເພາະຂອງຕົນເອງ. ສະກຸນເງິນ LAK / THB / USD (ບໍ່ແປງຄ່າ — ລາຍງານແຍກຕາມສະກຸນ).
 * photo = ຮູບໃບບິນ (ໄຟລ໌ຢູ່ private/money-receipts, ເປີດຜ່ານ API ທີ່ login ແລ້ວເທົ່ານັ້ນ).
 * source "PAYROLL" + source_id = ໃບເງິນເດືອນ: ລະບົບເພີ່ມເອງຕອນ HR ຈ່າຍເງິນເດືອນ, ລຶບເອງຕອນຍົກເລີກການຈ່າຍ
 */
class MoneyEntry extends sequelize_1.Model {
}
MoneyEntry.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    employee_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    /** income ລາຍຮັບ, expense ລາຍຈ່າຍ (ຕາມໝວດ) */
    kind: {
        type: sequelize_1.DataTypes.STRING(10),
        allowNull: false
    },
    category_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    amount: {
        type: sequelize_1.DataTypes.DECIMAL(16, 2),
        allowNull: false
    },
    currency: {
        type: sequelize_1.DataTypes.STRING(3),
        allowNull: false,
        defaultValue: "LAK"
    },
    entry_date: {
        type: sequelize_1.DataTypes.DATEONLY,
        allowNull: false
    },
    note: sequelize_1.DataTypes.STRING(500),
    photo: sequelize_1.DataTypes.STRING(100),
    source: sequelize_1.DataTypes.STRING(20),
    source_id: sequelize_1.DataTypes.INTEGER,
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
    modelName: "MoneyEntry",
    tableName: "tbl_money_entry",
    timestamps: true,
    indexes: [{ fields: ["employee_id", "entry_date"] }, { fields: ["source", "source_id"] }],
});
(0, autoSync_1.autoSync)(MoneyEntry);
exports.default = MoneyEntry;
