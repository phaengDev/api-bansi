import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";
import Partner from "./partner";
import ChartAccount from "./chartAccount";

/**
 * ໃບແຈ້ງໜີ້ (doc_kind 1) / ໃບບິນຜູ້ສະໜອງ (doc_kind 2) — paid = ຍອດທີ່ຕັດແລ້ວ (ສະກຸນຂອງໃບ), ຄ້າງ = total − paid.
 * ຕາຕະລາງສ້າງດ້ວຍ autoSync (index ໃສ່ໃຫ້ຕອນເປີດ server — controllers/bansi/glSeed.ts)
 */
export class PartnerDocLine extends Model {
  public _uuid!: number;
  public doc_id!: number;
  public line_no!: number;
  public account_id!: number;
  public description!: string | null;
  public amount!: string;
}

PartnerDocLine.init(
  {
    _uuid: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    doc_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    line_no: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    account_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    description: DataTypes.STRING(255),
    amount: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
  },
  { sequelize, modelName: "PartnerDocLine", tableName: "tbl_partner_doc_line", timestamps: true }
);

class PartnerDoc extends Model {
  public _uuid!: number;
  public doc_kind!: number;
  public doc_number!: string;
  public partner_id!: number;
  public doc_date!: string;
  public due_date!: string;
  public reference!: string | null;
  public description!: string | null;
  public currency_id!: number | null;
  public exchange_rate!: string;
  public subtotal!: string;
  public tax_id!: number | null;
  public tax!: string;
  public total!: string;
  public paid!: string;
  public control_account_id!: number;
  public status!: number;
  public created_by!: number | null;
  public createdAt!: Date;
  public updatedAt!: Date;
}

PartnerDoc.init(
  {
    _uuid: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    doc_kind: {
      type: DataTypes.TINYINT,
      allowNull: false
    },
    doc_number: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    },
    partner_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    doc_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    due_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    reference: DataTypes.STRING(100),
    description: DataTypes.STRING(500),
    currency_id: DataTypes.INTEGER,
    exchange_rate: {
      type: DataTypes.DECIMAL(16, 4),
      allowNull: false, defaultValue: 1
    },
    subtotal: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false, defaultValue: 0
    },
    tax_id: DataTypes.INTEGER,
    tax: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false, defaultValue: 0
    },
    total: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false, defaultValue: 0
    },
    paid: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false, defaultValue: 0
    },
    control_account_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    status: {
      type: DataTypes.TINYINT,
      allowNull: false, defaultValue: 1
    },
    created_by: DataTypes.INTEGER,
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
  },
  {
    sequelize,
    modelName: "PartnerDoc",
    tableName: "tbl_partner_doc",
    timestamps: true
  }
);

PartnerDoc.belongsTo(Partner, { foreignKey: "partner_id", as: "partner", constraints: false });
PartnerDoc.hasMany(PartnerDocLine, { foreignKey: "doc_id", as: "lines", constraints: false });
PartnerDocLine.belongsTo(ChartAccount, { foreignKey: "account_id", as: "account", constraints: false });

autoSync(PartnerDoc);
autoSync(PartnerDocLine);
export default PartnerDoc;
