import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";

class FinanceCategories extends Model {
    public _uuid!: number;
    public type_code!: string;
    public type_name!: string;
    public typestatus!: number; // 1: ປະເພດລາຍຮັບ, 2: ປະເພດລາຍຈ່າຍ
    public description!: string;
    public status!: number;
    public createdAt!: Date;
    public updatedAt!: Date;
}

FinanceCategories.init(
    {
        _uuid: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        type_code: DataTypes.STRING,
        type_name: DataTypes.STRING,
        typestatus: DataTypes.INTEGER,
        description: DataTypes.STRING,
        status: {
            type: DataTypes.INTEGER,
            defaultValue: 1
        },
        createdAt: {
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
        tableName: "tbl_finance_categories",
        modelName: "FinanceCategories",
        timestamps: true
    }
);
autoSync(FinanceCategories);
export default FinanceCategories;