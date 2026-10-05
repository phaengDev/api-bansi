import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";
import TreasuryAcount from "./treasuryAcount";
class TransferMoney extends Model {
    public _uuid!: number;
    public account_outid!: number;
    public balance_out!: number;
    public account_inid!: number;
    public balance_in!: number;
    public balance_transfer!: number;
    public description!: string;
    public createby!: string;
    public status!: number;
    public createdAt!: Date;
    public updatedAt!: Date;
}

TransferMoney.init(
    {
        _uuid: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        account_outid: DataTypes.INTEGER,
        balance_out: DataTypes.DECIMAL(14, 2),
        account_inid: DataTypes.INTEGER,
        balance_in: DataTypes.DECIMAL(14, 2),
        balance_transfer: DataTypes.DECIMAL(14, 2),
        description: DataTypes.STRING,
        createby: DataTypes.STRING,
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
        modelName: "TransferMoney",
        tableName: "tbl_transfer_money",
        timestamps: true,
    }
);

// Sync the model
// try {
//     TransferMoney.sync({ force: false });
// } catch (error) {
//     console.error("Error syncing TransferMoney model:", error);
// }


TransferMoney.belongsTo(TreasuryAcount, { foreignKey: "account_outid", as: "acounts" });
TransferMoney.belongsTo(TreasuryAcount, { foreignKey: "account_inid", as: "acounte" });
autoSync(TransferMoney);
export default TransferMoney;
