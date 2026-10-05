import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";
import Partner from "./partner";
import PartnerDoc from "./partnerDoc";
import TreasuryAccount from "./treasuryAcount";

/**
 * ຮັບຊຳລະ (pay_kind 1) / ຈ່າຍຊຳລະ (pay_kind 2) + ການຕັດໜີ້ (tbl_partner_allocation).
 * ຕາຕະລາງສ້າງດ້ວຍ autoSync (index ໃສ່ໃຫ້ຕອນເປີດ server — controllers/bansi/glSeed.ts)
 */
export class PartnerAllocation extends Model {
  public _uuid!: number;
  public payment_id!: number;
  public doc_id!: number;
  public amount!: string;
}

PartnerAllocation.init(
  {
    _uuid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    payment_id: { type: DataTypes.INTEGER, allowNull: false },
    doc_id: { type: DataTypes.INTEGER, allowNull: false },
    amount: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { sequelize, modelName: "PartnerAllocation", tableName: "tbl_partner_allocation", timestamps: true }
);

class PartnerPayment extends Model {
  public _uuid!: number;
  public pay_kind!: number;
  public pay_number!: string;
  public partner_id!: number;
  public pay_date!: string;
  public treasury_account_id!: number;
  public currency_id!: number | null;
  public exchange_rate!: string;
  public amount!: string;
  public reference!: string | null;
  public description!: string | null;
  public status!: number;
  public created_by!: number | null;
  public createdAt!: Date;
  public updatedAt!: Date;
}

PartnerPayment.init(
  {
    _uuid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    pay_kind: { type: DataTypes.TINYINT, allowNull: false },
    pay_number: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    partner_id: { type: DataTypes.INTEGER, allowNull: false },
    pay_date: { type: DataTypes.DATEONLY, allowNull: false },
    treasury_account_id: { type: DataTypes.INTEGER, allowNull: false },
    currency_id: DataTypes.INTEGER,
    exchange_rate: { type: DataTypes.DECIMAL(16, 4), allowNull: false, defaultValue: 1 },
    amount: { type: DataTypes.DECIMAL(18, 2), allowNull: false },
    reference: DataTypes.STRING(100),
    description: DataTypes.STRING(500),
    status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    created_by: DataTypes.INTEGER,
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { sequelize, modelName: "PartnerPayment", tableName: "tbl_partner_payment", timestamps: true }
);

PartnerPayment.belongsTo(Partner, { foreignKey: "partner_id", as: "partner", constraints: false });
PartnerPayment.belongsTo(TreasuryAccount, { foreignKey: "treasury_account_id", as: "account", constraints: false });
PartnerPayment.hasMany(PartnerAllocation, { foreignKey: "payment_id", as: "allocations", constraints: false });
PartnerAllocation.belongsTo(PartnerDoc, { foreignKey: "doc_id", as: "doc", constraints: false });
PartnerAllocation.belongsTo(PartnerPayment, { foreignKey: "payment_id", as: "payment", constraints: false });
PartnerDoc.hasMany(PartnerAllocation, { foreignKey: "doc_id", as: "allocations", constraints: false });

autoSync(PartnerPayment);
autoSync(PartnerAllocation);
export default PartnerPayment;
