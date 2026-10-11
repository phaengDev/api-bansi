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
 * ການເຂົ້າ-ອອກວຽກ — 1 ແຖວ ຕໍ່ ພະນັກງານ ຕໍ່ ວັນ (UNIQUE employee_id + work_date).
 * check_in / check_out ເປັນເວລາຈິງ (DATETIME), ພິກັດ + ໄລຍະຫ່າງຈາກບໍລິສັດ (ແມັດ) ເກັບໄວ້ກວດຄືນ.
 * late_minutes / early_minutes ຄິດຕອນບັນທຶກ ຈາກເວລາເຂົ້າ-ອອກວຽກຂອງບໍລິສັດໃນຕອນນັ້ນ (ປ່ຽນເວລາພາຍຫຼັງ ປະຫວັດບໍ່ປ່ຽນ).
 * status: 1 ມາວຽກ, 2 ລາພັກ (ໄດ້ເງິນເດືອນ), 3 ລາພັກບໍ່ໄດ້ເງິນເດືອນ; source: 1 ສະແກນ (app), 2 HR ບັນທຶກ/ແກ້ໄຂ
 */
class Attendance extends sequelize_1.Model {
}
Attendance.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    employee_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    work_date: {
        type: sequelize_1.DataTypes.DATEONLY,
        allowNull: false
    },
    check_in: sequelize_1.DataTypes.DATE,
    check_out: sequelize_1.DataTypes.DATE,
    in_latitude: sequelize_1.DataTypes.DECIMAL(10, 7),
    in_longitude: sequelize_1.DataTypes.DECIMAL(10, 7),
    in_distance: sequelize_1.DataTypes.INTEGER,
    in_accuracy: sequelize_1.DataTypes.INTEGER,
    out_latitude: sequelize_1.DataTypes.DECIMAL(10, 7),
    out_longitude: sequelize_1.DataTypes.DECIMAL(10, 7),
    out_distance: sequelize_1.DataTypes.INTEGER,
    out_accuracy: sequelize_1.DataTypes.INTEGER,
    late_minutes: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    early_minutes: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    status: {
        type: sequelize_1.DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 1
    },
    source: {
        type: sequelize_1.DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 1
    },
    note: sequelize_1.DataTypes.STRING(255),
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
    modelName: "Attendance",
    tableName: "tbl_attendance",
    timestamps: true
});
Attendance.belongsTo(employee_1.default, { foreignKey: "employee_id", as: "employee", constraints: false });
(0, autoSync_1.autoSync)(Attendance);
exports.default = Attendance;
