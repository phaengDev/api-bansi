"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
/**
 * ໂຟນເດີໂນດຂອງພະນັກງານ (app → ເມນູ "ໂນດ") — ຈັດກຸ່ມໂນດ (tbl_note.folder_id); ເຫັນ / ແກ້ໄດ້ສະເພາະເຈົ້າຂອງ.
 * ລຶບໂຟນເດີ = ໂນດຂ້າງໃນຍ້າຍອອກມາຢູ່ນອກ (folder_id = null), ບໍ່ລຶບໂນດ
 */
class NoteFolder extends sequelize_1.Model {
}
NoteFolder.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    employee_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    name: {
        type: sequelize_1.DataTypes.STRING(100),
        allowNull: false
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
    modelName: "NoteFolder",
    tableName: "tbl_note_folder",
    timestamps: true,
    indexes: [{ fields: ["employee_id"] }],
});
(0, autoSync_1.autoSync)(NoteFolder);
exports.default = NoteFolder;
