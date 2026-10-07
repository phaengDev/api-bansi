import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";
import JournalType from "./journalType";

/**
 * ຮູບແບບເລກທີເອກະສານ ເຊັ່ນ RV-2026-00015 = prefix + sep + ປີ(+ເດືອນ) + sep + ເລກລຳດັບ (digits ຕົວ).
 * year_format: 0 ບໍ່ໃສ່ປີ, 2 = YY, 4 = YYYY; reset_period: 0 ບໍ່ເລີ່ມໃໝ່, 1 ທຸກປີ, 2 ທຸກເດືອນ.
 * next_number = ເລກທີ່ຈະອອກຕໍ່ໄປ ໃນງວດ period_key (ເຊັ່ນ "2026" ຫຼື "2026-09")
 */
class DocNumbering extends Model {
  public _uuid!: number;
  public doc_code!: string;
  public name!: string;
  public journal_id!: number | null;
  public prefix!: string;
  public sep!: string;
  public year_format!: number;
  public with_month!: number;
  public digits!: number;
  public reset_period!: number;
  public next_number!: number;
  public period_key!: string | null;
  public description!: string | null;
  public status!: number;
  public createdAt!: Date;
  public updatedAt!: Date;
}

DocNumbering.init(
  {
    _uuid: {
      type: DataTypes.INTEGER,
      primaryKey: true
    },
    doc_code: {
      type: DataTypes.STRING(30),
      allowNull: false
    },
    name: {
      type: DataTypes.STRING(150),
      allowNull: false
    },
    journal_id: DataTypes.INTEGER,
    prefix: {
      type: DataTypes.STRING(20),
      allowNull: false, defaultValue: ""
    },
    sep: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: "-"
    },
    year_format: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 4
    },
    with_month: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 0
    },
    digits: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 5
    },
    reset_period: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    next_number: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    period_key: DataTypes.STRING(10),
    description: DataTypes.STRING(255),
    status: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
  },
  { sequelize, 
    modelName: "DocNumbering", 
    tableName: "tbl_doc_numbering", 
    timestamps: true }
);

DocNumbering.belongsTo(JournalType, { 
  foreignKey: "journal_id", as: "journal" });

autoSync(DocNumbering);
export default DocNumbering;
