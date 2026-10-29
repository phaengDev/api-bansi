import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";

/**
 * ໝວດໝູ່ລາຍຮັບ-ລາຍຈ່າຍສ່ວນຕົວຂອງພະນັກງານ (app) — ແຕ່ລະຄົນມີຊຸດຂອງຕົນເອງ (ສ້າງຊຸດເລີ່ມຕົ້ນໃຫ້ຕອນເປີດເທື່ອທຳອິດ),
 * ເພີ່ມ / ແກ້ໄຂ / ລຶບໄດ້. ລຶບ = status 0 (ລາຍການເກົ່າຍັງສະແດງຊື່ໝວດຢູ່). code "salary" = ໝວດເງິນເດືອນທີ່ລະບົບໃຊ້
 * ຕອນ HR ຈ່າຍເງິນເດືອນ (ລຶບບໍ່ໄດ້, ປ່ຽນຊື່ / ໄອຄອນໄດ້)
 */
class MoneyCategory extends Model {
  public _uuid!: number;
  public employee_id!: number;
  public kind!: string;
  public name!: string;
  public icon!: string;
  public color!: string;
  public code!: string | null;
  public sort!: number;
  public status!: number;
  public createdAt!: Date;
  public updatedAt!: Date;
}

MoneyCategory.init(
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
    /** income ລາຍຮັບ, expense ລາຍຈ່າຍ */
    kind: {
      type: DataTypes.STRING(10),
      allowNull: false
    },
    name: {
      type: DataTypes.STRING(60),
      allowNull: false
    },
    /** ຊື່ໄອຄອນໃນແອັບ (lib/screens/money_screen.dart — moneyIcons) */
    icon: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: "other"
    },
    /** #RRGGBB */
    color: {
      type: DataTypes.STRING(7),
      allowNull: false,
      defaultValue: "#64748B"
    },
    code: DataTypes.STRING(20),
    sort: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    /** 1 ໃຊ້ງານ, 0 ລຶບແລ້ວ */
    status: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1
    },
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
    modelName: "MoneyCategory",
    tableName: "tbl_money_category",
    timestamps: true,
    indexes: [{ fields: ["employee_id", "status"] }],
  }
);

autoSync(MoneyCategory);
export default MoneyCategory;
