"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
/**
 * ໝວດໝູ່ລາຍຮັບ-ລາຍຈ່າຍສ່ວນຕົວຂອງພະນັກງານ (app) — ແຕ່ລະຄົນມີຊຸດຂອງຕົນເອງ (ສ້າງຊຸດເລີ່ມຕົ້ນໃຫ້ຕອນເປີດເທື່ອທຳອິດ),
 * ເພີ່ມ / ແກ້ໄຂ / ລຶບໄດ້. ລຶບ = status 0 (ລາຍການເກົ່າຍັງສະແດງຊື່ໝວດຢູ່). code "salary" = ໝວດເງິນເດືອນທີ່ລະບົບໃຊ້
 * ຕອນ HR ຈ່າຍເງິນເດືອນ (ລຶບບໍ່ໄດ້, ປ່ຽນຊື່ / ໄອຄອນໄດ້)
 */
class MoneyCategory extends sequelize_1.Model {
}
MoneyCategory.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    employee_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    /** income ລາຍຮັບ, expense ລາຍຈ່າຍ */
    kind: {
        type: sequelize_1.DataTypes.STRING(10),
        allowNull: false
    },
    name: {
        type: sequelize_1.DataTypes.STRING(60),
        allowNull: false
    },
    /** ຊື່ໄອຄອນໃນແອັບ (lib/screens/money_screen.dart — moneyIcons) */
    icon: {
        type: sequelize_1.DataTypes.STRING(30),
        allowNull: false,
        defaultValue: "other"
    },
    /** #RRGGBB */
    color: {
        type: sequelize_1.DataTypes.STRING(7),
        allowNull: false,
        defaultValue: "#64748B"
    },
    code: sequelize_1.DataTypes.STRING(20),
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
    modelName: "MoneyCategory",
    tableName: "tbl_money_category",
    timestamps: true,
    indexes: [{ fields: ["employee_id", "status"] }],
});
(0, autoSync_1.autoSync)(MoneyCategory);
exports.default = MoneyCategory;
