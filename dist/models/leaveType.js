"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
/**
 * ປະເພດການລາພັກທີ່ HR ກຳນົດ (ເຊັ່ນ ລາພັກປະຈຳປີ, ລາປ່ວຍ) — ພະນັກງານເລືອກຕອນຂໍລາຜ່ານ app.
 * paid: 1 ໄດ້ເງິນເດືອນ (ອະນຸມັດແລ້ວບັນທຶກ tbl_attendance status 2), 0 ບໍ່ໄດ້ (status 3).
 * max_per_year / max_per_request = ມື້ເຮັດວຽກສູງສຸດຕໍ່ປີ / ຕໍ່ຄັ້ງ, null = ບໍ່ຈຳກັດ —
 * ນັບຄຳຂໍທີ່ລໍຖ້າ + ອະນຸມັດແລ້ວ, ກວດຕອນພະນັກງານຂໍ ແລະ ຕອນ HR ອະນຸມັດ.
 * status: 1 ໃຊ້ງານ, 0 ປິດ (ພະນັກງານເລືອກບໍ່ໄດ້ ແຕ່ຄຳຂໍເກົ່າຍັງອ້າງອີງໄດ້)
 */
class LeaveType extends sequelize_1.Model {
}
LeaveType.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: sequelize_1.DataTypes.STRING(100),
        allowNull: false
    },
    paid: {
        type: sequelize_1.DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 1
    },
    max_per_year: sequelize_1.DataTypes.INTEGER,
    max_per_request: sequelize_1.DataTypes.INTEGER,
    description: sequelize_1.DataTypes.STRING(255),
    sort: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    status: {
        type: sequelize_1.DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 1
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
    modelName: "LeaveType",
    tableName: "tbl_leave_type",
    timestamps: true
});
(0, autoSync_1.autoSync)(LeaveType);
exports.default = LeaveType;
