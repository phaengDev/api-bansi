import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";

/**
 * ແຈ້ງເຕືອນຂອງພະນັກງານ (app ມືຖື — ກະດິ່ງຢູ່ຫົວໜ້າຫຼັກ). 1 ແຖວຕໍ່ພະນັກງານ 1 ຄົນ — ແຈ້ງທຸກຄົນ = ສ້າງໃຫ້ທຸກຄົນ.
 * type: payroll (ໂອນເງິນເດືອນແລ້ວ), birthday (ວັນເກີດເພື່ອນ / ວັນເກີດຕົນເອງ), birthday_wish (ມີຄົນອວຍພອນ),
 * birthday_reply (ມີຄົນຕອບກັບຄຳອວຍພອນ), leave (ຜົນຄຳຂໍລາພັກ), holiday (ວັນພັກໃໝ່), announcement (HR ແຈ້ງການທົ່ວໄປ)
 * ref = ຂໍ້ມູນອ້າງອີງໃຫ້ app ເປີດໜ້າທີ່ກ່ຽວຂ້ອງ / ກັນສ້າງຊ້ຳ (ເຊັ່ນ "birthday:12:2026-10-11")
 * read_at = ເປີດເບິ່ງແລ້ວ (null = ໃໝ່)
 */
class Notification extends Model {
  public _uuid!: number;
  public employee_id!: number;
  public type!: string;
  public title!: string;
  public body!: string | null;
  public ref!: string | null;
  public read_at!: Date | null;
  public createdbyid!: number | null;
  public createdAt!: Date;
  public updatedAt!: Date;
}

Notification.init(
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
    type: {
      type: DataTypes.STRING(30),
      allowNull: false
    },
    title: {
      type: DataTypes.STRING(150),
      allowNull: false
    },
    body: DataTypes.STRING(1000),
    ref: DataTypes.STRING(100),
    read_at: DataTypes.DATE,
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
    modelName: "Notification",
    tableName: "tbl_notification",
    timestamps: true
  }
);

autoSync(Notification);
export default Notification;
