import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";
import Employee from "./employee";

/**
 * ຄຳຮ້ອງແຈ້ງລືມສະແກນ / ຂໍແກ້ເວລາເຂົ້າ-ອອກວຽກ — ພະນັກງານສົ່ງຜ່ານ app ມືຖື, HR ອະນຸມັດ/ປະຕິເສດ ຢູ່ໜ້າເວັບ.
 * check_in / check_out = ເວລາ "HH:mm" ທີ່ຂໍ (ຢ່າງໜ້ອຍ 1 ອັນ; ບໍ່ສົ່ງ = ໃຊ້ເວລາທີ່ສະແກນໄວ້ແລ້ວ).
 * status: 1 ລໍຖ້າ, 2 ອະນຸມັດ (ບັນທຶກລົງ tbl_attendance ແລ້ວ), 3 ປະຕິເສດ, 4 ພະນັກງານຍົກເລີກ.
 * ເດືອນທີ່ຈ່າຍເງິນເດືອນແລ້ວ ຂໍ/ອະນຸມັດບໍ່ໄດ້ (ຄືກັບການແກ້ການເຂົ້າວຽກ)
 */
class AttendanceRequest extends Model {
  public _uuid!: number;
  public employee_id!: number;
  public work_date!: string;
  public check_in!: string | null;
  public check_out!: string | null;
  public reason!: string;
  public status!: number;
  public review_note!: string | null;
  public reviewedbyid!: number | null;
  public reviewedAt!: Date | null;
  public createdAt!: Date;
  public updatedAt!: Date;
}

AttendanceRequest.init(
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
    work_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    check_in: DataTypes.STRING(5),
    check_out: DataTypes.STRING(5),
    reason: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    status: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1
    },
    review_note: DataTypes.STRING(255),
    reviewedbyid: DataTypes.INTEGER,
    reviewedAt: DataTypes.DATE,
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
    modelName: "AttendanceRequest",
    tableName: "tbl_attendance_request",
    timestamps: true
  }
);

AttendanceRequest.belongsTo(Employee, { foreignKey: "employee_id", as: "employee", constraints: false });

autoSync(AttendanceRequest);
export default AttendanceRequest;
