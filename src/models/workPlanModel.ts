import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";
import Users from "./userModel";

// ✅ Define attributes — ຕາຕະລາງເກັບແຜນວຽກ (ປະຕິທິນແຜນວຽກ)
interface WorkPlanAttributes {
    _uuid: number;
    userid: number;                 // ເຈົ້າຂອງແຜນວຽກ (tbl_users.user_uuid)
    title: string;                  // ຫົວຂໍ້ແຜນວຽກ
    note: string;                   // ລາຍລະອຽດເພີ່ມເຕີມ
    start_date: string;             // ວັນທີເລີ່ມ (YYYY-MM-DD)
    end_date: string;               // ວັນທີສິ້ນສຸດ (YYYY-MM-DD)
    done: number;                   // 0 = ຍັງບໍ່ສຳເລັດ, 1 = ສຳເລັດແລ້ວ
    status: number;                 // 1 = ໃຊ້ງານ, 0 = ລຶບແລ້ວ (soft delete)
    createdAt?: Date;
    updatedAt?: Date;
}

// ✅ Define optional attributes
interface WorkPlanAttributesOptional
    extends Optional<WorkPlanAttributes, "_uuid" | "note" | "done" | "status"> {}

// ✅ Define model
export class WorkPlan extends Model<WorkPlanAttributes, WorkPlanAttributesOptional> {
    public _uuid!: number;
    public userid!: number;
    public title!: string;
    public note!: string;
    public start_date!: string;
    public end_date!: string;
    public done!: number;
    public status!: number;
    public readonly createdAt?: Date;
    public readonly updatedAt?: Date;
}

// ✅ Initialize model
WorkPlan.init(
    {
        _uuid: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        userid: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        title: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        note: {
            type: DataTypes.TEXT,
            allowNull: true,
            defaultValue: "",
        },
        start_date: {
            type: DataTypes.DATEONLY,
            allowNull: false,
        },
        end_date: {
            type: DataTypes.DATEONLY,
            allowNull: false,
        },
        done: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
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
        modelName: "WorkPlan",
        tableName: "tbl_work_plan",
        timestamps: false,
    }
);

// ✅ Associations (import side effect — ຕ້ອງ import ໄຟລ໌ນີ້ກ່ອນຈຶ່ງໃຊ້ include ໄດ້)
WorkPlan.belongsTo(Users, { foreignKey: "userid", targetKey: "user_uuid", as: "user" });
Users.hasMany(WorkPlan, { foreignKey: "userid", sourceKey: "user_uuid", as: "workPlans" });

// ສ້າງ/ປັບຕາຕະລາງເອງຕອນເປີດ server (App.ts → runAutoSync)
autoSync(WorkPlan);
export default WorkPlan;
