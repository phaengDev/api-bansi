"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
/**
 * ລາຍການຍ່ອຍຂອງລາຍຈ່າຍ (ສ່ວນລາຍລະອຽດ) — ຫຼາຍແຖວຕໍ່ 1 ໃບຈ່າຍ (expense_id → tbl_expenses._uuid).
 * amount = quantity × unit_price − discount (backend ຄິດເອງ ບໍ່ເຊື່ອຄ່າຈາກໜ້າເວັບ).
 * quantity ເປັນທົດສະນິຍົມໄດ້ (ເຊັ່ນ 1.5 ກິໂລ)
 */
class ExpenseItems extends sequelize_1.Model {
}
ExpenseItems.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    expense_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
    },
    line_no: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
    },
    item_name: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false,
    },
    quantity: {
        type: sequelize_1.DataTypes.DECIMAL(12, 3),
        allowNull: false,
    },
    unit: sequelize_1.DataTypes.STRING(50),
    unit_price: {
        type: sequelize_1.DataTypes.DECIMAL(16, 2),
        allowNull: false,
    },
    discount: {
        type: sequelize_1.DataTypes.DECIMAL(16, 2),
        allowNull: false,
        defaultValue: 0,
    },
    amount: {
        type: sequelize_1.DataTypes.DECIMAL(16, 2),
        allowNull: false,
    },
    createdAt: {
        type: sequelize_1.DataTypes.DATE,
        defaultValue: sequelize_1.DataTypes.NOW,
    },
    updatedAt: {
        type: sequelize_1.DataTypes.DATE,
        defaultValue: sequelize_1.DataTypes.NOW,
    },
}, {
    sequelize: database_1.default,
    modelName: "ExpenseItems",
    tableName: "tbl_expense_items",
    timestamps: true,
});
(0, autoSync_1.autoSync)(ExpenseItems);
exports.default = ExpenseItems;
