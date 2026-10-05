import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";

// ✅ Define attributes
interface BanksAttributes {
    _uuid: number;
    logo: string;
    abbr: string;
    name_la: string;
    name_en: string;
    status: number;
    createdAt?: Date;
    updatedAt?: Date;
}

// ✅ Define optional attributes
interface BanksAttributesOptional extends Optional<BanksAttributes, "_uuid"> {}

// ✅ Define model
export class Banks extends Model<BanksAttributes, BanksAttributesOptional> {
    public _uuid!: number;
    public logo!: string;
    public abbr!: string;
    public name_la!: string;
    public name_en!: string;
    public status!: number;
    public readonly createdAt?: Date;
    public readonly updatedAt?: Date;
}

// ✅ Initialize model
Banks.init(
    {
        _uuid: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        logo: DataTypes.STRING,
        abbr: DataTypes.STRING,
        name_la: DataTypes.STRING,
        name_en: DataTypes.STRING,
        status: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1,
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
        modelName: "Banks",
        tableName: "tbl_banks",
        timestamps: false,
    }
);


// ສ້າງ/ປັບຕາຕະລາງເອງຕອນເປີດ server (App.ts → runAutoSync)
autoSync(Banks);

export default Banks;