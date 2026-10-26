"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
/**
 * ໄຟລ໌ຕິດຕັ້ງແອັບພະນັກງານ (OAC HR) ທີ່ HR ອັບໂຫຼດໃນເວັບ — ແອັບກວດ GET /app/release: build_number ສູງກວ່າຂອງເຄື່ອງ
 * = ຂຶ້ນແຖບ "ມີເວີຊັນໃໝ່" ໃຫ້ກົດອັບເດດເອງ. ໄຟລ໌ຢູ່ uploads/app (ດາວໂຫຼດຜ່ານ /image/app/<file_name>).
 * build_number / version_name ອ່ານຈາກ APK ເອງ (utils/apkInfo) — ບໍ່ໃຫ້ພິມ ກັນໃສ່ຜິດ
 */
class AppRelease extends sequelize_1.Model {
}
AppRelease.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    /** android (iPhone ອັບເດດຜ່ານ TestFlight / App Store) */
    platform: {
        type: sequelize_1.DataTypes.STRING(10),
        allowNull: false,
        defaultValue: "android"
    },
    version_name: sequelize_1.DataTypes.STRING(30),
    build_number: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    file_name: {
        type: sequelize_1.DataTypes.STRING(100),
        allowNull: false
    },
    /** byte */
    file_size: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    /** ມີຫຍັງໃໝ່ — ສະແດງໃນແອັບກ່ອນກົດອັບເດດ */
    notes: sequelize_1.DataTypes.STRING(1000),
    createdbyid: sequelize_1.DataTypes.INTEGER,
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
    modelName: "AppRelease",
    tableName: "tbl_app_release",
    timestamps: true
});
(0, autoSync_1.autoSync)(AppRelease);
exports.default = AppRelease;
