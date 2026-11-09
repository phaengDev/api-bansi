import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";

/**
 * ລາຍການຕັ້ງຄ່າຂອງຂໍ້ມູນພະນັກງານ ທີ່ HR ເພີ່ມ/ແກ້ຊື່ເອງໄດ້ — kind:
 *  employee_type = ປະເພດພະນັກງານ (ປະຈຳ, ຊົ່ວຄາວ, ຝຶກງານ…), education_level = ລະດັບການສຶກສາ (ປະລິນຍາຕີ…).
 * ທີ່ມີພະນັກງານໃຊ້ຢູ່ ລຶບບໍ່ໄດ້ — ປິດ (status 0) ແທນ
 */
class HrOption extends Model {
  public _uuid!: number;
  public kind!: string;
  public name!: string;
  public sort!: number;
  public status!: number;
  public createdAt!: Date;
  public updatedAt!: Date;
}

HrOption.init(
  {
    _uuid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    kind: { type: DataTypes.STRING(30), allowNull: false },
    name: { type: DataTypes.STRING(150), allowNull: false },
    sort: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    status: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  { sequelize, modelName: "HrOption", tableName: "tbl_hr_option", timestamps: true }
);

autoSync(HrOption);
export default HrOption;
