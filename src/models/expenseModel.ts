import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";
import FinanceCategories from "./typeIncomeModel";
import TreasuryAccount from "./treasuryAcount";
import ExpenseItems from "./expenseItemModel";
import Users from "./userModel";
import Banks from "./bankModel";
import Partner from "./partner";

/**
 * ລາຍຈ່າຍ — ສ່ວນຫົວ (1 ແຖວຕໍ່ໃບຈ່າຍ); ລາຍການຍ່ອຍຢູ່ tbl_expense_items (expense_id).
 * ບັນທຶກແລ້ວເງິນອອກຈາກ "ຍອດໃຊ້ໄດ້" (balance_treasury) ຂອງບັນຊີທີ່ຈ່າຍທັນທີ (ຜ່ານ moveBalance),
 * ຍົກເລີກ (status 2) = ຄືນເງິນເຂົ້າບັນຊີ. ຖັນເງິນ: subtotal = ລວມທຸກລາຍການ, tax = ອາກອນ,
 * balance_expense = ຍອດຈ່າຍອອກແທ້. pay_type ມາຈາກໝວດຂອງບັນຊີທີ່ຈ່າຍ: 1 = ເງິນສົດ (ໝວດ 101), 2 = ເງິນໂອນ
 */
class Expenses extends Model {
  public _uuid!: number;
  public number!: string;
  /** ວັນທີຈ່າຍເງິນ (ລົງຍ້ອນຫຼັງໄດ້) */
  public expense_date!: string;
  public expense_title!: string;
  public type_expense_fk!: number;
  /** ຜູ້ຮັບເງິນ / ຮ້ານຄ້າ ແລະ ເລກທີໃບບິນຂອງຮ້ານ (ບໍ່ບັງຄັບ) */
  public payee_name!: string | null;
  public bill_no!: string | null;
  public type_acountid!: number;
  public acount_id_fk!: number;
  /** 1 = ເງິນສົດ, 2 = ເງິນໂອນ */
  public pay_type!: number;
  /** ເງິນໂອນ: ທະນາຄານ / ເລກບັນຊີ ຂອງຜູ້ຮັບເງິນ (ບໍ່ບັງຄັບ) */
  public payee_bank_id!: number | null;
  public payee_account_number!: string | null;
  /** ລູກຄ້າ/ຜູ້ສະໜອງ ທີ່ຮັບເງິນ (tbl_partner) — ບໍ່ບັງຄັບ; ບໍ່ຕັດໜີ້ (ຕັດໜີ້ = /partner-payment) */
  public partner_id!: number | null;
  public subtotal!: string;
  public tax!: string;
  public balance_expense!: string;
  public description!: string | null;
  public file_doct!: string | null;
  public status!: number;
  public createdbyid!: number | null;
  public createdAt!: Date;
  public updatedAt!: Date;
}

Expenses.init(
  {
    _uuid: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    number: DataTypes.STRING(50),
    expense_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    expense_title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    type_expense_fk: DataTypes.INTEGER,
    payee_name: DataTypes.STRING,
    bill_no: DataTypes.STRING(100),
    type_acountid: DataTypes.INTEGER,
    acount_id_fk: DataTypes.INTEGER,
    pay_type: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    payee_bank_id: DataTypes.INTEGER,
    payee_account_number: DataTypes.STRING(100),
    partner_id: DataTypes.INTEGER,
    subtotal: {
      type: DataTypes.DECIMAL(16, 2),
      allowNull: false,
      defaultValue: 0,
    },
    tax: {
      type: DataTypes.DECIMAL(16, 2),
      allowNull: false,
      defaultValue: 0,
    },
    balance_expense: {
      type: DataTypes.DECIMAL(16, 2),
      allowNull: false,
      defaultValue: 0,
    },
    description: DataTypes.STRING(500),
    file_doct: DataTypes.STRING,
    status: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    createdbyid: DataTypes.INTEGER,
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    modelName: "Expenses",
    tableName: "tbl_expenses",
    timestamps: true,
  }
);

Expenses.belongsTo(FinanceCategories, { foreignKey: "type_expense_fk", as: "typeout" });
Expenses.belongsTo(TreasuryAccount, { foreignKey: "acount_id_fk", as: "acount" });
Expenses.belongsTo(Users, { foreignKey: "createdbyid", as: "user" });
Expenses.belongsTo(Banks, { foreignKey: "payee_bank_id", as: "payeeBank" });
Expenses.belongsTo(Partner, { foreignKey: "partner_id", as: "partner", constraints: false });
Expenses.hasMany(ExpenseItems, { foreignKey: "expense_id", as: "items" });
autoSync(Expenses);
export default Expenses;
