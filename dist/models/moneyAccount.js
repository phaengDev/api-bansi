"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
/**
 * ບັນຊີເງິນສ່ວນຕົວຂອງພະນັກງານ (app) — ພະນັກງານສ້າງເອງ (ບໍ່ກ່ຽວກັບຂໍ້ມູນ HR): ເງິນສົດ, ທະນາຄານ (tbl_bank), e-wallet.
 * 1 ບັນຊີ = 1 ສະກຸນເງິນ (ປ່ຽນບໍ່ໄດ້). opening_balance = ຍອດເງິນຕອນສ້າງ (ແກ້ໄຂບໍ່ໄດ້) — ຍອດປັດຈຸບັນ = opening +
 * ລາຍຮັບ − ລາຍຈ່າຍ − ໂອນອອກ + ໂອນເຂົ້າ (tbl_money_entry). ລຶບ = status 0 (ລາຍການເກົ່າຍັງຢູ່)
 */
class MoneyAccount extends sequelize_1.Model {
}
MoneyAccount.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    employee_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    name: {
        type: sequelize_1.DataTypes.STRING(60),
        allowNull: false
    },
    /** cash ເງິນສົດ, bank ທະນາຄານ, wallet e-wallet */
    kind: {
        type: sequelize_1.DataTypes.STRING(10),
        allowNull: false,
        defaultValue: "cash"
    },
    /** tbl_bank (ໂລໂກ້ທະນາຄານ) — ເງິນສົດ = null */
    bank_id: sequelize_1.DataTypes.INTEGER,
    /** ເລກບັນຊີ (ບໍ່ບັງຄັບ, ໃຫ້ເຈົ້າຂອງຈຳໄດ້) */
    account_no: sequelize_1.DataTypes.STRING(30),
    currency: {
        type: sequelize_1.DataTypes.STRING(3),
        allowNull: false,
        defaultValue: "LAK"
    },
    opening_balance: {
        type: sequelize_1.DataTypes.DECIMAL(16, 2),
        allowNull: false,
        defaultValue: 0
    },
    sort: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    /** 1 ໃຊ້ງານ, 0 ລຶບແລ້ວ */
    status: {
        type: sequelize_1.DataTypes.TINYINT,
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
    modelName: "MoneyAccount",
    tableName: "tbl_money_account",
    timestamps: true,
    indexes: [{ fields: ["employee_id", "status"] }],
});
(0, autoSync_1.autoSync)(MoneyAccount);
exports.default = MoneyAccount;
