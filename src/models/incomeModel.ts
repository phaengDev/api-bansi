import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";
import TypeInexp from "./typeIncomeModel";
import TreasuryAcount from "./treasuryAcount";
import Users from "./userModel";
import Banks from "./bankModel";
import Partner from "./partner";
class Incomes extends Model {
  public _uuid!: number;
  public number!: string;
  /** ວັນທີຮັບເງິນ (ລົງຍ້ອນຫຼັງໄດ້) — ແຖວເກົ່າເປັນ NULL ໃຊ້ວັນທີຂອງ createdAt ແທນ */
  public income_date!: string | null;
  public incom_title!: string;
  public type_incom_fk!: number ;
  public type_acountid!: number;
  public acount_id_fk!: number;
  /** 1 = ເງິນສົດ, 2 = ເງິນໂອນ */
  public receive_type!: number;
  /** ເງິນໂອນ: ທະນາຄານ / ຊື່ບັນຊີ / ເລກບັນຊີ ຂອງຜູ້ໂອນ (ບໍ່ບັງຄັບ) */
  public payer_bank_id!: number | null;
  public payer_account_name!: string | null;
  public payer_account_number!: string | null;
  /** ລູກຄ້າ (tbl_partner, partner_type 1 ຫຼື 3) — ບໍ່ບັງຄັບ; ພຽງບອກວ່າຮັບຈາກໃຜ ບໍ່ຕັດໜີ້ (ຕັດໜີ້ = /partner-payment) */
  public partner_id!: number | null;
  /** ຊື່ລູກຄ້າ — ເລືອກຈາກລາຍຊື່ (ສຳເນົາຊື່ຂອງ partner) ຫຼື ປ້ອນເອງ (partner_id = null) */
  public payer_name!: string | null;
  public balances!: number;
  public tax!: number;
  public balance_income!: number;
  public description!: string;
  public file_doct!: string;
  public close!: number;
  public status!: number;
  public createdbyid!: number;
  public createdAt!: Date;
  public updatedAt!: Date;
}

Incomes.init(
  {
    _uuid: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    number: DataTypes.STRING,
    income_date: DataTypes.DATEONLY,
    incom_title: DataTypes.STRING,
    type_incom_fk: DataTypes.INTEGER,
    type_acountid: DataTypes.INTEGER,
    acount_id_fk: DataTypes.INTEGER,
    receive_type: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    payer_bank_id: DataTypes.INTEGER,
    payer_account_name: DataTypes.STRING,
    payer_account_number: DataTypes.STRING,
    partner_id: DataTypes.INTEGER,
    payer_name: DataTypes.STRING,
    balances: DataTypes.INTEGER,
    tax: DataTypes.INTEGER,
    balance_income: DataTypes.INTEGER,
    description: DataTypes.STRING,
    file_doct: DataTypes.STRING,
    close:{
      type: DataTypes.INTEGER,
      defaultValue: 1
    },
   status: {
      type: DataTypes.INTEGER,
      defaultValue: 1
    },
    createdbyid: DataTypes.INTEGER,
    createdAt:{
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  },
  {
    sequelize,
    modelName: "Incomes",
    tableName: "tbl_incomes",
    timestamps: true,
  }
);
// try {
//   Incomes.sync({ force: true });
//   console.log('Incomes table created successfully');
// } catch (error) {
//   console.log(error);
// }

Incomes.belongsTo(TypeInexp, { foreignKey: "type_incom_fk",as:"typein" });
Incomes.belongsTo(TreasuryAcount, { foreignKey: "acount_id_fk",as:"acount" });
Incomes.belongsTo(Users, { foreignKey: "createdbyid",as:"user" });
Incomes.belongsTo(Banks, { foreignKey: "payer_bank_id", as: "payerBank" });
Incomes.belongsTo(Partner, { foreignKey: "partner_id", as: "partner", constraints: false });
autoSync(Incomes);
export default Incomes;
