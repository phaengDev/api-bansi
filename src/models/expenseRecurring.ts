import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";

/**
 * ລາຍຈ່າຍປະຈຳເດືອນ (ຄ່າເຊົ່າ, ຄ່າໄຟ, ອິນເຕີເນັດ…) — ແມ່ແບບທີ່ສ້າງຈາກລາຍຈ່າຍທີ່ເຄີຍບັນທຶກ: ປະເພດ, ບັນຊີທີ່ຈ່າຍ, ຜູ້ຮັບ,
 * ລາຍການ (items JSON [{ name, qty, unit, price }]) ແລະ ວັນທີທີ່ຄົບກຳນົດແຕ່ລະເດືອນ. ບໍ່ບັນທຶກເງິນອອກເອງ —
 * ຜູ້ໃຊ້ກົດ "ບັນທຶກເດືອນນີ້" ແລ້ວກວດຈຳນວນເອງ (ຄ່າໄຟປ່ຽນທຸກເດືອນ); ລາຍຈ່າຍທີ່ບັນທຶກຈາກແມ່ແບບມີ recurring_id
 */
class ExpenseRecurring extends Model {
  public _uuid!: number;
  public title!: string;
  public day_of_month!: number;
  public sub_category_id!: number;
  public acount_id_fk!: number;
  public partner_id!: number | null;
  public payee_name!: string | null;
  public payee_bank_id!: number | null;
  public payee_account_number!: string | null;
  public items!: string;
  public amount!: string;
  public description!: string | null;
  public status!: number;
  public createdbyid!: number | null;
  public createdAt!: Date;
  public updatedAt!: Date;
}

ExpenseRecurring.init(
  {
    _uuid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    title: { type: DataTypes.STRING(150), allowNull: false },
    day_of_month: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    sub_category_id: { type: DataTypes.INTEGER, allowNull: false },
    acount_id_fk: { type: DataTypes.INTEGER, allowNull: false },
    partner_id: DataTypes.INTEGER,
    payee_name: DataTypes.STRING(150),
    payee_bank_id: DataTypes.INTEGER,
    payee_account_number: DataTypes.STRING(50),
    items: { type: DataTypes.TEXT, allowNull: false },
    amount: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
    description: DataTypes.TEXT,
    status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    createdbyid: DataTypes.INTEGER,
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { sequelize, modelName: "ExpenseRecurring", tableName: "tbl_expense_recurring", timestamps: false },
);

autoSync(ExpenseRecurring);
export default ExpenseRecurring;
