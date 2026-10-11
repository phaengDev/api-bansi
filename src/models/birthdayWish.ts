import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";
import Employee from "./employee";

/**
 * ຄຳອວຍພອນວັນເກີດ — ພະນັກງານສົ່ງໃຫ້ເພື່ອນຮ່ວມງານທີ່ມີວັນເກີດມື້ນີ້ ຜ່ານ app ມືຖື.
 * employee_id = ເຈົ້າຂອງວັນເກີດ, sender_id = ຜູ້ສົ່ງ, wish_date = ວັນເກີດຂອງປີນັ້ນ (ເວລາລາວ);
 * ຄົນດຽວສົ່ງໃຫ້ຄົນດຽວໄດ້ 1 ຂໍ້ຄວາມຕໍ່ວັນເກີດ (ສົ່ງຊ້ຳ = ແກ້ຂໍ້ຄວາມເກົ່າ).
 * read_at = ເຈົ້າຂອງວັນເກີດເປີດເບິ່ງແລ້ວ (null = ໃໝ່ — app ແຈ້ງເຕືອນຢູ່ໜ້າຫຼັກ)
 * reply = ເຈົ້າຂອງວັນເກີດຕອບກັບ (1 ຂໍ້ຄວາມຕໍ່ຄຳອວຍພອນ, ຕອບຊ້ຳ = ແກ້), replied_at = ເວລາຕອບ,
 * reply_read_at = ຜູ້ອວຍພອນເປີດເບິ່ງຄຳຕອບແລ້ວ (null = ໃໝ່ — app ແຈ້ງເຕືອນຜູ້ອວຍພອນ)
 */
class BirthdayWish extends Model {
  public _uuid!: number;
  public employee_id!: number;
  public sender_id!: number;
  public wish_date!: string;
  public message!: string;
  public read_at!: Date | null;
  public reply!: string | null;
  public replied_at!: Date | null;
  public reply_read_at!: Date | null;
  public createdAt!: Date;
  public updatedAt!: Date;
}

BirthdayWish.init(
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
    sender_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    wish_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    message: {
      type: DataTypes.STRING(500),
      allowNull: false
    },
    read_at: DataTypes.DATE,
    reply: DataTypes.STRING(500),
    replied_at: DataTypes.DATE,
    reply_read_at: DataTypes.DATE,
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
    modelName: "BirthdayWish",
    tableName: "tbl_birthday_wish",
    timestamps: true
  }
);


BirthdayWish.belongsTo(Employee, { foreignKey: "sender_id", as: "sender", constraints: false });
BirthdayWish.belongsTo(Employee, { foreignKey: "employee_id", as: "employee", constraints: false });

autoSync(BirthdayWish);
export default BirthdayWish;
