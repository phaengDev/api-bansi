"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
/**
 * ວຽກທີ່ມອບໝາຍ — HR / ຫົວໜ້າ ສ້າງໃນເວັບ, ຫຼື ຫົວໜ້າມອບໝາຍໃຫ້ລູກທີມເອງໃນ app (assigned_by_employee_id);
 * ພະນັກງານທີ່ຮັບຜິດຊອບເຫັນ ແລະ ອັບເດດໃນ app.
 * status: 1 ລໍຖ້າດຳເນີນການ, 2 ກຳລັງດຳເນີນການ, 3 ສຳເລັດແລ້ວ. priority: 1 ປົກກະຕິ, 2 ສຳຄັນ, 3 ດ່ວນ.
 * important / urgent = ຕາຕະລາງບໍລິຫານເວລາ (ສຳຄັນ / ດ່ວນ) ທີ່ app ຕັ້ງ — null = ເອົາຕາມ priority
 * (3 = ສຳຄັນ + ດ່ວນ, 2 = ສຳຄັນ + ບໍ່ດ່ວນ, 1 = ຍັງບໍ່ໄດ້ຈັດ).
 * archived = 1 ເກັບເຂົ້າຄັງ (ບໍ່ສະແດງໃນລາຍການຫຼັກ / app). ຜູ້ຮັບຜິດຊອບ tbl_task_assignee, ລາຍການຍ່ອຍ tbl_task_item
 */
class Task extends sequelize_1.Model {
}
Task.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    title: {
        type: sequelize_1.DataTypes.STRING(255),
        allowNull: false
    },
    detail: sequelize_1.DataTypes.TEXT,
    project_id: sequelize_1.DataTypes.INTEGER,
    status: {
        type: sequelize_1.DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 1
    },
    priority: {
        type: sequelize_1.DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 1
    },
    start_date: sequelize_1.DataTypes.DATEONLY,
    due_date: sequelize_1.DataTypes.DATEONLY,
    archived: {
        type: sequelize_1.DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 0
    },
    done_at: sequelize_1.DataTypes.DATE,
    createdbyid: sequelize_1.DataTypes.INTEGER,
    assigned_by_employee_id: sequelize_1.DataTypes.INTEGER,
    important: sequelize_1.DataTypes.TINYINT,
    urgent: sequelize_1.DataTypes.TINYINT,
    updatedbyid: sequelize_1.DataTypes.INTEGER,
    createdAt: {
        type: sequelize_1.DataTypes.DATE,
        defaultValue: sequelize_1.DataTypes.NOW
    },
    updatedAt: {
        type: sequelize_1.DataTypes.DATE,
        defaultValue: sequelize_1.DataTypes.NOW
    },
}, {
    sequelize: database_1.default,
    modelName: "Task",
    tableName: "tbl_task",
    timestamps: true
});
(0, autoSync_1.autoSync)(Task);
exports.default = Task;
