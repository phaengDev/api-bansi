import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";

/**
 * ເອກະສານຂອງບໍລິສັດ — ໃບທະບຽນວິສາຫະກິດ, ໃບທະບຽນອາກອນ, ໃບອະນຸຍາດດຳເນີນທຸລະກິດ (ນາຍໜ້າປະກັນໄພ…), ອື່ນໆ.
 * expiry_date null = ບໍ່ມີວັນໝົດອາຍຸ; ໄຟລ໌ 1 ໄຟລ໌ (ຮູບ / PDF) ຢູ່ private/company-documents ດາວໂຫຼດຜ່ານ API ເທົ່ານັ້ນ
 */
class CompanyDocument extends Model {
  public _uuid!: number;
  public doc_type!: number;
  public title!: string;
  public doc_no!: string | null;
  public issued_by!: string | null;
  public issue_date!: string | null;
  public expiry_date!: string | null;
  public note!: string | null;
  public file_name!: string | null;
  public original_name!: string | null;
  public mime_type!: string | null;
  public file_size!: number | null;
  public createdbyid!: number | null;
  public createdAt!: Date;
  public updatedAt!: Date;
}

CompanyDocument.init(
  {
    _uuid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    doc_type: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 4 },
    title: { type: DataTypes.STRING(150), allowNull: false },
    doc_no: DataTypes.STRING(80),
    issued_by: DataTypes.STRING(150),
    issue_date: DataTypes.DATEONLY,
    expiry_date: DataTypes.DATEONLY,
    note: DataTypes.TEXT,
    file_name: DataTypes.STRING(200),
    original_name: DataTypes.STRING(255),
    mime_type: DataTypes.STRING(100),
    file_size: DataTypes.INTEGER,
    createdbyid: DataTypes.INTEGER,
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { sequelize, modelName: "CompanyDocument", tableName: "tbl_company_document", timestamps: false },
);

autoSync(CompanyDocument);
export default CompanyDocument;
