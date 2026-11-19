import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";
import Employee from "./employee";
import LeaveType from "./leaveType";

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
class LeaveRequest extends Model {
  public _uuid!: number;
  public employee_id!: number;
  public leave_type_id!: number | null;
  public leave_type!: number;
  public start_date!: string;
  public end_date!: string;
  public days!: number;
  public reason!: string;
  public status!: number;
  public review_note!: string | null;
  public reviewedbyid!: number | null;
  public reviewedAt!: Date | null;
  public lead_id!: number | null;
  public lead_status!: number | null;
  public lead_note!: string | null;
  public lead_at!: Date | null;
  public createdAt!: Date;
  public updatedAt!: Date;
}

LeaveRequest.init(
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
    leave_type_id: DataTypes.INTEGER,
    leave_type: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 2
    },
    start_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    end_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    days: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
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
    lead_id: DataTypes.INTEGER,
    lead_status: DataTypes.TINYINT,
    lead_note: DataTypes.STRING(255),
    lead_at: DataTypes.DATE,
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
    modelName: "LeaveRequest",
    tableName: "tbl_leave_request",
    timestamps: true
  }
);

LeaveRequest.belongsTo(Employee, { foreignKey: "employee_id", as: "employee", constraints: false });
LeaveRequest.belongsTo(LeaveType, { foreignKey: "leave_type_id", as: "type", constraints: false });
LeaveRequest.belongsTo(Employee, { foreignKey: "lead_id", as: "lead", constraints: false });

autoSync(LeaveRequest);
export default LeaveRequest;
