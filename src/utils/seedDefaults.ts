import { Op, QueryTypes } from "sequelize";
import moment from "moment";
import sequelize from "../config/database";
import Currency from "../models/currencyModel";
import MainMenu from "../models/mainMenuModel";
import FiscalYear from "../models/fiscalYear";
import JournalType from "../models/journalType";
import DocNumbering from "../models/docNumbering";
import PaymentMethod from "../models/paymentMethod";

/**
 * ເອີ້ນຫຼັງ runAutoSync (App.ts) — ໃສ່ສະເພາະສິ່ງທີ່ຍັງບໍ່ມີ, ແລ່ນທຸກເທື່ອທີ່ເປີດ server ກໍ່ບໍ່ທັບຂອງເກົ່າ:
 * - index / unique key / foreign key ທີ່ autoSync ບໍ່ສ້າງ (ຄືກັບໄຟລ໌ sql/ ຂອງ insurance) — ສ່ວນຂອງບັນຊີຄູ່ ແລະ
 *   ລູກໜີ້-ເຈົ້າໜີ້ ຢູ່ seedGlDefaults (controllers/bansi/glSeed.ts)
 * - ສະກຸນເງິນ (ເມື່ອ tbl_currency ຍັງຫວ່າງ) — LAK ເປັນສະກຸນຫຼັກ (reate 1); ສະກຸນອື່ນບໍ່ໃສ່ອັດຕາ,
 *   ຕັ້ງເອງຢູ່ ຕັ້ງຄ່າບັນຊີ → ອັດຕາແລກປ່ຽນ (ກ່ອນຕັ້ງ, ການລົງບັນຊີສະກຸນນັ້ນຈະແຈ້ງໃຫ້ຕັ້ງອັດຕາ)
 * - ເມນູໜ້າ desktop ບັນຊີ (tbl_main_menu types 2) — path ຕ້ອງກົງກັບໜ້າເວັບ (ຈັບຄູ່ດ້ວຍ path)
 * - ຕັ້ງຄ່າບັນຊີເລີ່ມຕົ້ນ ຄື sql/create_bansi_settings.sql ຂອງ insurance (ແຕ່ລະຕາຕະລາງ ໃສ່ສະເພາະຕອນຍັງຫວ່າງ):
 *   ປີການເງິນປີປັດຈຸບັນ, ປະເພດປຶ້ມບັນຊີ, ເລກທີເອກະສານ, ວິທີຊຳລະເງິນ — ອາກອນບໍ່ໃສ່ໃຫ້ ເພາະອັດຕາຂຶ້ນກັບນິຕິບຸກຄົນ
 */

const JOURNAL_TYPES = [
  { journal_code: "GJ", name: "ປຶ້ມລາຍວັນທົ່ວໄປ", journal_kind: 1 },
  { journal_code: "RV", name: "ປຶ້ມລາຍຮັບ", journal_kind: 2 },
  { journal_code: "PV", name: "ປຶ້ມລາຍຈ່າຍ", journal_kind: 3 },
  { journal_code: "CJ", name: "ປຶ້ມເງິນສົດ", journal_kind: 4 },
  { journal_code: "BJ", name: "ປຶ້ມທະນາຄານ", journal_kind: 5 },
];

/** doc_code ທີ່ລະບົບເອີ້ນ: RECEIPT (ລາຍຮັບ), PAYMENT (ລາຍຈ່າຍ), JOURNAL (ບັນທຶກບັນຊີ) — journal = journal_code ຂອງປຶ້ມ */
const DOC_NUMBERINGS = [
  { doc_code: "RECEIPT", name: "ໃບຮັບເງິນ", journal: "RV", prefix: "RV" },
  { doc_code: "PAYMENT", name: "ໃບຈ່າຍເງິນ", journal: "PV", prefix: "PV" },
  { doc_code: "JOURNAL", name: "ໃບບັນທຶກບັນຊີ", journal: "GJ", prefix: "JV" },
  { doc_code: "TRANSFER", name: "ໃບໂອນເງິນ", journal: "CJ", prefix: "TF" },
];

const PAYMENT_METHODS = [
  { method_code: "CASH", name: "ເງິນສົດ", method_type: 1, require_ref: 0, sort: 1 },
  { method_code: "TRANSFER", name: "ໂອນຜ່ານທະນາຄານ", method_type: 2, require_ref: 1, sort: 2 },
  { method_code: "QR", name: "ສະແກນ QR", method_type: 3, require_ref: 1, sort: 3 },
  { method_code: "CHEQUE", name: "ເຊັກ", method_type: 4, require_ref: 1, sort: 4 },
];

/** _uuid ເລີ່ມ 10001 ຄືກັບ maxid() — ໃຊ້ສະເພາະຕອນຕາຕະລາງຍັງຫວ່າງ */
const withIds = <T extends object>(rows: T[], now: Date) =>
  rows.map((row, i) => ({ _uuid: 10001 + i, ...row, status: 1, createdAt: now, updatedAt: now }));

const seedAccountingSettings = async () => {
  const now = new Date();

  if ((await FiscalYear.count()) === 0) {
    const year = moment().utcOffset("+07:00").year();
    await FiscalYear.create({
      _uuid: 10001, fiscal_code: String(year), fiscal_name: `ປີການເງິນ ${year}`,
      start_date: `${year}-01-01`, end_date: `${year}-12-31`, is_current: 1, status: 1, createdAt: now, updatedAt: now,
    } as any);
    console.log(`🌱 tbl_fiscal_year: ${year}`);
  }

  if ((await JournalType.count()) === 0) {
    await JournalType.bulkCreate(withIds(JOURNAL_TYPES, now) as any);
    console.log(`🌱 tbl_journal_type: ${JOURNAL_TYPES.length} rows`);
  }

  if ((await DocNumbering.count()) === 0) {
    const journals: any[] = await JournalType.findAll({ attributes: ["_uuid", "journal_code"], raw: true });
    const journalId = (code: string) => journals.find((j) => j.journal_code === code)?._uuid ?? null;
    const rows = DOC_NUMBERINGS.map(({ journal, ...doc }) => ({
      ...doc, journal_id: journalId(journal), sep: "-", year_format: 4, with_month: 0, digits: 5, reset_period: 1, next_number: 1,
    }));
    await DocNumbering.bulkCreate(withIds(rows, now) as any);
    console.log(`🌱 tbl_doc_numbering: ${rows.length} rows`);
  }

  if ((await PaymentMethod.count()) === 0) {
    await PaymentMethod.bulkCreate(withIds(PAYMENT_METHODS, now) as any);
    console.log(`🌱 tbl_payment_method: ${PAYMENT_METHODS.length} rows`);
  }
};

/** [ຕາຕະລາງ, ຊື່ index, ຖັນ, unique] */
const INDEXES: [string, string, string[], boolean][] = [
  // sql/create_bansi_settings.sql
  ["tbl_fiscal_year", "uq_fiscal_year_code", ["fiscal_code"], true],
  ["tbl_fiscal_year", "idx_fiscal_year_dates", ["start_date", "end_date"], false],
  ["tbl_exchange_rate", "idx_exchange_rate_currency_date", ["currencyId", "rate_date"], false],
  ["tbl_opening_balance", "uq_opening_balance_fiscal_account", ["fiscal_id", "account_id"], true],
  ["tbl_opening_balance", "idx_opening_balance_account", ["account_id"], false],
  ["tbl_payment_method", "uq_payment_method_code", ["method_code"], true],
  ["tbl_journal_type", "uq_journal_type_code", ["journal_code"], true],
  ["tbl_doc_numbering", "uq_doc_numbering_code", ["doc_code"], true],
  ["tbl_tax", "uq_tax_code", ["tax_code"], true],
  // sql/create_tbl_account_movement.sql
  ["tbl_account_movement", "idx_account_movement_account_date", ["account_id", "movement_date"], false],
  ["tbl_account_movement", "idx_account_movement_source", ["source_type", "source_id"], false],
  // sql/create_tbl_transfer_money.sql
  ["tbl_transfer_money", "idx_tbl_transfer_money_out", ["account_outid"], false],
  ["tbl_transfer_money", "idx_tbl_transfer_money_in", ["account_inid"], false],
  ["tbl_transfer_money", "idx_tbl_transfer_money_created", ["createdAt"], false],
  // sql/create_tbl_work_plan.sql
  ["tbl_work_plan", "idx_tbl_work_plan_userid", ["userid"], false],
  ["tbl_work_plan", "idx_tbl_work_plan_range", ["start_date", "end_date"], false],
  ["tbl_work_plan", "idx_tbl_work_plan_status", ["status"], false],
];

/** [ຕາຕະລາງ, ຊື່ constraint, ຖັນ, ຕາຕະລາງປາຍທາງ, ຖັນປາຍທາງ] — sql/fix_tbl_transfer_money_fk.sql */
const FOREIGN_KEYS: [string, string, string, string, string][] = [
  ["tbl_transfer_money", "tbl_transfer_money_ibfk_1", "account_outid", "tbl_treasury_account", "_uuid"],
  ["tbl_transfer_money", "tbl_transfer_money_ibfk_2", "account_inid", "tbl_treasury_account", "_uuid"],
];

const count = async (sql: string, replacements: Record<string, string>) => {
  const [row] = await sequelize.query<{ n: number }>(sql, { type: QueryTypes.SELECT, replacements });
  return Number(row?.n) || 0;
};

const tableExists = (table: string) =>
  count("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = :table", { table });

const ensureIndexes = async () => {
  for (const [table, name, columns, unique] of INDEXES) {
    if (!(await tableExists(table))) continue;
    if (await count(
      "SELECT COUNT(*) AS n FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = :table AND index_name = :name",
      { table, name }
    )) continue;
    await sequelize.query(`CREATE ${unique ? "UNIQUE " : ""}INDEX \`${name}\` ON \`${table}\` (${columns.map((c) => `\`${c}\``).join(", ")})`);
    console.log(`🛠️  ${table}: index ${name}`);
  }
};

const ensureForeignKeys = async () => {
  for (const [table, name, column, refTable, refColumn] of FOREIGN_KEYS) {
    if (!(await tableExists(table)) || !(await tableExists(refTable))) continue;
    if (await count(
      "SELECT COUNT(*) AS n FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = :table AND constraint_name = :name",
      { table, name }
    )) continue;
    await sequelize.query(
      `ALTER TABLE \`${table}\` ADD CONSTRAINT \`${name}\` FOREIGN KEY (\`${column}\`) REFERENCES \`${refTable}\` (\`${refColumn}\`) ON DELETE RESTRICT ON UPDATE CASCADE`
    );
    console.log(`🛠️  ${table}: foreign key ${name}`);
  }
};

const CURRENCIES = [
  { name: "LAK", laos: "ກີບ", genus: "₭", icon: "flag-LA", reate: 1 },
  { name: "THB", laos: "ບາດ", genus: "฿", icon: "flag-TH", reate: null },
  { name: "USD", laos: "ໂດລາ", genus: "$", icon: "flag-US", reate: null },
  { name: "CNY", laos: "ຢວນ", genus: "¥", icon: "flag-CN", reate: null },
];

const ACCOUNT_MENUS = [
  { name_la: "ບັນທຶກບັນຊີປະຈຳວັນ", name_en: "Journal Entries", name_cn: "日记账", icons: "fa-solid fa-pen-to-square", path: "/account/journal" },
  { name_la: "ຜັງບັນຊີ", name_en: "Chart of Accounts", name_cn: "会计科目表", icons: "fa-solid fa-sitemap", path: "/account/chart" },
  { name_la: "ປຶ້ມບັນຊີໃຫຍ່", name_en: "General Ledger", name_cn: "总分类账", icons: "fa-solid fa-book", path: "/account/ledger" },
  { name_la: "ເງິນສົດ ແລະ ທະນາຄານ", name_en: "Cash & Bank", name_cn: "现金与银行", icons: "fa-solid fa-building-columns", path: "/account/cash-bank" },
  { name_la: "ລູກໜີ້", name_en: "Receivables", name_cn: "应收账款", icons: "fa-solid fa-hand-holding-dollar", path: "/account/receivable" },
  { name_la: "ເຈົ້າໜີ້", name_en: "Payables", name_cn: "应付账款", icons: "fa-solid fa-file-invoice-dollar", path: "/account/payable" },
  { name_la: "ງົບທົດລອງ", name_en: "Trial Balance", name_cn: "试算平衡表", icons: "fa-solid fa-scale-balanced", path: "/account/trial-balance" },
  { name_la: "ລາຍງານການເງິນ", name_en: "Financial Statements", name_cn: "财务报表", icons: "fa-solid fa-chart-pie", path: "/account/statements" },
  { name_la: "ປະຕິທິນ", name_en: "Calendar", name_cn: "日历", icons: "fa-solid fa-calendar-days", path: "/calendar" },
  { name_la: "ຕັ້ງຄ່າບັນຊີ", name_en: "Accounting Settings", name_cn: "会计设置", icons: "fa-solid fa-gears", path: "/account/setting" },
];

export const seedDefaults = async () => {
  await ensureIndexes();
  await ensureForeignKeys();

  if ((await Currency.count()) === 0) {
    const now = new Date();
    await Currency.bulkCreate(CURRENCIES.map((c) => ({ ...c, createdAt: now, updatedAt: now })) as any);
    console.log(`🌱 tbl_currency: ${CURRENCIES.length} rows`);
  }

  const existing = await MainMenu.findAll({
    where: { types: 2, path: { [Op.in]: ACCOUNT_MENUS.map((m) => m.path) } },
    attributes: ["path"],
    raw: true,
  });
  const have = new Set(existing.map((m) => m.path));
  const missing = ACCOUNT_MENUS.filter((m) => !have.has(m.path));
  if (missing.length) {
    const now = new Date();
    // ລຽງຕາມ ACCOUNT_MENUS ເພາະໜ້າເວັບລຽງເມນູຕາມ _uuid
    for (const menu of missing) {
      await MainMenu.create({ ...menu, types: 2, password: null, status: 1, createdAt: now, updatedAt: now });
    }
    console.log(`🌱 tbl_main_menu: ${missing.length} account menus`);
  }

  await seedAccountingSettings();
};
