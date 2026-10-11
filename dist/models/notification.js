"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
/**
 * ແຈ້ງເຕືອນຂອງພະນັກງານ (app ມືຖື — ກະດິ່ງຢູ່ຫົວໜ້າຫຼັກ). 1 ແຖວຕໍ່ພະນັກງານ 1 ຄົນ — ແຈ້ງທຸກຄົນ = ສ້າງໃຫ້ທຸກຄົນ.
 * type: payroll (ໂອນເງິນເດືອນແລ້ວ), birthday (ວັນເກີດເພື່ອນ / ວັນເກີດຕົນເອງ), birthday_wish (ມີຄົນອວຍພອນ),
 * birthday_reply (ມີຄົນຕອບກັບຄຳອວຍພອນ), leave (ຜົນຄຳຂໍລາພັກ), holiday (ວັນພັກໃໝ່), announcement (HR ແຈ້ງການທົ່ວໄປ)
 * ref = ຂໍ້ມູນອ້າງອີງໃຫ້ app ເປີດໜ້າທີ່ກ່ຽວຂ້ອງ / ກັນສ້າງຊ້ຳ (ເຊັ່ນ "birthday:12:2026-10-11")
 * read_at = ເປີດເບິ່ງແລ້ວ (null = ໃໝ່)
 */
class Notification extends sequelize_1.Model {
}
Notification.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    employee_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    type: {
        type: sequelize_1.DataTypes.STRING(30),
        allowNull: false
    },
    title: {
        type: sequelize_1.DataTypes.STRING(150),
        allowNull: false
    },
    body: sequelize_1.DataTypes.STRING(1000),
    ref: sequelize_1.DataTypes.STRING(100),
    read_at: sequelize_1.DataTypes.DATE,
    createdbyid: sequelize_1.DataTypes.INTEGER,
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
    modelName: "Notification",
    tableName: "tbl_notification",
    timestamps: true
});
(0, autoSync_1.autoSync)(Notification);
exports.default = Notification;
