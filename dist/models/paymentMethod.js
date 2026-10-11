"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
const treasuryAcount_1 = __importDefault(require("./treasuryAcount"));
/**
 * ວິທີຊຳລະເງິນ — method_type: 1 ເງິນສົດ, 2 ໂອນຜ່ານທະນາຄານ, 3 QR / ກະເປົາເງິນ, 4 ເຊັກ, 5 ບັດ.
 * account_id = ບັນຊີເງິນຄັງທີ່ເງິນເຂົ້າ/ອອກໂດຍຄ່າເລີ່ມຕົ້ນ; require_ref = ຕ້ອງປ້ອນເລກອ້າງອີງ (ເລກໂອນ, ເລກເຊັກ)
 */
class PaymentMethod extends sequelize_1.Model {
}
PaymentMethod.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true
    },
    method_code: {
        type: sequelize_1.DataTypes.STRING(20),
        allowNull: false
    },
    name: {
        type: sequelize_1.DataTypes.STRING(150),
        allowNull: false
    },
    method_type: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
    },
    account_id: sequelize_1.DataTypes.INTEGER,
    require_ref: {
        type: sequelize_1.DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 0
    },
    fee_percent: {
        type: sequelize_1.DataTypes.DECIMAL(6, 3),
        allowNull: false,
        defaultValue: 0
    },
    sort: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
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
    modelName: "PaymentMethod",
    tableName: "tbl_payment_method",
    timestamps: true
});
PaymentMethod.belongsTo(treasuryAcount_1.default, { foreignKey: "account_id", as: "account" });
(0, autoSync_1.autoSync)(PaymentMethod);
exports.default = PaymentMethod;
