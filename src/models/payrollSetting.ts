import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";

/**
 * ຕັ້ງຄ່າເງິນເດືອນ (ແຖວດຽວ) — ນະໂຍບາຍເປີດ/ປິດ (sso_enabled, tax_enabled, deduct_absent, deduct_late: 0 = ບໍ່ຫັກ),
 * ປະກັນສັງຄົມ (% ພະນັກງານ / % ບໍລິສັດ / ເພດານເງິນເດືອນ), ຂັ້ນອາກອນລາຍໄດ້ (JSON
 * [{ upto, rate }] ຂັ້ນສຸດທ້າຍ upto = null), ເງິນເດືອນສູງສຸດທີ່ຄ່າລ່ວງເວລາບໍ່ເສຍອາກອນ (0 = ເສຍທຸກຄົນ),
 * ນາທີຜ່ອນຜັນມາຊ້າ/ອອກກ່ອນ ແລະ ຫັກຂາດວຽກ/ມາຊ້າ ອັດຕະໂນມັດ ຫຼື ບໍ່. ຍັງບໍ່ມີແຖວ = ໃຊ້ຄ່າເລີ່ມຕົ້ນ (hr/payrollRules.ts)
 */
class PayrollSetting extends Model {
  public _uuid!: number;
  public sso_enabled!: number;
  public sso_employee_rate!: string;
  public sso_employer_rate!: string;
  public sso_salary_cap!: string;
  public tax_enabled!: number;
  public tax_brackets!: string;
  public ot_tax_free_salary!: string;
  public late_grace_minutes!: number;
  public deduct_absent!: number;
  public deduct_late!: number;
  public updatedbyid!: number | null;
  public createdAt!: Date;
  public updatedAt!: Date;
}

PayrollSetting.init(
  {
    _uuid: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    sso_enabled: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1
    },
    sso_employee_rate: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 5.5
    },
    sso_employer_rate: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 6
    },
    sso_salary_cap: {
      type: DataTypes.DECIMAL(16, 2),
      allowNull: false,
      defaultValue: 4500000
    },
    tax_enabled: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1
    },
    tax_brackets: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    ot_tax_free_salary: {
      type: DataTypes.DECIMAL(16, 2),
      allowNull: false,
      defaultValue: 3000000
    },
    late_grace_minutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    deduct_absent: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1
    },
    deduct_late: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1
    },
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
    modelName: "PayrollSetting",
    tableName: "tbl_payroll_setting",
    timestamps: true
  }
);

autoSync(PayrollSetting);
export default PayrollSetting;
