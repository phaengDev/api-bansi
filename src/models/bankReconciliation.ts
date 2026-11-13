import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";

/**
 * ກະທົບຍອດທະນາຄານ — ແຕ່ລະຄັ້ງທີ່ທຽບໃບແຈ້ງຍອດ (statement) ຂອງບັນຊີເງິນຄັງ ກັບ ສະໝຸດບັນຊີ:
 * statement_balance = ຍອດໃນໃບແຈ້ງຍອດ ນ statement_date (ສະກຸນຂອງບັນຊີ); ແຖວສະໝຸດບັນຊີທີ່ຕິກວ່າກົງ
 * ຖືກໝາຍ tbl_journal_line.reconciliation_id. book_balance = ຍອດໃນລະບົບ ນ ວັນດຽວກັນ (ສ່ວນຕ່າງ = ລາຍການທີ່ຍັງບໍ່ຜ່ານທະນາຄານ)
 */
class BankReconciliation extends Model {
  declare _uuid: number;
  declare treasury_account_id: number;
  declare statement_date: string;
  declare statement_balance: string;
  declare book_balance: string;
  declare cleared_count: number;
  declare note: string | null;
  declare created_by: number | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

BankReconciliation.init(
  {
    _uuid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    treasury_account_id: { type: DataTypes.INTEGER, allowNull: false },
    statement_date: { type: DataTypes.DATEONLY, allowNull: false },
    statement_balance: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
    book_balance: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
    cleared_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    note: DataTypes.STRING(255),
    created_by: DataTypes.INTEGER,
    createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  { sequelize, modelName: "BankReconciliation", tableName: "tbl_bank_reconciliation", timestamps: true }
);

autoSync(BankReconciliation);
export default BankReconciliation;
