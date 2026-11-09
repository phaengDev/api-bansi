"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmployeeSkill = exports.Skill = exports.SkillType = void 0;
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
const employee_1 = __importDefault(require("./employee"));
/**
 * ທັກສະ — ໝວດ (ພາສາ, ຄອມພິວເຕີ…) ມີລະດັບຂອງໝວດເອງ (levels: ["A1","A2",…] ຫຼື ["ພື້ນຖານ",…]),
 * ທັກສະໃນໝວດ (ອັງກິດ, Excel…), ແລະ ທັກສະຂອງພະນັກງານ (ທັກສະ + ລະດັບ). HR ເພີ່ມໝວດ/ທັກສະເອງໄດ້
 */
class SkillType extends sequelize_1.Model {
}
exports.SkillType = SkillType;
SkillType.init({
    _uuid: { type: sequelize_1.DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: sequelize_1.DataTypes.STRING(100), allowNull: false },
    levels: { type: sequelize_1.DataTypes.TEXT, allowNull: false },
    sort: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    status: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    createdAt: { type: sequelize_1.DataTypes.DATE, defaultValue: sequelize_1.DataTypes.NOW },
    updatedAt: { type: sequelize_1.DataTypes.DATE, defaultValue: sequelize_1.DataTypes.NOW },
}, { sequelize: database_1.default, modelName: "SkillType", tableName: "tbl_skill_type", timestamps: true });
class Skill extends sequelize_1.Model {
}
exports.Skill = Skill;
Skill.init({
    _uuid: { type: sequelize_1.DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    type_id: { type: sequelize_1.DataTypes.INTEGER, allowNull: false },
    name: { type: sequelize_1.DataTypes.STRING(100), allowNull: false },
    sort: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    status: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    createdAt: { type: sequelize_1.DataTypes.DATE, defaultValue: sequelize_1.DataTypes.NOW },
    updatedAt: { type: sequelize_1.DataTypes.DATE, defaultValue: sequelize_1.DataTypes.NOW },
}, { sequelize: database_1.default, modelName: "Skill", tableName: "tbl_skill", timestamps: true });
class EmployeeSkill extends sequelize_1.Model {
}
exports.EmployeeSkill = EmployeeSkill;
EmployeeSkill.init({
    _uuid: { type: sequelize_1.DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    employee_id: { type: sequelize_1.DataTypes.INTEGER, allowNull: false },
    skill_id: { type: sequelize_1.DataTypes.INTEGER, allowNull: false },
    level: sequelize_1.DataTypes.STRING(50),
    createdAt: { type: sequelize_1.DataTypes.DATE, defaultValue: sequelize_1.DataTypes.NOW },
    updatedAt: { type: sequelize_1.DataTypes.DATE, defaultValue: sequelize_1.DataTypes.NOW },
}, { sequelize: database_1.default, modelName: "EmployeeSkill", tableName: "tbl_employee_skill", timestamps: true });
SkillType.hasMany(Skill, { foreignKey: "type_id", as: "skills" });
Skill.belongsTo(SkillType, { foreignKey: "type_id", as: "type" });
EmployeeSkill.belongsTo(Skill, { foreignKey: "skill_id", as: "skill" });
employee_1.default.hasMany(EmployeeSkill, { foreignKey: "employee_id", as: "skills" });
(0, autoSync_1.autoSync)(SkillType);
(0, autoSync_1.autoSync)(Skill);
(0, autoSync_1.autoSync)(EmployeeSkill);
