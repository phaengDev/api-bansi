import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";
import LeaveRequest from "./leaveRequest";

/**
 * ໃບລາ / ເອກະສານຄັດຕິດຂອງຄຳຂໍລາພັກ (ພະນັກງານແນບໃນ app ຕອນຂໍລາ: ສະແກນ, ຖ່າຍຮູບ, ຮູບ ຫຼື PDF) — ສູງສຸດ 5 ໄຟລ໌ຕໍ່ຄຳຂໍ.
 * ໄຟລ໌ຢູ່ private/leave-files (ບໍ່ມີ URL ສາທາລະນະ): ເຈົ້າຂອງ + ຜູ້ມີສິດອະນຸມັດລາພັກ ເປີດຜ່ານ app, HR ຜ່ານເວັບ.
 * created_by_employee_id = ພະນັກງານທີ່ແນບ
 */
class LeaveFile extends Model {
  public _uuid!: number;
  public leave_id!: number;
  public file_name!: string;
  public original_name!: string;
  public mime_type!: string | null;
  public file_size!: number;
  public created_by_employee_id!: number | null;
  public createdAt!: Date;
  public updatedAt!: Date;
}

LeaveFile.init(
  {
    _uuid: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    leave_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    file_name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    original_name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    mime_type: DataTypes.STRING(100),
    file_size: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    created_by_employee_id: DataTypes.INTEGER,
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
    modelName: "LeaveFile",
    tableName: "tbl_leave_file",
    timestamps: true,
    indexes: [{ fields: ["leave_id"] }],
  }
);

LeaveRequest.hasMany(LeaveFile, { foreignKey: "leave_id", as: "files", constraints: false });
LeaveFile.belongsTo(LeaveRequest, { foreignKey: "leave_id", as: "leave", constraints: false });

autoSync(LeaveFile);

export default LeaveFile;
