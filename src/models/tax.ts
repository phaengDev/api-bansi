import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";

/**
 * ອາກອນ — tax_kind: 1 ອາກອນມູນຄ່າເພີ່ມ (VAT), 2 ອາກອນຫັກ ນ ບ່ອນຈ່າຍ, 3 ອາກອນລາຍໄດ້/ກຳໄລ, 4 ອື່ນໆ.
 * calc_method: 1 ລວມໃນລາຄາແລ້ວ (inclusive), 2 ບວກເພີ່ມຈາກລາຄາ (exclusive).
 * is_default: ອາກອນທີ່ເລືອກໃຫ້ອັດຕະໂນມັດ — ມີໄດ້ອັນດຽວຕໍ່ tax_kind
 */
class Tax extends Model {
  public _uuid!: number;
  public tax_code!: string;
  public name!: string;
  public rate!: string;
  public tax_kind!: number;
  public calc_method!: number;
  public is_default!: number;
  public effective_date!: string | null;
  public description!: string | null;
  public status!: number;
  public createdAt!: Date;
  public updatedAt!: Date;
}

Tax.init(
  {
    _uuid: {
      type: DataTypes.INTEGER,
      primaryKey: true
    },
    tax_code: {
      type: DataTypes.STRING(20),
      allowNull: false
    },
    name: {
      type: DataTypes.STRING(150),
      allowNull: false
    },
    rate: {
      type: DataTypes.DECIMAL(7, 3),
      allowNull: false,
      defaultValue: 0
    },
    tax_kind: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    calc_method: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 2
    },
    is_default: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 0
    },
    effective_date: DataTypes.DATEONLY,
    description: DataTypes.STRING(255),
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
    modelName: "Tax",
    tableName: "tbl_tax",
    timestamps: true
  }
);
autoSync(Tax);
export default Tax;
