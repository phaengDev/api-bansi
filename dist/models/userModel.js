"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
const typeUserModel_1 = __importDefault(require("./typeUserModel"));
const employee_1 = __importDefault(require("./employee"));
class Users extends sequelize_1.Model {
}
Users.init({
    user_uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    type_user: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
    },
    user_name: {
        type: sequelize_1.DataTypes.STRING(100), // ຈຳກັດ 100 chars
        allowNull: true,
    },
    phones: {
        type: sequelize_1.DataTypes.STRING(20), // ຈຳກັດ 20 chars
        allowNull: true,
        unique: true,
    },
    password: {
        type: sequelize_1.DataTypes.STRING, // hash password ໄດ້
        allowNull: true,
    },
    employee_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: true,
    },
    status: {
        type: sequelize_1.DataTypes.INTEGER, // ໃຊ້ສະເພາະຕົວເລກ ENUM (0=inactive,1=active)
        allowNull: false,
        defaultValue: 1,
    },
    deletes: {
        type: sequelize_1.DataTypes.INTEGER, // ໃຊ້ສະເພາະຕົວເລກ ENUM (0=inactive,1=active)
        allowNull: false,
        defaultValue: 1,
    },
    updates: {
        type: sequelize_1.DataTypes.INTEGER, // ໃຊ້ສະເພາະຕົວເລກ ENUM (0=inactive,1=active)
        allowNull: false,
        defaultValue: 1,
    },
    creates: {
        type: sequelize_1.DataTypes.INTEGER, // ໃຊ້ສະເພາະຕົວເລກ ENUM (0=inactive,1=active)
        allowNull: false,
        defaultValue: 1,
    }
}, {
    sequelize: database_1.default,
    modelName: "Users",
    tableName: "tbl_users",
    timestamps: true, // Sequelize จะสร้าง createdAt / updatedAt
    // underscored: true,  // แปลงเป็น createdAt / updatedAt
});
Users.belongsTo(typeUserModel_1.default, {
    foreignKey: "type_user",
    as: "typeuser", // must match include
});
Users.belongsTo(employee_1.default, { foreignKey: "employee_id", as: "employee", constraints: false });
// ✅ Export model
// ສ້າງ/ປັບຕາຕະລາງເອງຕອນເປີດ server (App.ts → runAutoSync)
(0, autoSync_1.autoSync)(Users);
exports.default = Users;
