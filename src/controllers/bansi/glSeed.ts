import { QueryTypes } from "sequelize";
import sequelize from "../../config/database";
import ChartAccount from "../../models/chartAccount";
import GlMapping from "../../models/glMapping";

/**
 * ເອີ້ນຫຼັງ runAutoSync (App.ts) — ຕາຕະລາງບັນຊີຄູ່/ລູກໜີ້-ເຈົ້າໜີ້ ຖືກສ້າງດ້ວຍ autoSync ແຕ່ autoSync ບໍ່ສ້າງ index
 * ແລະ ບໍ່ໃສ່ຂໍ້ມູນ. ຢູ່ນີ້ໃສ່ສະເພາະສິ່ງທີ່ຍັງບໍ່ມີ (ແລ່ນທຸກເທື່ອທີ່ເປີດ server ກໍ່ບໍ່ທັບຂອງເກົ່າ):
 * - index ຂອງ sql/create_gl_accounting.sql ແລະ sql/create_gl_ar_ap.sql
 * - ຜັງບັນຊີເລີ່ມຕົ້ນ 5 ກຸ່ມ (ເມື່ອຜັງຍັງຫວ່າງ)
 * - ບົດບາດຂອງລະບົບ → ບັນຊີເລີ່ມຕົ້ນ (ບົດບາດທີ່ຍັງບໍ່ໄດ້ຜູກ)
 * ຖ້າບໍ່ມີຜັງບັນຊີ ແລະ ບົດບາດ, ການບັນທຶກລາຍຮັບ-ລາຍຈ່າຍ ຈະລົງບັນຊີບໍ່ໄດ້
 */

type Seed = [id: number, code: string, la: string, en: string, cn: string, parent: number | null, group: number, type: string, side: number, postable: number, system: number];

const CHART: Seed[] = [
  [1, "1000", "ຊັບສິນ", "Assets", "资产", null, 1, "CURRENT_ASSET", 1, 0, 1],
  [2, "1100", "ຊັບສິນໝູນວຽນ", "Current assets", "流动资产", 1, 1, "CURRENT_ASSET", 1, 0, 1],
  [3, "1110", "ເງິນສົດ", "Cash on hand", "库存现金", 2, 1, "CASH", 1, 1, 1],
  [4, "1120", "ເງິນຝາກທະນາຄານ", "Cash at bank", "银行存款", 2, 1, "CASH", 1, 1, 1],
  [5, "1130", "ລູກໜີ້ການຄ້າ", "Accounts receivable", "应收账款", 2, 1, "RECEIVABLE", 1, 1, 1],
  [6, "1140", "ຄ່ານາຍໜ້າຄ້າງຮັບ", "Commission receivable", "应收佣金", 2, 1, "RECEIVABLE", 1, 1, 0],
  [7, "1150", "ອາກອນມູນຄ່າເພີ່ມຂາເຂົ້າ", "VAT input", "进项增值税", 2, 1, "CURRENT_ASSET", 1, 1, 1],
  [8, "1160", "ລາຍຈ່າຍຈ່າຍລ່ວງໜ້າ", "Prepaid expenses", "预付费用", 2, 1, "CURRENT_ASSET", 1, 1, 0],
  [9, "1170", "ເງິນລ່ວງໜ້າພະນັກງານ", "Employee advances", "员工借支", 2, 1, "CURRENT_ASSET", 1, 1, 0],
  [10, "1190", "ຊັບສິນໝູນວຽນອື່ນ", "Other current assets", "其他流动资产", 2, 1, "CURRENT_ASSET", 1, 1, 0],
  [11, "1200", "ຊັບສິນບໍ່ໝູນວຽນ", "Non-current assets", "非流动资产", 1, 1, "FIXED_ASSET", 1, 0, 1],
  [12, "1210", "ທີ່ດິນ", "Land", "土地", 11, 1, "FIXED_ASSET", 1, 1, 0],
  [13, "1220", "ອາຄານ", "Buildings", "房屋建筑", 11, 1, "FIXED_ASSET", 1, 1, 0],
  [14, "1230", "ພາຫະນະ", "Vehicles", "运输工具", 11, 1, "FIXED_ASSET", 1, 1, 0],
  [15, "1240", "ອຸປະກອນຫ້ອງການ ແລະ ຄອມພິວເຕີ", "Office & computer equipment", "办公及电脑设备", 11, 1, "FIXED_ASSET", 1, 1, 0],
  [16, "1250", "ເຟີນິເຈີ", "Furniture & fixtures", "家具", 11, 1, "FIXED_ASSET", 1, 1, 0],
  [17, "1260", "ເງິນມັດຈຳ", "Deposits", "押金", 11, 1, "NONCURRENT_ASSET", 1, 1, 0],
  [18, "1290", "ຄ່າຫຼຸ້ຍຫ້ຽນສະສົມ", "Accumulated depreciation", "累计折旧", 11, 1, "FIXED_ASSET", 2, 1, 1],
  [19, "2000", "ໜີ້ສິນ", "Liabilities", "负债", null, 2, "CURRENT_LIABILITY", 2, 0, 1],
  [20, "2100", "ໜີ້ສິນໝູນວຽນ", "Current liabilities", "流动负债", 19, 2, "CURRENT_LIABILITY", 2, 0, 1],
  [21, "2110", "ເຈົ້າໜີ້ການຄ້າ", "Accounts payable", "应付账款", 20, 2, "PAYABLE", 2, 1, 1],
  [22, "2120", "ເບ້ຍປະກັນຄ້າງຈ່າຍບໍລິສັດປະກັນໄພ", "Premiums payable to insurers", "应付保险公司保费", 20, 2, "PAYABLE", 2, 1, 0],
  [23, "2130", "ອາກອນມູນຄ່າເພີ່ມຂາອອກ", "VAT output", "销项增值税", 20, 2, "CURRENT_LIABILITY", 2, 1, 1],
  [24, "2140", "ອາກອນຄ້າງຈ່າຍອື່ນ", "Other taxes payable", "其他应交税费", 20, 2, "CURRENT_LIABILITY", 2, 1, 0],
  [25, "2150", "ເງິນເດືອນຄ້າງຈ່າຍ", "Salaries payable", "应付工资", 20, 2, "CURRENT_LIABILITY", 2, 1, 0],
  [26, "2160", "ລາຍຈ່າຍຄ້າງຈ່າຍ", "Accrued expenses", "应计费用", 20, 2, "CURRENT_LIABILITY", 2, 1, 0],
  [27, "2170", "ລາຍຮັບຮັບລ່ວງໜ້າ", "Unearned revenue", "预收收入", 20, 2, "CURRENT_LIABILITY", 2, 1, 0],
  [28, "2180", "ເງິນກູ້ໄລຍະສັ້ນ", "Short-term loans", "短期借款", 20, 2, "CURRENT_LIABILITY", 2, 1, 0],
  [29, "2200", "ໜີ້ສິນບໍ່ໝູນວຽນ", "Non-current liabilities", "非流动负债", 19, 2, "NONCURRENT_LIABILITY", 2, 0, 1],
  [30, "2210", "ເງິນກູ້ໄລຍະຍາວ", "Long-term loans", "长期借款", 29, 2, "NONCURRENT_LIABILITY", 2, 1, 0],
  [31, "3000", "ທຶນ", "Equity", "所有者权益", null, 3, "EQUITY", 2, 0, 1],
  [32, "3100", "ທຶນຈົດທະບຽນ", "Share capital", "实收资本", 31, 3, "EQUITY", 2, 1, 1],
  [33, "3200", "ກຳໄລສະສົມ", "Retained earnings", "留存收益", 31, 3, "EQUITY", 2, 1, 1],
  [34, "3300", "ທຶນຍອດຍົກມາ", "Opening balance equity", "期初余额权益", 31, 3, "EQUITY", 2, 1, 1],
  [35, "3400", "ເງິນປັນຜົນ ແລະ ຖອນທຶນ", "Dividends & drawings", "分红及提款", 31, 3, "EQUITY", 1, 1, 0],
  [36, "4000", "ລາຍຮັບ", "Revenue", "收入", null, 4, "REVENUE", 2, 0, 1],
  [37, "4100", "ລາຍຮັບຈາກການດຳເນີນງານ", "Operating revenue", "营业收入", 36, 4, "REVENUE", 2, 0, 1],
  [38, "4110", "ລາຍຮັບຄ່ານາຍໜ້າປະກັນໄພ", "Insurance commission income", "保险佣金收入", 37, 4, "REVENUE", 2, 1, 0],
  [39, "4120", "ລາຍຮັບຄ່າບໍລິການ", "Service income", "服务收入", 37, 4, "REVENUE", 2, 1, 1],
  [40, "4200", "ລາຍຮັບອື່ນ", "Other income", "其他收入", 36, 4, "OTHER_INCOME", 2, 0, 1],
  [41, "4210", "ດອກເບ້ຍຮັບ", "Interest income", "利息收入", 40, 4, "OTHER_INCOME", 2, 1, 0],
  [42, "4220", "ກຳໄລຈາກອັດຕາແລກປ່ຽນ", "Foreign exchange gain", "汇兑收益", 40, 4, "OTHER_INCOME", 2, 1, 1],
  [43, "4290", "ລາຍຮັບອື່ນໆ", "Miscellaneous income", "其他杂项收入", 40, 4, "OTHER_INCOME", 2, 1, 0],
  [44, "5000", "ລາຍຈ່າຍ", "Expenses", "费用", null, 5, "EXPENSE", 1, 0, 1],
  [45, "5100", "ລາຍຈ່າຍໃນການດຳເນີນງານ", "Operating expenses", "营业费用", 44, 5, "EXPENSE", 1, 0, 1],
  [46, "5110", "ເງິນເດືອນ ແລະ ສະຫວັດດີການ", "Salaries & benefits", "工资及福利", 45, 5, "EXPENSE", 1, 1, 0],
  [47, "5120", "ຄ່າເຊົ່າ", "Rent", "租金", 45, 5, "EXPENSE", 1, 1, 0],
  [48, "5130", "ຄ່ານ້ຳ ຄ່າໄຟ ແລະ ຄ່າສື່ສານ", "Utilities & communication", "水电及通讯费", 45, 5, "EXPENSE", 1, 1, 0],
  [49, "5140", "ເຄື່ອງໃຊ້ຫ້ອງການ", "Office supplies", "办公用品", 45, 5, "EXPENSE", 1, 1, 0],
  [50, "5150", "ຄ່ານ້ຳມັນ ແລະ ຄ່າເດີນທາງ", "Fuel & travel", "燃油及差旅费", 45, 5, "EXPENSE", 1, 1, 0],
  [51, "5160", "ຄ່າໂຄສະນາ ແລະ ການຕະຫຼາດ", "Advertising & marketing", "广告及市场费", 45, 5, "EXPENSE", 1, 1, 0],
  [52, "5170", "ຄ່ານາຍໜ້າຈ່າຍຕົວແທນ", "Agent commission expense", "代理佣金支出", 45, 5, "EXPENSE", 1, 1, 0],
  [53, "5180", "ຄ່າບຳລຸງຮັກສາ ແລະ ສ້ອມແປງ", "Repairs & maintenance", "维修保养费", 45, 5, "EXPENSE", 1, 1, 0],
  [54, "5190", "ຄ່າຫຼຸ້ຍຫ້ຽນ", "Depreciation expense", "折旧费用", 45, 5, "EXPENSE", 1, 1, 0],
  [55, "5199", "ລາຍຈ່າຍດຳເນີນງານອື່ນໆ", "Other operating expenses", "其他营业费用", 45, 5, "EXPENSE", 1, 1, 1],
  [56, "5200", "ລາຍຈ່າຍອື່ນ", "Other expenses", "其他费用", 44, 5, "OTHER_EXPENSE", 1, 0, 1],
  [57, "5210", "ຄ່າທຳນຽມທະນາຄານ", "Bank charges", "银行手续费", 56, 5, "OTHER_EXPENSE", 1, 1, 0],
  [58, "5220", "ດອກເບ້ຍຈ່າຍ", "Interest expense", "利息支出", 56, 5, "OTHER_EXPENSE", 1, 1, 0],
  [59, "5230", "ຂາດທຶນຈາກອັດຕາແລກປ່ຽນ", "Foreign exchange loss", "汇兑损失", 56, 5, "OTHER_EXPENSE", 1, 1, 1],
  [60, "5300", "ອາກອນກຳໄລ", "Income tax expense", "所得税费用", 44, 5, "TAX_EXPENSE", 1, 1, 0],
];

/** ບົດບາດ → ລະຫັດບັນຊີເລີ່ມຕົ້ນ */
const ROLE_CODES: Record<string, string> = {
  DEFAULT_CASH: "1110",
  DEFAULT_BANK: "1120",
  AR: "1130",
  VAT_INPUT: "1150",
  AP: "2110",
  VAT_OUTPUT: "2130",
  RETAINED_EARNINGS: "3200",
  OPENING_EQUITY: "3300",
  DEFAULT_REVENUE: "4120",
  FX_GAIN: "4220",
  DEFAULT_EXPENSE: "5199",
  FX_LOSS: "5230",
};

/** [ຕາຕະລາງ, ຊື່ index, ຖັນ, unique] — ຄືກັບໄຟລ໌ SQL */
const INDEXES: [string, string, string[], boolean][] = [
  ["tbl_chart_account", "idx_chart_account_parent", ["parent_id"], false],
  ["tbl_gl_mapping", "uq_gl_mapping_source", ["source_type", "source_key"], true],
  ["tbl_journal_entry", "idx_journal_entry_date", ["entry_date"], false],
  ["tbl_journal_entry", "idx_journal_entry_source", ["source_type", "source_id"], false],
  ["tbl_journal_line", "idx_journal_line_entry", ["entry_id"], false],
  ["tbl_journal_line", "idx_journal_line_account", ["account_id"], false],
  ["tbl_partner_doc", "idx_partner_doc_partner", ["doc_kind", "partner_id"], false],
  ["tbl_partner_doc", "idx_partner_doc_due", ["doc_kind", "status", "due_date"], false],
  ["tbl_partner_doc_line", "idx_partner_doc_line_doc", ["doc_id"], false],
  ["tbl_partner_payment", "idx_partner_payment_partner", ["pay_kind", "partner_id"], false],
  ["tbl_partner_payment", "idx_partner_payment_date", ["pay_date"], false],
  ["tbl_partner_allocation", "idx_partner_allocation_payment", ["payment_id"], false],
  ["tbl_partner_allocation", "idx_partner_allocation_doc", ["doc_id"], false],
];

const ensureIndexes = async () => {
  for (const [table, name, columns, unique] of INDEXES) {
    const [found] = await sequelize.query<{ n: number }>(
      "SELECT COUNT(*) AS n FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = :table AND index_name = :name",
      { type: QueryTypes.SELECT, replacements: { table, name } }
    );
    if (Number(found?.n)) continue;
    const [exists] = await sequelize.query<{ n: number }>(
      "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = :table",
      { type: QueryTypes.SELECT, replacements: { table } }
    );
    if (!Number(exists?.n)) continue;
    await sequelize.query(`CREATE ${unique ? "UNIQUE " : ""}INDEX \`${name}\` ON \`${table}\` (${columns.map((c) => `\`${c}\``).join(", ")})`);
    console.log(`🛠️  ${table}: index ${name}`);
  }
};

export const seedGlDefaults = async () => {
  await ensureIndexes();

  if ((await ChartAccount.count()) === 0) {
    await ChartAccount.bulkCreate(CHART.map(([id, code, la, en, cn, parent, group, type, side, postable, system]) => ({
      _uuid: id, account_code: code, name_la: la, name_en: en, name_cn: cn, parent_id: parent,
      account_group: group, account_type: type, normal_side: side, is_postable: postable, is_system: system, status: 1,
    })));
    console.log(`🛠️  tbl_chart_account: seeded ${CHART.length} accounts`);
  }

  for (const [role, code] of Object.entries(ROLE_CODES)) {
    if (await GlMapping.count({ where: { source_type: "ROLE", source_key: role } })) continue;
    const account: any = await ChartAccount.findOne({ where: { account_code: code } });
    if (!account) continue;
    await GlMapping.create({ source_type: "ROLE", source_key: role, account_id: account._uuid });
    console.log(`🛠️  tbl_gl_mapping: ${role} → ${code}`);
  }
};
