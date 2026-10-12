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
 * ຄຳຮ້ອງແຈ້ງລືມສະແກນ / ຂໍແກ້ເວລາເຂົ້າ-ອອກວຽກ — ພະນັກງານສົ່ງຜ່ານ app ມືຖື, HR ອະນຸມັດ/ປະຕິເສດ ຢູ່ໜ້າເວັບ.
 * check_in / check_out = ເວລາ "HH:mm" ທີ່ຂໍ (ຢ່າງໜ້ອຍ 1 ອັນ; ບໍ່ສົ່ງ = ໃຊ້ເວລາທີ່ສະແກນໄວ້ແລ້ວ).
 * status: 1 ລໍຖ້າ, 2 ອະນຸມັດ (ບັນທຶກລົງ tbl_attendance ແລ້ວ), 3 ປະຕິເສດ, 4 ພະນັກງານຍົກເລີກ.
 * ເດືອນທີ່ຈ່າຍເງິນເດືອນແລ້ວ ຂໍ/ອະນຸມັດບໍ່ໄດ້ (ຄືກັບການແກ້ການເຂົ້າວຽກ)
 */
class AttendanceRequest extends sequelize_1.Model {
}
AttendanceRequest.init({
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
    check_in: sequelize_1.DataTypes.STRING(5),
    check_out: sequelize_1.DataTypes.STRING(5),
    reason: {
        type: sequelize_1.DataTypes.STRING(255),
        allowNull: false
    },
    status: {
        type: sequelize_1.DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 1
    },
    review_note: sequelize_1.DataTypes.STRING(255),
    reviewedbyid: sequelize_1.DataTypes.INTEGER,
    reviewedAt: sequelize_1.DataTypes.DATE,
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
    modelName: "AttendanceRequest",
    tableName: "tbl_attendance_request",
    timestamps: true
});
AttendanceRequest.belongsTo(employee_1.default, { foreignKey: "employee_id", as: "employee", constraints: false });
(0, autoSync_1.autoSync)(AttendanceRequest);
exports.default = AttendanceRequest;
