import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";

/**
 * ໄຟລ໌ຕິດຕັ້ງແອັບພະນັກງານ (OAC HR) ທີ່ HR ອັບໂຫຼດໃນເວັບ — ແອັບກວດ GET /app/release: build_number ສູງກວ່າຂອງເຄື່ອງ
 * = ຂຶ້ນແຖບ "ມີເວີຊັນໃໝ່" ໃຫ້ກົດອັບເດດເອງ. ໄຟລ໌ຢູ່ uploads/app (ດາວໂຫຼດຜ່ານ /image/app/<file_name>).
 * build_number / version_name ອ່ານຈາກ APK ເອງ (utils/apkInfo) — ບໍ່ໃຫ້ພິມ ກັນໃສ່ຜິດ
 */
class AppRelease extends Model {
  public _uuid!: number;
  public platform!: string;
  public version_name!: string | null;
  public build_number!: number;
  public file_name!: string;
  public file_size!: number;
  public notes!: string | null;
  public createdbyid!: number | null;
  public createdAt!: Date;
  public updatedAt!: Date;
}

AppRelease.init(
  {
    _uuid: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    /** android (iPhone ອັບເດດຜ່ານ TestFlight / App Store) */
    platform: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: "android"
    },
    version_name: DataTypes.STRING(30),
    build_number: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    file_name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    /** byte */
    file_size: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    /** ມີຫຍັງໃໝ່ — ສະແດງໃນແອັບກ່ອນກົດອັບເດດ */
    notes: DataTypes.STRING(1000),
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
    modelName: "AppRelease",
    tableName: "tbl_app_release",
    timestamps: true
  }
);

autoSync(AppRelease);
export default AppRelease;
