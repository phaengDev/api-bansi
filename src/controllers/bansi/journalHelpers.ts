import { Transaction } from "sequelize";
import moment from "moment";
import TreasuryAccount from "../../models/treasuryAcount";
import TypeTreasury from "../../models/typeTreasury";
import TypeAcount from "../../models/typeAcount";
import Tax from "../../models/tax";
import Banks from "../../models/bankModel";
import Currency from "../../models/currencyModel";
import Partner from "../../models/partner";
import { toDateOnly } from "./bansiHelpers";

/** ສ່ວນທີ່ລາຍຮັບ (incomeController) ແລະ ລາຍຈ່າຍ (expenseController) ໃຊ້ຮ່ວມກັນ */

export const ACTIVE = 1;
export const CANCELLED = 2;

/** ວິທີຮັບ/ຈ່າຍເງິນ — 1 ເງິນສົດ, 2 ເງິນໂອນ */
export const CASH = 1;
export const TRANSFER = 2;
/** ໝວດເງິນສົດ (101 ເງິນສົດໃນຄັງ) — ບັນຊີໃນໝວດນີ້ = ເງິນສົດ, ໝວດອື່ນ = ເງິນໂອນ (ກົງກັບ CASH_CLASS_CODE ຂອງໜ້າເວັບ) */
export const CASH_CLASS_CODE = "101";

/** ເວລາທຸລະກິດ (ລາວ) — ຂອບເຂດວັນທີຂອງການກັ່ນ */
export const BUSINESS_OFFSET = "+07:00";
export const todayLao = () => moment().utcOffset(BUSINESS_OFFSET).format("YYYY-MM-DD");

/** ວັນທີຂອງລາຍການຈາກ body — ບໍ່ສົ່ງ = ມື້ນີ້; ຜິດຮູບແບບ ຫຼື ເກີນມື້ນີ້ = error (label ເຊັ່ນ "ວັນທີຮັບເງິນ") */
export const entryDateOf = (value: unknown, label: string): { date: string } | { error: string } => {
  if (value === undefined || value === null || value === "") return { date: todayLao() };
  const date = toDateOnly(value);
  if (!date) return { error: `${label}ບໍ່ຖືກຕ້ອງ` };
  if (date > todayLao()) return { error: `${label}ຕ້ອງບໍ່ເກີນມື້ນີ້` };
  return { date };
};

/** ບັນຊີເງິນຄັງ + ທະນາຄານ + ປະເພດ (+ ສະກຸນເງິນ) — ສຳລັບສະແດງໃນລາຍການ */
export const accountInclude = {
  model: TreasuryAccount,
  as: "acount",
  attributes: ["_uuid", "acountName", "acount_number", "bankId", "type_treasuryid", "balance_treasury", "status"],
  include: [
    { model: Banks, as: "banks", attributes: ["_uuid", "abbr", "name_la", "logo"] },
    {
      model: TypeTreasury,
      as: "treasury",
      attributes: ["_uuid", "treasury_code", "treasury_name", "currencyId"],
      include: [{ model: Currency, as: "currency", attributes: ["_id", "name", "genus"] }],
    },
  ],
};

/** ບັນຊີຢູ່ໃນໝວດເງິນສົດບໍ່ — ວິທີຮັບ/ຈ່າຍຄິດຈາກນີ້ ບໍ່ເຊື່ອຄ່າທີ່ໜ້າເວັບສົ່ງມາ */
export const isCashAccount = async (account: any, t?: Transaction) => {
  const type: any = await TypeTreasury.findByPk(account.type_treasuryid, {
    include: [{ model: TypeAcount, as: "types", attributes: ["type_code"] }],
    transaction: t,
  });
  return String(type?.types?.type_code ?? "") === CASH_CLASS_CODE;
};

/**
 * ຄິດອາກອນ (ສູດດຽວກັບໜ້າຕັ້ງຄ່າອາກອນ): calc_method 1 = ລວມໃນລາຄາແລ້ວ (ຍອດ = ຈຳນວນ),
 * 2 = ບວກເພີ່ມ (ຍອດ = ຈຳນວນ + ອາກອນ). tax_id → ອັດຕາຈາກ tbl_tax; ບໍ່ມີ tax_id ແຕ່ມີ tax → ຈຳນວນທີ່ປ້ອນເອງ
 */
export const computeTax = async (body: any, amount: number, t: Transaction) => {
  const taxId = Number(body.tax_id);
  if (Number.isInteger(taxId) && taxId > 0) {
    const row = await Tax.findOne({ where: { _uuid: taxId, status: 1 }, transaction: t });
    if (!row) return { error: "ບໍ່ພົບອາກອນທີ່ເລືອກ" };
    const rate = Number(row.rate) || 0;
    const method = Number(row.calc_method) === 1 ? 1 : 2;
    const tax = method === 1 ? amount - amount / (1 + rate / 100) : (amount * rate) / 100;
    const rounded = Math.round(tax);
    return { tax: rounded, total: method === 1 ? amount : amount + rounded };
  }
  const manual = Math.round(Number(body.tax) || 0);
  if (manual < 0) return { error: "ອາກອນຕ້ອງບໍ່ຕິດລົບ" };
  if (!manual) return { tax: 0, total: amount };
  const method = Number(body.calc_method) === 2 ? 2 : 1;
  if (method === 1 && manual >= amount) return { error: "ອາກອນທີ່ລວມໃນລາຄາ ຕ້ອງນ້ອຍກວ່າຈຳນວນເງິນ" };
  return { tax: manual, total: method === 1 ? amount : amount + manual };
};

/** partner_type ທີ່ເລືອກໄດ້ — ລາຍຮັບ: ລູກຄ້າ (1 ລູກຄ້າ, 3 ທັງສອງ); ລາຍຈ່າຍ: ທັງລູກຄ້າ ແລະ ຜູ້ສະໜອງ (1, 2, 3) */
export const INCOME_PARTNER_TYPES = [1, 3];
export const EXPENSE_PARTNER_TYPES = [1, 2, 3];

/** include ລູກຄ້າ/ຄູ່ຄ້າ ຂອງລາຍຮັບ-ລາຍຈ່າຍ (as "partner") */
export const partnerInclude = {
  model: Partner,
  as: "partner",
  attributes: ["_uuid", "partner_code", "name", "phone", "partner_type"],
};

/**
 * ລູກຄ້າ/ຄູ່ຄ້າ (partner_id) ຂອງລາຍຮັບ-ລາຍຈ່າຍ — ບໍ່ສົ່ງ = ບໍ່ປ່ຽນ (skip), ວ່າງ/0 = ບໍ່ລະບຸ (null).
 * ຕ້ອງເປັນຄູ່ຄ້າທີ່ໃຊ້ງານ ແລະ partner_type ຢູ່ໃນ types ຍົກເວັ້ນຄົນເດີມຂອງລາຍການທີ່ກຳລັງແກ້ໄຂ (current).
 * ພຽງບອກວ່າຮັບຈາກ/ຈ່າຍໃຫ້ໃຜ — ບໍ່ຕັດໜີ້ (ຕັດໜີ້ = /partner-payment)
 */
export const partnerIdOf = async (
  value: unknown,
  types: number[],
  current: number | null = null
): Promise<{ skip: true } | { id: number | null } | { error: string }> => {
  if (value === undefined) return { skip: true };
  if (value === null || value === "" || value === "null" || Number(value) === 0) return { id: null };
  const id = Number(value);
  if (!Number.isInteger(id)) return { error: "ລູກຄ້າບໍ່ຖືກຕ້ອງ" };
  if (id === current) return { id };
  const partner: any = await Partner.findByPk(id);
  if (!partner || Number(partner.status) !== 1 || !types.includes(Number(partner.partner_type))) {
    return { error: "ບໍ່ພົບລູກຄ້າທີ່ເລືອກ ຫຼື ປິດໃຊ້ງານແລ້ວ" };
  }
  return { id };
};
