"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
const district_1 = __importDefault(require("./district"));
/**
 * ຂໍ້ມູນບໍລິສັດ — ມີແຖວດຽວ. ທີ່ຢູ່ເກັບແຕ່ district_id (ແຂວງເອົາຈາກ tbl_district.province_id). ພິກັດ + scan_radius (ແມັດ) = ຂອບເຂດທີ່ພະນັກງານສະແກນເຂົ້າ-ອອກວຽກໄດ້.
 * QR ສະແກນເຂົ້າ-ອອກວຽກ: scan_token = ລະຫັດລັບໃນ QR ທີ່ຕິດໄວ້ບໍລິສັດ (ສ້າງໃໝ່ = QR ເກົ່າໃຊ້ບໍ່ໄດ້), scan_require_qr = 1
 * ຕ້ອງສະແກນ QR ນຳ (ນອກຈາກ GPS). scan_token ບໍ່ສົ່ງອອກທາງ GET /company — ອ່ານໄດ້ສະເພາະ HR ຜ່ານ /company/scan-qr
 * work_start / work_end = "HH:mm", days_off = ວັນພັກປະຈຳອາທິດ "6,0" (0 ອາທິດ … 6 ເສົາ ຄື Date.getDay())
 */
class Company extends sequelize_1.Model {
}
Company.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name_la: {
        type: sequelize_1.DataTypes.STRING(200),
        allowNull: false
    },
    name_en: sequelize_1.DataTypes.STRING(200),
    logo: sequelize_1.DataTypes.STRING(255),
    phone1: sequelize_1.DataTypes.STRING(30),
    phone2: sequelize_1.DataTypes.STRING(30),
    district_id: sequelize_1.DataTypes.INTEGER,
    village: sequelize_1.DataTypes.STRING(150),
    latitude: sequelize_1.DataTypes.DECIMAL(10, 7),
    longitude: sequelize_1.DataTypes.DECIMAL(10, 7),
    scan_radius: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 50
    },
    scan_require_qr: {
        type: sequelize_1.DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 0
    },
    scan_token: sequelize_1.DataTypes.STRING(64),
    scan_token_at: sequelize_1.DataTypes.DATE,
    work_start: {
        type: sequelize_1.DataTypes.STRING(5),
        allowNull: false,
        defaultValue: "08:00"
    },
    work_end: {
        type: sequelize_1.DataTypes.STRING(5),
        allowNull: false,
        defaultValue: "17:00"
    },
    days_off: {
        type: sequelize_1.DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "6,0"
    },
    updatedbyid: sequelize_1.DataTypes.INTEGER,
    createdAt: {
        type: sequelize_1.DataTypes.DATE,
        defaultValue: sequelize_1.DataTypes.NOW
    },
    updatedAt: {
        type: sequelize_1.DataTypes.DATE,
        defaultValue: sequelize_1.DataTypes.NOW
    },
}, {
    sequelize: database_1.default,
    modelName: "Company",
    tableName: "tbl_company",
    timestamps: true
});
Company.belongsTo(district_1.default, { foreignKey: "district_id", as: "district" });
(0, autoSync_1.autoSync)(Company);
exports.default = Company;
