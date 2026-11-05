import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";
import Task from "./task";
import Employee from "./employee";
import Users from "./userModel";

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
  createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
});
const id = () => ({ type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true });

export class TaskProject extends Model {
  public _uuid!: number;
  public name!: string;
  public color!: string;
  public sort!: number;
  public status!: number;
}

TaskProject.init(
  {
    _uuid: id(),
    name: { type: DataTypes.STRING(150), allowNull: false },
    color: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "#1580be" },
    sort: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    ...stamps(),
  },
  { sequelize, modelName: "TaskProject", tableName: "tbl_task_project", timestamps: true }
);

export class TaskAssignee extends Model {
  public _uuid!: number;
  public task_id!: number;
  public employee_id!: number;
  public is_lead!: number;
}

TaskAssignee.init(
  {
    _uuid: id(),
    task_id: { type: DataTypes.INTEGER, allowNull: false },
    employee_id: { type: DataTypes.INTEGER, allowNull: false },
    is_lead: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
    ...stamps(),
  },
  { sequelize, modelName: "TaskAssignee", tableName: "tbl_task_assignee", timestamps: true }
);

export class TaskItem extends Model {
  public _uuid!: number;
  public task_id!: number;
  public title!: string;
  public done!: number;
  public done_at!: Date | null;
  public done_by!: number | null;
  public sort!: number;
}

TaskItem.init(
  {
    _uuid: id(),
    task_id: { type: DataTypes.INTEGER, allowNull: false },
    title: { type: DataTypes.STRING(255), allowNull: false },
    done: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
    done_at: DataTypes.DATE,
    done_by: DataTypes.INTEGER,
    sort: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    ...stamps(),
  },
  { sequelize, modelName: "TaskItem", tableName: "tbl_task_item", timestamps: true }
);

export class TaskStar extends Model {
  public _uuid!: number;
  public user_id!: number;
  public task_id!: number;
}

TaskStar.init(
  {
    _uuid: id(),
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    task_id: { type: DataTypes.INTEGER, allowNull: false },
    ...stamps(),
  },
  { sequelize, modelName: "TaskStar", tableName: "tbl_task_star", timestamps: true }
);

export class TaskFile extends Model {
  public _uuid!: number;
  public task_id!: number;
  public file_name!: string;
  public original_name!: string;
  public mime_type!: string | null;
  public file_size!: number;
  public createdbyid!: number | null;
}

TaskFile.init(
  {
    _uuid: id(),
    task_id: { type: DataTypes.INTEGER, allowNull: false },
    file_name: { type: DataTypes.STRING, allowNull: false },
    original_name: { type: DataTypes.STRING, allowNull: false },
    mime_type: DataTypes.STRING(100),
    file_size: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    createdbyid: DataTypes.INTEGER,
    ...stamps(),
  },
  { sequelize, modelName: "TaskFile", tableName: "tbl_task_file", timestamps: true }
);

export class TaskComment extends Model {
  public _uuid!: number;
  public task_id!: number;
  public body!: string;
  public user_id!: number | null;
  public employee_id!: number | null;
  public createdAt!: Date;
}

TaskComment.init(
  {
    _uuid: id(),
    task_id: { type: DataTypes.INTEGER, allowNull: false },
    body: { type: DataTypes.TEXT, allowNull: false },
    user_id: DataTypes.INTEGER,
    employee_id: DataTypes.INTEGER,
    ...stamps(),
  },
  { sequelize, modelName: "TaskComment", tableName: "tbl_task_comment", timestamps: true }
);

export class TaskLog extends Model {
  public _uuid!: number;
  public task_id!: number;
  public action!: string;
  public fields!: string | null;
  public status!: number | null;
  public note!: string | null;
  public user_id!: number | null;
  public employee_id!: number | null;
  public createdAt!: Date;
}

TaskLog.init(
  {
    _uuid: id(),
    task_id: { type: DataTypes.INTEGER, allowNull: false },
    action: { type: DataTypes.STRING(20), allowNull: false },
    fields: DataTypes.STRING(255),
    status: DataTypes.TINYINT,
    note: DataTypes.STRING(255),
    user_id: DataTypes.INTEGER,
    employee_id: DataTypes.INTEGER,
    ...stamps(),
  },
  { sequelize, modelName: "TaskLog", tableName: "tbl_task_log", timestamps: true }
);

Task.belongsTo(TaskProject, { foreignKey: "project_id", as: "project", constraints: false });
Task.hasMany(TaskAssignee, { foreignKey: "task_id", as: "assignees", constraints: false });
Task.hasMany(TaskItem, { foreignKey: "task_id", as: "items", constraints: false });
Task.hasMany(TaskFile, { foreignKey: "task_id", as: "files", constraints: false });
Task.hasMany(TaskComment, { foreignKey: "task_id", as: "comments", constraints: false });
TaskComment.belongsTo(Employee, { foreignKey: "employee_id", as: "employee", constraints: false });
TaskComment.belongsTo(Users, { foreignKey: "user_id", as: "user", constraints: false });
TaskLog.belongsTo(Employee, { foreignKey: "employee_id", as: "employee", constraints: false });
TaskLog.belongsTo(Users, { foreignKey: "user_id", as: "user", constraints: false });
TaskAssignee.belongsTo(Employee, { foreignKey: "employee_id", as: "employee", constraints: false });

autoSync(TaskProject);
autoSync(TaskAssignee);
autoSync(TaskItem);
autoSync(TaskStar);
autoSync(TaskFile);
autoSync(TaskComment);
autoSync(TaskLog);
