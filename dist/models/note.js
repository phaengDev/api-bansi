"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
/**
 * ໂນດສ່ວນຕົວຂອງພະນັກງານ (app → ເມນູ "ໂນດ") — ເຫັນ / ແກ້ໄດ້ສະເພາະເຈົ້າຂອງ.
 * marks = ສີ / ໂຕໜາ / ໄຮໄລ້ ຂອງບາງຄຳໃນ body — JSON [{ s, e, c?, b?, h? }] (s–e = ຕຳແໜ່ງຕົວອັກສອນ), null = ຕົວໜັງສືທຳມະດາ.
 * ink = ຮູບຂີດແຕ້ມດ້ວຍນິ້ວ / ປາກກາ ເປັນ JSON ເສັ້ນ vector ຈາກ app ({ w, h, strokes: [{ c, s, p: [x, y, …] }] }) — null = ບໍ່ມີຮູບ.
 * folder_id = ໂຟນເດີ (tbl_note_folder) — null = ຢູ່ນອກໂຟນເດີ.
 * color = ສີພື້ນບັດໂນດ "#RRGGBB" (null = ຂາວ); pinned = ປັກໝຸດໄວ້ເທິງສຸດ
 */
class Note extends sequelize_1.Model {
}
Note.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    employee_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    folder_id: sequelize_1.DataTypes.INTEGER,
    title: sequelize_1.DataTypes.STRING(255),
    body: sequelize_1.DataTypes.TEXT,
    marks: sequelize_1.DataTypes.TEXT,
    ink: sequelize_1.DataTypes.TEXT("medium"),
    color: sequelize_1.DataTypes.STRING(16),
    pinned: {
        type: sequelize_1.DataTypes.TINYINT,
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
    modelName: "Note",
    tableName: "tbl_note",
    timestamps: true,
    indexes: [{ fields: ["employee_id"] }],
});
(0, autoSync_1.autoSync)(Note);
exports.default = Note;
