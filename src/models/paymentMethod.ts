import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";
import TreasuryAccount from "./treasuryAcount";

/**
 * ວິທີຊຳລະເງິນ — method_type: 1 ເງິນສົດ, 2 ໂອນຜ່ານທະນາຄານ, 3 QR / ກະເປົາເງິນ, 4 ເຊັກ, 5 ບັດ.
 * account_id = ບັນຊີເງິນຄັງທີ່ເງິນເຂົ້າ/ອອກໂດຍຄ່າເລີ່ມຕົ້ນ; require_ref = ຕ້ອງປ້ອນເລກອ້າງອີງ (ເລກໂອນ, ເລກເຊັກ)
 */
class PaymentMethod extends Model {
  public _uuid!: number;
  public method_code!: string;
  public name!: string;
  public method_type!: number;
  public account_id!: number | null;
  public require_ref!: number;
  public fee_percent!: string;
  public sort!: number;
  public description!: string | null;
  public status!: number;
  public createdAt!: Date;
  public updatedAt!: Date;
}

PaymentMethod.init(
  {
    _uuid: {
      type: DataTypes.INTEGER,
      primaryKey: true
    },
    method_code: {
      type: DataTypes.STRING(20),
      allowNull: false
    },
    name: {
      type: DataTypes.STRING(150),
      allowNull: false
    },
    method_type: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    account_id: DataTypes.INTEGER,
    require_ref: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 0
    },
    fee_percent: {
      type: DataTypes.DECIMAL(6, 3),
      allowNull: false,
      defaultValue: 0
    },
    sort: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    description: DataTypes.STRING(255),
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
    modelName: "PaymentMethod",
    tableName: "tbl_payment_method",
    timestamps: true
  }
);
PaymentMethod.belongsTo(TreasuryAccount, { foreignKey: "account_id", as: "account" });

autoSync(PaymentMethod);
export default PaymentMethod;
