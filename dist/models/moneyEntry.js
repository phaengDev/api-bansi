"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
/**
 * ລາຍຮັບ / ລາຍຈ່າຍ / ໂອນ ຂອງບັນຊີເງິນສ່ວນຕົວ (app) — ເຫັນສະເພາະຂອງຕົນເອງ. ສະກຸນ = ສະກຸນຂອງບັນຊີ (ບໍ່ແປງຄ່າ —
 * ລາຍງານແຍກຕາມສະກຸນ). transfer = ໂອນຈາກ account_id (amount, ສະກຸນບັນຊີຕົ້ນທາງ) ໄປ to_account_id (to_amount,
 * ສະກຸນບັນຊີປາຍທາງ — ແລກເງິນ = ຄົນລະຈຳນວນ), category_id 0, ບໍ່ນັບເປັນລາຍຮັບ-ລາຍຈ່າຍ.
 * account_id null = ລາຍການກ່ອນມີບັນຊີ (ບໍ່ລະບຸບັນຊີ). photo = ຮູບໃບບິນ (private/money-receipts, ເປີດຜ່ານ API ເທົ່ານັ້ນ).
 * source "PAYROLL" = ລາຍການທີ່ລະບົບເຄີຍເພີ່ມຕອນ HR ຈ່າຍເງິນເດືອນ (ເລີກແລ້ວ — ພະນັກງານບັນທຶກເອງ)
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
    /** income ລາຍຮັບ, expense ລາຍຈ່າຍ (ຕາມໝວດ), transfer ໂອນລະຫວ່າງບັນຊີ */
    kind: {
        type: sequelize_1.DataTypes.STRING(10),
        allowNull: false
    },
    /** ບັນຊີ (ລາຍຮັບເຂົ້າ / ລາຍຈ່າຍອອກ / ໂອນອອກ) — null = ກ່ອນມີບັນຊີ */
    account_id: sequelize_1.DataTypes.INTEGER,
    /** ໂອນ = 0 */
    category_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    amount: {
        type: sequelize_1.DataTypes.DECIMAL(16, 2),
        allowNull: false
    },
    /** ໂອນ: ບັນຊີປາຍທາງ ແລະ ຈຳນວນທີ່ເຂົ້າ (ສະກຸນຂອງປາຍທາງ) */
    to_account_id: sequelize_1.DataTypes.INTEGER,
    to_amount: sequelize_1.DataTypes.DECIMAL(16, 2),
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
    indexes: [{ fields: ["employee_id", "entry_date"] }, { fields: ["account_id"] }, { fields: ["to_account_id"] }],
});
(0, autoSync_1.autoSync)(MoneyEntry);
exports.default = MoneyEntry;
