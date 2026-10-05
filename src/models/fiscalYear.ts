import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";

/** ປີການເງິນ — ມີປີປັດຈຸບັນ (is_current) ໄດ້ປີດຽວ; status 1 = ເປີດ, 2 = ປິດບັນຊີແລ້ວ (ລັອກຍອດຍົກມາ) */
class FiscalYear extends Model {
  public _uuid!: number;
  public fiscal_code!: string;
  public fiscal_name!: string | null;
  public start_date!: string;
  public end_date!: string;
  public is_current!: number;
  public status!: number;
  public closed_at!: Date | null;
  public closed_by!: string | null;
  public description!: string | null;
  public createby!: string | null;
  public createdAt!: Date;
  public updatedAt!: Date;
}

FiscalYear.init(
  {
    _uuid: {
      type: DataTypes.INTEGER,
      primaryKey: true
    },
    fiscal_code: {
      type: DataTypes.STRING(20),
      allowNull: false
    },
    fiscal_name: DataTypes.STRING(150),
    start_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    end_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    is_current: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 0
    },
    status: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    closed_at: DataTypes.DATE,
    closed_by: DataTypes.STRING(100),
    description: DataTypes.STRING(255),
    createby: DataTypes.STRING(100),
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
  },
  { sequelize, modelName: "FiscalYear", tableName: "tbl_fiscal_year", timestamps: true }
);

autoSync(FiscalYear);
export default FiscalYear;
