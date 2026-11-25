"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
/**
 * ເອກະສານຂອງບໍລິສັດ — ໃບທະບຽນວິສາຫະກິດ, ໃບທະບຽນອາກອນ, ໃບອະນຸຍາດດຳເນີນທຸລະກິດ (ນາຍໜ້າປະກັນໄພ…), ອື່ນໆ.
 * expiry_date null = ບໍ່ມີວັນໝົດອາຍຸ; ໄຟລ໌ 1 ໄຟລ໌ (ຮູບ / PDF) ຢູ່ private/company-documents ດາວໂຫຼດຜ່ານ API ເທົ່ານັ້ນ
 */
class CompanyDocument extends sequelize_1.Model {
}
CompanyDocument.init({
    _uuid: { type: sequelize_1.DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    doc_type: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 4 },
    title: { type: sequelize_1.DataTypes.STRING(150), allowNull: false },
    doc_no: sequelize_1.DataTypes.STRING(80),
    issued_by: sequelize_1.DataTypes.STRING(150),
    issue_date: sequelize_1.DataTypes.DATEONLY,
    expiry_date: sequelize_1.DataTypes.DATEONLY,
    note: sequelize_1.DataTypes.TEXT,
    file_name: sequelize_1.DataTypes.STRING(200),
    original_name: sequelize_1.DataTypes.STRING(255),
    mime_type: sequelize_1.DataTypes.STRING(100),
    file_size: sequelize_1.DataTypes.INTEGER,
    createdbyid: sequelize_1.DataTypes.INTEGER,
    createdAt: { type: sequelize_1.DataTypes.DATE, allowNull: false, defaultValue: sequelize_1.DataTypes.NOW },
    updatedAt: { type: sequelize_1.DataTypes.DATE, allowNull: false, defaultValue: sequelize_1.DataTypes.NOW },
}, { sequelize: database_1.default, modelName: "CompanyDocument", tableName: "tbl_company_document", timestamps: false });
(0, autoSync_1.autoSync)(CompanyDocument);
exports.default = CompanyDocument;
