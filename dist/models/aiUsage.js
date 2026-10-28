"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
/**
 * ການໃຊ້ຜູ້ຊ່ວຍ AI (Claude) ຂອງພະນັກງານແຕ່ລະມື້ — ຈຳກັດຈຳນວນຄັ້ງຕໍ່ມື້ (AI_DAILY_LIMIT) ແລະ ນັບ token ໄວ້ຄິດຄ່າໃຊ້ຈ່າຍ.
 * 1 ແຖວ ຕໍ່ ພະນັກງານ ຕໍ່ ມື້
 */
class AiUsage extends sequelize_1.Model {
}
AiUsage.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    employee_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    usage_date: {
        type: sequelize_1.DataTypes.DATEONLY,
        allowNull: false
    },
    requests: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    /** ລວມ token ທີ່ cache ແລ້ວ — ຄ່າໃຊ້ຈ່າຍໂດຍປະມານ */
    input_tokens: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    /** ລວມ token ຂອງການຄິດ (thinking) */
    output_tokens: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    /** ຕົວອັກສອນທີ່ອ່ານເປັນສຽງ (Azure Speech ຄິດເງິນຕາມຕົວອັກສອນ) */
    speech_chars: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
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
    modelName: "AiUsage",
    tableName: "tbl_ai_usage",
    timestamps: true
});
(0, autoSync_1.autoSync)(AiUsage);
exports.default = AiUsage;
