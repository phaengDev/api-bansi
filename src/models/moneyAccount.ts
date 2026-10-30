import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";

/**
 * ບັນຊີເງິນສ່ວນຕົວຂອງພະນັກງານ (app) — ພະນັກງານສ້າງເອງ (ບໍ່ກ່ຽວກັບຂໍ້ມູນ HR): ເງິນສົດ, ທະນາຄານ (tbl_bank), e-wallet.
 * 1 ບັນຊີ = 1 ສະກຸນເງິນ (ປ່ຽນບໍ່ໄດ້). opening_balance = ຍອດເງິນຕອນສ້າງ (ແກ້ໄຂບໍ່ໄດ້) — ຍອດປັດຈຸບັນ = opening +
 * ລາຍຮັບ − ລາຍຈ່າຍ − ໂອນອອກ + ໂອນເຂົ້າ (tbl_money_entry). ລຶບ = status 0 (ລາຍການເກົ່າຍັງຢູ່)
 */
class MoneyAccount extends Model {
  public _uuid!: number;
  public employee_id!: number;
  public name!: string;
  public kind!: string;
  public bank_id!: number | null;
  public account_no!: string | null;
  public currency!: string;
  public opening_balance!: string;
  public sort!: number;
  public status!: number;
  public createdAt!: Date;
  public updatedAt!: Date;
}

MoneyAccount.init(
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
    name: {
      type: DataTypes.STRING(60),
      allowNull: false
    },
    /** cash ເງິນສົດ, bank ທະນາຄານ, wallet e-wallet */
    kind: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: "cash"
    },
    /** tbl_bank (ໂລໂກ້ທະນາຄານ) — ເງິນສົດ = null */
    bank_id: DataTypes.INTEGER,
    /** ເລກບັນຊີ (ບໍ່ບັງຄັບ, ໃຫ້ເຈົ້າຂອງຈຳໄດ້) */
    account_no: DataTypes.STRING(30),
    currency: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: "LAK"
    },
    opening_balance: {
      type: DataTypes.DECIMAL(16, 2),
      allowNull: false,
      defaultValue: 0
    },
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
    modelName: "MoneyAccount",
    tableName: "tbl_money_account",
    timestamps: true,
    indexes: [{ fields: ["employee_id", "status"] }],
  }
);

autoSync(MoneyAccount);
export default MoneyAccount;
