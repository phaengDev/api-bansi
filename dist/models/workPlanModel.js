"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkPlan = void 0;
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
const userModel_1 = __importDefault(require("./userModel"));
// ✅ Define model
class WorkPlan extends sequelize_1.Model {
}
exports.WorkPlan = WorkPlan;
// ✅ Initialize model
WorkPlan.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    userid: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
    },
    employee_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null,
    },
    title: {
        type: sequelize_1.DataTypes.STRING(255),
        allowNull: false,
    },
    note: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: true,
        defaultValue: "",
    },
    start_date: {
        type: sequelize_1.DataTypes.DATEONLY,
        allowNull: false,
    },
    end_date: {
        type: sequelize_1.DataTypes.DATEONLY,
        allowNull: false,
    },
    done: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    progress: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    progress_log: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: true,
    },
    done_at: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: true,
    },
    status: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
    },
    createdAt: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize_1.DataTypes.NOW,
    },
    updatedAt: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize_1.DataTypes.NOW,
    },
}, {
    sequelize: database_1.default,
    modelName: "WorkPlan",
    tableName: "tbl_work_plan",
    timestamps: false,
});
// ✅ Associations (import side effect — ຕ້ອງ import ໄຟລ໌ນີ້ກ່ອນຈຶ່ງໃຊ້ include ໄດ້)
WorkPlan.belongsTo(userModel_1.default, { foreignKey: "userid", targetKey: "user_uuid", as: "user" });
userModel_1.default.hasMany(WorkPlan, { foreignKey: "userid", sourceKey: "user_uuid", as: "workPlans" });
// ສ້າງ/ປັບຕາຕະລາງເອງຕອນເປີດ server (App.ts → runAutoSync)
(0, autoSync_1.autoSync)(WorkPlan);
exports.default = WorkPlan;
