"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
/**
 * ສິດວັນລາພັກສະເພາະພະນັກງານ (HR ຕັ້ງໃນເວັບ → ລາຍລະອຽດພະນັກງານ) — ແທນ max_per_year ຂອງປະເພດສຳລັບຄົນນີ້
 * (ເຊັ່ນ ອາຍຸງານຫຼາຍ = ລາພັກປະຈຳປີຫຼາຍກວ່າ). ບໍ່ມີແຖວ = ໃຊ້ຂອງປະເພດ.
 * days = ມື້ເຮັດວຽກຕໍ່ປີເຕັມ (0 = ລາປະເພດນີ້ບໍ່ມີສິດ); ປີທີ່ເລີ່ມວຽກ ໄດ້ຕາມເດືອນທີ່ເຮັດວຽກ (ຄິດໄລ່ໃນ leaveController).
 * ໜຶ່ງຄົນ ໜຶ່ງປະເພດ ໜຶ່ງແຖວ (UNIQUE employee_id + leave_type_id)
 */
class LeaveQuota extends sequelize_1.Model {
}
LeaveQuota.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    employee_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    leave_type_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    days: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    createdbyid: sequelize_1.DataTypes.INTEGER,
    updatedbyid: sequelize_1.DataTypes.INTEGER,
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
    modelName: "LeaveQuota",
    tableName: "tbl_leave_quota",
    timestamps: true,
    indexes: [{ unique: true, fields: ["employee_id", "leave_type_id"] }],
});
(0, autoSync_1.autoSync)(LeaveQuota);
exports.default = LeaveQuota;
