import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";
import Currency from "./currencyModel";

/**
 * ປະຫວັດອັດຕາແລກປ່ຽນ (1 ໜ່ວຍສະກຸນເງິນ = rate ກີບ) — ອັດຕາຫຼ້າສຸດຕາມ rate_date ຖືກຂຽນກັບໄປ tbl_currency.reate
 * ເພື່ອໃຫ້ໜ້າອື່ນທີ່ອ່ານ reate ຢູ່ແລ້ວໃຊ້ຕໍ່ໄດ້
 */
class ExchangeRate extends Model {
  public _uuid!: number;
  public currencyId!: number;
  public rate!: string;
  public rate_date!: string;
  public description!: string | null;
  public createby!: string | null;
  public status!: number;
  public createdAt!: Date;
  public updatedAt!: Date;
}

ExchangeRate.init(
  {
    _uuid: {
      type: DataTypes.INTEGER,
      primaryKey: true
    },
    currencyId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    rate: {
      type: DataTypes.DECIMAL(16, 4),
      allowNull: false
    },
    rate_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    description: DataTypes.STRING(255),
    createby: DataTypes.STRING(100),
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
  { sequelize, 
    modelName: "ExchangeRate", 
    tableName: "tbl_exchange_rate", 
    timestamps: true }
);

ExchangeRate.belongsTo(Currency, { 
  foreignKey: "currencyId", as: "currency" });

autoSync(ExchangeRate);
export default ExchangeRate;
