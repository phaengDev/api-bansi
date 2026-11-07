import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";
import FinanceCategories from "./typeIncomeModel";

/**
 * ລາຍການຍ່ອຍຂອງປະເພດລາຍຮັບ / ລາຍຈ່າຍ (ເຊັ່ນ ປະເພດ "ບໍລິຫານຫ້ອງການ" → ຄ່ານ້ຳ, ຄ່າໄຟຟ້າ, ຄ່າຂີ້ເຫຍື້ອ).
 * ລາຍຮັບ / ລາຍຈ່າຍເກັບສະເພາະ sub_category_id — ປະເພດອ່ານຜ່ານ category_id ຂອງລາຍການຍ່ອຍ (ບໍ່ເກັບຊ້ຳ).
 * ມີລາຍການໃຊ້ຢູ່ ລຶບ = status 0 (ລາຍການເກົ່າຍັງສະແດງຊື່)
 */
class FinanceSubCategory extends Model {
  public _uuid!: number;
  public category_id!: number;
  public name!: string;
  public sort!: number;
  public status!: number;
  public createdAt!: Date;
  public updatedAt!: Date;
}

FinanceSubCategory.init(
  {
    _uuid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    category_id: { type: DataTypes.INTEGER, allowNull: false },
    name: { type: DataTypes.STRING(150), allowNull: false },
    sort: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  { sequelize, modelName: "FinanceSubCategory", tableName: "tbl_finance_subcategory", timestamps: true }
);

FinanceCategories.hasMany(FinanceSubCategory, { foreignKey: "category_id", as: "subs", constraints: false });
FinanceSubCategory.belongsTo(FinanceCategories, { foreignKey: "category_id", as: "category", constraints: false });

autoSync(FinanceSubCategory);
export default FinanceSubCategory;
