import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";

/**
 * ປະເພດການລາພັກທີ່ HR ກຳນົດ (ເຊັ່ນ ລາພັກປະຈຳປີ, ລາປ່ວຍ) — ພະນັກງານເລືອກຕອນຂໍລາຜ່ານ app.
 * paid: 1 ໄດ້ເງິນເດືອນ (ອະນຸມັດແລ້ວບັນທຶກ tbl_attendance status 2), 0 ບໍ່ໄດ້ (status 3).
 * max_per_year / max_per_request = ມື້ເຮັດວຽກສູງສຸດຕໍ່ປີ / ຕໍ່ຄັ້ງ, null = ບໍ່ຈຳກັດ —
 * ນັບຄຳຂໍທີ່ລໍຖ້າ + ອະນຸມັດແລ້ວ — ເກີນ = ຍັງຂໍໄດ້ (ແຈ້ງເຕືອນ), HR ຕັດສິນ ໄດ້/ບໍ່ໄດ້ເງິນເດືອນ ຕອນອະນຸມັດ.
 * status: 1 ໃຊ້ງານ, 0 ປິດ (ພະນັກງານເລືອກບໍ່ໄດ້ ແຕ່ຄຳຂໍເກົ່າຍັງອ້າງອີງໄດ້)
 */
class LeaveType extends Model {
  public _uuid!: number;
  public name!: string;
  public paid!: number;
  public max_per_year!: number | null;
  public max_per_request!: number | null;
  public description!: string | null;
  public sort!: number;
  public status!: number;
  public createdbyid!: number | null;
  public updatedbyid!: number | null;
  public createdAt!: Date;
  public updatedAt!: Date;
}

LeaveType.init(
  {
    _uuid: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    paid: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1
    },
    max_per_year: DataTypes.INTEGER,
    max_per_request: DataTypes.INTEGER,
    description: DataTypes.STRING(255),
    sort: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    status: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1
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
    modelName: "LeaveType",
    tableName: "tbl_leave_type",
    timestamps: true
  }
);

autoSync(LeaveType);
export default LeaveType;
