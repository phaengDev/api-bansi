import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";

class TypeAccount extends Model {
  public _uuid!: number;
  public type_code!: string;
  public type_name!: string;
  public status!: number;
  public createdAt!: Date;
  public updatedAt!: Date;
}

TypeAccount.init(
  {
    _uuid: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    type_code: DataTypes.STRING,
    type_name: DataTypes.STRING,
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
    }
  },
  {
    sequelize,
    modelName: "TypeAccount",
    tableName: "tbl_type_account",
    timestamps: true,
  }
);

autoSync(TypeAccount);
export default TypeAccount;
