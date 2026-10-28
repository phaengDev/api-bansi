import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";

/**
 * ການໃຊ້ຜູ້ຊ່ວຍ AI (Claude) ຂອງພະນັກງານແຕ່ລະມື້ — ຈຳກັດຈຳນວນຄັ້ງຕໍ່ມື້ (AI_DAILY_LIMIT) ແລະ ນັບ token ໄວ້ຄິດຄ່າໃຊ້ຈ່າຍ.
 * 1 ແຖວ ຕໍ່ ພະນັກງານ ຕໍ່ ມື້
 */
class AiUsage extends Model {
  public _uuid!: number;
  public employee_id!: number;
  public usage_date!: string;
  public requests!: number;
  public input_tokens!: number;
  public output_tokens!: number;
  public speech_chars!: number;
  public createdAt!: Date;
  public updatedAt!: Date;
}

AiUsage.init(
  {
    _uuid: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    employee_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    usage_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    requests: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    /** ລວມ token ທີ່ cache ແລ້ວ — ຄ່າໃຊ້ຈ່າຍໂດຍປະມານ */
    input_tokens: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    /** ລວມ token ຂອງການຄິດ (thinking) */
    output_tokens: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    /** ຕົວອັກສອນທີ່ອ່ານເປັນສຽງ (Azure Speech ຄິດເງິນຕາມຕົວອັກສອນ) */
    speech_chars: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
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
    modelName: "AiUsage",
    tableName: "tbl_ai_usage",
    timestamps: true
  }
);

autoSync(AiUsage);
export default AiUsage;
