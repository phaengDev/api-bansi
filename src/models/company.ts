import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";
import District from "./district";

/**
 * ຂໍ້ມູນບໍລິສັດ — ມີແຖວດຽວ. ທີ່ຢູ່ເກັບແຕ່ district_id (ແຂວງເອົາຈາກ tbl_district.province_id). ພິກັດ + scan_radius (ແມັດ) = ຂອບເຂດທີ່ພະນັກງານສະແກນເຂົ້າ-ອອກວຽກໄດ້.
 * work_start / work_end = "HH:mm", days_off = ວັນພັກປະຈຳອາທິດ "6,0" (0 ອາທິດ … 6 ເສົາ ຄື Date.getDay())
 */
class Company extends Model {
  public _uuid!: number;
  public name_la!: string;
  public name_en!: string | null;
  public logo!: string | null;
  public phone1!: string | null;
  public phone2!: string | null;
  public district_id!: number | null;
  public village!: string | null;
  public latitude!: string | null;
  public longitude!: string | null;
  public scan_radius!: number;
  public work_start!: string;
  public work_end!: string;
  public days_off!: string;
  public updatedbyid!: number | null;
  public createdAt!: Date;
  public updatedAt!: Date;
}

Company.init(
  {
    _uuid: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name_la: {
      type: DataTypes.STRING(200),
      allowNull: false
    },
    name_en: DataTypes.STRING(200),
    logo: DataTypes.STRING(255),
    phone1: DataTypes.STRING(30),
    phone2: DataTypes.STRING(30),
    district_id: DataTypes.INTEGER,
    village: DataTypes.STRING(150),
    latitude: DataTypes.DECIMAL(10, 7),
    longitude: DataTypes.DECIMAL(10, 7),
    scan_radius: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 50
    },
    work_start: {
      type: DataTypes.STRING(5),
      allowNull: false,
      defaultValue: "08:00"
    },
    work_end: {
      type: DataTypes.STRING(5),
      allowNull: false,
      defaultValue: "17:00"
    },
    days_off: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "6,0"
    },
    updatedbyid: DataTypes.INTEGER,
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
  },
  {
    sequelize,
    modelName: "Company",
    tableName: "tbl_company",
    timestamps: true
  }
);

Company.belongsTo(District, { foreignKey: "district_id", as: "district" });

autoSync(Company);
export default Company;
