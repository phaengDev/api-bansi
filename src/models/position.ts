import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";
import Department from "./department";

/**
 * ຕຳແໜ່ງ — ຂຶ້ນກັບພະແນກ (department_id); ແກ້ພ້ອມກັບພະແນກ (PUT /department/:id { positions }).
 * ຕຳແໜ່ງທີ່ມີພະນັກງານໃຊ້ຢູ່ ລຶບບໍ່ໄດ້ — ປິດ (status 0) ແທນ
 */
class Position extends Model {
  public _uuid!: number;
  public department_id!: number;
  public position_name!: string;
  public sort!: number;
  public status!: number;
  public createdAt!: Date;
  public updatedAt!: Date;
}

Position.init(
  {
    _uuid: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    department_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    position_name: {
      type: DataTypes.STRING(150),
      allowNull: false
    },
    sort: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    status: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
  },
  {
    sequelize,
    modelName: "Position",
    tableName: "tbl_position",
    timestamps: true
  }
);

Position.belongsTo(Department, { foreignKey: "department_id", as: "department" });
Department.hasMany(Position, { foreignKey: "department_id", as: "positions" });

autoSync(Position);
export default Position;
