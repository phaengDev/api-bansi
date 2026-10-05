import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";
import TreasuryAccount from "./treasuryAcount";
import Users from "./userModel";

/**
 * ປະຫວັດການເຄື່ອນໄຫວຂອງບັນຊີເງິນຄັງ — ທຸກຄັ້ງທີ່ຍອດປ່ຽນ ມີແຖວໜຶ່ງ: ຍອດກ່ອນ, ເຂົ້າ/ອອກ ເທົ່າໃດ, ຍອດຫຼັງ.
 * ຂຽນຜ່ານ moveBalance() (controllers/bansi/accountMovement.ts) ເທົ່ານັ້ນ — ບ່ອນດຽວທີ່ປ່ຽນຍອດບັນຊີ.
 * direction: 1 = ເງິນເຂົ້າ, 2 = ເງິນອອກ. balance_kind: 1 = ຍອດໃຊ້ໄດ້ (balance_treasury), 2 = ຍອດຄ້າງ (balance_unable).
 * source_type ບອກທີ່ມາ (OPENING, INCOME, INCOME_CANCEL, TRANSFER_IN, TRANSFER_OUT, …) + source_id ຂອງເອກະສານນັ້ນ
 */
class AccountMovement extends Model {
  public _uuid!: number;
  public account_id!: number;
  public movement_date!: string;
  public direction!: number;
  public balance_kind!: number;
  public amount!: string;
  public balance_before!: string;
  public balance_after!: string;
  public currency_id!: number | null;
  public source_type!: string;
  public source_id!: string | null;
  public doc_number!: string | null;
  public counterpart_account_id!: number | null;
  public description!: string | null;
  public created_by!: number | null;
  public status!: number;
  public createdAt!: Date;
  public updatedAt!: Date;
}

AccountMovement.init(
  {
    _uuid: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    account_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    movement_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    direction: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    balance_kind: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    amount: {
      type: DataTypes.DECIMAL(16, 2),
      allowNull: false
    },
    balance_before: {
      type: DataTypes.DECIMAL(16, 2),
      allowNull: false
    },
    balance_after: {
      type: DataTypes.DECIMAL(16, 2),
      allowNull: false
    },
    currency_id: DataTypes.INTEGER,
    source_type: {
      type: DataTypes.STRING(30),
      allowNull: false
    },
    source_id: DataTypes.STRING(50),
    doc_number: DataTypes.STRING(50),
    counterpart_account_id: DataTypes.INTEGER,
    description: DataTypes.STRING(255),
    created_by: DataTypes.INTEGER,
    status: {
      type: DataTypes.INTEGER,
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
    modelName: "AccountMovement", 
    tableName: "tbl_account_movement", 
    timestamps: true 
  }
);

AccountMovement.belongsTo(TreasuryAccount, { foreignKey: "account_id", as: "account" });
AccountMovement.belongsTo(TreasuryAccount, { foreignKey: "counterpart_account_id", as: "counterpart" });
AccountMovement.belongsTo(Users, { foreignKey: "created_by", as: "user" });

autoSync(AccountMovement);
export default AccountMovement;
