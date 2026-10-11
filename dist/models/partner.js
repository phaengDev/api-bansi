"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
/**
 * ຄູ່ຄ້າ (tbl_partner) — partner_type 1 ລູກຄ້າ (ລູກໜີ້), 2 ຜູ້ສະໜອງ (ເຈົ້າໜີ້), 3 ທັງສອງ.
 * ຕາຕະລາງສ້າງດ້ວຍ autoSync (index ໃສ່ໃຫ້ຕອນເປີດ server — controllers/bansi/glSeed.ts)
 */
class Partner extends sequelize_1.Model {
}
Partner.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    partner_code: {
        type: sequelize_1.DataTypes.STRING(30),
        allowNull: false,
        unique: true
    },
    name: {
        type: sequelize_1.DataTypes.STRING(200),
        allowNull: false
    },
    partner_type: {
        type: sequelize_1.DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 1
    },
    contact_person: {
        type: sequelize_1.DataTypes.STRING(150),
        allowNull: true
    },
    phone: {
        type: sequelize_1.DataTypes.STRING(50),
        allowNull: true
    },
    email: {
        type: sequelize_1.DataTypes.STRING(150),
        allowNull: true
    },
    address: {
        type: sequelize_1.DataTypes.STRING(255),
        allowNull: true
    },
    tax_number: {
        type: sequelize_1.DataTypes.STRING(50),
        allowNull: true
    },
    credit_days: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    receivable_account_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: true
    },
    payable_account_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: true
    },
    description: {
        type: sequelize_1.DataTypes.STRING(255),
        allowNull: true
    },
    status: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
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
    modelName: "Partner",
    tableName: "tbl_partner",
    timestamps: true
});
(0, autoSync_1.autoSync)(Partner);
exports.default = Partner;
