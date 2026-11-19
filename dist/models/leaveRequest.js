"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
const employee_1 = __importDefault(require("./employee"));
const leaveType_1 = __importDefault(require("./leaveType"));
/**
 * ຄຳຂໍລາພັກ — ພະນັກງານສົ່ງຜ່ານ app ມືຖື, HR ອະນຸມັດ/ປະຕິເສດ ຢູ່ໜ້າຕ່າງ ການເຂົ້າ-ອອກວຽກ.
 * leave_type_id = ປະເພດທີ່ HR ກຳນົດ (tbl_leave_type: ຊື່ + ຂີດຈຳກັດມື້); null = ຄຳຂໍເກົ່າກ່ອນມີປະເພດ.
 * leave_type = status ຂອງ tbl_attendance ທີ່ຈະບັນທຶກຕອນອະນຸມັດ: 2 ລາພັກ (ໄດ້ເງິນເດືອນ), 3 ລາພັກບໍ່ໄດ້ເງິນເດືອນ
 * (ຕາມ paid ຂອງປະເພດ).
 * status: 1 ລໍຖ້າ, 2 ອະນຸມັດ (ບັນທຶກລົງ tbl_attendance ທຸກມື້ເຮັດວຽກໃນຊ່ວງແລ້ວ), 3 ປະຕິເສດ, 4 ພະນັກງານຍົກເລີກ.
 * days = ມື້ເຮັດວຽກໃນຊ່ວງ (ຕອນຂໍ) / ມື້ທີ່ບັນທຶກລາພັກແທ້ (ຕອນອະນຸມັດ — ມື້ທີ່ມາວຽກແລ້ວບໍ່ນັບ)
 *
 * ອະນຸມັດ 2 ຂັ້ນ (ລູກທີມ): ຜູ້ຂໍມີຫົວໜ້າສາຍງານ (reports_to_id) ແລະ ບໍ່ມີລູກທີມເອງ = ຫົວໜ້າທີມອະນຸມັດກ່ອນ ແລ້ວຈຶ່ງ HR.
 * lead_id = ຫົວໜ້າທີມ ຕອນຂໍ (null = ບໍ່ມີຂັ້ນຫົວໜ້າ → HR ເລີຍ, ລວມທັງຄຳຂໍເກົ່າກ່ອນມີຂັ້ນນີ້);
 * lead_status: 1 ລໍຫົວໜ້າ (HR ອະນຸມັດ / ປະຕິເສດບໍ່ໄດ້), 2 ຫົວໜ້າອະນຸມັດແລ້ວ (ລໍ HR), 3 ຫົວໜ້າປະຕິເສດ (status = 3 ເລີຍ)
 */
class LeaveRequest extends sequelize_1.Model {
}
LeaveRequest.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    employee_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    leave_type_id: sequelize_1.DataTypes.INTEGER,
    leave_type: {
        type: sequelize_1.DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 2
    },
    start_date: {
        type: sequelize_1.DataTypes.DATEONLY,
        allowNull: false
    },
    end_date: {
        type: sequelize_1.DataTypes.DATEONLY,
        allowNull: false
    },
    days: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
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
    lead_id: sequelize_1.DataTypes.INTEGER,
    lead_status: sequelize_1.DataTypes.TINYINT,
    lead_note: sequelize_1.DataTypes.STRING(255),
    lead_at: sequelize_1.DataTypes.DATE,
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
    modelName: "LeaveRequest",
    tableName: "tbl_leave_request",
    timestamps: true
});
LeaveRequest.belongsTo(employee_1.default, { foreignKey: "employee_id", as: "employee", constraints: false });
LeaveRequest.belongsTo(leaveType_1.default, { foreignKey: "leave_type_id", as: "type", constraints: false });
LeaveRequest.belongsTo(employee_1.default, { foreignKey: "lead_id", as: "lead", constraints: false });
(0, autoSync_1.autoSync)(LeaveRequest);
exports.default = LeaveRequest;
