"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PartnerAllocation = void 0;
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
const partner_1 = __importDefault(require("./partner"));
const partnerDoc_1 = __importDefault(require("./partnerDoc"));
const treasuryAcount_1 = __importDefault(require("./treasuryAcount"));
/**
 * ຮັບຊຳລະ (pay_kind 1) / ຈ່າຍຊຳລະ (pay_kind 2) + ການຕັດໜີ້ (tbl_partner_allocation).
 * ຕາຕະລາງສ້າງດ້ວຍ autoSync (index ໃສ່ໃຫ້ຕອນເປີດ server — controllers/bansi/glSeed.ts)
 */
class PartnerAllocation extends sequelize_1.Model {
}
exports.PartnerAllocation = PartnerAllocation;
PartnerAllocation.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    payment_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    doc_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
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
}, {
    sequelize: database_1.default,
    modelName: "PartnerAllocation",
    tableName: "tbl_partner_allocation",
    timestamps: true
});
class PartnerPayment extends sequelize_1.Model {
}
PartnerPayment.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    pay_kind: {
        type: sequelize_1.DataTypes.TINYINT,
        allowNull: false
    },
    pay_number: {
        type: sequelize_1.DataTypes.STRING(50),
        allowNull: false,
        unique: true
    },
    partner_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    pay_date: {
        type: sequelize_1.DataTypes.DATEONLY,
        allowNull: false
    },
    treasury_account_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    currency_id: sequelize_1.DataTypes.INTEGER,
    exchange_rate: {
        type: sequelize_1.DataTypes.DECIMAL(16, 4),
        allowNull: false,
        defaultValue: 1
    },
    amount: {
        type: sequelize_1.DataTypes.DECIMAL(18, 2),
        allowNull: false
    },
    reference: sequelize_1.DataTypes.STRING(100),
    description: sequelize_1.DataTypes.STRING(500),
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
}, { sequelize: database_1.default, modelName: "PartnerPayment", tableName: "tbl_partner_payment", timestamps: true });
PartnerPayment.belongsTo(partner_1.default, {
    foreignKey: "partner_id", as: "partner",
    constraints: false
});
PartnerPayment.belongsTo(treasuryAcount_1.default, {
    foreignKey: "treasury_account_id", as: "account",
    constraints: false
});
PartnerPayment.hasMany(PartnerAllocation, {
    foreignKey: "payment_id", as: "allocations",
    constraints: false
});
PartnerAllocation.belongsTo(partnerDoc_1.default, {
    foreignKey: "doc_id", as: "doc",
    constraints: false
});
PartnerAllocation.belongsTo(PartnerPayment, {
    foreignKey: "payment_id", as: "payment",
    constraints: false
});
partnerDoc_1.default.hasMany(PartnerAllocation, {
    foreignKey: "doc_id", as: "allocations",
    constraints: false
});
(0, autoSync_1.autoSync)(PartnerPayment);
(0, autoSync_1.autoSync)(PartnerAllocation);
exports.default = PartnerPayment;
