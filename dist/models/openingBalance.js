"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
const fiscalYear_1 = __importDefault(require("./fiscalYear"));
const treasuryAcount_1 = __importDefault(require("./treasuryAcount"));
/** ຍອດຍົກມາຕົ້ນປີການເງິນ ຂອງແຕ່ລະບັນຊີເງິນຄັງ — ໜຶ່ງບັນຊີມີໄດ້ແຖວດຽວຕໍ່ປີ (UNIQUE fiscal_id + account_id) */
class OpeningBalance extends sequelize_1.Model {
}
OpeningBalance.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true
    },
    fiscal_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    account_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    balance_usable: {
        type: sequelize_1.DataTypes.DECIMAL(16, 2),
        allowNull: false,
        defaultValue: 0
    },
    balance_held: {
        type: sequelize_1.DataTypes.DECIMAL(16, 2),
        allowNull: false,
        defaultValue: 0
    },
    description: sequelize_1.DataTypes.STRING(255),
    createby: sequelize_1.DataTypes.STRING(100),
    status: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false, defaultValue: 1
    },
    createdAt: {
        type: sequelize_1.DataTypes.DATE,
        defaultValue: sequelize_1.DataTypes.NOW
    },
    updatedAt: {
        type: sequelize_1.DataTypes.DATE,
        defaultValue: sequelize_1.DataTypes.NOW
    },
}, { sequelize: database_1.default, modelName: "OpeningBalance", tableName: "tbl_opening_balance", timestamps: true });
OpeningBalance.belongsTo(fiscalYear_1.default, {
    foreignKey: "fiscal_id", as: "fiscal"
});
OpeningBalance.belongsTo(treasuryAcount_1.default, {
    foreignKey: "account_id", as: "account"
});
(0, autoSync_1.autoSync)(OpeningBalance);
exports.default = OpeningBalance;
