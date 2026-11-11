import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";

/**
 * ສິດວັນລາພັກສະເພາະພະນັກງານ (HR ຕັ້ງໃນເວັບ → ລາຍລະອຽດພະນັກງານ) — ແທນ max_per_year ຂອງປະເພດສຳລັບຄົນນີ້
 * (ເຊັ່ນ ອາຍຸງານຫຼາຍ = ລາພັກປະຈຳປີຫຼາຍກວ່າ). ບໍ່ມີແຖວ = ໃຊ້ຂອງປະເພດ.
 * days = ມື້ເຮັດວຽກຕໍ່ປີເຕັມ (0 = ລາປະເພດນີ້ບໍ່ມີສິດ); ປີທີ່ເລີ່ມວຽກ ໄດ້ຕາມເດືອນທີ່ເຮັດວຽກ (ຄິດໄລ່ໃນ leaveController).
 * ໜຶ່ງຄົນ ໜຶ່ງປະເພດ ໜຶ່ງແຖວ (UNIQUE employee_id + leave_type_id)
 */
class LeaveQuota extends Model {
  public _uuid!: number;
  public employee_id!: number;
  public leave_type_id!: number;
  public days!: number;
  public createdbyid!: number | null;
  public updatedbyid!: number | null;
  public createdAt!: Date;
  public updatedAt!: Date;
}

LeaveQuota.init(
  {
    _uuid: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    employee_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    leave_type_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    days: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    createdbyid: DataTypes.INTEGER,
    updatedbyid: DataTypes.INTEGER,
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
    modelName: "LeaveQuota",
    tableName: "tbl_leave_quota",
    timestamps: true,
    indexes: [{ unique: true, fields: ["employee_id", "leave_type_id"] }],
  }
);

autoSync(LeaveQuota);

export default LeaveQuota;
