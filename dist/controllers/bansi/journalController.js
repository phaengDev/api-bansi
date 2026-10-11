"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGlLedger = exports.getGlBalances = exports.reverseJournalEntry = exports.createJournalEntry = exports.getJournalEntries = void 0;
const sequelize_1 = require("sequelize");
const journalEntry_1 = __importDefault(require("../../models/journalEntry"));
const journalLine_1 = __importDefault(require("../../models/journalLine"));
const chartAccount_1 = __importDefault(require("../../models/chartAccount"));
const userModel_1 = __importDefault(require("../../models/userModel"));
const bansiHelpers_1 = require("./bansiHelpers");
const journalHelpers_1 = require("./journalHelpers");
const glCore_1 = require("./glCore");
/**
 * ສະໝຸດບັນຊີ (tbl_journal_entry + tbl_journal_line): ລາຍການໃບບັນທຶກ, ບັນທຶກທົ່ວໄປ (MANUAL),
 * ກັບລາຍການ ແລະ ຍອດຕາມບັນຊີ (ງົບທົດລອງ / ໃບສະຫຼຸບຊັບສົມບັດ / ປຶ້ມບັນຊີໃຫຍ່)
 */
const notReady = (res) => res.status(503).json({ message: "ຍັງບໍ່ໄດ້ສ້າງຕາຕະລາງບັນຊີຄູ່ — ແລ່ນ sql/create_gl_accounting.sql ກ່ອນ", notReady: true });
const fail = (res, error, fallback) => {
    if (error instanceof glCore_1.GlError) {
        res.status(400).json({ message: error.message });
        return;
    }
    (0, bansiHelpers_1.sendError)(res, error, fallback);
};
/** ຊ່ວງວັນທີຈາກ body — ບໍ່ສົ່ງ end = ມື້ນີ້ */
const rangeOf = (body) => ({
    start: (0, bansiHelpers_1.toDateOnly)(body?.start_date),
    end: (0, bansiHelpers_1.toDateOnly)(body?.end_date) ?? (0, journalHelpers_1.todayLao)(),
});
const lineInclude = {
    model: journalLine_1.default,
    as: "lines",
    include: [{ model: chartAccount_1.default, as: "account", attributes: ["_uuid", "account_code", "name_la", "name_en", "name_cn", "account_group"] }],
};
/**
 * POST /journal-entry/fetch { start_date?, end_date?, source_type?, account_id?, keyword? } —
 * ໃບບັນທຶກຕາມວັນທີ (ໃໝ່ສຸດກ່ອນ) ພ້ອມແຖວ ແລະ ບັນຊີ
 */
const getJournalEntries = async (req, res) => {
    try {
        if (!(await (0, glCore_1.glReady)()))
            return notReady(res);
        const body = req.body || {};
        const { start, end } = rangeOf(body);
        const where = { entry_date: { ...(start ? { [sequelize_1.Op.gte]: start } : {}), [sequelize_1.Op.lte]: end } };
        if (body.source_type)
            where.source_type = String(body.source_type);
        const keyword = String(body.keyword ?? "").trim();
        if (keyword) {
            where[sequelize_1.Op.or] = [
                { entry_number: { [sequelize_1.Op.like]: `%${keyword}%` } },
                { reference: { [sequelize_1.Op.like]: `%${keyword}%` } },
                { description: { [sequelize_1.Op.like]: `%${keyword}%` } },
            ];
        }
        if (body.account_id) {
            const ids = await journalLine_1.default.findAll({ where: { account_id: Number(body.account_id) }, attributes: ["entry_id"], raw: true });
            where._uuid = [...new Set(ids.map((r) => Number(r.entry_id)))];
        }
        const rows = await journalEntry_1.default.findAll({
            where,
            order: [["entry_date", "DESC"], ["_uuid", "DESC"]],
            include: [lineInclude],
        });
        const userIds = [...new Set(rows.map((r) => Number(r.created_by)).filter(Boolean))];
        const users = userIds.length ? await userModel_1.default.findAll({ where: { user_uuid: userIds }, attributes: ["user_uuid", "user_name"] }) : [];
        const data = rows.map((r) => {
            const plain = r.get({ plain: true });
            plain.lines.sort((a, b) => a.line_no - b.line_no);
            return { ...plain, user: users.find((u) => Number(u.user_uuid) === Number(r.created_by)) ?? null };
        });
        res.status(200).json({ data, total: data.length });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting journal entries");
    }
};
exports.getJournalEntries = getJournalEntries;
/**
 * POST /journal-entry/create — ບັນທຶກທົ່ວໄປ
 * { entry_date, reference?, description?, currency_id?, exchange_rate?, lines: [{ account_id, debit, credit, description? }] }
 * ທຸກແຖວເປັນສະກຸນດຽວກັນ (currency_id; ບໍ່ສົ່ງ = LAK); ແຕ່ລະແຖວມີໜີ້ ຫຼື ມີ ຢ່າງໃດຢ່າງໜຶ່ງ; ໜີ້ລວມ = ມີລວມ
 */
const createJournalEntry = async (req, res) => {
    const t = await journalEntry_1.default.sequelize.transaction();
    try {
        if (!(await (0, glCore_1.glReady)(t))) {
            await t.rollback();
            return notReady(res);
        }
        const body = req.body || {};
        const date = (0, bansiHelpers_1.toDateOnly)(body.entry_date) ?? (0, journalHelpers_1.todayLao)();
        if (date > (0, journalHelpers_1.todayLao)())
            throw new glCore_1.GlError("ວັນທີຕ້ອງບໍ່ເກີນມື້ນີ້");
        const items = Array.isArray(body.lines) ? body.lines : [];
        const currencyId = body.currency_id ? Number(body.currency_id) : null;
        const rate = Number(body.exchange_rate) > 0 ? Number(body.exchange_rate) : await (0, glCore_1.rateOf)(currencyId, date, t);
        const lines = [];
        let debit = 0;
        let credit = 0;
        items.forEach((item, i) => {
            const dr = (0, glCore_1.round2)(Number(item?.debit) || 0);
            const cr = (0, glCore_1.round2)(Number(item?.credit) || 0);
            if (!dr && !cr)
                return;
            if (dr < 0 || cr < 0)
                throw new glCore_1.GlError(`ແຖວ ${i + 1}: ຈຳນວນຕ້ອງບໍ່ຕິດລົບ`);
            if (dr && cr)
                throw new glCore_1.GlError(`ແຖວ ${i + 1}: ໃສ່ໄດ້ຝັ່ງໜີ້ ຫຼື ຝັ່ງມີ ຢ່າງໃດຢ່າງໜຶ່ງ`);
            if (!item?.account_id)
                throw new glCore_1.GlError(`ແຖວ ${i + 1}: ກະລຸນາເລືອກບັນຊີ`);
            debit += dr;
            credit += cr;
            lines.push({
                accountId: Number(item.account_id),
                side: dr ? glCore_1.DEBIT : glCore_1.CREDIT,
                amount: dr || cr,
                currencyId,
                rate,
                description: String(item?.description ?? "").trim() || null,
            });
        });
        if ((0, glCore_1.round2)(debit) !== (0, glCore_1.round2)(credit))
            throw new glCore_1.GlError("ຍອດໜີ້ ແລະ ຍອດມີ ບໍ່ເທົ່າກັນ");
        const entry = await (0, glCore_1.postEntry)({
            date,
            sourceType: "MANUAL",
            reference: String(body.reference ?? "").trim() || null,
            description: String(body.description ?? "").trim() || null,
            lines,
            actorId: Number((0, bansiHelpers_1.actorOf)(req)) || null,
        }, t);
        await t.commit();
        res.status(200).json({ message: "Successfully created journal entry", data: entry });
    }
    catch (error) {
        await t.rollback();
        fail(res, error, "Error creating journal entry");
    }
};
exports.createJournalEntry = createJournalEntry;
/**
 * PUT /journal-entry/reverse/:id { date?, description? } — ກັບລາຍການບັນທຶກທົ່ວໄປ.
 * ໃບທີ່ລົງຈາກເອກະສານ (ລາຍຮັບ, ລາຍຈ່າຍ …) ຕ້ອງຍົກເລີກທີ່ເອກະສານ
 */
const reverseJournalEntry = async (req, res) => {
    const t = await journalEntry_1.default.sequelize.transaction();
    try {
        if (!(await (0, glCore_1.glReady)(t))) {
            await t.rollback();
            return notReady(res);
        }
        const entry = await journalEntry_1.default.findByPk((0, bansiHelpers_1.decodeId)(req), { transaction: t, lock: t.LOCK.UPDATE });
        if (!entry)
            throw new glCore_1.GlError("ບໍ່ພົບໃບບັນທຶກ");
        if (entry.source_type !== "MANUAL")
            throw new glCore_1.GlError("ໃບນີ້ລົງຈາກເອກະສານ — ຍົກເລີກທີ່ເອກະສານຕົ້ນທາງແທນ");
        const date = req.body?.date ? (0, bansiHelpers_1.toDateOnly)(req.body.date) : null;
        if (req.body?.date && !date)
            throw new glCore_1.GlError("ວັນທີບໍ່ຖືກຕ້ອງ");
        if (date && date > (0, journalHelpers_1.todayLao)())
            throw new glCore_1.GlError("ວັນທີຕ້ອງບໍ່ເກີນມື້ນີ້");
        const reversal = await (0, glCore_1.reverseEntry)(entry, t, {
            date: date ?? undefined,
            actorId: Number((0, bansiHelpers_1.actorOf)(req)) || null,
            description: String(req.body?.description ?? "").trim() || undefined,
        });
        await t.commit();
        res.status(200).json({ message: "Successfully reversed journal entry", data: reversal });
    }
    catch (error) {
        await t.rollback();
        fail(res, error, "Error reversing journal entry");
    }
};
exports.reverseJournalEntry = reverseJournalEntry;
/**
 * POST /gl/balances { start_date?, end_date? } — ຍອດຕໍ່ບັນຊີ (LAK):
 * opening = ໜີ້ − ມີ ກ່ອນ start_date, debit/credit = ໃນຊ່ວງ, closing = opening + debit − credit.
 * ບໍ່ສົ່ງ start_date = ທຸກຢ່າງເຖິງ end_date ຢູ່ໃນຊ່ວງ (ໃຊ້ກັບໃບສະຫຼຸບຊັບສົມບັດ)
 */
const getGlBalances = async (req, res) => {
    try {
        if (!(await (0, glCore_1.glReady)()))
            return notReady(res);
        const { start, end } = rangeOf(req.body);
        const rows = await journalEntry_1.default.sequelize.query(`SELECT l.account_id,
        SUM(CASE WHEN :start IS NOT NULL AND e.entry_date < :start THEN l.debit - l.credit ELSE 0 END) AS opening,
        SUM(CASE WHEN :start IS NULL OR e.entry_date >= :start THEN l.debit ELSE 0 END) AS debit,
        SUM(CASE WHEN :start IS NULL OR e.entry_date >= :start THEN l.credit ELSE 0 END) AS credit
       FROM tbl_journal_line l
       JOIN tbl_journal_entry e ON e._uuid = l.entry_id
       WHERE e.entry_date <= :end
       GROUP BY l.account_id`, { type: sequelize_1.QueryTypes.SELECT, replacements: { start, end } });
        const data = rows.map((r) => {
            const opening = (0, glCore_1.round2)(Number(r.opening));
            const debit = (0, glCore_1.round2)(Number(r.debit));
            const credit = (0, glCore_1.round2)(Number(r.credit));
            return { account_id: Number(r.account_id), opening, debit, credit, closing: (0, glCore_1.round2)(opening + debit - credit) };
        });
        res.status(200).json({ data, start_date: start, end_date: end });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting GL balances");
    }
};
exports.getGlBalances = getGlBalances;
/**
 * POST /gl/ledger { account_id, start_date?, end_date? } — ປຶ້ມບັນຊີໃຫຍ່ຂອງບັນຊີດຽວ:
 * ຍອດຍົກມາ (ໜີ້ − ມີ ກ່ອນ start_date) + ທຸກແຖວໃນຊ່ວງ ລຽງຕາມວັນທີ ພ້ອມຍອດສະສົມ
 */
const getGlLedger = async (req, res) => {
    try {
        if (!(await (0, glCore_1.glReady)()))
            return notReady(res);
        const accountId = Number(req.body?.account_id);
        if (!accountId)
            throw new glCore_1.GlError("ກະລຸນາເລືອກບັນຊີ");
        const { start, end } = rangeOf(req.body);
        const [opening] = await journalEntry_1.default.sequelize.query(`SELECT COALESCE(SUM(l.debit - l.credit), 0) AS balance
       FROM tbl_journal_line l JOIN tbl_journal_entry e ON e._uuid = l.entry_id
       WHERE l.account_id = :accountId AND :start IS NOT NULL AND e.entry_date < :start`, { type: sequelize_1.QueryTypes.SELECT, replacements: { accountId, start } });
        const lines = await journalEntry_1.default.sequelize.query(`SELECT l._uuid, l.line_no, l.description AS line_description, l.debit, l.credit, l.currency_id,
              l.amount_currency, l.exchange_rate, l.treasury_account_id,
              e._uuid AS entry_id, e.entry_number, e.entry_date, e.source_type, e.source_id, e.reference,
              e.description, e.reversal_of, e.reversed_by
       FROM tbl_journal_line l JOIN tbl_journal_entry e ON e._uuid = l.entry_id
       WHERE l.account_id = :accountId AND e.entry_date <= :end AND (:start IS NULL OR e.entry_date >= :start)
       ORDER BY e.entry_date ASC, e._uuid ASC, l.line_no ASC`, { type: sequelize_1.QueryTypes.SELECT, replacements: { accountId, start, end } });
        let running = (0, glCore_1.round2)(Number(opening?.balance));
        const data = lines.map((l) => {
            running = (0, glCore_1.round2)(running + Number(l.debit) - Number(l.credit));
            return { ...l, debit: Number(l.debit), credit: Number(l.credit), amount_currency: Number(l.amount_currency), balance: running };
        });
        res.status(200).json({ opening: (0, glCore_1.round2)(Number(opening?.balance)), closing: running, data, start_date: start, end_date: end });
    }
    catch (error) {
        fail(res, error, "Error getting ledger");
    }
};
exports.getGlLedger = getGlLedger;
