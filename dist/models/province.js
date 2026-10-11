"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
/** ແຂວງ — ຂໍ້ມູນຕັ້ງຕົ້ນ 18 ແຂວງ ໃສ່ໃຫ້ຕອນເປີດ server (utils/seedDefaults.ts, utils/laoAddress.ts) */
class Province extends sequelize_1.Model {
}
Province.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true
    },
    province_name: {
        type: sequelize_1.DataTypes.STRING(150),
        allowNull: false
    },
}, {
    sequelize: database_1.default,
    modelName: "Province",
    tableName: "tbl_province",
    timestamps: false
});
(0, autoSync_1.autoSync)(Province);
exports.default = Province;
