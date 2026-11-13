"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FixedAssetDepreciation = void 0;
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
/**
 * ທະບຽນຊັບສົມບັດຄົງທີ່ — ຄ່າຫຼຸ້ຍຫ້ຽນແບບເສັ້ນຊື່ ລາຍເດືອນ: (ລາຄາທຶນ − ມູນຄ່າຊາກ) ÷ ອາຍຸການໃຊ້ (ເດືອນ),
 * ເລີ່ມເດືອນຂອງ depreciation_start. opening_accumulated = ຄ່າຫຼຸ້ຍຫ້ຽນສະສົມກ່ອນເຂົ້າລະບົບ.
 * acquisition_mode: 0 = ການຊື້ບັນທຶກຜ່ານ ລາຍຈ່າຍ/ເຈົ້າໜີ້ ແລ້ວ (ບໍ່ລົງບັນຊີຊ້ຳ), 1 = ຍອດຍົກມາ (ລົງ ໜີ້ ຊັບສົມບັດ / ມີ ທຶນຍອດຍົກມາ
 * ແລະ ຄ່າຫຼຸ້ຍຫ້ຽນສະສົມຍົກມາ ວັນທີ opening_date). status: 1 ໃຊ້ງານ, 2 ຈຳໜ່າຍ/ຂາຍ ແລ້ວ
 */
class FixedAsset extends sequelize_1.Model {
}
const money = () => ({ type: sequelize_1.DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0 });
FixedAsset.init({
    _uuid: { type: sequelize_1.DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    asset_code: { type: sequelize_1.DataTypes.STRING(30), allowNull: false },
    name: { type: sequelize_1.DataTypes.STRING(200), allowNull: false },
    asset_account_id: { type: sequelize_1.DataTypes.INTEGER, allowNull: false },
    accum_account_id: sequelize_1.DataTypes.INTEGER,
    expense_account_id: sequelize_1.DataTypes.INTEGER,
    acquisition_date: { type: sequelize_1.DataTypes.DATEONLY, allowNull: false },
    depreciation_start: { type: sequelize_1.DataTypes.DATEONLY, allowNull: false },
    cost: money(),
    salvage_value: money(),
    useful_life_months: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, defaultValue: 60 },
    opening_accumulated: money(),
    acquisition_mode: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
    opening_date: sequelize_1.DataTypes.DATEONLY,
    location: sequelize_1.DataTypes.STRING(150),
    serial_no: sequelize_1.DataTypes.STRING(100),
    note: sequelize_1.DataTypes.STRING(255),
    status: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    disposal_date: sequelize_1.DataTypes.DATEONLY,
    disposal_note: sequelize_1.DataTypes.STRING(255),
    created_by: sequelize_1.DataTypes.INTEGER,
    createdAt: { type: sequelize_1.DataTypes.DATE, defaultValue: sequelize_1.DataTypes.NOW },
    updatedAt: { type: sequelize_1.DataTypes.DATE, defaultValue: sequelize_1.DataTypes.NOW },
}, { sequelize: database_1.default, modelName: "FixedAsset", tableName: "tbl_fixed_asset", timestamps: true });
/** ຄ່າຫຼຸ້ຍຫ້ຽນທີ່ລົງແລ້ວ — ແຖວລະຊັບສົມບັດຕໍ່ເດືອນ (period = YYYY-MM), entry_id = ໃບບັນທຶກ DEPRECIATION ຂອງເດືອນນັ້ນ */
class FixedAssetDepreciation extends sequelize_1.Model {
}
exports.FixedAssetDepreciation = FixedAssetDepreciation;
FixedAssetDepreciation.init({
    _uuid: { type: sequelize_1.DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    asset_id: { type: sequelize_1.DataTypes.INTEGER, allowNull: false },
    period: { type: sequelize_1.DataTypes.STRING(7), allowNull: false },
    amount: money(),
    entry_id: sequelize_1.DataTypes.INTEGER,
    createdAt: { type: sequelize_1.DataTypes.DATE, defaultValue: sequelize_1.DataTypes.NOW },
    updatedAt: { type: sequelize_1.DataTypes.DATE, defaultValue: sequelize_1.DataTypes.NOW },
}, { sequelize: database_1.default, modelName: "FixedAssetDepreciation", tableName: "tbl_fixed_asset_depreciation", timestamps: true });
(0, autoSync_1.autoSync)(FixedAsset);
(0, autoSync_1.autoSync)(FixedAssetDepreciation);
exports.default = FixedAsset;
