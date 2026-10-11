"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
const employee_1 = __importDefault(require("./employee"));
/**
 * ຄຳອວຍພອນວັນເກີດ — ພະນັກງານສົ່ງໃຫ້ເພື່ອນຮ່ວມງານທີ່ມີວັນເກີດມື້ນີ້ ຜ່ານ app ມືຖື.
 * employee_id = ເຈົ້າຂອງວັນເກີດ, sender_id = ຜູ້ສົ່ງ, wish_date = ວັນເກີດຂອງປີນັ້ນ (ເວລາລາວ);
 * ຄົນດຽວສົ່ງໃຫ້ຄົນດຽວໄດ້ 1 ຂໍ້ຄວາມຕໍ່ວັນເກີດ (ສົ່ງຊ້ຳ = ແກ້ຂໍ້ຄວາມເກົ່າ).
 * read_at = ເຈົ້າຂອງວັນເກີດເປີດເບິ່ງແລ້ວ (null = ໃໝ່ — app ແຈ້ງເຕືອນຢູ່ໜ້າຫຼັກ)
 * reply = ເຈົ້າຂອງວັນເກີດຕອບກັບ (1 ຂໍ້ຄວາມຕໍ່ຄຳອວຍພອນ, ຕອບຊ້ຳ = ແກ້), replied_at = ເວລາຕອບ,
 * reply_read_at = ຜູ້ອວຍພອນເປີດເບິ່ງຄຳຕອບແລ້ວ (null = ໃໝ່ — app ແຈ້ງເຕືອນຜູ້ອວຍພອນ)
 */
class BirthdayWish extends sequelize_1.Model {
}
BirthdayWish.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    employee_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    sender_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    wish_date: {
        type: sequelize_1.DataTypes.DATEONLY,
        allowNull: false
    },
    message: {
        type: sequelize_1.DataTypes.STRING(500),
        allowNull: false
    },
    read_at: sequelize_1.DataTypes.DATE,
    reply: sequelize_1.DataTypes.STRING(500),
    replied_at: sequelize_1.DataTypes.DATE,
    reply_read_at: sequelize_1.DataTypes.DATE,
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
    modelName: "BirthdayWish",
    tableName: "tbl_birthday_wish",
    timestamps: true
});
BirthdayWish.belongsTo(employee_1.default, { foreignKey: "sender_id", as: "sender", constraints: false });
BirthdayWish.belongsTo(employee_1.default, { foreignKey: "employee_id", as: "employee", constraints: false });
(0, autoSync_1.autoSync)(BirthdayWish);
exports.default = BirthdayWish;
