"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
const department_1 = __importDefault(require("./department"));
/**
 * ຕຳແໜ່ງ — ຂຶ້ນກັບພະແນກ (department_id); ແກ້ພ້ອມກັບພະແນກ (PUT /department/:id { positions }).
 * ຕຳແໜ່ງທີ່ມີພະນັກງານໃຊ້ຢູ່ ລຶບບໍ່ໄດ້ — ປິດ (status 0) ແທນ
 */
class Position extends sequelize_1.Model {
}
Position.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    department_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    position_name: {
        type: sequelize_1.DataTypes.STRING(150),
        allowNull: false
    },
    sort: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
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
    modelName: "Position",
    tableName: "tbl_position",
    timestamps: true
});
Position.belongsTo(department_1.default, { foreignKey: "department_id", as: "department" });
department_1.default.hasMany(Position, { foreignKey: "department_id", as: "positions" });
(0, autoSync_1.autoSync)(Position);
exports.default = Position;
