"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
/**
 * ການຜູກບັນຊີ (tbl_gl_mapping) — ROLE (source_key = ຊື່ບົດບາດ ເຊັ່ນ VAT_OUTPUT),
 * FINANCE_CATEGORY / TREASURY_ACCOUNT (source_key = _uuid) → ບັນຊີໃນຜັງ (account_id).
 * ຕາຕະລາງສ້າງດ້ວຍ autoSync; ບົດບາດເລີ່ມຕົ້ນ ໃສ່ໃຫ້ຕອນເປີດ server (controllers/bansi/glSeed.ts)
 */
class GlMapping extends sequelize_1.Model {
}
GlMapping.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    source_type: {
        type: sequelize_1.DataTypes.STRING(30),
        allowNull: false
    },
    source_key: {
        type: sequelize_1.DataTypes.STRING(50),
        allowNull: false
    },
    account_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
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
    modelName: "GlMapping",
    tableName: "tbl_gl_mapping",
    timestamps: true,
});
(0, autoSync_1.autoSync)(GlMapping);
exports.default = GlMapping;
