"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
/**
 * ເຄື່ອງທີ່ຮັບແຈ້ງເຕືອນເດັ້ງຂຶ້ນຈໍ (Firebase Cloud Messaging) ຂອງພະນັກງານ — app ສົ່ງ token ມາຫຼັງເຂົ້າລະບົບ
 * (POST /app/device-token), ອອກຈາກລະບົບ = ລຶບ. 1 ພະນັກງານມີໄດ້ຫຼາຍເຄື່ອງ; token ດຽວເປັນຂອງຄົນດຽວ (UNIQUE) —
 * ເຄື່ອງດຽວປ່ຽນຄົນເຂົ້າລະບົບ = ຍ້າຍໄປຄົນໃໝ່. FCM ບອກວ່າ token ໃຊ້ບໍ່ໄດ້ແລ້ວ = ລຶບເອງ (utils/push)
 */
class DeviceToken extends sequelize_1.Model {
}
DeviceToken.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    employee_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    token: {
        type: sequelize_1.DataTypes.STRING(255),
        allowNull: false,
        unique: true
    },
    /** android | ios */
    platform: sequelize_1.DataTypes.STRING(10),
    /** 1 = ແຈ້ງເຕືອນທີ່ມີສຽງເວົ້າ (ເຊັ່ນ "ຢ່າລືມກົດອອກວຽກ") ໃຊ້ສຽງເວົ້າ, 0 = ຜູ້ໃຊ້ປິດໃນແອັບ → ສຽງທຳມະດາ */
    voice: {
        type: sequelize_1.DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 1
    },
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
    modelName: "DeviceToken",
    tableName: "tbl_device_token",
    timestamps: true
});
(0, autoSync_1.autoSync)(DeviceToken);
exports.default = DeviceToken;
