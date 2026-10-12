import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";

/**
 * ເຄື່ອງທີ່ຮັບແຈ້ງເຕືອນເດັ້ງຂຶ້ນຈໍ (Firebase Cloud Messaging) ຂອງພະນັກງານ — app ສົ່ງ token ມາຫຼັງເຂົ້າລະບົບ
 * (POST /app/device-token), ອອກຈາກລະບົບ = ລຶບ. 1 ພະນັກງານມີໄດ້ຫຼາຍເຄື່ອງ; token ດຽວເປັນຂອງຄົນດຽວ (UNIQUE) —
 * ເຄື່ອງດຽວປ່ຽນຄົນເຂົ້າລະບົບ = ຍ້າຍໄປຄົນໃໝ່. FCM ບອກວ່າ token ໃຊ້ບໍ່ໄດ້ແລ້ວ = ລຶບເອງ (utils/push)
 */
class DeviceToken extends Model {
  public _uuid!: number;
  public employee_id!: number;
  public token!: string;
  public platform!: string | null;
  public createdAt!: Date;
  public updatedAt!: Date;
}

DeviceToken.init(
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
    token: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true
    },
    /** android | ios */
    platform: DataTypes.STRING(10),
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
    modelName: "DeviceToken",
    tableName: "tbl_device_token",
    timestamps: true
  }
);

autoSync(DeviceToken);
export default DeviceToken;
