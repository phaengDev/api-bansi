"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
const typeIncomeModel_1 = __importDefault(require("./typeIncomeModel"));
const treasuryAcount_1 = __importDefault(require("./treasuryAcount"));
const userModel_1 = __importDefault(require("./userModel"));
const bankModel_1 = __importDefault(require("./bankModel"));
const partner_1 = __importDefault(require("./partner"));
class Incomes extends sequelize_1.Model {
}
Incomes.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    number: sequelize_1.DataTypes.STRING,
    income_date: sequelize_1.DataTypes.DATEONLY,
    incom_title: sequelize_1.DataTypes.STRING,
    type_incom_fk: sequelize_1.DataTypes.INTEGER,
    type_acountid: sequelize_1.DataTypes.INTEGER,
    acount_id_fk: sequelize_1.DataTypes.INTEGER,
    receive_type: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
    },
    payer_bank_id: sequelize_1.DataTypes.INTEGER,
    payer_account_name: sequelize_1.DataTypes.STRING,
    payer_account_number: sequelize_1.DataTypes.STRING,
    partner_id: sequelize_1.DataTypes.INTEGER,
    payer_name: sequelize_1.DataTypes.STRING,
    balances: sequelize_1.DataTypes.INTEGER,
    tax: sequelize_1.DataTypes.INTEGER,
    balance_income: sequelize_1.DataTypes.INTEGER,
    description: sequelize_1.DataTypes.STRING,
    file_doct: sequelize_1.DataTypes.STRING,
    close: {
        type: sequelize_1.DataTypes.INTEGER,
        defaultValue: 1
    },
    status: {
        type: sequelize_1.DataTypes.INTEGER,
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
    }
}, {
    sequelize: database_1.default,
    modelName: "Incomes",
    tableName: "tbl_incomes",
    timestamps: true,
});
// try {
//   Incomes.sync({ force: true });
//   console.log('Incomes table created successfully');
// } catch (error) {
//   console.log(error);
// }
Incomes.belongsTo(typeIncomeModel_1.default, { foreignKey: "type_incom_fk", as: "typein" });
Incomes.belongsTo(treasuryAcount_1.default, { foreignKey: "acount_id_fk", as: "acount" });
Incomes.belongsTo(userModel_1.default, { foreignKey: "createdbyid", as: "user" });
Incomes.belongsTo(bankModel_1.default, { foreignKey: "payer_bank_id", as: "payerBank" });
Incomes.belongsTo(partner_1.default, { foreignKey: "partner_id", as: "partner", constraints: false });
(0, autoSync_1.autoSync)(Incomes);
exports.default = Incomes;
