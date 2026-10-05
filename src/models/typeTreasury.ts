import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";
import Currency from "./currencyModel";
import TypeAcount from "./typeAcount";
class TypeTreasury extends Model {
  public _uuid!: number;
  public typeId!: number;
  public currencyId!: number;
  public treasury_code!: string;
  public treasury_name!: string;
  public description!: string;
  public status!: number;
  public createdAt!: Date;
  public updatedAt!: Date;
}

TypeTreasury.init(
  {
    _uuid: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    typeId: DataTypes.INTEGER,
    currencyId: DataTypes.INTEGER,
    treasury_code: DataTypes.STRING,
    treasury_name: DataTypes.STRING,
    description: DataTypes.STRING,
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
    modelName: "TypeTreasury",
    tableName: "tbl_type_treasury",
    timestamps: true,
  }
);

TypeTreasury.belongsTo(Currency, { foreignKey: "currencyId", as: "currency" });
TypeTreasury.belongsTo(TypeAcount, { foreignKey: "typeId", as: "types" });

autoSync(TypeTreasury);
export default TypeTreasury;
