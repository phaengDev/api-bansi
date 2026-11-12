"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
const leaveRequest_1 = __importDefault(require("./leaveRequest"));
/**
 * ໃບລາ / ເອກະສານຄັດຕິດຂອງຄຳຂໍລາພັກ (ພະນັກງານແນບໃນ app ຕອນຂໍລາ: ສະແກນ, ຖ່າຍຮູບ, ຮູບ ຫຼື PDF) — ສູງສຸດ 5 ໄຟລ໌ຕໍ່ຄຳຂໍ.
 * ໄຟລ໌ຢູ່ private/leave-files (ບໍ່ມີ URL ສາທາລະນະ): ເຈົ້າຂອງ + ຜູ້ມີສິດອະນຸມັດລາພັກ ເປີດຜ່ານ app, HR ຜ່ານເວັບ.
 * created_by_employee_id = ພະນັກງານທີ່ແນບ
 */
class LeaveFile extends sequelize_1.Model {
}
LeaveFile.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    leave_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    file_name: {
        type: sequelize_1.DataTypes.STRING(255),
        allowNull: false
    },
    original_name: {
        type: sequelize_1.DataTypes.STRING(255),
        allowNull: false
    },
    mime_type: sequelize_1.DataTypes.STRING(100),
    file_size: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    created_by_employee_id: sequelize_1.DataTypes.INTEGER,
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
    modelName: "LeaveFile",
    tableName: "tbl_leave_file",
    timestamps: true,
    indexes: [{ fields: ["leave_id"] }],
});
leaveRequest_1.default.hasMany(LeaveFile, { foreignKey: "leave_id", as: "files", constraints: false });
LeaveFile.belongsTo(leaveRequest_1.default, { foreignKey: "leave_id", as: "leave", constraints: false });
(0, autoSync_1.autoSync)(LeaveFile);
exports.default = LeaveFile;
