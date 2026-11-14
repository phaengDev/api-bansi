import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";

/**
 * ໂນດສ່ວນຕົວຂອງພະນັກງານ (app → ເມນູ "ໂນດ") — ເຫັນ / ແກ້ໄດ້ສະເພາະເຈົ້າຂອງ.
 * marks = ສີ / ໂຕໜາ / ໄຮໄລ້ ຂອງບາງຄຳໃນ body — JSON [{ s, e, c?, b?, h? }] (s–e = ຕຳແໜ່ງຕົວອັກສອນ), null = ຕົວໜັງສືທຳມະດາ.
 * ink = ຮູບຂີດແຕ້ມດ້ວຍນິ້ວ / ປາກກາ ເປັນ JSON ເສັ້ນ vector ຈາກ app ({ w, h, strokes: [{ c, s, p: [x, y, …] }] }) — null = ບໍ່ມີຮູບ.
 * folder_id = ໂຟນເດີ (tbl_note_folder) — null = ຢູ່ນອກໂຟນເດີ.
 * color = ສີພື້ນບັດໂນດ "#RRGGBB" (null = ຂາວ); pinned = ປັກໝຸດໄວ້ເທິງສຸດ
 */
class Note extends Model {
  public _uuid!: number;
  public employee_id!: number;
  public folder_id!: number | null;
  public title!: string | null;
  public body!: string | null;
  public marks!: string | null;
  public ink!: string | null;
  public color!: string | null;
  public pinned!: number;
  public createdAt!: Date;
  public updatedAt!: Date;
}

Note.init(
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
    folder_id: DataTypes.INTEGER,
    title: DataTypes.STRING(255),
    body: DataTypes.TEXT,
    marks: DataTypes.TEXT,
    ink: DataTypes.TEXT("medium"),
    color: DataTypes.STRING(16),
    pinned: {
      type: DataTypes.TINYINT,
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
    modelName: "Note",
    tableName: "tbl_note",
    timestamps: true,
    indexes: [{ fields: ["employee_id"] }],
  }
);

autoSync(Note);

export default Note;
