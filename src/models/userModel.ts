import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";
import TypeUser from "./typeUserModel";
import Employee from "./employee";
// ✅ Define attributes
interface UserAttributes {
    user_uuid: number;
    type_user: number;
    user_name: string;
    phones: string;
    password: string;
    employee_id?: number | null;
    status: number;
    deletes: number;
    updates: number;
    creates: number;
    createdAt?: Date;
    updatedAt?: Date;
}
interface UserCreationAttributes extends Optional<UserAttributes, "user_uuid"> { }

class Users extends Model<UserAttributes, UserCreationAttributes>
    implements UserAttributes {
    public user_uuid!: number;
    public type_user!: number;
    public company_id_fk!: number;
    public user_name!: string;
    public phones!: string;
    public password!: string;
    /** ພະນັກງານເຈົ້າຂອງບັນຊີ (tbl_employee) — ບໍ່ບັງຄັບ, ໜຶ່ງພະນັກງານມີໄດ້ບັນຊີດຽວ */
    public employee_id!: number | null;
    public status!: number;
    public deletes!: number;
    public updates!: number;
    public creates!: number;
    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

Users.init(
    {
        user_uuid: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        type_user: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        user_name: {
            type: DataTypes.STRING(100), // ຈຳກັດ 100 chars
            allowNull: true,
        },
        phones: {
            type: DataTypes.STRING(20), // ຈຳກັດ 20 chars
            allowNull: true,
            unique: true,
        },
        password: {
            type: DataTypes.STRING, // hash password ໄດ້
            allowNull: true,
        },
        employee_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        status: {
            type: DataTypes.INTEGER, // ໃຊ້ສະເພາະຕົວເລກ ENUM (0=inactive,1=active)
            allowNull: false,
            defaultValue: 1,
        },
        deletes: {
            type: DataTypes.INTEGER, // ໃຊ້ສະເພາະຕົວເລກ ENUM (0=inactive,1=active)
            allowNull: false,
            defaultValue: 1,
        },
        updates: {
            type: DataTypes.INTEGER, // ໃຊ້ສະເພາະຕົວເລກ ENUM (0=inactive,1=active)
            allowNull: false,
            defaultValue: 1,
        },
        creates: {
            type: DataTypes.INTEGER, // ໃຊ້ສະເພາະຕົວເລກ ENUM (0=inactive,1=active)
            allowNull: false,
            defaultValue: 1,
        }
    },

    {
        sequelize,
        modelName: "Users",
        tableName: "tbl_users",
        timestamps: true,   // Sequelize จะสร้าง createdAt / updatedAt
        // underscored: true,  // แปลงเป็น createdAt / updatedAt
    }
);

Users.belongsTo(TypeUser, {
  foreignKey: "type_user",
  as: "typeuser",   // must match include
});
Users.belongsTo(Employee, { foreignKey: "employee_id", as: "employee", constraints: false });
// ✅ Export model
// ສ້າງ/ປັບຕາຕະລາງເອງຕອນເປີດ server (App.ts → runAutoSync)
autoSync(Users);

export default Users;
