import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";
import Task from "./task";
import Employee from "./employee";

/**
 * ສ່ວນປະກອບຂອງວຽກທີ່ມອບໝາຍ (models/task.ts):
 * - TaskProject: ໂປຣເຈັກ / ໝວດວຽກ (ຕັ້ງຢູ່ ຕັ້ງຄ່າ ຂອງໜ້າມອບໝາຍວຽກ) — status 0 = ປິດ (ວຽກເກົ່າຍັງສະແດງຊື່)
 * - TaskAssignee: ຜູ້ຮັບຜິດຊອບ (UNIQUE task_id + employee_id); is_lead = ຫົວໜ້າວຽກ (ມົງກຸດ) 1 ຄົນຕໍ່ວຽກ
 * - TaskItem: ລາຍການຍ່ອຍ (checklist) — done_by = ພະນັກງານທີ່ໝາຍສຳເລັດ (null = HR ໃນເວັບ)
 * - TaskStar: ດາວ (ວຽກທີ່ຕິດຕາມ) ຂອງຜູ້ໃຊ້ເວັບແຕ່ລະຄົນ (UNIQUE user_id + task_id)
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

Task.belongsTo(TaskProject, { foreignKey: "project_id", as: "project", constraints: false });
Task.hasMany(TaskAssignee, { foreignKey: "task_id", as: "assignees", constraints: false });
Task.hasMany(TaskItem, { foreignKey: "task_id", as: "items", constraints: false });
TaskAssignee.belongsTo(Employee, { foreignKey: "employee_id", as: "employee", constraints: false });

autoSync(TaskProject);
autoSync(TaskAssignee);
autoSync(TaskItem);
autoSync(TaskStar);
