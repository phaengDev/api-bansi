"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskLog = exports.TaskComment = exports.TaskFile = exports.TaskStar = exports.TaskItem = exports.TaskAssignee = exports.TaskProject = void 0;
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
const task_1 = __importDefault(require("./task"));
const employee_1 = __importDefault(require("./employee"));
const userModel_1 = __importDefault(require("./userModel"));
/**
 * ສ່ວນປະກອບຂອງວຽກທີ່ມອບໝາຍ (models/task.ts):
 * - TaskProject: ໂປຣເຈັກ / ໝວດວຽກ (ຕັ້ງຢູ່ ຕັ້ງຄ່າ ຂອງໜ້າມອບໝາຍວຽກ) — status 0 = ປິດ (ວຽກເກົ່າຍັງສະແດງຊື່)
 * - TaskAssignee: ຜູ້ຮັບຜິດຊອບ (UNIQUE task_id + employee_id); is_lead = ຫົວໜ້າວຽກ (ມົງກຸດ) 1 ຄົນຕໍ່ວຽກ
 * - TaskItem: ລາຍການຍ່ອຍ (checklist) — done_by = ພະນັກງານທີ່ໝາຍສຳເລັດ (null = HR ໃນເວັບ)
 * - TaskStar: ດາວ (ວຽກທີ່ຕິດຕາມ) ຂອງຜູ້ໃຊ້ເວັບແຕ່ລະຄົນ (UNIQUE user_id + task_id)
 * - TaskFile: ເອກະສານຄັດຕິດ — file_name = ຊື່ໄຟລ໌ໃນ private/task-files (ບໍ່ຢູ່ໃຕ້ /image), original_name = ຊື່ເດີມຕອນອັບໂຫຼດ
 * - TaskComment: ຄອມເມັນ — ຜູ້ຂຽນເປັນຜູ້ໃຊ້ເວັບ (user_id) ຫຼື ພະນັກງານໃນ app (employee_id) ຢ່າງໃດຢ່າງໜຶ່ງ
 * - TaskLog: ໄທມ໌ໄລນ໌ — ໃຜເຮັດຫຍັງກັບວຽກ. action: create | update (fields = ຊ່ອງທີ່ແກ້, status = ສະຖານະໃໝ່ຖ້າປ່ຽນ) | item_done | item_undone |
 *   file_add | file_del | archive | unarchive; note = ຊື່ລາຍການຍ່ອຍ / ໄຟລ໌. ຫົວຂໍ້ສະແດງຕາມພາສາຂອງໜ້າເວັບ ຈຶ່ງເກັບເປັນລະຫັດ
 */
const stamps = () => ({
    createdAt: { type: sequelize_1.DataTypes.DATE, defaultValue: sequelize_1.DataTypes.NOW },
    updatedAt: { type: sequelize_1.DataTypes.DATE, defaultValue: sequelize_1.DataTypes.NOW },
});
const id = () => ({ type: sequelize_1.DataTypes.INTEGER, primaryKey: true, autoIncrement: true });
class TaskProject extends sequelize_1.Model {
}
exports.TaskProject = TaskProject;
TaskProject.init({
    _uuid: id(),
    name: { type: sequelize_1.DataTypes.STRING(150), allowNull: false },
    color: { type: sequelize_1.DataTypes.STRING(20), allowNull: false, defaultValue: "#1580be" },
    sort: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    status: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    ...stamps(),
}, { sequelize: database_1.default, modelName: "TaskProject", tableName: "tbl_task_project", timestamps: true });
/**
 * ຜູ້ຮັບຜິດຊອບວຽກ — is_lead = ຫົວໜ້າວຽກ (ມົງກຸດ). ຄວາມຄືບໜ້າ "ສ່ວນຂອງຕົນ" ທີ່ພະນັກງານອັບເດດເອງໃນ app:
 * status 1 ຍັງບໍ່ເລີ່ມ, 2 ກຳລັງເຮັດ, 3 ສຳເລັດ; progress 0–100 %; active_at = ຄັ້ງລ່າສຸດທີ່ຄົນນີ້ເຮັດຫຍັງໃນວຽກນີ້
 * (ອັບເດດຄວາມຄືບໜ້າ, ໝາຍລາຍການຍ່ອຍ, ຄອມເມັນ) — null = ຍັງບໍ່ເຄີຍ
 */
class TaskAssignee extends sequelize_1.Model {
}
exports.TaskAssignee = TaskAssignee;
TaskAssignee.init({
    _uuid: id(),
    task_id: { type: sequelize_1.DataTypes.INTEGER, allowNull: false },
    employee_id: { type: sequelize_1.DataTypes.INTEGER, allowNull: false },
    is_lead: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
    status: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    progress: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
    active_at: sequelize_1.DataTypes.DATE,
    ...stamps(),
}, { sequelize: database_1.default, modelName: "TaskAssignee", tableName: "tbl_task_assignee", timestamps: true });
class TaskItem extends sequelize_1.Model {
}
exports.TaskItem = TaskItem;
TaskItem.init({
    _uuid: id(),
    task_id: { type: sequelize_1.DataTypes.INTEGER, allowNull: false },
    title: { type: sequelize_1.DataTypes.STRING(255), allowNull: false },
    done: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
    done_at: sequelize_1.DataTypes.DATE,
    done_by: sequelize_1.DataTypes.INTEGER,
    sort: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    ...stamps(),
}, { sequelize: database_1.default, modelName: "TaskItem", tableName: "tbl_task_item", timestamps: true });
class TaskStar extends sequelize_1.Model {
}
exports.TaskStar = TaskStar;
TaskStar.init({
    _uuid: id(),
    user_id: { type: sequelize_1.DataTypes.INTEGER, allowNull: false },
    task_id: { type: sequelize_1.DataTypes.INTEGER, allowNull: false },
    ...stamps(),
}, { sequelize: database_1.default, modelName: "TaskStar", tableName: "tbl_task_star", timestamps: true });
class TaskFile extends sequelize_1.Model {
}
exports.TaskFile = TaskFile;
TaskFile.init({
    _uuid: id(),
    task_id: { type: sequelize_1.DataTypes.INTEGER, allowNull: false },
    file_name: { type: sequelize_1.DataTypes.STRING, allowNull: false },
    original_name: { type: sequelize_1.DataTypes.STRING, allowNull: false },
    mime_type: sequelize_1.DataTypes.STRING(100),
    file_size: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    createdbyid: sequelize_1.DataTypes.INTEGER,
    ...stamps(),
}, { sequelize: database_1.default, modelName: "TaskFile", tableName: "tbl_task_file", timestamps: true });
/** ຄອມເມັນຂອງວຽກ — to_ids = ພະນັກງານທີ່ຜູ້ມອບໝາຍເລືອກແຈ້ງເຖິງ ("12,15"); null = ແຈ້ງທຸກຄົນ. ທຸກຄົນໃນວຽກເຫັນຄອມເມັນຄືກັນ */
class TaskComment extends sequelize_1.Model {
}
exports.TaskComment = TaskComment;
TaskComment.init({
    _uuid: id(),
    task_id: { type: sequelize_1.DataTypes.INTEGER, allowNull: false },
    body: { type: sequelize_1.DataTypes.TEXT, allowNull: false },
    user_id: sequelize_1.DataTypes.INTEGER,
    employee_id: sequelize_1.DataTypes.INTEGER,
    to_ids: sequelize_1.DataTypes.STRING(255),
    ...stamps(),
}, { sequelize: database_1.default, modelName: "TaskComment", tableName: "tbl_task_comment", timestamps: true });
class TaskLog extends sequelize_1.Model {
}
exports.TaskLog = TaskLog;
TaskLog.init({
    _uuid: id(),
    task_id: { type: sequelize_1.DataTypes.INTEGER, allowNull: false },
    action: { type: sequelize_1.DataTypes.STRING(20), allowNull: false },
    fields: sequelize_1.DataTypes.STRING(255),
    status: sequelize_1.DataTypes.TINYINT,
    note: sequelize_1.DataTypes.STRING(255),
    user_id: sequelize_1.DataTypes.INTEGER,
    employee_id: sequelize_1.DataTypes.INTEGER,
    ...stamps(),
}, { sequelize: database_1.default, modelName: "TaskLog", tableName: "tbl_task_log", timestamps: true });
task_1.default.belongsTo(TaskProject, { foreignKey: "project_id", as: "project", constraints: false });
task_1.default.hasMany(TaskAssignee, { foreignKey: "task_id", as: "assignees", constraints: false });
task_1.default.hasMany(TaskItem, { foreignKey: "task_id", as: "items", constraints: false });
task_1.default.hasMany(TaskFile, { foreignKey: "task_id", as: "files", constraints: false });
task_1.default.hasMany(TaskComment, { foreignKey: "task_id", as: "comments", constraints: false });
TaskComment.belongsTo(employee_1.default, { foreignKey: "employee_id", as: "employee", constraints: false });
TaskComment.belongsTo(userModel_1.default, { foreignKey: "user_id", as: "user", constraints: false });
TaskLog.belongsTo(employee_1.default, { foreignKey: "employee_id", as: "employee", constraints: false });
TaskLog.belongsTo(userModel_1.default, { foreignKey: "user_id", as: "user", constraints: false });
TaskAssignee.belongsTo(employee_1.default, { foreignKey: "employee_id", as: "employee", constraints: false });
(0, autoSync_1.autoSync)(TaskProject);
(0, autoSync_1.autoSync)(TaskAssignee);
(0, autoSync_1.autoSync)(TaskItem);
(0, autoSync_1.autoSync)(TaskStar);
(0, autoSync_1.autoSync)(TaskFile);
(0, autoSync_1.autoSync)(TaskComment);
(0, autoSync_1.autoSync)(TaskLog);
