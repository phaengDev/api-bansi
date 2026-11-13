import { Request, Response } from "express";
import { Transaction } from "sequelize";
import AccountSetting from "../../models/accountSetting";
import { sendError } from "./bansiHelpers";

/**
 * ຕັ້ງຄ່າບັນຊີຂອງບໍລິສັດ (tbl_account_setting, ແຖວດຽວ) — ຮູບແບບຕົວເລກ, ເລກອາກອນ, ຜູ້ເຊັນງົບ, ຟັງຊັນທີ່ໃຊ້,
 * ອັດຕາອາກອນກຳໄລ ແລະ ນະໂຍບາຍບັນຊີ. ວັນທີປິດງວດ (lock_date) ປ່ຽນຜ່ານ /period-close ເທົ່ານັ້ນ
 */

const FLAGS = ["use_vat", "use_fixed_assets", "use_withholding", "use_fx_revaluation", "use_bank_reconciliation"] as const;
const TEXTS: [field: "tax_id" | "chief_accountant" | "director", max: number][] = [
  ["tax_id", 50],
  ["chief_accountant", 150],
  ["director", 150],
];
const MAX_POLICIES = 20000;

/** ແຖວຕັ້ງຄ່າຂອງບໍລິສັດ — ຍັງບໍ່ມີ = ສ້າງດ້ວຍຄ່າຕັ້ງຕົ້ນ */
export const loadAccountSetting = async (t?: Transaction) => {
  const row = await AccountSetting.findOne({ order: [["_uuid", "ASC"]], transaction: t });
  return row ?? AccountSetting.create({}, { transaction: t });
};

/** ຟັງຊັນເປີດໃຊ້ຢູ່ບໍ (ໃຊ້ໃນ controller ອື່ນ) */
export const featureOn = async (feature: (typeof FLAGS)[number], t?: Transaction) =>
  Number((await loadAccountSetting(t))[feature]) === 1;

/** GET /account-setting */
export const getAccountSetting = async (_req: Request, res: Response) => {
  try {
    res.status(200).json({ data: await loadAccountSetting() });
  } catch (error) {
    sendError(res, error, "Error getting account settings");
  }
};

/** PUT /account-setting — ສົ່ງສະເພາະຊ່ອງທີ່ປ່ຽນກໍ່ໄດ້ */
export const updateAccountSetting = async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const patch: Record<string, unknown> = {};
    if (body.number_format !== undefined) patch.number_format = Number(body.number_format) === 2 ? 2 : 1;
    for (const field of FLAGS) {
      if (body[field] !== undefined) patch[field] = Number(body[field]) === 1 || body[field] === true ? 1 : 0;
    }
    for (const [field, max] of TEXTS) {
      if (body[field] !== undefined) patch[field] = String(body[field] ?? "").trim().slice(0, max) || null;
    }
    if (body.profit_tax_rate !== undefined) {
      const rate = Number(body.profit_tax_rate);
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
        res.status(400).json({ message: "ອັດຕາອາກອນກຳໄລຕ້ອງຢູ່ລະຫວ່າງ 0–100%" });
        return;
      }
      patch.profit_tax_rate = Math.round(rate * 100) / 100;
    }
    if (body.policies !== undefined) patch.policies = String(body.policies ?? "").trim().slice(0, MAX_POLICIES) || null;
    const row = await loadAccountSetting();
    await row.update({ ...patch, updatedAt: new Date() });
    res.status(200).json({ message: "Successfully saved account settings", data: row });
  } catch (error) {
    sendError(res, error, "Error saving account settings");
  }
};
