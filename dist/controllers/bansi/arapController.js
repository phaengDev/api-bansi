"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelPartnerPayment = exports.createPartnerPayment = exports.getPartnerPayments = exports.cancelPartnerDoc = exports.createPartnerDoc = exports.getPartnerDocs = exports.updatePartner = exports.createPartner = exports.getPartners = exports.AP = exports.AR = void 0;
const sequelize_1 = require("sequelize");
const moment_1 = __importDefault(require("moment"));
const database_1 = __importDefault(require("../../config/database"));
const partner_1 = __importDefault(require("../../models/partner"));
const partnerDoc_1 = __importStar(require("../../models/partnerDoc"));
const partnerPayment_1 = __importStar(require("../../models/partnerPayment"));
const chartAccount_1 = __importDefault(require("../../models/chartAccount"));
const treasuryAcount_1 = __importDefault(require("../../models/treasuryAcount"));
const typeTreasury_1 = __importDefault(require("../../models/typeTreasury"));
const currencyModel_1 = __importDefault(require("../../models/currencyModel"));
const bankModel_1 = __importDefault(require("../../models/bankModel"));
const utils_1 = require("../../utils");
const bansiHelpers_1 = require("./bansiHelpers");
const docNumberingController_1 = require("./docNumberingController");
const accountMovement_1 = require("./accountMovement");
const journalHelpers_1 = require("./journalHelpers");
const glCore_1 = require("./glCore");
/**
 * ລູກໜີ້ (AR, kind 1) ແລະ ເຈົ້າໜີ້ (AP, kind 2):
 * - ຄູ່ຄ້າ (tbl_partner)
 * - ໃບແຈ້ງໜີ້ / ໃບບິນ (tbl_partner_doc + lines) — ລົງບັນຊີ:
 *     AR: ໜີ້ ລູກໜີ້ (ຍອດລວມ) / ມີ ລາຍຮັບແຕ່ລະແຖວ (ກ່ອນອາກອນ) + ມີ ອາກອນຂາອອກ
 *     AP: ໜີ້ ລາຍຈ່າຍ/ຊັບສິນແຕ່ລະແຖວ + ໜີ້ ອາກອນຂາເຂົ້າ / ມີ ເຈົ້າໜີ້ (ຍອດລວມ)
 * - ຮັບ/ຈ່າຍຊຳລະ (tbl_partner_payment + allocation) — ເງິນເຂົ້າ/ອອກ ບັນຊີເງິນຄັງ ແລະ ລົງບັນຊີ:
 *     AR: ໜີ້ ເງິນສົດ/ທະນາຄານ / ມີ ລູກໜີ້ (ຕາມອັດຕາຂອງໃບ) ± ກຳໄລ/ຂາດທຶນ ອັດຕາແລກປ່ຽນ
 *     AP: ໜີ້ ເຈົ້າໜີ້ (ຕາມອັດຕາຂອງໃບ) / ມີ ເງິນສົດ/ທະນາຄານ ± ກຳໄລ/ຂາດທຶນ ອັດຕາແລກປ່ຽນ
 * ຍົກເລີກ = ກັບລາຍການໃບບັນທຶກ (ໃບທີ່ຕັດໜີ້ແລ້ວຕ້ອງຍົກເລີກການຊຳລະກ່ອນ). ຕ້ອງແລ່ນ sql/create_gl_ar_ap.sql
 */
exports.AR = 1;
exports.AP = 2;
const ACTIVE = 1;
const CANCELLED = 2;
const KIND = {
    [exports.AR]: { docCode: "AR_INVOICE", docPrefix: "INV", payCode: "AR_RECEIPT", payPrefix: "RCV", role: "AR", partnerTypes: [1, 3] },
    [exports.AP]: { docCode: "AP_BILL", docPrefix: "BILL", payCode: "AP_PAYMENT", payPrefix: "PAY", role: "AP", partnerTypes: [2, 3] },
};
const kindOf = (value) => (Number(value) === exports.AR ? exports.AR : Number(value) === exports.AP ? exports.AP : null);
// ---- ຕາຕະລາງພ້ອມບໍ່ ----
let ready = false;
let checkedAt = 0;
const arapReady = async (t) => {
    if (ready)
        return true;
    if (!(await (0, glCore_1.glReady)(t)))
        return false;
    if (Date.now() - checkedAt < 60000)
        return false;
    checkedAt = Date.now();
    const rows = await database_1.default.query("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN " +
        "('tbl_partner','tbl_partner_doc','tbl_partner_doc_line','tbl_partner_payment','tbl_partner_allocation')", { type: sequelize_1.QueryTypes.SELECT, transaction: t });
    ready = Number(rows[0]?.n) === 5;
    return ready;
};
const notReady = (res) => res.status(503).json({
    message: "ຍັງບໍ່ໄດ້ສ້າງຕາຕະລາງລູກໜີ້-ເຈົ້າໜີ້ — ແລ່ນ sql/create_gl_accounting.sql ແລະ sql/create_gl_ar_ap.sql ກ່ອນ",
    notReady: true,
});
const fail = (res, error, fallback) => {
    if (error instanceof glCore_1.GlError) {
        res.status(400).json({ message: error.message });
        return;
    }
    (0, bansiHelpers_1.sendError)(res, error, fallback);
};
/** ເລກທີ: ຮູບແບບຈາກ ຕັ້ງຄ່າ → ເລກທີເອກະສານ (code) ຫຼື PREFIX-YYYY-00001 */
const nextNumber = async (code, prefix, model, field, date, t) => {
    const issued = await (0, docNumberingController_1.issueDocNumber)(code, t);
    if (issued?.number)
        return issued.number;
    const head = `${prefix}-${(0, moment_1.default)(date).format("YYYY")}-`;
    const last = await model.findOne({
        where: { [field]: { [sequelize_1.Op.like]: `${head}%` } },
        order: [[field, "DESC"]],
        transaction: t,
        lock: t.LOCK.UPDATE,
    });
    const seq = last ? Number(String(last[field]).slice(head.length)) || 0 : 0;
    return `${head}${String(seq + 1).padStart(5, "0")}`;
};
/** ສະກຸນຂອງ id — ບໍ່ສົ່ງ = LAK (ຖ້າມີໃນ tbl_currency) */
const currencyIdOf = async (value, t) => {
    if (value)
        return Number(value);
    const base = await currencyModel_1.default.findOne({ where: { name: "LAK" }, transaction: t });
    return base ? Number(base._id) : null;
};
/** ສະກຸນດຽວກັນບໍ່ (null ຫຼື LAK = ສະກຸນຫຼັກ) */
const sameCurrency = async (a, b, t) => {
    if (Number(a || 0) === Number(b || 0))
        return true;
    const [ca, cb] = await Promise.all([a ? currencyModel_1.default.findByPk(a, { transaction: t }) : null, b ? currencyModel_1.default.findByPk(b, { transaction: t }) : null]);
    return (0, glCore_1.isBaseCurrency)(ca) && (0, glCore_1.isBaseCurrency)(cb);
};
// ======================= ຄູ່ຄ້າ =======================
const PARTNER_FIELDS = [
    "partner_code", "name", "partner_type", "contact_person", "phone", "email", "address", "tax_number",
    "credit_days", "receivable_account_id", "payable_account_id", "description", "status",
];
/** GET /partner/fetch — ທຸກຄູ່ຄ້າ + ຍອດຄ້າງ (LAK ຕາມອັດຕາຂອງໃບ) ແລະ ຈຳນວນໃບທີ່ຍັງຄ້າງ */
const getPartners = async (_req, res) => {
    try {
        if (!(await arapReady()))
            return notReady(res);
        const [partners, open] = await Promise.all([
            partner_1.default.findAll({ order: [["partner_code", "ASC"]] }),
            database_1.default.query(`SELECT partner_id, doc_kind, SUM((total - paid) * exchange_rate) AS open_base, COUNT(*) AS docs,
                SUM(CASE WHEN due_date < :today THEN (total - paid) * exchange_rate ELSE 0 END) AS overdue_base
         FROM tbl_partner_doc WHERE status = 1 AND total > paid GROUP BY partner_id, doc_kind`, { type: sequelize_1.QueryTypes.SELECT, replacements: { today: (0, journalHelpers_1.todayLao)() } }),
        ]);
        const data = partners.map((p) => {
            const row = (kind) => open.find((o) => Number(o.partner_id) === Number(p._uuid) && Number(o.doc_kind) === kind);
            const ar = row(exports.AR);
            const ap = row(exports.AP);
            return {
                ...p.get({ plain: true }),
                ar_open: (0, glCore_1.round2)(Number(ar?.open_base) || 0),
                ar_overdue: (0, glCore_1.round2)(Number(ar?.overdue_base) || 0),
                ar_docs: Number(ar?.docs) || 0,
                ap_open: (0, glCore_1.round2)(Number(ap?.open_base) || 0),
                ap_overdue: (0, glCore_1.round2)(Number(ap?.overdue_base) || 0),
                ap_docs: Number(ap?.docs) || 0,
            };
        });
        res.status(200).json({ data, total: data.length });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting partners");
    }
};
exports.getPartners = getPartners;
const preparePartner = async (body, existing) => {
    const merged = { ...(existing ? existing.get({ plain: true }) : {}), ...body };
    const code = String(merged.partner_code ?? "").trim().toUpperCase();
    const name = String(merged.name ?? "").trim();
    if (!code)
        throw new glCore_1.GlError("ກະລຸນາປ້ອນລະຫັດຄູ່ຄ້າ");
    if (!name)
        throw new glCore_1.GlError("ກະລຸນາປ້ອນຊື່ຄູ່ຄ້າ");
    const clash = await partner_1.default.count({ where: { partner_code: code, ...(existing ? { _uuid: { [sequelize_1.Op.ne]: existing._uuid } } : {}) } });
    if (clash)
        throw new glCore_1.GlError(`ລະຫັດ ${code} ມີແລ້ວ`);
    const type = [1, 2, 3].includes(Number(merged.partner_type)) ? Number(merged.partner_type) : 1;
    const accountOf = async (value, group, label) => {
        if (!value)
            return null;
        const account = await chartAccount_1.default.findByPk(Number(value));
        if (!account || Number(account.status) !== 1 || Number(account.is_postable) !== 1 || Number(account.account_group) !== group) {
            throw new glCore_1.GlError(`${label} ຕ້ອງເປັນບັນຊີລົງລາຍການກຸ່ມ ${group} ທີ່ໃຊ້ງານຢູ່`);
        }
        return Number(account._uuid);
    };
    return {
        partner_code: code,
        name,
        partner_type: type,
        contact_person: String(merged.contact_person ?? "").trim() || null,
        phone: String(merged.phone ?? "").trim() || null,
        email: String(merged.email ?? "").trim() || null,
        address: String(merged.address ?? "").trim() || null,
        tax_number: String(merged.tax_number ?? "").trim() || null,
        credit_days: Math.max(0, Math.round(Number(merged.credit_days) || 0)),
        receivable_account_id: await accountOf(merged.receivable_account_id, 1, "ບັນຊີລູກໜີ້"),
        payable_account_id: await accountOf(merged.payable_account_id, 2, "ບັນຊີເຈົ້າໜີ້"),
        description: String(merged.description ?? "").trim() || null,
        status: Number(merged.status) === 0 ? 0 : 1,
    };
};
/** POST /partner/create */
const createPartner = async (req, res) => {
    try {
        if (!(await arapReady()))
            return notReady(res);
        const row = await partner_1.default.create(await preparePartner((0, bansiHelpers_1.pickFields)(req.body, PARTNER_FIELDS)));
        res.status(200).json({ message: "Successfully created partner", data: row });
    }
    catch (error) {
        fail(res, error, "Error creating partner");
    }
};
exports.createPartner = createPartner;
/** PUT /partner/:id (base64) */
const updatePartner = async (req, res) => {
    try {
        if (!(await arapReady()))
            return notReady(res);
        const row = await partner_1.default.findByPk((0, bansiHelpers_1.decodeId)(req));
        if (!row) {
            res.status(404).json({ message: "ບໍ່ພົບຄູ່ຄ້າ" });
            return;
        }
        await row.update({ ...(await preparePartner((0, bansiHelpers_1.pickFields)(req.body, PARTNER_FIELDS), row)), updatedAt: new Date() });
        res.status(200).json({ message: "Successfully updated partner", data: row });
    }
    catch (error) {
        fail(res, error, "Error updating partner");
    }
};
exports.updatePartner = updatePartner;
// ======================= ໃບແຈ້ງໜີ້ / ໃບບິນ =======================
const docInclude = [
    { model: partner_1.default, as: "partner", attributes: ["_uuid", "partner_code", "name", "phone"] },
    {
        model: partnerDoc_1.PartnerDocLine,
        as: "lines",
        include: [{ model: chartAccount_1.default, as: "account", attributes: ["_uuid", "account_code", "name_la", "name_en", "name_cn", "account_group"] }],
    },
    {
        model: partnerPayment_1.PartnerAllocation,
        as: "allocations",
        include: [{ model: partnerPayment_1.default, as: "payment", attributes: ["_uuid", "pay_number", "pay_date", "status"] }],
    },
];
/**
 * POST /partner-doc/fetch { kind, partner_id?, open_only?, status?, start_date?, end_date? } —
 * ໃບຕາມວັນທີ (ໃໝ່ສຸດກ່ອນ) ພ້ອມແຖວ, ຄູ່ຄ້າ, ການຕັດໜີ້ ແລະ ສະກຸນເງິນ
 */
const getPartnerDocs = async (req, res) => {
    try {
        if (!(await arapReady()))
            return notReady(res);
        const body = req.body || {};
        const kind = kindOf(body.kind);
        if (!kind)
            throw new glCore_1.GlError("kind ຕ້ອງເປັນ 1 (ລູກໜີ້) ຫຼື 2 (ເຈົ້າໜີ້)");
        const where = { doc_kind: kind };
        if (body.partner_id)
            where.partner_id = Number(body.partner_id);
        if (body.open_only) {
            where.status = ACTIVE;
            where.total = { [sequelize_1.Op.gt]: database_1.default.col("PartnerDoc.paid") };
        }
        else if ([ACTIVE, CANCELLED].includes(Number(body.status)))
            where.status = Number(body.status);
        const start = (0, bansiHelpers_1.toDateOnly)(body.start_date);
        const end = (0, bansiHelpers_1.toDateOnly)(body.end_date);
        if (start || end)
            where.doc_date = { ...(start ? { [sequelize_1.Op.gte]: start } : {}), ...(end ? { [sequelize_1.Op.lte]: end } : {}) };
        const [rows, currencies] = await Promise.all([
            partnerDoc_1.default.findAll({ where, order: [["doc_date", "DESC"], ["_uuid", "DESC"]], include: docInclude }),
            currencyModel_1.default.findAll({ attributes: ["_id", "name", "genus"] }),
        ]);
        const data = rows.map((r) => {
            const plain = r.get({ plain: true });
            plain.lines.sort((a, b) => a.line_no - b.line_no);
            return {
                ...plain,
                currency: currencies.find((c) => Number(c._id) === Number(r.currency_id)) ?? null,
                open: (0, glCore_1.round2)(Number(r.total) - Number(r.paid)),
            };
        });
        res.status(200).json({ data, total: data.length });
    }
    catch (error) {
        fail(res, error, "Error getting partner documents");
    }
};
exports.getPartnerDocs = getPartnerDocs;
/**
 * POST /partner-doc/create
 * { kind, partner_id, doc_date?, due_date?, reference?, description?, currency_id?, exchange_rate?,
 *   tax_id? | (tax, calc_method)?, lines: [{ account_id, description?, amount }] }
 */
const createPartnerDoc = async (req, res) => {
    const t = await database_1.default.transaction();
    try {
        if (!(await arapReady(t))) {
            await t.rollback();
            return notReady(res);
        }
        const body = req.body || {};
        const kind = kindOf(body.kind);
        if (!kind)
            throw new glCore_1.GlError("kind ຕ້ອງເປັນ 1 (ລູກໜີ້) ຫຼື 2 (ເຈົ້າໜີ້)");
        const cfg = KIND[kind];
        const partner = await partner_1.default.findByPk(Number(body.partner_id), { transaction: t });
        if (!partner || Number(partner.status) !== 1)
            throw new glCore_1.GlError("ບໍ່ພົບຄູ່ຄ້າ ຫຼື ປິດໃຊ້ງານແລ້ວ");
        if (!cfg.partnerTypes.includes(Number(partner.partner_type))) {
            throw new glCore_1.GlError(kind === exports.AR ? "ຄູ່ຄ້ານີ້ບໍ່ແມ່ນລູກຄ້າ" : "ຄູ່ຄ້ານີ້ບໍ່ແມ່ນຜູ້ສະໜອງ");
        }
        const docDate = (0, journalHelpers_1.entryDateOf)(body.doc_date, "ວັນທີເອກະສານ");
        if ("error" in docDate)
            throw new glCore_1.GlError(docDate.error);
        const due = (0, bansiHelpers_1.toDateOnly)(body.due_date) ?? (0, moment_1.default)(docDate.date).add(Number(partner.credit_days) || 0, "days").format("YYYY-MM-DD");
        if (due < docDate.date)
            throw new glCore_1.GlError("ວັນຄົບກຳນົດຕ້ອງບໍ່ກ່ອນວັນທີເອກະສານ");
        const items = Array.isArray(body.lines) ? body.lines : [];
        const lines = items
            .map((l) => ({ account_id: Number(l?.account_id), description: String(l?.description ?? "").trim() || null, amount: (0, glCore_1.round2)(Number(l?.amount) || 0) }))
            .filter((l) => l.amount !== 0 || l.account_id);
        if (!lines.length)
            throw new glCore_1.GlError("ກະລຸນາປ້ອນຢ່າງໜ້ອຍ 1 ລາຍການ");
        lines.forEach((l, i) => {
            if (!l.account_id)
                throw new glCore_1.GlError(`ແຖວ ${i + 1}: ກະລຸນາເລືອກບັນຊີ`);
            if (!(l.amount > 0))
                throw new glCore_1.GlError(`ແຖວ ${i + 1}: ຈຳນວນຕ້ອງຫຼາຍກວ່າ 0`);
        });
        const subtotal = (0, glCore_1.round2)(lines.reduce((n, l) => n + l.amount, 0));
        const taxed = await (0, journalHelpers_1.computeTax)(body, subtotal, t);
        if ("error" in taxed)
            throw new glCore_1.GlError(taxed.error);
        const tax = (0, glCore_1.round2)(taxed.tax);
        const total = (0, glCore_1.round2)(taxed.total);
        const currencyId = await currencyIdOf(body.currency_id, t);
        const rate = Number(body.exchange_rate) > 0 ? Number(body.exchange_rate) : await (0, glCore_1.rateOf)(currencyId, docDate.date, t);
        const control = (kind === exports.AR ? partner.receivable_account_id : partner.payable_account_id) || (await (0, glCore_1.roleAccountId)(cfg.role, t));
        const doc = await partnerDoc_1.default.create({
            doc_kind: kind,
            doc_number: await nextNumber(cfg.docCode, cfg.docPrefix, partnerDoc_1.default, "doc_number", docDate.date, t),
            partner_id: partner._uuid,
            doc_date: docDate.date,
            due_date: due,
            reference: String(body.reference ?? "").trim() || null,
            description: String(body.description ?? "").trim() || null,
            currency_id: currencyId,
            exchange_rate: rate,
            subtotal,
            tax_id: Number(body.tax_id) > 0 ? Number(body.tax_id) : null,
            tax,
            total,
            paid: 0,
            control_account_id: control,
            status: ACTIVE,
            created_by: Number((0, bansiHelpers_1.actorOf)(req)) || null,
        }, { transaction: t });
        await partnerDoc_1.PartnerDocLine.bulkCreate(lines.map((l, i) => ({ ...l, doc_id: doc._uuid, line_no: i + 1 })), { transaction: t });
        // ຍອດກ່ອນອາກອນຂອງແຕ່ລະແຖວ (ອາກອນລວມໃນລາຄາ → ຫານຕາມສັດສ່ວນ, ເສດໃສ່ແຖວສຸດທ້າຍ)
        const net = (0, glCore_1.round2)(total - tax);
        let remaining = net;
        const netLines = lines.map((l, i) => {
            const value = i === lines.length - 1 ? remaining : (0, glCore_1.round2)((l.amount * net) / subtotal);
            remaining = (0, glCore_1.round2)(remaining - value);
            return { ...l, net: value };
        });
        const common = { currencyId, rate };
        const sideOf = (isControl) => (kind === exports.AR ? (isControl ? glCore_1.DEBIT : glCore_1.CREDIT) : (isControl ? glCore_1.CREDIT : glCore_1.DEBIT));
        const draft = [
            { ...common, accountId: control, side: sideOf(true), amount: total, description: partner.name },
            ...netLines.map((l) => ({ ...common, accountId: l.account_id, side: sideOf(false), amount: l.net, description: l.description })),
        ];
        if (tax)
            draft.push({ ...common, accountId: await (0, glCore_1.roleAccountId)(kind === exports.AR ? "VAT_OUTPUT" : "VAT_INPUT", t), side: sideOf(false), amount: tax });
        await (0, glCore_1.postEntry)({
            date: docDate.date,
            sourceType: cfg.docCode,
            sourceId: doc._uuid,
            reference: doc.doc_number,
            description: `${partner.name}${doc.description ? ` — ${doc.description}` : ""}`,
            lines: draft,
            actorId: Number((0, bansiHelpers_1.actorOf)(req)) || null,
        }, t);
        await t.commit();
        res.status(200).json({ message: "Successfully created document", data: doc });
    }
    catch (error) {
        await t.rollback();
        fail(res, error, "Error creating document");
    }
};
exports.createPartnerDoc = createPartnerDoc;
/** PUT /partner-doc/cancel/:id — ຍົກເລີກໄດ້ສະເພາະໃບທີ່ຍັງບໍ່ໄດ້ຕັດໜີ້ (ກັບລາຍການໃບບັນທຶກ) */
const cancelPartnerDoc = async (req, res) => {
    const t = await database_1.default.transaction();
    try {
        if (!(await arapReady(t))) {
            await t.rollback();
            return notReady(res);
        }
        const doc = await partnerDoc_1.default.findByPk((0, bansiHelpers_1.decodeId)(req), { transaction: t, lock: t.LOCK.UPDATE });
        if (!doc)
            throw new glCore_1.GlError("ບໍ່ພົບເອກະສານ");
        if (Number(doc.status) !== ACTIVE)
            throw new glCore_1.GlError("ເອກະສານນີ້ຖືກຍົກເລີກແລ້ວ");
        if (Number(doc.paid) > 0)
            throw new glCore_1.GlError("ເອກະສານນີ້ຕັດໜີ້ແລ້ວ — ຍົກເລີກການຊຳລະກ່ອນ");
        await (0, glCore_1.reverseSource)(KIND[doc.doc_kind].docCode, doc._uuid, t, Number((0, bansiHelpers_1.actorOf)(req)) || null);
        await doc.update({ status: CANCELLED, updatedAt: new Date() }, { transaction: t });
        await t.commit();
        res.status(200).json({ message: "Successfully cancelled document" });
    }
    catch (error) {
        await t.rollback();
        fail(res, error, "Error cancelling document");
    }
};
exports.cancelPartnerDoc = cancelPartnerDoc;
// ======================= ຮັບ / ຈ່າຍຊຳລະ =======================
const paymentInclude = [
    { model: partner_1.default, as: "partner", attributes: ["_uuid", "partner_code", "name"] },
    {
        model: treasuryAcount_1.default,
        as: "account",
        attributes: ["_uuid", "acountName", "acount_number", "bankId", "type_treasuryid"],
        include: [
            { model: bankModel_1.default, as: "banks", attributes: ["_uuid", "abbr", "name_la", "logo"] },
            {
                model: typeTreasury_1.default,
                as: "treasury",
                attributes: ["_uuid", "treasury_name", "currencyId"],
                include: [{ model: currencyModel_1.default, as: "currency", attributes: ["_id", "name", "genus"] }],
            },
        ],
    },
    {
        model: partnerPayment_1.PartnerAllocation,
        as: "allocations",
        include: [{ model: partnerDoc_1.default, as: "doc", attributes: ["_uuid", "doc_number", "doc_date", "due_date", "total"] }],
    },
];
const presentPayment = (row) => {
    const r = row.get({ plain: true });
    const logo = r.account?.banks?.logo;
    return {
        ...r,
        account: r.account && {
            ...r.account,
            banks: r.account.banks && { ...r.account.banks, url: logo ? `${(0, utils_1.url)()}/logo/${logo}` : null },
        },
    };
};
/** POST /partner-payment/fetch { kind?, partner_id?, start_date?, end_date?, status? } */
const getPartnerPayments = async (req, res) => {
    try {
        if (!(await arapReady()))
            return notReady(res);
        const body = req.body || {};
        const where = {};
        const kind = kindOf(body.kind);
        if (kind)
            where.pay_kind = kind;
        if (body.partner_id)
            where.partner_id = Number(body.partner_id);
        if ([ACTIVE, CANCELLED].includes(Number(body.status)))
            where.status = Number(body.status);
        const start = (0, bansiHelpers_1.toDateOnly)(body.start_date);
        const end = (0, bansiHelpers_1.toDateOnly)(body.end_date);
        if (start || end)
            where.pay_date = { ...(start ? { [sequelize_1.Op.gte]: start } : {}), ...(end ? { [sequelize_1.Op.lte]: end } : {}) };
        const rows = await partnerPayment_1.default.findAll({ where, order: [["pay_date", "DESC"], ["_uuid", "DESC"]], include: paymentInclude });
        res.status(200).json({ data: rows.map(presentPayment), total: rows.length });
    }
    catch (error) {
        fail(res, error, "Error getting payments");
    }
};
exports.getPartnerPayments = getPartnerPayments;
/** ຍອດຕັດແລ້ວຂອງໃບ = ລວມການຕັດຂອງການຊຳລະທີ່ຍັງໃຊ້ງານ */
const refreshPaid = async (docIds, t) => {
    for (const id of [...new Set(docIds)]) {
        const [row] = await database_1.default.query(`SELECT COALESCE(SUM(a.amount), 0) AS paid FROM tbl_partner_allocation a
       JOIN tbl_partner_payment p ON p._uuid = a.payment_id AND p.status = 1 WHERE a.doc_id = :id`, { type: sequelize_1.QueryTypes.SELECT, replacements: { id }, transaction: t });
        await partnerDoc_1.default.update({ paid: (0, glCore_1.round2)(Number(row?.paid)), updatedAt: new Date() }, { where: { _uuid: id }, transaction: t });
    }
};
/**
 * POST /partner-payment/create
 * { kind, partner_id, pay_date?, treasury_account_id, reference?, description?, allocations: [{ doc_id, amount }] } —
 * ຍອດຊຳລະ = ລວມການຕັດໜີ້; ທຸກໃບຕ້ອງເປັນຂອງຄູ່ຄ້ານີ້ ແລະ ສະກຸນດຽວກັບບັນຊີເງິນຄັງ
 */
const createPartnerPayment = async (req, res) => {
    const t = await database_1.default.transaction();
    try {
        if (!(await arapReady(t))) {
            await t.rollback();
            return notReady(res);
        }
        const body = req.body || {};
        const kind = kindOf(body.kind);
        if (!kind)
            throw new glCore_1.GlError("kind ຕ້ອງເປັນ 1 (ລູກໜີ້) ຫຼື 2 (ເຈົ້າໜີ້)");
        const cfg = KIND[kind];
        const actorId = Number((0, bansiHelpers_1.actorOf)(req)) || null;
        const partner = await partner_1.default.findByPk(Number(body.partner_id), { transaction: t });
        if (!partner)
            throw new glCore_1.GlError("ບໍ່ພົບຄູ່ຄ້າ");
        const payDate = (0, journalHelpers_1.entryDateOf)(body.pay_date, kind === exports.AR ? "ວັນທີຮັບເງິນ" : "ວັນທີຈ່າຍເງິນ");
        if ("error" in payDate)
            throw new glCore_1.GlError(payDate.error);
        const account = await treasuryAcount_1.default.findByPk(Number(body.treasury_account_id), {
            include: [{ model: typeTreasury_1.default, as: "treasury", attributes: ["_uuid", "currencyId"] }],
            transaction: t,
            lock: t.LOCK.UPDATE,
        });
        if (!account || Number(account.status) !== 1)
            throw new glCore_1.GlError("ບັນຊີເງິນຄັງບໍ່ມີ ຫຼື ປິດໃຊ້ງານແລ້ວ");
        const currencyId = account.treasury?.currencyId ?? null;
        const items = Array.isArray(body.allocations) ? body.allocations : [];
        const allocations = items
            .map((a) => ({ doc_id: Number(a?.doc_id), amount: (0, glCore_1.round2)(Number(a?.amount) || 0) }))
            .filter((a) => a.doc_id && a.amount > 0);
        if (!allocations.length)
            throw new glCore_1.GlError("ກະລຸນາເລືອກໃບທີ່ຈະຕັດໜີ້ ແລະ ຈຳນວນ");
        if (new Set(allocations.map((a) => a.doc_id)).size !== allocations.length)
            throw new glCore_1.GlError("ເລືອກໃບດຽວກັນຊ້ຳ");
        const docs = await partnerDoc_1.default.findAll({
            where: { _uuid: allocations.map((a) => a.doc_id) },
            transaction: t,
            lock: t.LOCK.UPDATE,
        });
        for (const a of allocations) {
            const doc = docs.find((d) => Number(d._uuid) === a.doc_id);
            if (!doc || Number(doc.doc_kind) !== kind || Number(doc.partner_id) !== Number(partner._uuid)) {
                throw new glCore_1.GlError("ມີໃບທີ່ບໍ່ແມ່ນຂອງຄູ່ຄ້ານີ້");
            }
            if (Number(doc.status) !== ACTIVE)
                throw new glCore_1.GlError(`ໃບ ${doc.doc_number} ຖືກຍົກເລີກແລ້ວ`);
            const open = (0, glCore_1.round2)(Number(doc.total) - Number(doc.paid));
            if (a.amount > open + 0.001)
                throw new glCore_1.GlError(`ໃບ ${doc.doc_number} ຄ້າງພຽງ ${open.toLocaleString("en-US")}`);
            if (!(await sameCurrency(doc.currency_id, currencyId, t))) {
                throw new glCore_1.GlError(`ໃບ ${doc.doc_number} ຄົນລະສະກຸນກັບບັນຊີ ${account.acountName}`);
            }
        }
        const amount = (0, glCore_1.round2)(allocations.reduce((n, a) => n + a.amount, 0));
        if (kind === exports.AP && (Number(account.balance_treasury) || 0) < amount) {
            throw new glCore_1.GlError(`ຍອດເງິນທີ່ໃຊ້ໄດ້ຂອງ ${account.acountName} ບໍ່ພໍ`);
        }
        const rate = await (0, glCore_1.rateOf)(currencyId, payDate.date, t);
        const payment = await partnerPayment_1.default.create({
            pay_kind: kind,
            pay_number: await nextNumber(cfg.payCode, cfg.payPrefix, partnerPayment_1.default, "pay_number", payDate.date, t),
            partner_id: partner._uuid,
            pay_date: payDate.date,
            treasury_account_id: account._uuid,
            currency_id: currencyId,
            exchange_rate: rate,
            amount,
            reference: String(body.reference ?? "").trim() || null,
            description: String(body.description ?? "").trim() || null,
            status: ACTIVE,
            created_by: actorId,
        }, { transaction: t });
        await partnerPayment_1.PartnerAllocation.bulkCreate(allocations.map((a) => ({ ...a, payment_id: payment._uuid })), { transaction: t });
        await refreshPaid(allocations.map((a) => a.doc_id), t);
        await (0, accountMovement_1.moveBalance)(account, {
            direction: kind === exports.AR ? accountMovement_1.MOVE_IN : accountMovement_1.MOVE_OUT,
            amount,
            source: kind === exports.AR ? "AR_RECEIPT" : "AP_PAYMENT",
            sourceId: payment._uuid,
            docNumber: payment.pay_number,
            date: payDate.date,
            description: `${partner.name}${payment.description ? ` — ${payment.description}` : ""}`,
            actorId,
        }, t);
        // ລົງບັນຊີ: ເງິນສົດ/ທະນາຄານ ຕາມອັດຕາມື້ຊຳລະ, ລູກໜີ້/ເຈົ້າໜີ້ ຕາມອັດຕາຂອງແຕ່ລະໃບ, ສ່ວນຕ່າງ = ອັດຕາແລກປ່ຽນ
        const cashAccount = await (0, glCore_1.treasuryAccountId)(account._uuid, await (0, journalHelpers_1.isCashAccount)(account, t), t);
        const cashBase = (0, glCore_1.round2)(amount * rate);
        const controlLines = allocations.map((a) => {
            const doc = docs.find((d) => Number(d._uuid) === a.doc_id);
            return {
                accountId: Number(doc.control_account_id),
                side: kind === exports.AR ? glCore_1.CREDIT : glCore_1.DEBIT,
                amount: a.amount,
                currencyId,
                rate: Number(doc.exchange_rate) || 1,
                description: doc.doc_number,
            };
        });
        const controlBase = (0, glCore_1.round2)(controlLines.reduce((n, l) => n + (0, glCore_1.round2)(l.amount * (l.rate ?? 1)), 0));
        const gain = (0, glCore_1.round2)(kind === exports.AR ? cashBase - controlBase : controlBase - cashBase);
        const draft = [
            { accountId: cashAccount, side: kind === exports.AR ? glCore_1.DEBIT : glCore_1.CREDIT, amount, currencyId, rate, treasuryAccountId: account._uuid, description: partner.name },
            ...controlLines,
        ];
        if (gain > 0)
            draft.push({ accountId: await (0, glCore_1.roleAccountId)("FX_GAIN", t), side: glCore_1.CREDIT, amount: gain });
        if (gain < 0)
            draft.push({ accountId: await (0, glCore_1.roleAccountId)("FX_LOSS", t), side: glCore_1.DEBIT, amount: -gain });
        await (0, glCore_1.postEntry)({
            date: payDate.date,
            sourceType: cfg.payCode,
            sourceId: payment._uuid,
            reference: payment.pay_number,
            description: `${partner.name}${payment.description ? ` — ${payment.description}` : ""}`,
            lines: draft,
            actorId,
        }, t);
        await t.commit();
        res.status(200).json({ message: "Successfully created payment", data: payment });
    }
    catch (error) {
        await t.rollback();
        fail(res, error, "Error creating payment");
    }
};
exports.createPartnerPayment = createPartnerPayment;
/** PUT /partner-payment/cancel/:id — ເງິນກັບຄືນບັນຊີເງິນຄັງ, ກັບລາຍການໃບບັນທຶກ ແລະ ຄືນຍອດຄ້າງໃຫ້ໃບ */
const cancelPartnerPayment = async (req, res) => {
    const t = await database_1.default.transaction();
    try {
        if (!(await arapReady(t))) {
            await t.rollback();
            return notReady(res);
        }
        const payment = await partnerPayment_1.default.findByPk((0, bansiHelpers_1.decodeId)(req), { transaction: t, lock: t.LOCK.UPDATE });
        if (!payment)
            throw new glCore_1.GlError("ບໍ່ພົບການຊຳລະ");
        if (Number(payment.status) !== ACTIVE)
            throw new glCore_1.GlError("ການຊຳລະນີ້ຖືກຍົກເລີກແລ້ວ");
        const kind = payment.pay_kind;
        const actorId = Number((0, bansiHelpers_1.actorOf)(req)) || null;
        const amount = (0, glCore_1.round2)(Number(payment.amount));
        const account = await treasuryAcount_1.default.findByPk(payment.treasury_account_id, { transaction: t, lock: t.LOCK.UPDATE });
        if (account) {
            if (kind === exports.AR && (Number(account.balance_treasury) || 0) < amount) {
                throw new glCore_1.GlError("ຍອດເງິນທີ່ໃຊ້ໄດ້ຂອງບັນຊີບໍ່ພໍ ຈຶ່ງຫັກຄືນ ແລະ ຍົກເລີກບໍ່ໄດ້");
            }
            await (0, accountMovement_1.moveBalance)(account, {
                direction: kind === exports.AR ? accountMovement_1.MOVE_OUT : accountMovement_1.MOVE_IN,
                amount,
                source: kind === exports.AR ? "AR_RECEIPT_CANCEL" : "AP_PAYMENT_CANCEL",
                sourceId: payment._uuid,
                docNumber: payment.pay_number,
                description: payment.description,
                actorId,
            }, t);
        }
        await (0, glCore_1.reverseSource)(KIND[kind].payCode, payment._uuid, t, actorId);
        await payment.update({ status: CANCELLED, updatedAt: new Date() }, { transaction: t });
        const allocations = await partnerPayment_1.PartnerAllocation.findAll({ where: { payment_id: payment._uuid }, transaction: t });
        await refreshPaid(allocations.map((a) => Number(a.doc_id)), t);
        await t.commit();
        res.status(200).json({ message: "Successfully cancelled payment" });
    }
    catch (error) {
        await t.rollback();
        fail(res, error, "Error cancelling payment");
    }
};
exports.cancelPartnerPayment = cancelPartnerPayment;
