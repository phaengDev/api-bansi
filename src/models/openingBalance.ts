import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";
import FiscalYear from "./fiscalYear";
import TreasuryAccount from "./treasuryAcount";

/** ຍອດຍົກມາຕົ້ນປີການເງິນ ຂອງແຕ່ລະບັນຊີເງິນຄັງ — ໜຶ່ງບັນຊີມີໄດ້ແຖວດຽວຕໍ່ປີ (UNIQUE fiscal_id + account_id) */
class OpeningBalance extends Model {
  public _uuid!: number;
  public fiscal_id!: number;
  public account_id!: number;
  public balance_usable!: string;
  public balance_held!: string;
  public description!: string | null;
  public createby!: string | null;
  public status!: number;
  public createdAt!: Date;
  public updatedAt!: Date;
}

OpeningBalance.init(
  {
    _uuid: { type: DataTypes.INTEGER, primaryKey: true },
    fiscal_id: { type: DataTypes.INTEGER, allowNull: false },
    account_id: { type: DataTypes.INTEGER, allowNull: false },
    balance_usable: { type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0 },
    balance_held: { type: DataTypes.DECIMAL(16, 2), allowNull: false, defaultValue: 0 },
    description: DataTypes.STRING(255),
    createby: DataTypes.STRING(100),
    status: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  { sequelize, modelName: "OpeningBalance", tableName: "tbl_opening_balance", timestamps: true }
);

OpeningBalance.belongsTo(FiscalYear, { foreignKey: "fiscal_id", as: "fiscal" });
OpeningBalance.belongsTo(TreasuryAccount, { foreignKey: "account_id", as: "account" });

autoSync(OpeningBalance);
export default OpeningBalance;
