import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";

/**
 * ການຜູກບັນຊີ (tbl_gl_mapping) — ROLE (source_key = ຊື່ບົດບາດ ເຊັ່ນ VAT_OUTPUT),
 * FINANCE_CATEGORY / TREASURY_ACCOUNT (source_key = _uuid) → ບັນຊີໃນຜັງ (account_id).
 * ຕາຕະລາງສ້າງດ້ວຍ autoSync; ບົດບາດເລີ່ມຕົ້ນ ໃສ່ໃຫ້ຕອນເປີດ server (controllers/bansi/glSeed.ts)
 */
class GlMapping extends Model {
  public _uuid!: number;
  public source_type!: string;
  public source_key!: string;
  public account_id!: number;
  public createdAt!: Date;
  public updatedAt!: Date;
}

GlMapping.init(
  {
    _uuid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    source_type: { type: DataTypes.STRING(30), allowNull: false },
    source_key: { type: DataTypes.STRING(50), allowNull: false },
    account_id: { type: DataTypes.INTEGER, allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: "GlMapping",
    tableName: "tbl_gl_mapping",
    timestamps: true,
  }
);

autoSync(GlMapping);
export default GlMapping;
