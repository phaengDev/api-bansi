import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";
// ✅ Define attributes
interface MainMenuAttributes {
   _uuid: number;
    name_la: string;
    name_en: string;
    name_cn: string;
    icons: string;
    path: string;
    types: number; //1 ໃຊ້ທົ່ວໄປ 2 ໃຊ້ເປັນເມນູໃນບັນຊີ
    password: string | null; // bcrypt hash ລະຫັດເຂົ້າເມນູບັນຊີ — NULL = ບໍ່ລັອກ
    status: number;
    createdAt: Date;
    updatedAt: Date;
}

export type MainMenuCreationAttributes = Optional<MainMenuAttributes, "_uuid">;
// ✅ Define model
export class MainMenu extends Model<MainMenuAttributes, MainMenuCreationAttributes> {
    declare _uuid: number;
    declare name_la: string;
    declare name_en: string;
    declare name_cn: string;
    declare icons: string;
    declare path: string;
    declare types: number;
    declare password: string | null;
    declare status: number;
    declare readonly createdAt: Date;
    declare readonly updatedAt: Date;
}

MainMenu.init(
    {
        _uuid: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        name_la: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        name_en: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        name_cn: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        icons: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        path: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        types: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1,
        },
        password: {
            type: DataTypes.STRING,
            allowNull: true,
        },
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
        modelName: "MainMenu",
        tableName: "tbl_main_menu",
        timestamps: true,
        // password (bcrypt hash ລະຫັດເຂົ້າເມນູບັນຊີ) ບໍ່ອອກໄປກັບ query ປົກກະຕິ — ລວມທັງ include ຈາກ SubMenu.
        // ໃຊ້ MainMenu.scope("withPassword") ສະເພາະບ່ອນທີ່ກວດລະຫັດ (bansi/menuLockController)
        defaultScope: { attributes: { exclude: ["password"] } },
        scopes: { withPassword: {} },
        }
    );

// ✅ Export model
// ສ້າງ/ປັບຕາຕະລາງເອງຕອນເປີດ server (App.ts → runAutoSync)
autoSync(MainMenu);

export default MainMenu