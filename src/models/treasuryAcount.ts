import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";
import TypeTreasury from "./typeTreasury";
import Banks from "./bankModel";
class TreasuryAccount extends Model {
  public _uuid!: number;
  public type_treasuryid!: number;
  public bankId!: number | null;
  public acountName!: string;
  public acount_number!: string;
  public balance_treasury!: number;
  public balance_unable!: number;
  public status!: number;
  public createdAt!: Date;
  public updatedAt!: Date;
}

TreasuryAccount.init(
  {
    _uuid: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    type_treasuryid: DataTypes.INTEGER,
    bankId: DataTypes.INTEGER || null,
    acountName: DataTypes.STRING,
    acount_number: DataTypes.STRING,
    balance_treasury: DataTypes.INTEGER,
    balance_unable: DataTypes.INTEGER,
   status: {
      type: DataTypes.INTEGER,
      defaultValue: 1
    },
    createdAt:{
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  },
  {
    sequelize,
    modelName: "TreasuryAccount",
    tableName: "tbl_treasury_account",
    timestamps: true,
  }
);

TreasuryAccount.belongsTo(TypeTreasury, { foreignKey: "type_treasuryid",as:"treasury" });
TreasuryAccount.belongsTo(Banks, { foreignKey: "bankId",as:"banks" });
autoSync(TreasuryAccount);
export default TreasuryAccount;
