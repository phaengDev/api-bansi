"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
const journalLine_1 = __importDefault(require("./journalLine"));
/**
 * ໃບບັນທຶກບັນຊີ (tbl_journal_entry) — ລາຍຮັບ/ລາຍຈ່າຍ/ໂອນ/ຍອດຍົກມາ ລົງໃຫ້ເອງ (source_type + source_id),
 * MANUAL = ບັນທຶກທົ່ວໄປ. ບໍ່ລຶບ: ຍົກເລີກ = ໃບກັບລາຍການ (reversal_of) ແລະ ໝາຍໃບເດີມ reversed_by.
 * ຕາຕະລາງສ້າງດ້ວຍ autoSync; index ໃສ່ໃຫ້ຕອນເປີດ server (controllers/bansi/glSeed.ts)
 */
class JournalEntry extends sequelize_1.Model {
}
JournalEntry.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    entry_number: {
        type: sequelize_1.DataTypes.STRING(50),
        allowNull: false,
        unique: true
    },
    entry_date: {
        type: sequelize_1.DataTypes.DATEONLY,
        allowNull: false
    },
    source_type: {
        type: sequelize_1.DataTypes.STRING(30),
        allowNull: false
    },
    source_id: sequelize_1.DataTypes.STRING(50),
    reference: sequelize_1.DataTypes.STRING(100),
    description: sequelize_1.DataTypes.STRING(500),
    total_debit: {
        type: sequelize_1.DataTypes.DECIMAL(18, 2),
        allowNull: false,
        defaultValue: 0
    },
    total_credit: {
        type: sequelize_1.DataTypes.DECIMAL(18, 2),
        allowNull: false,
        defaultValue: 0
    },
    reversal_of: sequelize_1.DataTypes.INTEGER,
    reversed_by: sequelize_1.DataTypes.INTEGER,
    status: {
        type: sequelize_1.DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 1
    },
    created_by: sequelize_1.DataTypes.INTEGER,
    createdAt: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize_1.DataTypes.NOW
    },
    updatedAt: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize_1.DataTypes.NOW
    },
}, {
    sequelize: database_1.default,
    modelName: "JournalEntry",
    tableName: "tbl_journal_entry",
    timestamps: true,
});
JournalEntry.hasMany(journalLine_1.default, {
    foreignKey: "entry_id", as: "lines",
    constraints: false
});
(0, autoSync_1.autoSync)(JournalEntry);
exports.default = JournalEntry;
