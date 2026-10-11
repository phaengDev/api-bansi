import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";
import Employee from "./employee";

/**
 * ການເຮັດວຽກລ່ວງເວລາ (OT) — HR ບັນທຶກ: ພະນັກງານ, ວັນທີ, ເວລາ (ຂ້າມທ່ຽງຄືນໄດ້), ຈຳນວນຊົ່ວໂມງ ແລະ ປະເພດ.
 * kind = ອັດຕາຕາມກົດໝາຍແຮງງານ (ຕັ້ງຢູ່ ຕັ້ງຄ່າເງິນເດືອນ): 1 ມື້ເຮັດວຽກ, 2 ມື້ເຮັດວຽກ ກາງຄືນ (22:00–05:00),
 * 3 ວັນພັກ (ວັນພັກປະຈຳອາທິດ / ວັນພັກ), 4 ວັນພັກ ກາງຄືນ.
 * pay_type = ວິທີຈ່າຍ: 1 ຕາມອັດຕາ (ຄ່າແຮງຕໍ່ຊົ່ວໂມງຈາກເງິນເດືອນ × % ຂອງ kind), 2 ຕໍ່ຊົ່ວໂມງ (amount × hours),
 * 3 ເໝົາຈ່າຍ (amount ເທື່ອດຽວ ບໍ່ກ່ຽວກັບຊົ່ວໂມງ).
 * ເງິນເດືອນຂອງເດືອນນັ້ນລວມ OT ໃຫ້ອັດຕະໂນມັດ (ໃບຮ່າງ ກົດຄິດໄລ່ໃໝ່); ເດືອນທີ່ຈ່າຍເງິນເດືອນແລ້ວ ແກ້ບໍ່ໄດ້
 */
class Overtime extends Model {
  public _uuid!: number;
  public employee_id!: number;
  public work_date!: string;
  public start_time!: string | null;
  public end_time!: string | null;
  public hours!: string;
  public kind!: number;
  public pay_type!: number;
  public amount!: string;
  public note!: string | null;
  public createdbyid!: number | null;
  public updatedbyid!: number | null;
  public createdAt!: Date;
  public updatedAt!: Date;
}

Overtime.init(
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
    start_time: DataTypes.STRING(5),
    end_time: DataTypes.STRING(5),
    hours: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0
    },
    kind: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1
    },
    pay_type: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1
    },
    amount: {
      type: DataTypes.DECIMAL(16, 2),
      allowNull: false,
      defaultValue: 0
    },
    note: DataTypes.STRING(255),
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
    modelName: "Overtime",
    tableName: "tbl_overtime",
    timestamps: true
  }
);

Overtime.belongsTo(Employee, { foreignKey: "employee_id", as: "employee", constraints: false });

autoSync(Overtime);
export default Overtime;
