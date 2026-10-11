"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MainMenu = void 0;
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
// ✅ Define model
class MainMenu extends sequelize_1.Model {
}
exports.MainMenu = MainMenu;
MainMenu.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    name_la: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false,
    },
    name_en: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: true,
    },
    name_cn: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: true,
    },
    icons: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: true,
    },
    path: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: true,
    },
    types: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
    },
    password: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: true,
    },
    status: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
    },
    createdAt: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize_1.DataTypes.NOW,
    },
    updatedAt: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize_1.DataTypes.NOW,
    },
}, {
    sequelize: database_1.default,
    modelName: "MainMenu",
    tableName: "tbl_main_menu",
    timestamps: true,
    // password (bcrypt hash ລະຫັດເຂົ້າເມນູບັນຊີ) ບໍ່ອອກໄປກັບ query ປົກກະຕິ — ລວມທັງ include ຈາກ SubMenu.
    // ໃຊ້ MainMenu.scope("withPassword") ສະເພາະບ່ອນທີ່ກວດລະຫັດ (bansi/menuLockController)
    defaultScope: { attributes: { exclude: ["password"] } },
    scopes: { withPassword: {} },
});
// ✅ Export model
// ສ້າງ/ປັບຕາຕະລາງເອງຕອນເປີດ server (App.ts → runAutoSync)
(0, autoSync_1.autoSync)(MainMenu);
exports.default = MainMenu;
