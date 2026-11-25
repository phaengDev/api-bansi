"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
/**
 * ປະຫວັດການແກ້ໄຂ / ຍົກເລີກ / ລຶບ — ສະເພາະເລື່ອງສຳຄັນ (ເງິນ, ເງິນເດືອນ, ສິດຜູ້ໃຊ້, ຕັ້ງຄ່າ). ບໍ່ເກັບການເພີ່ມ ແລະ ການອ່ານ.
 * changes = JSON { ຊ່ອງ: [ຄ່າເກົ່າ, ຄ່າໃໝ່] } ສະເພາະຊ່ອງທີ່ປ່ຽນ (ລຶບ = ຄ່າໃໝ່ null). ລາຍການຂຽນຫຼັງຕອບກັບແລ້ວ (utils/audit)
 */
class AuditLog extends sequelize_1.Model {
}
AuditLog.init({
    _uuid: { type: sequelize_1.DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    at: { type: sequelize_1.DataTypes.DATE, allowNull: false, defaultValue: sequelize_1.DataTypes.NOW },
    user_id: { type: sequelize_1.DataTypes.INTEGER, allowNull: true },
    action: { type: sequelize_1.DataTypes.STRING(20), allowNull: false },
    entity: { type: sequelize_1.DataTypes.STRING(30), allowNull: false },
    entity_id: { type: sequelize_1.DataTypes.INTEGER, allowNull: true },
    label: { type: sequelize_1.DataTypes.STRING(150), allowNull: true },
    changes: { type: sequelize_1.DataTypes.TEXT, allowNull: true },
}, { sequelize: database_1.default, modelName: "AuditLog", tableName: "tbl_audit_log", timestamps: false });
(0, autoSync_1.autoSync)(AuditLog);
exports.default = AuditLog;
