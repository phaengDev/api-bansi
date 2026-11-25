import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";

/**
 * ປະຫວັດການແກ້ໄຂ / ຍົກເລີກ / ລຶບ — ສະເພາະເລື່ອງສຳຄັນ (ເງິນ, ເງິນເດືອນ, ສິດຜູ້ໃຊ້, ຕັ້ງຄ່າ). ບໍ່ເກັບການເພີ່ມ ແລະ ການອ່ານ.
 * changes = JSON { ຊ່ອງ: [ຄ່າເກົ່າ, ຄ່າໃໝ່] } ສະເພາະຊ່ອງທີ່ປ່ຽນ (ລຶບ = ຄ່າໃໝ່ null). ລາຍການຂຽນຫຼັງຕອບກັບແລ້ວ (utils/audit)
 */
class AuditLog extends Model {
  public _uuid!: number;
  public at!: Date;
  public user_id!: number | null;
  public action!: string;
  public entity!: string;
  public entity_id!: number | null;
  public label!: string | null;
  public changes!: string | null;
}

AuditLog.init(
  {
    _uuid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    user_id: { type: DataTypes.INTEGER, allowNull: true },
    action: { type: DataTypes.STRING(20), allowNull: false },
    entity: { type: DataTypes.STRING(30), allowNull: false },
    entity_id: { type: DataTypes.INTEGER, allowNull: true },
    label: { type: DataTypes.STRING(150), allowNull: true },
    changes: { type: DataTypes.TEXT, allowNull: true },
  },
  { sequelize, modelName: "AuditLog", tableName: "tbl_audit_log", timestamps: false },
);

autoSync(AuditLog);
export default AuditLog;
