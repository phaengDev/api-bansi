"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.undoFxReval = exports.postFxReval = exports.previewFxReval = void 0;
const sequelize_1 = require("sequelize");
const moment_1 = __importDefault(require("moment"));
const database_1 = __importDefault(require("../../config/database"));
const journalEntry_1 = __importDefault(require("../../models/journalEntry"));
const glCore_1 = require("./glCore");
const bansiHelpers_1 = require("./bansiHelpers");
/**
 * ປັບມູນຄ່າເງິນຕາຕ່າງປະເທດທ້າຍເດືອນ (IFRS for SMEs ພາກ 30): ຍອດ USD/THB… ຂອງ ບັນຊີເງິນຄັງ, ລູກໜີ້ ແລະ ເຈົ້າໜີ້ ທີ່ຍັງຄ້າງ
 * ຄິດເປັນກີບຕາມອັດຕາທ້າຍເດືອນ — ສ່ວນຕ່າງກັບຍອດກີບໃນບັນຊີ = ກຳໄລ/ຂາດທຶນອັດຕາແລກປ່ຽນ (ທີ່ຍັງບໍ່ເກີດຂຶ້ນ).
 * ລົງແບບ "ສ່ວນຕ່າງ" (ໃບ FX_REVAL ລະເດືອນ, source_id = YYYY-MM, ວັນທີທ້າຍເດືອນ): ຍອດກີບໃນບັນຊີລວມການປັບຄັ້ງກ່ອນແລ້ວ ຈຶ່ງລົງສະເພາະສ່ວນທີ່ປ່ຽນ.
 * ແຖວປັບເປັນ "ກີບຢ່າງດຽວ" (lakOnly) — ຍອດສະກຸນເດີມບໍ່ປ່ຽນ (ການກະທົບຍອດທະນາຄານບໍ່ກະທົບ)
 */
const fail = (res, error, fallback) => {
    if (error instanceof glCore_1.GlError) {
        res.status(400).json({ message: error.message });
        return;
    }
    (0, bansiHelpers_1.sendError)(res, error, fallback);
};
const monthEnd = (month) => (0, moment_1.default)(month, "YYYY-MM").endOf("month").format("YYYY-MM-DD");
const parseMonth = (value) => {
    const m = (0, moment_1.default)(String(value ?? ""), "YYYY-MM", true);
    if (!m.isValid())
        throw new glCore_1.GlError("ກະລຸນາເລືອກເດືອນ");
    return m.format("YYYY-MM");
};
/** ຄິດຍອດທີ່ຕ້ອງປັບ ນ ທ້າຍເດືອນ */
const compute = async (month, t) => {
    const end = monthEnd(month);
    const currencies = await database_1.default.query("SELECT _id AS id, name FROM tbl_currency", { type: sequelize_1.QueryTypes.SELECT, transaction: t });
    const foreignName = (id) => {
        const name = currencies.find((c) => Number(c.id) === Number(id))?.name;
        return name && name.toUpperCase() !== "LAK" ? name : null;
    };
    const items = [];
    const add = async (item) => {
        const rate = await (0, glCore_1.rateOf)(item.currency_id, end, t);
        const target = (0, glCore_1.round2)(item.foreign * rate);
        const diff = (0, glCore_1.round2)(target - item.book);
        if (Math.abs(diff) >= 0.01)
            items.push({ ...item, rate, target, diff });
    };
    // ບັນຊີເງິນຄັງ: ຍອດສະກຸນ = Σ amount_currency, ກີບ = Σ ໜີ້ − ມີ (ລວມແຖວປັບຄັ້ງກ່ອນ)
    const treasuries = await database_1.default.query(`SELECT l.treasury_account_id AS tid, l.account_id, l.currency_id, a.acountName AS name,
            SUM(l.amount_currency) AS foreign_total, SUM(l.debit - l.credit) AS book
     FROM tbl_journal_line l
     JOIN tbl_journal_entry e ON e._uuid = l.entry_id
     LEFT JOIN tbl_treasury_account a ON a._uuid = l.treasury_account_id
     WHERE l.treasury_account_id IS NOT NULL AND l.currency_id IS NOT NULL AND e.entry_date <= :end
     GROUP BY l.treasury_account_id, l.account_id, l.currency_id, a.acountName`, { type: sequelize_1.QueryTypes.SELECT, replacements: { end }, transaction: t });
    for (const r of treasuries) {
        const currency = foreignName(r.currency_id);
        if (!currency)
            continue;
        await add({
            kind: "treasury", label: r.name ?? `#${r.tid}`, currency, currency_id: Number(r.currency_id), account_id: Number(r.account_id),
            treasury_id: Number(r.tid), foreign: (0, glCore_1.round2)(Number(r.foreign_total)), book: (0, glCore_1.round2)(Number(r.book)),
        });
    }
    // ລູກໜີ້/ເຈົ້າໜີ້: ຍອດຄ້າງ ນ ທ້າຍເດືອນ × ອັດຕາຂອງໃບ + ການປັບຄັ້ງກ່ອນ (ແຖວກີບຢ່າງດຽວຂອງບັນຊີຄຸມ ສະກຸນນັ້ນ)
    const docs = await database_1.default.query(`SELECT d.doc_kind, d.control_account_id, d.currency_id,
            SUM(d.total - COALESCE(p.paid, 0)) AS outstanding,
            SUM((d.total - COALESCE(p.paid, 0)) * d.exchange_rate) AS historical
     FROM tbl_partner_doc d
     LEFT JOIN (
       SELECT a.doc_id, SUM(a.amount) AS paid FROM tbl_partner_allocation a
       JOIN tbl_partner_payment pp ON pp._uuid = a.payment_id
       WHERE pp.status = 1 AND pp.pay_date <= :end GROUP BY a.doc_id
     ) p ON p.doc_id = d._uuid
     WHERE d.status = 1 AND d.doc_date <= :end AND d.currency_id IS NOT NULL
     GROUP BY d.doc_kind, d.control_account_id, d.currency_id`, { type: sequelize_1.QueryTypes.SELECT, replacements: { end }, transaction: t }).catch(() => []);
    const previous = await database_1.default.query(`SELECT l.account_id, l.currency_id, SUM(l.debit - l.credit) AS net
     FROM tbl_journal_line l JOIN tbl_journal_entry e ON e._uuid = l.entry_id
     WHERE e.source_type = 'FX_REVAL' AND e.entry_date <= :end AND l.treasury_account_id IS NULL
       AND l.currency_id IS NOT NULL AND l.amount_currency = 0
     GROUP BY l.account_id, l.currency_id`, { type: sequelize_1.QueryTypes.SELECT, replacements: { end }, transaction: t });
    for (const d of docs) {
        const currency = foreignName(d.currency_id);
        if (!currency)
            continue;
        const isAr = Number(d.doc_kind) === 1;
        const prev = Number(previous.find((p) => Number(p.account_id) === Number(d.control_account_id) && Number(p.currency_id) === Number(d.currency_id))?.net ?? 0);
        await add({
            kind: isAr ? "ar" : "ap", label: isAr ? "ລູກໜີ້" : "ເຈົ້າໜີ້", currency, currency_id: Number(d.currency_id),
            account_id: Number(d.control_account_id), treasury_id: null, foreign: (0, glCore_1.round2)(Number(d.outstanding)),
            // ຊັບສິນ (ລູກໜີ້) ນັບຝັ່ງໜີ້, ເຈົ້າໜີ້ ນັບຝັ່ງມີ
            book: (0, glCore_1.round2)(Number(d.historical) + (isAr ? prev : -prev)),
        });
    }
    return items;
};
/** ໃບປັບຂອງເດືອນທີ່ຍັງມີຜົນ / ເດືອນລ່າສຸດທີ່ລົງແລ້ວ */
const activeEntry = (month, t) => journalEntry_1.default.findOne({ where: { source_type: "FX_REVAL", source_id: month, reversal_of: null, reversed_by: null }, transaction: t });
const latestMonth = async (t) => {
    const [row] = await database_1.default.query("SELECT MAX(source_id) AS month FROM tbl_journal_entry WHERE source_type = 'FX_REVAL' AND reversal_of IS NULL AND reversed_by IS NULL", { type: sequelize_1.QueryTypes.SELECT, transaction: t });
    return row?.month ?? null;
};
/** POST /fx-reval/preview { month } — ລາຍການທີ່ຈະປັບ + ລົງແລ້ວບໍ່ */
const previewFxReval = async (req, res) => {
    const t = await database_1.default.transaction();
    try {
        if (!(await (0, glCore_1.glReady)(t))) {
            await t.rollback();
            res.status(503).json({ message: "ຍັງບໍ່ໄດ້ເປີດໃຊ້ລະບົບບັນຊີຄູ່", notReady: true });
            return;
        }
        const month = parseMonth(req.body?.month);
        const posted = await activeEntry(month, t);
        // ລົງແລ້ວ = ຍອດໃນບັນຊີລວມການປັບນີ້ແລ້ວ — ສະແດງຍອດທີ່ຈະເປັນ ຖ້າລົງໃໝ່ ບໍ່ໄດ້ ຈຶ່ງສົ່ງສະເພາະຂໍ້ມູນໃບ
        const items = posted ? [] : await compute(month, t);
        const latest = await latestMonth(t);
        await t.rollback();
        res.status(200).json({
            month,
            posted: posted && { entry_number: posted.entry_number, entry_date: posted.entry_date, total: Number(posted.total_debit) },
            latest,
            items,
            // ຜົນກະທົບຕໍ່ກຳໄລ: ບວກ = ກຳໄລ (ຊັບສິນເພີ່ມ / ເຈົ້າໜີ້ຫຼຸດ), ລົບ = ຂາດທຶນ
            net: (0, glCore_1.round2)(items.reduce((n, i) => n + (i.kind === "ap" ? -i.diff : i.diff), 0)),
        });
    }
    catch (error) {
        await t.rollback();
        fail(res, error, "Error previewing FX revaluation");
    }
};
exports.previewFxReval = previewFxReval;
/** POST /fx-reval/post { month } — ລົງໃບປັບ (ເດືອນລ່າສຸດທີ່ລົງແລ້ວ ລົງຊ້ຳໄດ້: ກັບໃບເກົ່າແລ້ວຄິດໃໝ່) */
const postFxReval = async (req, res) => {
    const t = await database_1.default.transaction();
    try {
        const month = parseMonth(req.body?.month);
        const date = monthEnd(month);
        if (date > (0, moment_1.default)().utcOffset("+07:00").endOf("month").format("YYYY-MM-DD"))
            throw new glCore_1.GlError("ປັບເດືອນທີ່ຍັງບໍ່ເຖິງບໍ່ໄດ້");
        await (0, glCore_1.assertOpenPeriod)(date, t);
        const latest = await latestMonth(t);
        if (latest && month < latest)
            throw new glCore_1.GlError(`ປັບອັດຕາຮອດ ${(0, moment_1.default)(latest).format("MM/YYYY")} ແລ້ວ — ປັບເດືອນກ່ອນໜ້ານັ້ນບໍ່ໄດ້`);
        const actorId = Number((0, bansiHelpers_1.actorOf)(req)) || null;
        const existing = await activeEntry(month, t);
        if (existing)
            await (0, glCore_1.reverseEntry)(existing, t, { actorId, description: `ຄິດໃໝ່ — ກັບລາຍການ ${existing.entry_number}` });
        const items = await compute(month, t);
        if (!items.length)
            throw new glCore_1.GlError("ບໍ່ມີຍອດເງິນຕາຕ່າງປະເທດທີ່ຕ້ອງປັບ");
        const gainAccount = await (0, glCore_1.roleAccountId)("FX_GAIN", t);
        const lossAccount = await (0, glCore_1.roleAccountId)("FX_LOSS", t);
        const lines = [];
        let gain = 0;
        for (const i of items) {
            // ຊັບສິນ (ເງິນຄັງ, ລູກໜີ້): diff ບວກ = ໜີ້ ບັນຊີ (ກຳໄລ); ເຈົ້າໜີ້: diff ບວກ = ມີ ບັນຊີ (ຂາດທຶນ)
            const assetSide = i.kind === "ap" ? (i.diff > 0 ? glCore_1.CREDIT : glCore_1.DEBIT) : i.diff > 0 ? glCore_1.DEBIT : glCore_1.CREDIT;
            lines.push({
                accountId: i.account_id, side: assetSide, amount: Math.abs(i.diff), currencyId: i.currency_id, lakOnly: true,
                treasuryAccountId: i.treasury_id, description: `${i.label} ${i.foreign.toLocaleString("en-US")} ${i.currency} × ${i.rate}`,
            });
            gain = (0, glCore_1.round2)(gain + (assetSide === glCore_1.DEBIT ? Math.abs(i.diff) : -Math.abs(i.diff)));
        }
        if (gain > 0)
            lines.push({ accountId: gainAccount, side: glCore_1.CREDIT, amount: gain, description: "ກຳໄລອັດຕາແລກປ່ຽນ (ຍັງບໍ່ເກີດຂຶ້ນ)" });
        if (gain < 0)
            lines.push({ accountId: lossAccount, side: glCore_1.DEBIT, amount: -gain, description: "ຂາດທຶນອັດຕາແລກປ່ຽນ (ຍັງບໍ່ເກີດຂຶ້ນ)" });
        const entry = await (0, glCore_1.postEntry)({
            date, sourceType: "FX_REVAL", sourceId: month, reference: `FXR-${month}`,
            description: `ປັບມູນຄ່າເງິນຕາຕ່າງປະເທດ ${(0, moment_1.default)(month).format("MM/YYYY")}`, lines, actorId,
        }, t);
        await t.commit();
        res.status(200).json({ message: "Successfully posted FX revaluation", data: { entry_number: entry.entry_number, net: gain } });
    }
    catch (error) {
        await t.rollback();
        fail(res, error, "Error posting FX revaluation");
    }
};
exports.postFxReval = postFxReval;
/** DELETE /fx-reval/:month — ຍົກເລີກໃບປັບຂອງເດືອນລ່າສຸດ */
const undoFxReval = async (req, res) => {
    const t = await database_1.default.transaction();
    try {
        const month = parseMonth(req.params.month);
        if ((await latestMonth(t)) !== month)
            throw new glCore_1.GlError("ຍົກເລີກໄດ້ສະເພາະເດືອນລ່າສຸດທີ່ປັບ");
        const entry = await activeEntry(month, t);
        if (!entry)
            throw new glCore_1.GlError("ບໍ່ພົບໃບປັບຂອງເດືອນນີ້");
        await (0, glCore_1.reverseEntry)(entry, t, { actorId: Number((0, bansiHelpers_1.actorOf)(req)) || null, description: `ຍົກເລີກການປັບອັດຕາ ${(0, moment_1.default)(month).format("MM/YYYY")}` });
        await t.commit();
        res.status(200).json({ message: "Successfully removed FX revaluation" });
    }
    catch (error) {
        await t.rollback();
        fail(res, error, "Error removing FX revaluation");
    }
};
exports.undoFxReval = undoFxReval;
