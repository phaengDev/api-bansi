import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";

/**
 * ທະບຽນຊັບສົມບັດຄົງທີ່ — ຄ່າຫຼຸ້ຍຫ້ຽນແບບເສັ້ນຊື່ ລາຍເດືອນ: (ລາຄາທຶນ − ມູນຄ່າຊາກ) ÷ ອາຍຸການໃຊ້ (ເດືອນ),
 * ເລີ່ມເດືອນຂອງ depreciation_start. opening_accumulated = ຄ່າຫຼຸ້ຍຫ້ຽນສະສົມກ່ອນເຂົ້າລະບົບ.
 * acquisition_mode: 0 = ການຊື້ບັນທຶກຜ່ານ ລາຍຈ່າຍ/ເຈົ້າໜີ້ ແລ້ວ (ບໍ່ລົງບັນຊີຊ້ຳ), 1 = ຍອດຍົກມາ (ລົງ ໜີ້ ຊັບສົມບັດ / ມີ ທຶນຍອດຍົກມາ
 * ແລະ ຄ່າຫຼຸ້ຍຫ້ຽນສະສົມຍົກມາ ວັນທີ opening_date). status: 1 ໃຊ້ງານ, 2 ຈຳໜ່າຍ/ຂາຍ ແລ້ວ
 */
class FixedAsset extends Model {
  declare _uuid: number;
  declare asset_code: string;
  declare name: string;
  declare asset_account_id: number;
  declare accum_account_id: number | null;
  declare expense_account_id: number | null;
  declare acquisition_date: string;
  declare depreciation_start: string;
  declare cost: string;
  declare salvage_value: string;
  declare useful_life_months: number;
  declare opening_accumulated: string;
  declare acquisition_mode: number;
  declare opening_date: string | null;
  declare location: string | null;
  declare serial_no: string | null;
  declare note: string | null;
  declare status: number;
  declare disposal_date: string | null;
  declare disposal_note: string | null;
  declare created_by: number | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

const money = () => ({ type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0 });

FixedAsset.init(
  {
    _uuid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    asset_code: { type: DataTypes.STRING(30), allowNull: false },
    name: { type: DataTypes.STRING(200), allowNull: false },
    asset_account_id: { type: DataTypes.INTEGER, allowNull: false },
    accum_account_id: DataTypes.INTEGER,
    expense_account_id: DataTypes.INTEGER,
    acquisition_date: { type: DataTypes.DATEONLY, allowNull: false },
    depreciation_start: { type: DataTypes.DATEONLY, allowNull: false },
    cost: money(),
    salvage_value: money(),
    useful_life_months: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 60 },
    opening_accumulated: money(),
    acquisition_mode: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
    opening_date: DataTypes.DATEONLY,
    location: DataTypes.STRING(150),
    serial_no: DataTypes.STRING(100),
    note: DataTypes.STRING(255),
    status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    disposal_date: DataTypes.DATEONLY,
    disposal_note: DataTypes.STRING(255),
    created_by: DataTypes.INTEGER,
    createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  { sequelize, modelName: "FixedAsset", tableName: "tbl_fixed_asset", timestamps: true }
);

/** ຄ່າຫຼຸ້ຍຫ້ຽນທີ່ລົງແລ້ວ — ແຖວລະຊັບສົມບັດຕໍ່ເດືອນ (period = YYYY-MM), entry_id = ໃບບັນທຶກ DEPRECIATION ຂອງເດືອນນັ້ນ */
export class FixedAssetDepreciation extends Model {
  declare _uuid: number;
  declare asset_id: number;
  declare period: string;
  declare amount: string;
  declare entry_id: number | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

FixedAssetDepreciation.init(
  {
    _uuid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    asset_id: { type: DataTypes.INTEGER, allowNull: false },
    period: { type: DataTypes.STRING(7), allowNull: false },
    amount: money(),
    entry_id: DataTypes.INTEGER,
    createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  { sequelize, modelName: "FixedAssetDepreciation", tableName: "tbl_fixed_asset_depreciation", timestamps: true }
);

autoSync(FixedAsset);
autoSync(FixedAssetDepreciation);
export default FixedAsset;
