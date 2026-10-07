import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";

/**
 * ຜັງບັນຊີ (tbl_chart_account) — ກຸ່ມ 1 ຊັບສິນ, 2 ໜີ້ສິນ, 3 ທຶນ, 4 ລາຍຮັບ, 5 ລາຍຈ່າຍ.
 * is_postable 0 = ບັນຊີຫົວ (ລວມຍອດລູກ, ລົງລາຍການບໍ່ໄດ້). normal_side 1 ໜີ້ (Dr), 2 ມີ (Cr).
 * ຕາຕະລາງສ້າງດ້ວຍ autoSync; index + ຜັງບັນຊີເລີ່ມຕົ້ນ ໃສ່ໃຫ້ຕອນເປີດ server (controllers/bansi/glSeed.ts)
 */
class ChartAccount extends Model {
  public _uuid!: number;
  public account_code!: string;
  public name_la!: string;
  public name_en!: string | null;
  public name_cn!: string | null;
  public parent_id!: number | null;
  public account_group!: number;
  public account_type!: string;
  public normal_side!: number;
  public is_postable!: number;
  public currency_id!: number | null;
  public is_system!: number;
  public description!: string | null;
  public status!: number;
  public createdAt!: Date;
  public updatedAt!: Date;
}

ChartAccount.init(
  {
    _uuid: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    account_code: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true
    },
    name_la: {
      type: DataTypes.STRING(200),
      allowNull: false
    },
    name_en: {
      type: DataTypes.STRING(200),
      allowNull: true
    },
    name_cn: {
      type: DataTypes.STRING(200),
      allowNull: true
    },
    parent_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    account_group: {
      type: DataTypes.TINYINT,
      allowNull: false
    },
    account_type: {
      type: DataTypes.STRING(30),
      allowNull: false
    },
    normal_side: {
      type: DataTypes.TINYINT,
      allowNull: false
    },
    is_postable: {
      type: DataTypes.TINYINT,
      allowNull: false, defaultValue: 1
    },
    currency_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    is_system: {
      type: DataTypes.TINYINT,
      allowNull: false, defaultValue: 0
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    status: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
  },
  {
    sequelize,
    modelName: "ChartAccount",
    tableName: "tbl_chart_account",
    timestamps: true,
  }
);

autoSync(ChartAccount);
export default ChartAccount;
