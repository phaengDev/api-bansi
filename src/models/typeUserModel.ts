import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";

// ✅ Define attributes
interface TypeUserAttributes {
    _uuid: number;
    names: string;
    status: number;
    createdAt?: Date;
    updatedAt?: Date;
}

// ✅ Define optional attributes
interface TypeUserAttributesOptional extends Optional<TypeUserAttributes, "_uuid"> {}

// ✅ Define model
export class TypeUser extends Model<TypeUserAttributes, TypeUserAttributesOptional> {
    public _uuid!: number;
    public names!: string;
    public status!: number;
    public readonly createdAt?: Date;
    public readonly updatedAt?: Date;
}

// ✅ Initialize model
TypeUser.init(
    {
        _uuid: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        names: DataTypes.STRING,
        status: DataTypes.INTEGER,
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
        modelName: "Typeuser",
        tableName: "tbl_typeuser",
        timestamps: false,
    }
);


// ສ້າງ/ປັບຕາຕະລາງເອງຕອນເປີດ server (App.ts → runAutoSync)
autoSync(TypeUser);

export default TypeUser;