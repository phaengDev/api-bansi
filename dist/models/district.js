"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
const province_1 = __importDefault(require("./province"));
/** ເມືອງ — ຂໍ້ມູນຕັ້ງຕົ້ນ 148 ເມືອງ ໃສ່ໃຫ້ຕອນເປີດ server (utils/seedDefaults.ts, utils/laoAddress.ts) */
class District extends sequelize_1.Model {
}
District.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true
    },
    province_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    district_name: {
        type: sequelize_1.DataTypes.STRING(150),
        allowNull: false
    },
}, {
    sequelize: database_1.default,
    modelName: "District",
    tableName: "tbl_district",
    timestamps: false
});
District.belongsTo(province_1.default, { foreignKey: "province_id", as: "province" });
province_1.default.hasMany(District, { foreignKey: "province_id", as: "districts" });
(0, autoSync_1.autoSync)(District);
exports.default = District;
