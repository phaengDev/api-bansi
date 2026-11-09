"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
/**
 * ຕຳແໜ່ງ — ລາຍຊື່ກາງຂອງທັງບໍລິສັດ (ພິມເທື່ອດຽວ ໃຊ້ໄດ້ທຸກພະແນກ), ຊື່ບໍ່ຊ້ຳ.
 * level = Level 1, 2, 3… (1 = ສູງສຸດ, ບໍ່ຈຳກັດຈຳນວນຂັ້ນ; null = ຍັງບໍ່ກຳນົດ) — ໃຊ້ແນະນຳ "ຫົວໜ້າສາຍງານ"
 * ໃນຟອມພະນັກງານ ແລະ ລຽງໂຄງຮ່າງ. ຫົວໜ້າສາຍງານຕົວຈິງຢູ່ tbl_employee.reports_to_id.
 * ຕຳແໜ່ງທີ່ເຄີຍມີພະນັກງານ ລຶບບໍ່ໄດ້ — ປິດ (status 0) ແທນ.
 * (ຖັນ department_id ເກົ່າ ຍັງຢູ່ໃນ DB ໃຫ້ server ທີ່ຍັງບໍ່ທັນ deploy — ບໍ່ໃຊ້ແລ້ວ)
 */
class Position extends sequelize_1.Model {
}
Position.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    position_name: {
        type: sequelize_1.DataTypes.STRING(150),
        allowNull: false
    },
    level: sequelize_1.DataTypes.INTEGER,
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
(0, autoSync_1.autoSync)(Position);
exports.default = Position;
