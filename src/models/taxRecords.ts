import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";
import TreasuryAccount from "./treasuryAcount";

const money = () => ({ type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0 });
const stamps = () => ({
  createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
});

/**
 * ການຄິດອາກອນກຳໄລຂອງປີການເງິນ (ແຖວດຽວຕໍ່ປີ): ກຳໄລກ່ອນອາກອນ (ຈາກສະໝຸດບັນຊີ ຕອນຄິດ) + ລາຍຈ່າຍທີ່ບໍ່ຫັກໄດ້ − ລາຍຮັບທີ່ບໍ່ຕ້ອງເສຍ
 * = ກຳໄລເສຍອາກອນ × ອັດຕາ. ລົງບັນຊີ PROFIT_TAX (source_id FY-{fiscal_id}): ໜີ້ ລາຍຈ່າຍອາກອນກຳໄລ / ມີ ອາກອນກຳໄລຄ້າງຈ່າຍ
 */
export class ProfitTax extends Model {
  declare _uuid: number;
  declare fiscal_id: number;
  declare profit_before_tax: string;
  declare add_back: string;
  declare deduction: string;
  declare rate: string;
  declare taxable: string;
  declare tax: string;
  declare entry_date: string | null;
  declare note: string | null;
  declare created_by: number | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

ProfitTax.init(
  {
    _uuid: { 
      type: DataTypes.INTEGER, 
      primaryKey: true, 
      autoIncrement: true 
    },
    fiscal_id: { 
      type: DataTypes.INTEGER, 
      allowNull: false 
    },
    profit_before_tax: money(),
    add_back: money(),
    deduction: money(),
    rate: { 
       type: DataTypes.DECIMAL(5, 2),
       allowNull: false, 
       defaultValue: 20 },
    taxable: money(),
    tax: money(),
    entry_date: DataTypes.DATEONLY,
    note: DataTypes.STRING(255),
    created_by: DataTypes.INTEGER,
    ...stamps(),
  },
  { sequelize, 
    modelName: "ProfitTax", 
    tableName: "tbl_profit_tax", 
    timestamps: true }
);

/**
 * ອາກອນຫັກ ນ ທີ່ຈ່າຍ — ແຕ່ລະຄັ້ງທີ່ຫັກອາກອນໄວ້ຈາກການຈ່າຍ (ຜູ້ໃຫ້ບໍລິການຕ່າງປະເທດ, ເງິນປັນຜົນ, ດອກເບ້ຍ…).
 * ລົງບັນຊີ WHT (source_id = _uuid): ໜີ້ debit_account (ລາຍຈ່າຍ ຫຼື ເຈົ້າໜີ້) / ມີ ອາກອນຫັກ ນ ທີ່ຈ່າຍ ຄ້າງນຳສົ່ງ.
 * income_type: 1 ບໍລິການຈາກຕ່າງປະເທດ, 2 ເງິນປັນຜົນ, 3 ດອກເບ້ຍ, 4 ຄ່າລິຂະສິດ, 5 ຄ່າເຊົ່າ, 6 ຄ່ານາຍໜ້າ/ທີ່ປຶກສາ/ຄ່າບໍລິການ,
 *   7 ກໍ່ສ້າງ-ສ້ອມແປງ, 8 ຂາຍອອນລາຍ, 9 ອື່ນໆ (ກົດໝາຍອາກອນລາຍໄດ້ 2025). status 1 ໃຊ້, 2 ຍົກເລີກ
 */
export class WithholdingTax extends Model {
  declare _uuid: number;
  declare wht_date: string;
  declare payee_name: string;
  declare payee_tax_id: string | null;
  declare income_type: number;
  declare gross_amount: string;
  declare rate: string;
  declare wht_amount: string;
  declare reference: string | null;
  declare debit_account_id: number | null;
  declare note: string | null;
  declare status: number;
  declare created_by: number | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

WithholdingTax.init(
  {
    _uuid: { 
      type: DataTypes.INTEGER, 
      primaryKey: true, 
      autoIncrement: true 
    },
    wht_date: { 
      type: DataTypes.DATEONLY, 
      allowNull: false 
    },
    payee_name: { 
      type: DataTypes.STRING(200), 
      allowNull: false },
    payee_tax_id: DataTypes.STRING(50),
    income_type: { 
      type: DataTypes.TINYINT, 
      allowNull: false, 
      defaultValue: 1 
    },
    gross_amount: money(),
    rate: { 
      type: DataTypes.DECIMAL(5, 2), 
      allowNull: false, 
      defaultValue: 0 
    },
    wht_amount: money(),
    reference: DataTypes.STRING(100),
    debit_account_id: DataTypes.INTEGER,
    note: DataTypes.STRING(255),
    status: { 
      type: DataTypes.TINYINT, 
      allowNull: false, 
      defaultValue: 1 },
    created_by: DataTypes.INTEGER,
    ...stamps(),
  },
  { sequelize, 
    modelName: "WithholdingTax", 
    tableName: "tbl_withholding_tax", 
    timestamps: true 
  }
);

/**
 * ນຳສົ່ງອາກອນໃຫ້ລັດ — ລ້າງຍອດອາກອນຄ້າງຈ່າຍ (ຮອດວັນທີ period_end) ດ້ວຍເງິນຈາກບັນຊີເງິນຄັງສະກຸນກີບ.
 * tax_kind: 1 ອາກອນມູນຄ່າເພີ່ມ (ໜີ້ ຂາອອກ / ມີ ຂາເຂົ້າ + ເງິນ — vat_output/vat_input = ຍອດທີ່ຫັກກັນ),
 * 2 ອາກອນລາຍໄດ້ເງິນເດືອນ, 3 ປະກັນສັງຄົມ, 4 ອາກອນຫັກ ນ ທີ່ຈ່າຍ, 5 ອາກອນກຳໄລ (ໜີ້ ຄ້າງຈ່າຍ / ມີ ເງິນ).
 * status 1 ໃຊ້, 2 ຍົກເລີກ. ລົງບັນຊີ TAX_PAYMENT (source_id = _uuid), ເງິນອອກ = tbl_account_movement TAX_PAYMENT
 */
export class TaxPayment extends Model {
  declare _uuid: number;
  declare number: string | null;
  declare tax_kind: number;
  declare period_end: string;
  declare pay_date: string;
  declare treasury_account_id: number;
  declare amount: string;
  declare vat_output: string;
  declare vat_input: string;
  declare reference: string | null;
  declare note: string | null;
  declare status: number;
  declare created_by: number | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

TaxPayment.init(
  {
    _uuid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    number: DataTypes.STRING(30),
    tax_kind: { type: DataTypes.TINYINT, allowNull: false },
    period_end: { type: DataTypes.DATEONLY, allowNull: false },
    pay_date: { type: DataTypes.DATEONLY, allowNull: false },
    treasury_account_id: { type: DataTypes.INTEGER, allowNull: false },
    amount: money(),
    vat_output: money(),
    vat_input: money(),
    reference: DataTypes.STRING(100),
    note: DataTypes.STRING(255),
    status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    created_by: DataTypes.INTEGER,
    ...stamps(),
  },
  { sequelize, modelName: "TaxPayment", tableName: "tbl_tax_payment", timestamps: true }
);

autoSync(ProfitTax);
autoSync(WithholdingTax);
autoSync(TaxPayment);

TaxPayment.belongsTo(TreasuryAccount, { foreignKey: "treasury_account_id", as: "account", constraints: false });
