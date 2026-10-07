import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";

/** ແຂວງ — ຂໍ້ມູນຕັ້ງຕົ້ນ 18 ແຂວງ ໃສ່ໃຫ້ຕອນເປີດ server (utils/seedDefaults.ts, utils/laoAddress.ts) */
class Province extends Model {
  public _uuid!: number;
  public province_name!: string;
}

Province.init(
  {
    _uuid: {
      type: DataTypes.INTEGER,
      primaryKey: true
    },
    province_name: {
      type: DataTypes.STRING(150),
      allowNull: false
    },
  },
  {
    sequelize,
    modelName: "Province",
    tableName: "tbl_province",
    timestamps: false
  }
);

autoSync(Province);
export default Province;
