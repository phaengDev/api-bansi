import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";
import Payroll from "./payroll";

/**
 * ເງິນເດືອນລາຍຄົນຂອງໃບເງິນເດືອນ (UNIQUE payroll_id + employee_id). ຊື່/ພະແນກ/ບັນຊີທະນາຄານ ເກັບເປັນສຳເນົາ
 * ຕອນສ້າງ/ຄິດໄລ່ໃໝ່ (ໃບທີ່ຈ່າຍແລ້ວບໍ່ປ່ຽນຕາມຂໍ້ມູນພະນັກງານ). ສູດຢູ່ controllers/hr/payrollRules.ts:
 * ເງິນເດືອນຕາມວັນເຮັດວຽກ (base_pay) − ຫັກຂາດວຽກ − ຫັກມາຊ້າ + ເງິນອຸດໜູນ + ລ່ວງເວລາ + ໂບນັດ = gross;
 * net = gross − ປກສ ພະນັກງານ − ອາກອນ − ຫັກອື່ນ. ລ່ວງເວລາ (overtime) ຄິດຈາກບັນທຶກ OT (overtime_mode 1) ຫຼື ປ້ອນເອງ (0).
 * deduction_mode / sso_mode / tax_mode = ນະໂຍບາຍສະເພາະຄົນຂອງແຕ່ລະກຸ່ມການຫັກ:
 * 1 ຕາມບໍລິສັດ, 3 ຫັກສະເໝີ, 2 ບໍ່ຫັກ, 0 ປ້ອນເອງ (MODE_* ໃນ payrollRules.ts)
 */
class PayrollLine extends Model {
  public _uuid!: number;
  public payroll_id!: number;
  public employee_id!: number;
  public emp_code!: string;
  public employee_name!: string;
  public department_name!: string | null;
  public position_name!: string | null;
  public bank_name!: string | null;
  public bank_account_no!: string | null;
  public bank_account_name!: string | null;
  public basic_salary!: string;
  public workdays!: number;
  public employed_days!: number;
  public present_days!: number;
  public leave_days!: number;
  public unpaid_days!: number;
  public absent_days!: number;
  public late_days!: number;
  public late_minutes!: number;
  public base_pay!: string;
  public absence_deduction!: string;
  public late_deduction!: string;
  public allowance!: string;
  public overtime!: string;
  public ot_hours!: string;
  public ot_weighted_hours!: string;
  public ot_fixed_amount!: string;
  public overtime_mode!: number;
  public bonus!: string;
  public gross!: string;
  public sso_base!: string;
  public sso_employee!: string;
  public sso_employer!: string;
  public taxable!: string;
  public tax!: string;
  public other_deduction!: string;
  public net!: string;
  public deduction_mode!: number;
  public sso_mode!: number;
  public tax_mode!: number;
  public note!: string | null;
  public createdAt!: Date;
  public updatedAt!: Date;
}

/** ສ້າງໃໝ່ທຸກຖັນ — Sequelize ແກ້ object ຂອງ attribute (field), ໃຊ້ object ດຽວກັນຫຼາຍຖັນ = ທຸກຖັນຊີ້ໄປຖັນທຳອິດ */
const money = () => ({ type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0 });
const count = () => ({ type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 });
const mode = () => ({ type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 });

PayrollLine.init(
  {
    _uuid: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    payroll_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    employee_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    emp_code: {
      type: DataTypes.STRING(30),
      allowNull: false
    },
    employee_name: {
      type: DataTypes.STRING(200),
      allowNull: false
    },
    department_name: DataTypes.STRING(150),
    position_name: DataTypes.STRING(150),
    bank_name: DataTypes.STRING(100),
    bank_account_no: DataTypes.STRING(50),
    bank_account_name: DataTypes.STRING(150),
    basic_salary: money(),
    workdays: count(),
    employed_days: count(),
    present_days: count(),
    leave_days: count(),
    unpaid_days: count(),
    absent_days: count(),
    late_days: count(),
    late_minutes: count(),
    base_pay: money(),
    absence_deduction: money(),
    late_deduction: money(),
    allowance: money(),
    overtime: money(),
    // ຊົ່ວໂມງ OT ຂອງເດືອນ (tbl_overtime) ແລະ ຊົ່ວໂມງຄູນອັດຕາ (Σ ຊົ່ວໂມງ × % ÷ 100) ຕອນສ້າງ/ຄິດໄລ່ໃໝ່
    ot_hours: { type: DataTypes.DECIMAL(8, 2), allowNull: false, defaultValue: 0 },
    ot_weighted_hours: { type: DataTypes.DECIMAL(8, 2), allowNull: false, defaultValue: 0 },
    // OT ທີ່ກຳນົດເງິນເອງ (ຕໍ່ຊົ່ວໂມງ × ຊົ່ວໂມງ + ເໝົາຈ່າຍ) — ບວກເພີ່ມຈາກສ່ວນທີ່ຄິດຕາມອັດຕາ
    ot_fixed_amount: { type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0 },
    // 1 ຄິດຈາກບັນທຶກ OT, 0 ປ້ອນເອງ — ຄ່າເລີ່ມຕົ້ນຂອງຖັນ 0: ແຖວທີ່ມີກ່ອນມີບັນທຶກ OT ຍັງເປັນຈຳນວນທີ່ປ້ອນໄວ້; ແຖວໃໝ່ = 1
    overtime_mode: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
    bonus: money(),
    gross: money(),
    sso_base: money(),
    sso_employee: money(),
    sso_employer: money(),
    taxable: money(),
    tax: money(),
    other_deduction: money(),
    net: money(),
    deduction_mode: mode(),
    sso_mode: mode(),
    tax_mode: mode(),
    note: DataTypes.STRING(255),
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
    modelName: "PayrollLine",
    tableName: "tbl_payroll_line",
    timestamps: true
  }
);

Payroll.hasMany(PayrollLine, { foreignKey: "payroll_id", as: "lines", constraints: false });
PayrollLine.belongsTo(Payroll, { foreignKey: "payroll_id", as: "payroll", constraints: false });

autoSync(PayrollLine, { rename: { deduction_auto: "deduction_mode", sso_auto: "sso_mode", tax_auto: "tax_mode" } });
export default PayrollLine;
