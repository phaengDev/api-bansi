"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
/**
 * ອາກອນ — tax_kind: 1 ອາກອນມູນຄ່າເພີ່ມ (VAT), 2 ອາກອນຫັກ ນ ບ່ອນຈ່າຍ, 3 ອາກອນລາຍໄດ້/ກຳໄລ, 4 ອື່ນໆ.
 * calc_method: 1 ລວມໃນລາຄາແລ້ວ (inclusive), 2 ບວກເພີ່ມຈາກລາຄາ (exclusive).
 * is_default: ອາກອນທີ່ເລືອກໃຫ້ອັດຕະໂນມັດ — ມີໄດ້ອັນດຽວຕໍ່ tax_kind
 */
class Tax extends sequelize_1.Model {
}
Tax.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true
    },
    tax_code: {
        type: sequelize_1.DataTypes.STRING(20),
        allowNull: false
    },
    name: {
        type: sequelize_1.DataTypes.STRING(150),
        allowNull: false
    },
    rate: {
        type: sequelize_1.DataTypes.DECIMAL(7, 3),
        allowNull: false,
        defaultValue: 0
    },
    tax_kind: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
    },
    calc_method: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 2
    },
    is_default: {
        type: sequelize_1.DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 0
    },
    effective_date: sequelize_1.DataTypes.DATEONLY,
    description: sequelize_1.DataTypes.STRING(255),
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
    modelName: "Tax",
    tableName: "tbl_tax",
    timestamps: true
});
(0, autoSync_1.autoSync)(Tax);
exports.default = Tax;
