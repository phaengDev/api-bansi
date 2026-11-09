import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";
import Employee from "./employee";

/**
 * ທັກສະ — ໝວດ (ພາສາ, ຄອມພິວເຕີ…) ມີລະດັບຂອງໝວດເອງ (levels: ["A1","A2",…] ຫຼື ["ພື້ນຖານ",…]),
 * ທັກສະໃນໝວດ (ອັງກິດ, Excel…), ແລະ ທັກສະຂອງພະນັກງານ (ທັກສະ + ລະດັບ). HR ເພີ່ມໝວດ/ທັກສະເອງໄດ້
 */
export class SkillType extends Model {
  public _uuid!: number;
  public name!: string;
  /** JSON array ຂອງຊື່ລະດັບ ຈາກຕ່ຳຫາສູງ */
  public levels!: string;
  public sort!: number;
  public status!: number;
}

SkillType.init(
  {
    _uuid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    levels: { type: DataTypes.TEXT, allowNull: false },
    sort: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    status: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  { sequelize, modelName: "SkillType", tableName: "tbl_skill_type", timestamps: true }
);

export class Skill extends Model {
  public _uuid!: number;
  public type_id!: number;
  public name!: string;
  public sort!: number;
  public status!: number;
}

Skill.init(
  {
    _uuid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    type_id: { type: DataTypes.INTEGER, allowNull: false },
    name: { type: DataTypes.STRING(100), allowNull: false },
    sort: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    status: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  { sequelize, modelName: "Skill", tableName: "tbl_skill", timestamps: true }
);

export class EmployeeSkill extends Model {
  public _uuid!: number;
  public employee_id!: number;
  public skill_id!: number;
  public level!: string | null;
}

EmployeeSkill.init(
  {
    _uuid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    employee_id: { type: DataTypes.INTEGER, allowNull: false },
    skill_id: { type: DataTypes.INTEGER, allowNull: false },
    level: DataTypes.STRING(50),
    createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  { sequelize, modelName: "EmployeeSkill", tableName: "tbl_employee_skill", timestamps: true }
);

SkillType.hasMany(Skill, { foreignKey: "type_id", as: "skills" });
Skill.belongsTo(SkillType, { foreignKey: "type_id", as: "type" });
EmployeeSkill.belongsTo(Skill, { foreignKey: "skill_id", as: "skill" });
Employee.hasMany(EmployeeSkill, { foreignKey: "employee_id", as: "skills" });

autoSync(SkillType);
autoSync(Skill);
autoSync(EmployeeSkill);
