import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";

/**
 * ວັນພັກທົ່ວບໍລິສັດ (ນອກຈາກວັນພັກປະຈຳອາທິດ) — ພະນັກງານທຸກຄົນພັກ, UNIQUE holiday_date.
 * kind: 1 ທາງການ (ວັນພັກລັດຖະການທີ່ລັດຖະບານກຳນົດ), 2 ບໍ່ເປັນທາງການ (ບໍລິສັດປະກາດພັກເອງ ເຊັ່ນ ພາພະນັກງານໄປທ່ຽວ, ພັກພິເສດ).
 * ມື້ນີ້ບໍ່ນັບເປັນມື້ເຮັດວຽກ: ບໍ່ສະແກນກໍ່ບໍ່ເປັນຂາດວຽກ ແລະ ບໍ່ນັບໃນວັນເຮັດວຽກຂອງເດືອນ (ເງິນເດືອນ)
 */
class Holiday extends Model {
  public _uuid!: number;
  public holiday_date!: string;
  public name!: string;
  public kind!: number;
  public createdbyid!: number | null;
  public createdAt!: Date;
  public updatedAt!: Date;
}

Holiday.init(
  {
    _uuid: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    holiday_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    name: {
      type: DataTypes.STRING(150),
      allowNull: false
    },
    kind: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1
    },
    createdbyid: DataTypes.INTEGER,
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
    modelName: "Holiday",
    tableName: "tbl_holiday",
    timestamps: true
  }
);

autoSync(Holiday);
export default Holiday;
