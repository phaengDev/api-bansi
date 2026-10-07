import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";
import Province from "./province";

/** ເມືອງ — ຂໍ້ມູນຕັ້ງຕົ້ນ 148 ເມືອງ ໃສ່ໃຫ້ຕອນເປີດ server (utils/seedDefaults.ts, utils/laoAddress.ts) */
class District extends Model {
  public _uuid!: number;
  public province_id!: number;
  public district_name!: string;
}

District.init(
  {
    _uuid: {
      type: DataTypes.INTEGER,
      primaryKey: true
    },
    province_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    district_name: {
      type: DataTypes.STRING(150),
      allowNull: false
    },
  },
  {
    sequelize,
    modelName: "District",
    tableName: "tbl_district",
    timestamps: false
  }
);

District.belongsTo(Province, { foreignKey: "province_id", as: "province" });
Province.hasMany(District, { foreignKey: "province_id", as: "districts" });

autoSync(District);
export default District;
