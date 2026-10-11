"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
const journalType_1 = __importDefault(require("./journalType"));
/**
 * ຮູບແບບເລກທີເອກະສານ ເຊັ່ນ RV-2026-00015 = prefix + sep + ປີ(+ເດືອນ) + sep + ເລກລຳດັບ (digits ຕົວ).
 * year_format: 0 ບໍ່ໃສ່ປີ, 2 = YY, 4 = YYYY; reset_period: 0 ບໍ່ເລີ່ມໃໝ່, 1 ທຸກປີ, 2 ທຸກເດືອນ.
 * next_number = ເລກທີ່ຈະອອກຕໍ່ໄປ ໃນງວດ period_key (ເຊັ່ນ "2026" ຫຼື "2026-09")
 */
class DocNumbering extends sequelize_1.Model {
}
DocNumbering.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true
    },
    doc_code: {
        type: sequelize_1.DataTypes.STRING(30),
        allowNull: false
    },
    name: {
        type: sequelize_1.DataTypes.STRING(150),
        allowNull: false
    },
    journal_id: sequelize_1.DataTypes.INTEGER,
    prefix: {
        type: sequelize_1.DataTypes.STRING(20),
        allowNull: false, defaultValue: ""
    },
    sep: {
        type: sequelize_1.DataTypes.STRING(3),
        allowNull: false,
        defaultValue: "-"
    },
    year_format: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 4
    },
    with_month: {
        type: sequelize_1.DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 0
    },
    digits: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 5
    },
    reset_period: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
    },
    next_number: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
    },
    period_key: sequelize_1.DataTypes.STRING(10),
    description: sequelize_1.DataTypes.STRING(255),
    status: {
        type: sequelize_1.DataTypes.INTEGER,
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
}, { sequelize: database_1.default,
    modelName: "DocNumbering",
    tableName: "tbl_doc_numbering",
    timestamps: true });
DocNumbering.belongsTo(journalType_1.default, {
    foreignKey: "journal_id", as: "journal"
});
(0, autoSync_1.autoSync)(DocNumbering);
exports.default = DocNumbering;
