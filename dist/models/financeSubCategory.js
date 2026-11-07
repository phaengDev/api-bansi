"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
const typeIncomeModel_1 = __importDefault(require("./typeIncomeModel"));
/**
 * ລາຍການຍ່ອຍຂອງປະເພດລາຍຮັບ / ລາຍຈ່າຍ (ເຊັ່ນ ປະເພດ "ບໍລິຫານຫ້ອງການ" → ຄ່ານ້ຳ, ຄ່າໄຟຟ້າ, ຄ່າຂີ້ເຫຍື້ອ).
 * ລາຍຮັບ / ລາຍຈ່າຍເກັບສະເພາະ sub_category_id — ປະເພດອ່ານຜ່ານ category_id ຂອງລາຍການຍ່ອຍ (ບໍ່ເກັບຊ້ຳ).
 * ມີລາຍການໃຊ້ຢູ່ ລຶບ = status 0 (ລາຍການເກົ່າຍັງສະແດງຊື່)
 */
class FinanceSubCategory extends sequelize_1.Model {
}
FinanceSubCategory.init({
    _uuid: { type: sequelize_1.DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    category_id: { type: sequelize_1.DataTypes.INTEGER, allowNull: false },
    name: { type: sequelize_1.DataTypes.STRING(150), allowNull: false },
    sort: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    status: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    createdAt: { type: sequelize_1.DataTypes.DATE, defaultValue: sequelize_1.DataTypes.NOW },
    updatedAt: { type: sequelize_1.DataTypes.DATE, defaultValue: sequelize_1.DataTypes.NOW },
}, { sequelize: database_1.default, modelName: "FinanceSubCategory", tableName: "tbl_finance_subcategory", timestamps: true });
typeIncomeModel_1.default.hasMany(FinanceSubCategory, { foreignKey: "category_id", as: "subs", constraints: false });
FinanceSubCategory.belongsTo(typeIncomeModel_1.default, { foreignKey: "category_id", as: "category", constraints: false });
(0, autoSync_1.autoSync)(FinanceSubCategory);
exports.default = FinanceSubCategory;
