"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.partnerIdOf = exports.partnerInclude = exports.EXPENSE_PARTNER_TYPES = exports.INCOME_PARTNER_TYPES = exports.computeTax = exports.isCashAccount = exports.accountInclude = exports.entryDateOf = exports.todayLao = exports.BUSINESS_OFFSET = exports.CASH_CLASS_CODE = exports.TRANSFER = exports.CASH = exports.CANCELLED = exports.ACTIVE = void 0;
const moment_1 = __importDefault(require("moment"));
const treasuryAcount_1 = __importDefault(require("../../models/treasuryAcount"));
const typeTreasury_1 = __importDefault(require("../../models/typeTreasury"));
const typeAcount_1 = __importDefault(require("../../models/typeAcount"));
const tax_1 = __importDefault(require("../../models/tax"));
const bankModel_1 = __importDefault(require("../../models/bankModel"));
const currencyModel_1 = __importDefault(require("../../models/currencyModel"));
const partner_1 = __importDefault(require("../../models/partner"));
const bansiHelpers_1 = require("./bansiHelpers");
/** ສ່ວນທີ່ລາຍຮັບ (incomeController) ແລະ ລາຍຈ່າຍ (expenseController) ໃຊ້ຮ່ວມກັນ */
exports.ACTIVE = 1;
exports.CANCELLED = 2;
/** ວິທີຮັບ/ຈ່າຍເງິນ — 1 ເງິນສົດ, 2 ເງິນໂອນ */
exports.CASH = 1;
exports.TRANSFER = 2;
/** ໝວດເງິນສົດ (101 ເງິນສົດໃນຄັງ) — ບັນຊີໃນໝວດນີ້ = ເງິນສົດ, ໝວດອື່ນ = ເງິນໂອນ (ກົງກັບ CASH_CLASS_CODE ຂອງໜ້າເວັບ) */
exports.CASH_CLASS_CODE = "101";
/** ເວລາທຸລະກິດ (ລາວ) — ຂອບເຂດວັນທີຂອງການກັ່ນ */
exports.BUSINESS_OFFSET = "+07:00";
const todayLao = () => (0, moment_1.default)().utcOffset(exports.BUSINESS_OFFSET).format("YYYY-MM-DD");
exports.todayLao = todayLao;
/** ວັນທີຂອງລາຍການຈາກ body — ບໍ່ສົ່ງ = ມື້ນີ້; ຜິດຮູບແບບ ຫຼື ເກີນມື້ນີ້ = error (label ເຊັ່ນ "ວັນທີຮັບເງິນ") */
const entryDateOf = (value, label) => {
    if (value === undefined || value === null || value === "")
        return { date: (0, exports.todayLao)() };
    const date = (0, bansiHelpers_1.toDateOnly)(value);
    if (!date)
        return { error: `${label}ບໍ່ຖືກຕ້ອງ` };
    if (date > (0, exports.todayLao)())
        return { error: `${label}ຕ້ອງບໍ່ເກີນມື້ນີ້` };
    return { date };
};
exports.entryDateOf = entryDateOf;
/** ບັນຊີເງິນຄັງ + ທະນາຄານ + ປະເພດ (+ ສະກຸນເງິນ) — ສຳລັບສະແດງໃນລາຍການ */
exports.accountInclude = {
    model: treasuryAcount_1.default,
    as: "acount",
    attributes: ["_uuid", "acountName", "acount_number", "bankId", "type_treasuryid", "balance_treasury", "status"],
    include: [
        { model: bankModel_1.default, as: "banks", attributes: ["_uuid", "abbr", "name_la", "logo"] },
        {
            model: typeTreasury_1.default,
            as: "treasury",
            attributes: ["_uuid", "treasury_code", "treasury_name", "currencyId"],
            include: [{ model: currencyModel_1.default, as: "currency", attributes: ["_id", "name", "genus"] }],
        },
    ],
};
/** ບັນຊີຢູ່ໃນໝວດເງິນສົດບໍ່ — ວິທີຮັບ/ຈ່າຍຄິດຈາກນີ້ ບໍ່ເຊື່ອຄ່າທີ່ໜ້າເວັບສົ່ງມາ */
const isCashAccount = async (account, t) => {
    const type = await typeTreasury_1.default.findByPk(account.type_treasuryid, {
        include: [{ model: typeAcount_1.default, as: "types", attributes: ["type_code"] }],
        transaction: t,
    });
    return String(type?.types?.type_code ?? "") === exports.CASH_CLASS_CODE;
};
exports.isCashAccount = isCashAccount;
/**
 * ຄິດອາກອນ (ສູດດຽວກັບໜ້າຕັ້ງຄ່າອາກອນ): calc_method 1 = ລວມໃນລາຄາແລ້ວ (ຍອດ = ຈຳນວນ),
 * 2 = ບວກເພີ່ມ (ຍອດ = ຈຳນວນ + ອາກອນ). tax_id → ອັດຕາຈາກ tbl_tax; ບໍ່ມີ tax_id ແຕ່ມີ tax → ຈຳນວນທີ່ປ້ອນເອງ
 */
const computeTax = async (body, amount, t) => {
    const taxId = Number(body.tax_id);
    if (Number.isInteger(taxId) && taxId > 0) {
        const row = await tax_1.default.findOne({ where: { _uuid: taxId, status: 1 }, transaction: t });
        if (!row)
            return { error: "ບໍ່ພົບອາກອນທີ່ເລືອກ" };
        const rate = Number(row.rate) || 0;
        const method = Number(row.calc_method) === 1 ? 1 : 2;
        const tax = method === 1 ? amount - amount / (1 + rate / 100) : (amount * rate) / 100;
        const rounded = Math.round(tax);
        return { tax: rounded, total: method === 1 ? amount : amount + rounded };
    }
    const manual = Math.round(Number(body.tax) || 0);
    if (manual < 0)
        return { error: "ອາກອນຕ້ອງບໍ່ຕິດລົບ" };
    if (!manual)
        return { tax: 0, total: amount };
    const method = Number(body.calc_method) === 2 ? 2 : 1;
    if (method === 1 && manual >= amount)
        return { error: "ອາກອນທີ່ລວມໃນລາຄາ ຕ້ອງນ້ອຍກວ່າຈຳນວນເງິນ" };
    return { tax: manual, total: method === 1 ? amount : amount + manual };
};
exports.computeTax = computeTax;
/** partner_type ທີ່ເລືອກໄດ້ — ລາຍຮັບ: ລູກຄ້າ (1 ລູກຄ້າ, 3 ທັງສອງ); ລາຍຈ່າຍ: ທັງລູກຄ້າ ແລະ ຜູ້ສະໜອງ (1, 2, 3) */
exports.INCOME_PARTNER_TYPES = [1, 3];
exports.EXPENSE_PARTNER_TYPES = [1, 2, 3];
/** include ລູກຄ້າ/ຄູ່ຄ້າ ຂອງລາຍຮັບ-ລາຍຈ່າຍ (as "partner") */
exports.partnerInclude = {
    model: partner_1.default,
    as: "partner",
    attributes: ["_uuid", "partner_code", "name", "phone", "partner_type"],
};
/**
 * ລູກຄ້າ/ຄູ່ຄ້າ (partner_id) ຂອງລາຍຮັບ-ລາຍຈ່າຍ — ບໍ່ສົ່ງ = ບໍ່ປ່ຽນ (skip), ວ່າງ/0 = ບໍ່ລະບຸ (null).
 * ຕ້ອງເປັນຄູ່ຄ້າທີ່ໃຊ້ງານ ແລະ partner_type ຢູ່ໃນ types ຍົກເວັ້ນຄົນເດີມຂອງລາຍການທີ່ກຳລັງແກ້ໄຂ (current).
 * ພຽງບອກວ່າຮັບຈາກ/ຈ່າຍໃຫ້ໃຜ — ບໍ່ຕັດໜີ້ (ຕັດໜີ້ = /partner-payment)
 */
const partnerIdOf = async (value, types, current = null) => {
    if (value === undefined)
        return { skip: true };
    if (value === null || value === "" || value === "null" || Number(value) === 0)
        return { id: null };
    const id = Number(value);
    if (!Number.isInteger(id))
        return { error: "ລູກຄ້າບໍ່ຖືກຕ້ອງ" };
    if (id === current)
        return { id };
    const partner = await partner_1.default.findByPk(id);
    if (!partner || Number(partner.status) !== 1 || !types.includes(Number(partner.partner_type))) {
        return { error: "ບໍ່ພົບລູກຄ້າທີ່ເລືອກ ຫຼື ປິດໃຊ້ງານແລ້ວ" };
    }
    return { id };
};
exports.partnerIdOf = partnerIdOf;
