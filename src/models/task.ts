import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";

/**
 * ວຽກທີ່ມອບໝາຍ — HR / ຫົວໜ້າ ສ້າງໃນເວັບ, ຫຼື ຫົວໜ້າມອບໝາຍໃຫ້ລູກທີມເອງໃນ app (assigned_by_employee_id);
 * ພະນັກງານທີ່ຮັບຜິດຊອບເຫັນ ແລະ ອັບເດດໃນ app.
 * status: 1 ລໍຖ້າດຳເນີນການ, 2 ກຳລັງດຳເນີນການ, 3 ສຳເລັດແລ້ວ. priority: 1 ປົກກະຕິ, 2 ສຳຄັນ, 3 ດ່ວນ.
 * important / urgent = ຕາຕະລາງບໍລິຫານເວລາ (ສຳຄັນ / ດ່ວນ) ທີ່ app ຕັ້ງ — null = ເອົາຕາມ priority
 * (3 = ສຳຄັນ + ດ່ວນ, 2 = ສຳຄັນ + ບໍ່ດ່ວນ, 1 = ຍັງບໍ່ໄດ້ຈັດ).
 * archived = 1 ເກັບເຂົ້າຄັງ (ບໍ່ສະແດງໃນລາຍການຫຼັກ / app). ຜູ້ຮັບຜິດຊອບ tbl_task_assignee, ລາຍການຍ່ອຍ tbl_task_item
 */
class Task extends Model {
  public _uuid!: number;
  public title!: string;
  public detail!: string | null;
  public project_id!: number | null;
  public status!: number;
  public priority!: number;
  public start_date!: string | null;
  public due_date!: string | null;
  public archived!: number;
  public done_at!: Date | null;
  public createdbyid!: number | null;
  /** ຫົວໜ້າທີ່ມອບໝາຍຈາກ app (null = ສ້າງໃນເວັບ) — ຄົນນີ້ປ່ຽນສະຖານະ / ລຶບວຽກໃນ app ໄດ້ */
  public assigned_by_employee_id!: number | null;
  public important!: number | null;
  public urgent!: number | null;
  public updatedbyid!: number | null;
  public createdAt!: Date;
  public updatedAt!: Date;
}

Task.init(
  {
    _uuid: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    detail: DataTypes.TEXT,
    project_id: DataTypes.INTEGER,
    status: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1
    },
    priority: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1
    },
    start_date: DataTypes.DATEONLY,
    due_date: DataTypes.DATEONLY,
    archived: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 0
    },
    done_at: DataTypes.DATE,
    createdbyid: DataTypes.INTEGER,
    assigned_by_employee_id: DataTypes.INTEGER,
    important: DataTypes.TINYINT,
    urgent: DataTypes.TINYINT,
    updatedbyid: DataTypes.INTEGER,
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
  },
  {
    sequelize,
    modelName: "Task",
    tableName: "tbl_task",
    timestamps: true
  }
);

autoSync(Task);
export default Task;
