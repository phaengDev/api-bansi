"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
/**
 * ລາຍການຕັ້ງຄ່າຂອງຂໍ້ມູນພະນັກງານ ທີ່ HR ເພີ່ມ/ແກ້ຊື່ເອງໄດ້ — kind:
 *  employee_type = ປະເພດພະນັກງານ (ປະຈຳ, ຊົ່ວຄາວ, ຝຶກງານ…), education_level = ລະດັບການສຶກສາ (ປະລິນຍາຕີ…).
 * ທີ່ມີພະນັກງານໃຊ້ຢູ່ ລຶບບໍ່ໄດ້ — ປິດ (status 0) ແທນ
 */
class HrOption extends sequelize_1.Model {
}
HrOption.init({
    _uuid: { type: sequelize_1.DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    kind: { type: sequelize_1.DataTypes.STRING(30), allowNull: false },
    name: { type: sequelize_1.DataTypes.STRING(150), allowNull: false },
    sort: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    status: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    createdAt: { type: sequelize_1.DataTypes.DATE, defaultValue: sequelize_1.DataTypes.NOW },
    updatedAt: { type: sequelize_1.DataTypes.DATE, defaultValue: sequelize_1.DataTypes.NOW },
}, { sequelize: database_1.default, modelName: "HrOption", tableName: "tbl_hr_option", timestamps: true });
(0, autoSync_1.autoSync)(HrOption);
exports.default = HrOption;
