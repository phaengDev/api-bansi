import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";

/**
 * ຕັ້ງຄ່າບັນຊີຂອງບໍລິສັດ — ແຖວດຽວຕໍ່ບໍລິສັດ (ອ່ານ/ສ້າງຜ່ານ accountSettingController.loadAccountSetting, ບໍ່ອີງ _uuid):
 * - accounting_mode: 1 = ແບບທຳມະດາ (ເກັບຂໍ້ມູນພາຍໃນບໍລິສັດ — ລະບົບບໍ່ຄິດ/ບໍ່ຕິດຕາມອາກອນ: ບໍ່ມີອາກອນມູນຄ່າເພີ່ມ,
 *   ອາກອນຫັກ ນ ທີ່ຈ່າຍ, ອາກອນກຳໄລ, ອາກອນເງິນເດືອນ, ປັບອັດຕາແລກປ່ຽນ ແລະ ເອກະສານງົບການເງິນທາງການ),
 *   2 = ຄົບຕາມມາດຕະຖານ (ກົດໝາຍບັນຊີ + ອາກອນ — ຟັງຊັນລຸ່ມນີ້ເປີດ/ປິດແຍກໄດ້). ແຖວເດີມ = 2 (ພຶດຕິກຳເກົ່າ)
 * - number_format: 1 = 1,250,000.50 (ທີ່ໃຊ້ທົ່ວໄປ), 2 = 1.250.000,50 (ກົດໝາຍບັນຊີ ມາດຕາ 7)
 * - ເລກປະຈຳຕົວຜູ້ເສຍອາກອນ ແລະ ຊື່ຜູ້ເຊັນງົບການເງິນ (ຫົວໜ້າບັນຊີ, ຜູ້ອຳນວຍການ — ມາດຕາ 20)
 * - ຟັງຊັນທີ່ບໍລິສັດໃຊ້ (use_*): ບໍລິສັດທີ່ບໍ່ໃຊ້ ປິດໄວ້ ເມນູ/ໜ້າທີ່ກ່ຽວຂ້ອງຈະບໍ່ຂຶ້ນ
 * - lock_date: ປິດງວດຮອດວັນທີນີ້ (ທ້າຍເດືອນ) — ລົງ/ແກ້ລາຍການວັນທີ ≤ lock_date ບໍ່ໄດ້ (glCore.assertOpenPeriod)
 * - profit_tax_rate: ອັດຕາອາກອນກຳໄລ (%) ຂອງໜ້າ ຄິດອາກອນກຳໄລ
 * - ໃບເກັບເງິນອາກອນ: invoice_license = ເລກທີໃບອະນຸຍາດນຳໃຊ້ໃບເກັບເງິນ (ພິມທ້າຍໃບ), invoice_account_id = ບັນຊີທະນາຄານ
 *   ຂອງບໍລິສັດທີ່ພິມໃສ່ໃບ (ຜູ້ຊື້ໂອນເຂົ້າ), invoice_copies = ພິມ 1 ໃບ (ສຳລັບຜູ້ຊື້) ຫຼື 2 ໃບ (+ ສຳລັບຜູ້ຂາຍ)
 * - policies: ນະໂຍບາຍບັນຊີ ໃນບົດອະທິບາຍງົບການເງິນ (ຫວ່າງ = ໃຊ້ຂໍ້ຄວາມຕັ້ງຕົ້ນຂອງໜ້າເວັບ)
 */
class AccountSetting extends Model {
  declare _uuid: number;
  declare accounting_mode: number;
  declare number_format: number;
  declare tax_id: string | null;
  declare chief_accountant: string | null;
  declare director: string | null;
  declare use_vat: number;
  declare use_fixed_assets: number;
  declare use_withholding: number;
  declare use_fx_revaluation: number;
  declare use_bank_reconciliation: number;
  declare lock_date: string | null;
  declare locked_by: string | null;
  declare profit_tax_rate: string;
  declare policies: string | null;
  declare invoice_license: string | null;
  declare invoice_account_id: number | null;
  declare invoice_copies: number;
  declare createdAt: Date;
  declare updatedAt: Date;
  declare use_credit: number;
}

const flag = (on: number) => ({ type: DataTypes.TINYINT, allowNull: false, defaultValue: on });

AccountSetting.init(
  {
    _uuid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    accounting_mode: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 2 },
    number_format: flag(1),
    tax_id: DataTypes.STRING(50),
    chief_accountant: DataTypes.STRING(150),
    director: DataTypes.STRING(150),
    use_vat: flag(1),
    use_fixed_assets: flag(1),
    use_withholding: flag(0),
    use_fx_revaluation: flag(0),
    use_bank_reconciliation: flag(1),
    lock_date: DataTypes.DATEONLY,
    locked_by: DataTypes.STRING(100),
    profit_tax_rate: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 20 },
    policies: DataTypes.TEXT,
    invoice_license: DataTypes.STRING(100),
    invoice_account_id: DataTypes.INTEGER,
    invoice_copies: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 2 },
    createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    /** ລະບົບສິນເຊື່ອ (sql/credit_system.sql) — 0 = ປິດ, ເມນູສິນເຊື່ອບໍ່ຂຶ້ນ */
    use_credit: flag(0),
  },
  { sequelize, modelName: "AccountSetting", tableName: "tbl_account_setting", timestamps: true }
);

autoSync(AccountSetting);
export default AccountSetting;
