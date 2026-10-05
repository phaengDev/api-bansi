import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";

// ✅ Define attributes
interface CurrencyAttributes {
    _id: number;
    name: string;
    laos: string;
    icon: string;
    genus: string;
    reate: number;
    createdAt: Date;
    updatedAt: Date;
}
interface CurrencyCreationAttributes extends Optional<CurrencyAttributes, "_id"> {}
// ✅ Define model
export class Currency extends Model<CurrencyAttributes, CurrencyCreationAttributes> {
    public _id!: number;
    public name!: string;
    public laos!: string;
    public icon!: string;
    public genus!: string;
    public reate!: number;
    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

Currency.init(
    {
        _id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        laos: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        icon: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        genus: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        reate: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true,
        },
        createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
        },
        updatedAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
        },
    },
    {
        sequelize,
        modelName: "Currency",
        tableName: "tbl_currency",
        timestamps: true,
    }   

);

// ✅ Export model
// ສ້າງ/ປັບຕາຕະລາງເອງຕອນເປີດ server (App.ts → runAutoSync)
autoSync(Currency);

export default Currency