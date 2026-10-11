"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PartnerDocLine = void 0;
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
const partner_1 = __importDefault(require("./partner"));
const chartAccount_1 = __importDefault(require("./chartAccount"));
/**
 * ໃບແຈ້ງໜີ້ (doc_kind 1) / ໃບບິນຜູ້ສະໜອງ (doc_kind 2) — paid = ຍອດທີ່ຕັດແລ້ວ (ສະກຸນຂອງໃບ), ຄ້າງ = total − paid.
 * ຕາຕະລາງສ້າງດ້ວຍ autoSync (index ໃສ່ໃຫ້ຕອນເປີດ server — controllers/bansi/glSeed.ts)
 */
class PartnerDocLine extends sequelize_1.Model {
}
exports.PartnerDocLine = PartnerDocLine;
PartnerDocLine.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    doc_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    line_no: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    account_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    description: sequelize_1.DataTypes.STRING(255),
    amount: {
        type: sequelize_1.DataTypes.DECIMAL(18, 2),
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
}, { sequelize: database_1.default, modelName: "PartnerDocLine", tableName: "tbl_partner_doc_line", timestamps: true });
class PartnerDoc extends sequelize_1.Model {
}
PartnerDoc.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    doc_kind: {
        type: sequelize_1.DataTypes.TINYINT,
        allowNull: false
    },
    doc_number: {
        type: sequelize_1.DataTypes.STRING(50),
        allowNull: false,
        unique: true
    },
    partner_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    doc_date: {
        type: sequelize_1.DataTypes.DATEONLY,
        allowNull: false
    },
    due_date: {
        type: sequelize_1.DataTypes.DATEONLY,
        allowNull: false
    },
    reference: sequelize_1.DataTypes.STRING(100),
    description: sequelize_1.DataTypes.STRING(500),
    currency_id: sequelize_1.DataTypes.INTEGER,
    exchange_rate: {
        type: sequelize_1.DataTypes.DECIMAL(16, 4),
        allowNull: false, defaultValue: 1
    },
    subtotal: {
        type: sequelize_1.DataTypes.DECIMAL(18, 2),
        allowNull: false, defaultValue: 0
    },
    tax_id: sequelize_1.DataTypes.INTEGER,
    tax: {
        type: sequelize_1.DataTypes.DECIMAL(18, 2),
        allowNull: false, defaultValue: 0
    },
    total: {
        type: sequelize_1.DataTypes.DECIMAL(18, 2),
        allowNull: false, defaultValue: 0
    },
    paid: {
        type: sequelize_1.DataTypes.DECIMAL(18, 2),
        allowNull: false, defaultValue: 0
    },
    control_account_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    status: {
        type: sequelize_1.DataTypes.TINYINT,
        allowNull: false, defaultValue: 1
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
    modelName: "PartnerDoc",
    tableName: "tbl_partner_doc",
    timestamps: true
});
PartnerDoc.belongsTo(partner_1.default, { foreignKey: "partner_id", as: "partner", constraints: false });
PartnerDoc.hasMany(PartnerDocLine, { foreignKey: "doc_id", as: "lines", constraints: false });
PartnerDocLine.belongsTo(chartAccount_1.default, { foreignKey: "account_id", as: "account", constraints: false });
(0, autoSync_1.autoSync)(PartnerDoc);
(0, autoSync_1.autoSync)(PartnerDocLine);
exports.default = PartnerDoc;
