"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateAccountSetting = exports.getAccountSetting = exports.featureOn = exports.loadAccountSetting = void 0;
const accountSetting_1 = __importDefault(require("../../models/accountSetting"));
const bansiHelpers_1 = require("./bansiHelpers");
/**
 * ຕັ້ງຄ່າບັນຊີຂອງບໍລິສັດ (tbl_account_setting, ແຖວດຽວ) — ຮູບແບບຕົວເລກ, ເລກອາກອນ, ຜູ້ເຊັນງົບ, ຟັງຊັນທີ່ໃຊ້,
 * ອັດຕາອາກອນກຳໄລ ແລະ ນະໂຍບາຍບັນຊີ. ວັນທີປິດງວດ (lock_date) ປ່ຽນຜ່ານ /period-close ເທົ່ານັ້ນ
 */
const FLAGS = ["use_vat", "use_fixed_assets", "use_withholding", "use_fx_revaluation", "use_bank_reconciliation"];
const TEXTS = [
    ["tax_id", 50],
    ["chief_accountant", 150],
    ["director", 150],
];
const MAX_POLICIES = 20000;
/** ແຖວຕັ້ງຄ່າຂອງບໍລິສັດ — ຍັງບໍ່ມີ = ສ້າງດ້ວຍຄ່າຕັ້ງຕົ້ນ */
const loadAccountSetting = async (t) => {
    const row = await accountSetting_1.default.findOne({ order: [["_uuid", "ASC"]], transaction: t });
    return row ?? accountSetting_1.default.create({}, { transaction: t });
};
exports.loadAccountSetting = loadAccountSetting;
/** ຟັງຊັນເປີດໃຊ້ຢູ່ບໍ (ໃຊ້ໃນ controller ອື່ນ) */
const featureOn = async (feature, t) => Number((await (0, exports.loadAccountSetting)(t))[feature]) === 1;
exports.featureOn = featureOn;
/** GET /account-setting */
const getAccountSetting = async (_req, res) => {
    try {
        res.status(200).json({ data: await (0, exports.loadAccountSetting)() });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting account settings");
    }
};
exports.getAccountSetting = getAccountSetting;
/** PUT /account-setting — ສົ່ງສະເພາະຊ່ອງທີ່ປ່ຽນກໍ່ໄດ້ */
const updateAccountSetting = async (req, res) => {
    try {
        const body = req.body || {};
        const patch = {};
        if (body.number_format !== undefined)
            patch.number_format = Number(body.number_format) === 2 ? 2 : 1;
        for (const field of FLAGS) {
            if (body[field] !== undefined)
                patch[field] = Number(body[field]) === 1 || body[field] === true ? 1 : 0;
        }
        for (const [field, max] of TEXTS) {
            if (body[field] !== undefined)
                patch[field] = String(body[field] ?? "").trim().slice(0, max) || null;
        }
        if (body.profit_tax_rate !== undefined) {
            const rate = Number(body.profit_tax_rate);
            if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
                res.status(400).json({ message: "ອັດຕາອາກອນກຳໄລຕ້ອງຢູ່ລະຫວ່າງ 0–100%" });
                return;
            }
            patch.profit_tax_rate = Math.round(rate * 100) / 100;
        }
        if (body.policies !== undefined)
            patch.policies = String(body.policies ?? "").trim().slice(0, MAX_POLICIES) || null;
        const row = await (0, exports.loadAccountSetting)();
        await row.update({ ...patch, updatedAt: new Date() });
        res.status(200).json({ message: "Successfully saved account settings", data: row });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error saving account settings");
    }
};
exports.updateAccountSetting = updateAccountSetting;
