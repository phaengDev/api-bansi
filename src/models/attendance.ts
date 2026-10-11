import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";
import Employee from "./employee";

/**
 * ການເຂົ້າ-ອອກວຽກ — 1 ແຖວ ຕໍ່ ພະນັກງານ ຕໍ່ ວັນ (UNIQUE employee_id + work_date).
 * check_in / check_out ເປັນເວລາຈິງ (DATETIME), ພິກັດ + ໄລຍະຫ່າງຈາກບໍລິສັດ (ແມັດ) ເກັບໄວ້ກວດຄືນ.
 * late_minutes / early_minutes ຄິດຕອນບັນທຶກ ຈາກເວລາເຂົ້າ-ອອກວຽກຂອງບໍລິສັດໃນຕອນນັ້ນ (ປ່ຽນເວລາພາຍຫຼັງ ປະຫວັດບໍ່ປ່ຽນ).
 * status: 1 ມາວຽກ, 2 ລາພັກ (ໄດ້ເງິນເດືອນ), 3 ລາພັກບໍ່ໄດ້ເງິນເດືອນ; source: 1 ສະແກນ (app), 2 HR ບັນທຶກ/ແກ້ໄຂ
 */
class Attendance extends Model {
  public _uuid!: number;
  public employee_id!: number;
  public work_date!: string;
  public check_in!: Date | null;
  public check_out!: Date | null;
  public in_latitude!: string | null;
  public in_longitude!: string | null;
  public in_distance!: number | null;
  public in_accuracy!: number | null;
  public out_latitude!: string | null;
  public out_longitude!: string | null;
  public out_distance!: number | null;
  public out_accuracy!: number | null;
  public late_minutes!: number;
  public early_minutes!: number;
  public status!: number;
  public source!: number;
  public note!: string | null;
  public updatedbyid!: number | null;
  public createdAt!: Date;
  public updatedAt!: Date;
}

Attendance.init(
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
    check_in: DataTypes.DATE,
    check_out: DataTypes.DATE,
    in_latitude: DataTypes.DECIMAL(10, 7),
    in_longitude: DataTypes.DECIMAL(10, 7),
    in_distance: DataTypes.INTEGER,
    in_accuracy: DataTypes.INTEGER,
    out_latitude: DataTypes.DECIMAL(10, 7),
    out_longitude: DataTypes.DECIMAL(10, 7),
    out_distance: DataTypes.INTEGER,
    out_accuracy: DataTypes.INTEGER,
    late_minutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    early_minutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    status: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1
    },
    source: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1
    },
    note: DataTypes.STRING(255),
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
    modelName: "Attendance",
    tableName: "tbl_attendance",
    timestamps: true
  }
);

Attendance.belongsTo(Employee, { foreignKey: "employee_id", as: "employee", constraints: false });

autoSync(Attendance);
export default Attendance;
