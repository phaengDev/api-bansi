"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
/**
 * ປະເພດປຶ້ມບັນຊີ (journal) — journal_kind: 1 ລາຍວັນທົ່ວໄປ, 2 ລາຍຮັບ, 3 ລາຍຈ່າຍ, 4 ເງິນສົດ, 5 ທະນາຄານ,
 * 6 ປັບປຸງ/ປິດບັນຊີ. ເອກະສານແຕ່ລະໃບຈະຖືກບັນທຶກລົງປຶ້ມໃດປຶ້ມໜຶ່ງ
 */
class JournalType extends sequelize_1.Model {
}
JournalType.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true
    },
    journal_code: {
        type: sequelize_1.DataTypes.STRING(20),
        allowNull: false
    },
    name: {
        type: sequelize_1.DataTypes.STRING(150),
        allowNull: false
    },
    journal_kind: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
    },
    description: sequelize_1.DataTypes.STRING(255),
    status: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
    },
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
    modelName: "JournalType",
    tableName: "tbl_journal_type",
    timestamps: true
});
(0, autoSync_1.autoSync)(JournalType);
exports.default = JournalType;
