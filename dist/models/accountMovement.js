"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
const treasuryAcount_1 = __importDefault(require("./treasuryAcount"));
const userModel_1 = __importDefault(require("./userModel"));
/**
 * ປະຫວັດການເຄື່ອນໄຫວຂອງບັນຊີເງິນຄັງ — ທຸກຄັ້ງທີ່ຍອດປ່ຽນ ມີແຖວໜຶ່ງ: ຍອດກ່ອນ, ເຂົ້າ/ອອກ ເທົ່າໃດ, ຍອດຫຼັງ.
 * ຂຽນຜ່ານ moveBalance() (controllers/bansi/accountMovement.ts) ເທົ່ານັ້ນ — ບ່ອນດຽວທີ່ປ່ຽນຍອດບັນຊີ.
 * direction: 1 = ເງິນເຂົ້າ, 2 = ເງິນອອກ. balance_kind: 1 = ຍອດໃຊ້ໄດ້ (balance_treasury), 2 = ຍອດຄ້າງ (balance_unable).
 * source_type ບອກທີ່ມາ (OPENING, INCOME, INCOME_CANCEL, TRANSFER_IN, TRANSFER_OUT, …) + source_id ຂອງເອກະສານນັ້ນ
 */
class AccountMovement extends sequelize_1.Model {
}
AccountMovement.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    account_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    movement_date: {
        type: sequelize_1.DataTypes.DATEONLY,
        allowNull: false
    },
    direction: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    balance_kind: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
    },
    amount: {
        type: sequelize_1.DataTypes.DECIMAL(16, 2),
        allowNull: false
    },
    balance_before: {
        type: sequelize_1.DataTypes.DECIMAL(16, 2),
        allowNull: false
    },
    balance_after: {
        type: sequelize_1.DataTypes.DECIMAL(16, 2),
        allowNull: false
    },
    currency_id: sequelize_1.DataTypes.INTEGER,
    source_type: {
        type: sequelize_1.DataTypes.STRING(30),
        allowNull: false
    },
    source_id: sequelize_1.DataTypes.STRING(50),
    doc_number: sequelize_1.DataTypes.STRING(50),
    counterpart_account_id: sequelize_1.DataTypes.INTEGER,
    description: sequelize_1.DataTypes.STRING(255),
    created_by: sequelize_1.DataTypes.INTEGER,
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
    modelName: "AccountMovement",
    tableName: "tbl_account_movement",
    timestamps: true
});
AccountMovement.belongsTo(treasuryAcount_1.default, { foreignKey: "account_id", as: "account" });
AccountMovement.belongsTo(treasuryAcount_1.default, { foreignKey: "counterpart_account_id", as: "counterpart" });
AccountMovement.belongsTo(userModel_1.default, { foreignKey: "created_by", as: "user" });
(0, autoSync_1.autoSync)(AccountMovement);
exports.default = AccountMovement;
