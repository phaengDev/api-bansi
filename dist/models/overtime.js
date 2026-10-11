"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
const employee_1 = __importDefault(require("./employee"));
/**
 * ການເຮັດວຽກລ່ວງເວລາ (OT) — HR ບັນທຶກ: ພະນັກງານ, ວັນທີ, ເວລາ (ຂ້າມທ່ຽງຄືນໄດ້), ຈຳນວນຊົ່ວໂມງ ແລະ ປະເພດ.
 * kind = ອັດຕາຕາມກົດໝາຍແຮງງານ (ຕັ້ງຢູ່ ຕັ້ງຄ່າເງິນເດືອນ): 1 ມື້ເຮັດວຽກ, 2 ມື້ເຮັດວຽກ ກາງຄືນ (22:00–05:00),
 * 3 ວັນພັກ (ວັນພັກປະຈຳອາທິດ / ວັນພັກ), 4 ວັນພັກ ກາງຄືນ.
 * pay_type = ວິທີຈ່າຍ: 1 ຕາມອັດຕາ (ຄ່າແຮງຕໍ່ຊົ່ວໂມງຈາກເງິນເດືອນ × % ຂອງ kind), 2 ຕໍ່ຊົ່ວໂມງ (amount × hours),
 * 3 ເໝົາຈ່າຍ (amount ເທື່ອດຽວ ບໍ່ກ່ຽວກັບຊົ່ວໂມງ).
 * ເງິນເດືອນຂອງເດືອນນັ້ນລວມ OT ໃຫ້ອັດຕະໂນມັດ (ໃບຮ່າງ ກົດຄິດໄລ່ໃໝ່); ເດືອນທີ່ຈ່າຍເງິນເດືອນແລ້ວ ແກ້ບໍ່ໄດ້
 */
class Overtime extends sequelize_1.Model {
}
Overtime.init({
    _uuid: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    employee_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    work_date: {
        type: sequelize_1.DataTypes.DATEONLY,
        allowNull: false
    },
    start_time: sequelize_1.DataTypes.STRING(5),
    end_time: sequelize_1.DataTypes.STRING(5),
    hours: {
        type: sequelize_1.DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0
    },
    kind: {
        type: sequelize_1.DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 1
    },
    pay_type: {
        type: sequelize_1.DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 1
    },
    amount: {
        type: sequelize_1.DataTypes.DECIMAL(16, 2),
        allowNull: false,
        defaultValue: 0
    },
    note: sequelize_1.DataTypes.STRING(255),
    createdbyid: sequelize_1.DataTypes.INTEGER,
    updatedbyid: sequelize_1.DataTypes.INTEGER,
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
    modelName: "Overtime",
    tableName: "tbl_overtime",
    timestamps: true
});
Overtime.belongsTo(employee_1.default, { foreignKey: "employee_id", as: "employee", constraints: false });
(0, autoSync_1.autoSync)(Overtime);
exports.default = Overtime;
