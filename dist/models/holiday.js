"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
/**
 * ວັນພັກທົ່ວບໍລິສັດ (ນອກຈາກວັນພັກປະຈຳອາທິດ) — ພະນັກງານທຸກຄົນພັກ, UNIQUE holiday_date.
 * kind: 1 ທາງການ (ວັນພັກລັດຖະການທີ່ລັດຖະບານກຳນົດ), 2 ບໍ່ເປັນທາງການ (ບໍລິສັດປະກາດພັກເອງ ເຊັ່ນ ພາພະນັກງານໄປທ່ຽວ, ພັກພິເສດ).
 * ມື້ນີ້ບໍ່ນັບເປັນມື້ເຮັດວຽກ: ບໍ່ສະແກນກໍ່ບໍ່ເປັນຂາດວຽກ ແລະ ບໍ່ນັບໃນວັນເຮັດວຽກຂອງເດືອນ (ເງິນເດືອນ)
 */
class Holiday extends sequelize_1.Model {
}
Holiday.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    holiday_date: {
        type: sequelize_1.DataTypes.DATEONLY,
        allowNull: false
    },
    name: {
        type: sequelize_1.DataTypes.STRING(150),
        allowNull: false
    },
    kind: {
        type: sequelize_1.DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 1
    },
    createdbyid: sequelize_1.DataTypes.INTEGER,
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
    modelName: "Holiday",
    tableName: "tbl_holiday",
    timestamps: true
});
(0, autoSync_1.autoSync)(Holiday);
exports.default = Holiday;
