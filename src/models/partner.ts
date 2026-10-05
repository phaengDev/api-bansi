import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";

/**
 * ຄູ່ຄ້າ (tbl_partner) — partner_type 1 ລູກຄ້າ (ລູກໜີ້), 2 ຜູ້ສະໜອງ (ເຈົ້າໜີ້), 3 ທັງສອງ.
 * ຕາຕະລາງສ້າງດ້ວຍ autoSync (index ໃສ່ໃຫ້ຕອນເປີດ server — controllers/bansi/glSeed.ts)
 */
class Partner extends Model {
  public _uuid!: number;
  public partner_code!: string;
  public name!: string;
  public partner_type!: number;
  public contact_person!: string | null;
  public phone!: string | null;
  public email!: string | null;
  public address!: string | null;
  public tax_number!: string | null;
  public credit_days!: number;
  public receivable_account_id!: number | null;
  public payable_account_id!: number | null;
  public description!: string | null;
  public status!: number;
  public createdAt!: Date;
  public updatedAt!: Date;
}

Partner.init(
  {
    _uuid: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    partner_code: {
      type: DataTypes.STRING(30),
      allowNull: false,
      unique: true
    },
    name: {
      type: DataTypes.STRING(200),
      allowNull: false
    },
    partner_type: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1
    },
    contact_person: {
      type: DataTypes.STRING(150),
      allowNull: true
    },
    phone: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    email: {
      type: DataTypes.STRING(150),
      allowNull: true
    },
    address: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    tax_number: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    credit_days: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    receivable_account_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    payable_account_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    status: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
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
  {
    sequelize,
    modelName: "Partner",
    tableName: "tbl_partner",
    timestamps: true
  }
);

autoSync(Partner);
export default Partner;
