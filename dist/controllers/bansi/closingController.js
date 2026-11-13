"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteBankRec = exports.saveBankRec = exports.openBankRec = exports.getBankRecHistory = exports.getBankRecAccounts = exports.reopenPeriod = exports.closePeriod = exports.getPeriodCloseStatus = void 0;
const sequelize_1 = require("sequelize");
const moment_1 = __importDefault(require("moment"));
const database_1 = __importDefault(require("../../config/database"));
const fiscalYear_1 = __importDefault(require("../../models/fiscalYear"));
const journalLine_1 = __importDefault(require("../../models/journalLine"));
const bankReconciliation_1 = __importDefault(require("../../models/bankReconciliation"));
const glCore_1 = require("./glCore");
const accountSettingController_1 = require("./accountSettingController");
const bansiHelpers_1 = require("./bansiHelpers");
const journalHelpers_1 = require("./journalHelpers");
const fixedAssetController_1 = require("./fixedAssetController");
/**
 * ປິດງວດບັນຊີ (ກົດໝາຍບັນຊີ ມາດຕາ 22–23): ສະຖານະແຕ່ລະເດືອນຂອງປີການເງິນ + ລາຍການກວດກ່ອນປິດ,
 * ປິດ/ເປີດງວດຄືນ (tbl_account_setting.lock_date) ແລະ ກະທົບຍອດທະນາຄານ (tbl_bank_reconciliation)
 */
const fail = (res, error, fallback) => {
    if (error instanceof glCore_1.GlError) {
        res.status(400).json({ message: error.message });
        return;
    }
    (0, bansiHelpers_1.sendError)(res, error, fallback);
};
const notReady = (res) => res.status(503).json({ message: "ຍັງບໍ່ໄດ້ເປີດໃຊ້ລະບົບບັນຊີຄູ່", notReady: true });
const monthEnd = (month) => (0, moment_1.default)(month, "YYYY-MM").endOf("month").format("YYYY-MM-DD");
const parseMonth = (value) => {
    const m = (0, moment_1.default)(String(value ?? ""), "YYYY-MM", true);
    if (!m.isValid())
        throw new glCore_1.GlError("ກະລຸນາເລືອກເດືອນ");
    return m.format("YYYY-MM");
};
/** ບັນຊີເງິນຄັງທີ່ໃຊ້ງານ ພ້ອມສະກຸນ ແລະ ທະນາຄານ */
const treasuries = async () => {
    const rows = await database_1.default.query(`SELECT a._uuid AS id, a.acountName AS name, a.acount_number AS number, b.abbr AS bank, c.name AS currency, ta.type_code
     FROM tbl_treasury_account a
     LEFT JOIN tbl_type_treasury tt ON tt._uuid = a.type_treasuryid
     LEFT JOIN tbl_currency c ON c._id = tt.currencyId
     LEFT JOIN tbl_type_account ta ON ta._uuid = tt.typeId
     LEFT JOIN tbl_banks b ON b._uuid = a.bankId
     WHERE a.status = 1
     ORDER BY a.sort ASC, a._uuid ASC`, { type: sequelize_1.QueryTypes.SELECT });
    return rows.map((r) => ({
        id: Number(r.id), name: r.name, number: r.number ?? null, bank: r.bank ?? null, currency: r.currency ?? null,
        is_cash: String(r.type_code ?? "") === journalHelpers_1.CASH_CLASS_CODE,
    }));
};
/** ບັນຊີເງິນຄັງທີ່ຕ້ອງກະທົບຍອດ = ບໍ່ແມ່ນເງິນສົດ ແລະ ມີລາຍການໃນສະໝຸດບັນຊີແລ້ວ */
const bankAccounts = async () => {
    const used = await database_1.default.query("SELECT DISTINCT treasury_account_id AS id FROM tbl_journal_line WHERE treasury_account_id IS NOT NULL", { type: sequelize_1.QueryTypes.SELECT });
    const ids = new Set(used.map((r) => Number(r.id)));
    return (await treasuries()).filter((a) => !a.is_cash && ids.has(a.id));
};
/** ຍອດສະກຸນຂອງບັນຊີເງິນຄັງ ນ ວັນທີ (ໜີ້ + / ມີ −) */
const bookBalance = async (treasuryId, date) => {
    const [row] = await database_1.default.query(`SELECT COALESCE(SUM(l.amount_currency), 0) AS total
     FROM tbl_journal_line l JOIN tbl_journal_entry e ON e._uuid = l.entry_id
     WHERE l.treasury_account_id = :treasuryId AND e.entry_date <= :date`, { type: sequelize_1.QueryTypes.SELECT, replacements: { treasuryId, date } });
    return (0, glCore_1.round2)(Number(row?.total ?? 0));
};
const lastReconciliation = (treasuryId) => bankReconciliation_1.default.findOne({ where: { treasury_account_id: treasuryId }, order: [["statement_date", "DESC"], ["_uuid", "DESC"]] });
/** ລາຍການກວດກ່ອນປິດເດືອນ — ສະເພາະຟັງຊັນທີ່ບໍລິສັດເປີດໃຊ້ */
const checksOf = async (month, setting, banks, foreign) => {
    const end = monthEnd(month);
    const checks = [];
    const posted = async (sourceType) => (await database_1.default.query(`SELECT COUNT(*) AS n FROM tbl_journal_entry WHERE source_type = :sourceType AND source_id = :month AND reversed_by IS NULL AND reversal_of IS NULL`, { type: sequelize_1.QueryTypes.SELECT, replacements: { sourceType, month } }))[0]?.n > 0;
    // ຄ່າຫຼຸ້ຍຫ້ຽນ: ຖາມສະເພາະເມື່ອມີຊັບສົມບັດທີ່ຕ້ອງຄິດເດືອນນີ້ (ຫຼື ລົງແລ້ວ)
    if (Number(setting.use_fixed_assets) === 1) {
        const done = await posted("DEPRECIATION");
        if (done || (await (0, fixedAssetController_1.computeMonth)(month)).length)
            checks.push({ key: "depreciation", ok: done });
    }
    if (Number(setting.use_bank_reconciliation) === 1 && banks.length) {
        const pending = [];
        for (const bank of banks) {
            const last = await lastReconciliation(bank.id);
            if (!last || String(last.statement_date) < end)
                pending.push(bank.name);
        }
        checks.push({ key: "bank", ok: !pending.length, detail: pending.join(", ") || undefined });
    }
    if (Number(setting.use_fx_revaluation) === 1 && foreign.length)
        checks.push({ key: "fx", ok: await posted("FX_REVAL") });
    return checks;
};
/**
 * GET /period-close/status — ທຸກເດືອນຂອງປີການເງິນປັດຈຸບັນ (ຫຼື ?fiscal_id=): ປິດແລ້ວບໍ່, ຈຳນວນໃບບັນທຶກ,
 * ແລະ ລາຍການກວດຂອງເດືອນທີ່ຈະປິດຖັດໄປ
 */
const getPeriodCloseStatus = async (req, res) => {
    try {
        if (!(await (0, glCore_1.glReady)()))
            return notReady(res);
        const fiscalId = Number(req.query.fiscal_id) || null;
        const fiscal = fiscalId
            ? await fiscalYear_1.default.findByPk(fiscalId)
            : (await fiscalYear_1.default.findOne({ where: { is_current: 1 } })) ?? (await fiscalYear_1.default.findOne({ order: [["start_date", "DESC"]] }));
        if (!fiscal)
            throw new glCore_1.GlError("ຍັງບໍ່ມີປີການເງິນ — ສ້າງຢູ່ ຕັ້ງຄ່າບັນຊີ → ປີການເງິນ");
        const setting = await (0, accountSettingController_1.loadAccountSetting)();
        const lock = setting.lock_date ? String(setting.lock_date) : null;
        const counts = await database_1.default.query(`SELECT DATE_FORMAT(entry_date, '%Y-%m') AS month, COUNT(*) AS n FROM tbl_journal_entry
       WHERE entry_date BETWEEN :start AND :end GROUP BY DATE_FORMAT(entry_date, '%Y-%m')`, { type: sequelize_1.QueryTypes.SELECT, replacements: { start: fiscal.start_date, end: fiscal.end_date } });
        const banks = await bankAccounts();
        const foreign = (await treasuries()).filter((a) => a.currency && a.currency.toUpperCase() !== "LAK");
        const months = [];
        for (const m = (0, moment_1.default)(fiscal.start_date).startOf("month"); m.isSameOrBefore((0, moment_1.default)(fiscal.end_date), "month"); m.add(1, "month")) {
            const key = m.format("YYYY-MM");
            const end = monthEnd(key);
            months.push({
                month: key,
                start: m.format("YYYY-MM-DD"),
                end,
                closed: Number(fiscal.status) === 2 || (!!lock && end <= lock),
                entries: Number(counts.find((c) => c.month === key)?.n ?? 0),
            });
        }
        const next = months.find((m) => !m.closed);
        if (next)
            next.checks = await checksOf(next.month, setting, banks, foreign);
        res.status(200).json({ fiscal, lock_date: lock, months, next: next?.month ?? null });
    }
    catch (error) {
        fail(res, error, "Error getting period close status");
    }
};
exports.getPeriodCloseStatus = getPeriodCloseStatus;
/** PUT /period-close/close { month } — ປິດງວດຮອດທ້າຍເດືອນນັ້ນ (ລວມທຸກເດືອນກ່ອນໜ້າ) */
const closePeriod = async (req, res) => {
    try {
        const month = parseMonth(req.body?.month);
        const end = monthEnd(month);
        const setting = await (0, accountSettingController_1.loadAccountSetting)();
        const lock = setting.lock_date ? String(setting.lock_date) : null;
        if (lock && end <= lock)
            throw new glCore_1.GlError(`ເດືອນ ${(0, moment_1.default)(month).format("MM/YYYY")} ປິດແລ້ວ`);
        if (end > (0, moment_1.default)().utcOffset("+07:00").endOf("month").format("YYYY-MM-DD"))
            throw new glCore_1.GlError("ປິດງວດເດືອນທີ່ຍັງບໍ່ທັນເຖິງບໍ່ໄດ້");
        await setting.update({ lock_date: end, locked_by: (0, bansiHelpers_1.actorOf)(req) || null, updatedAt: new Date() });
        res.status(200).json({ message: "Successfully closed period", lock_date: end });
    }
    catch (error) {
        fail(res, error, "Error closing period");
    }
};
exports.closePeriod = closePeriod;
/** PUT /period-close/reopen { month } — ເປີດເດືອນນັ້ນ ແລະ ທຸກເດືອນຫຼັງຈາກນັ້ນຄືນ (ປີການເງິນທີ່ປິດແລ້ວ ຕ້ອງເປີດປີຄືນກ່ອນ) */
const reopenPeriod = async (req, res) => {
    try {
        const month = parseMonth(req.body?.month);
        const start = (0, moment_1.default)(month, "YYYY-MM").startOf("month").format("YYYY-MM-DD");
        const closedYear = await fiscalYear_1.default.findOne({ where: { status: 2, end_date: { [sequelize_1.Op.gte]: start }, start_date: { [sequelize_1.Op.lte]: monthEnd(month) } } });
        if (closedYear)
            throw new glCore_1.GlError(`ປີການເງິນ ${closedYear.fiscal_code} ປິດບັນຊີແລ້ວ — ເປີດປີການເງິນຄືນກ່ອນ`);
        const setting = await (0, accountSettingController_1.loadAccountSetting)();
        const lock = await (0, glCore_1.lockDateOf)();
        if (!lock || start > lock)
            throw new glCore_1.GlError(`ເດືອນ ${(0, moment_1.default)(month).format("MM/YYYY")} ຍັງບໍ່ໄດ້ປິດ`);
        const newLock = (0, moment_1.default)(start).subtract(1, "day").format("YYYY-MM-DD");
        await setting.update({ lock_date: newLock, locked_by: (0, bansiHelpers_1.actorOf)(req) || null, updatedAt: new Date() });
        res.status(200).json({ message: "Successfully reopened period", lock_date: newLock });
    }
    catch (error) {
        fail(res, error, "Error reopening period");
    }
};
exports.reopenPeriod = reopenPeriod;
// ================= ກະທົບຍອດທະນາຄານ
/** GET /bank-rec/accounts — ບັນຊີທະນາຄານ + ຍອດໃນລະບົບ + ການກະທົບຍອດຄັ້ງລ່າສຸດ + ຈຳນວນລາຍການທີ່ຍັງບໍ່ກະທົບ */
const getBankRecAccounts = async (_req, res) => {
    try {
        if (!(await (0, glCore_1.glReady)()))
            return notReady(res);
        const today = (0, moment_1.default)().utcOffset("+07:00").format("YYYY-MM-DD");
        const list = await bankAccounts();
        const pending = await database_1.default.query(`SELECT treasury_account_id AS id, COUNT(*) AS n FROM tbl_journal_line
       WHERE treasury_account_id IS NOT NULL AND reconciliation_id IS NULL AND amount_currency <> 0 GROUP BY treasury_account_id`, { type: sequelize_1.QueryTypes.SELECT });
        const data = [];
        for (const a of list) {
            const last = await lastReconciliation(a.id);
            data.push({
                ...a,
                book_balance: await bookBalance(a.id, today),
                uncleared: Number(pending.find((p) => Number(p.id) === a.id)?.n ?? 0),
                last: last && { id: last._uuid, statement_date: last.statement_date, statement_balance: Number(last.statement_balance) },
            });
        }
        res.status(200).json({ data });
    }
    catch (error) {
        fail(res, error, "Error getting bank accounts");
    }
};
exports.getBankRecAccounts = getBankRecAccounts;
/** POST /bank-rec/history { treasury_account_id } — ການກະທົບຍອດທີ່ຜ່ານມາ (ໃໝ່ສຸດກ່ອນ) */
const getBankRecHistory = async (req, res) => {
    try {
        const rows = await bankReconciliation_1.default.findAll({
            where: { treasury_account_id: Number(req.body?.treasury_account_id) || 0 },
            order: [["statement_date", "DESC"], ["_uuid", "DESC"]],
            limit: 60,
        });
        res.status(200).json({ data: rows });
    }
    catch (error) {
        fail(res, error, "Error getting reconciliation history");
    }
};
exports.getBankRecHistory = getBankRecHistory;
/**
 * ແຖວທີ່ຍັງບໍ່ກະທົບຂອງບັນຊີ ຮອດວັນທີ — ແຍກຄູ່ "ໃບເດີມ + ໃບກັບລາຍການ" ທີ່ຫັກລ້າງກັນເປັນ 0 ອອກ
 * (ບໍ່ເຄີຍຜ່ານທະນາຄານ, ຕິກໃຫ້ເອງຕອນບັນທຶກ)
 */
const openLines = async (treasuryId, date) => {
    const rows = await database_1.default.query(`SELECT l._uuid AS line_id, e._uuid AS entry_id, COALESCE(e.reversal_of, e._uuid) AS pair_id, e.reversal_of, e.reversed_by,
            e.entry_number, e.entry_date, e.source_type, e.reference, COALESCE(l.description, e.description) AS description, l.amount_currency
     FROM tbl_journal_line l JOIN tbl_journal_entry e ON e._uuid = l.entry_id
     WHERE l.treasury_account_id = :treasuryId AND l.reconciliation_id IS NULL AND e.entry_date <= :date
     ORDER BY e.entry_date ASC, e._uuid ASC, l.line_no ASC`, { type: sequelize_1.QueryTypes.SELECT, replacements: { treasuryId, date } });
    const lines = rows.map((r) => ({
        line_id: Number(r.line_id), entry_id: Number(r.entry_id), pair_id: Number(r.pair_id), entry_number: r.entry_number,
        entry_date: r.entry_date, source_type: r.source_type, reference: r.reference, description: r.description, amount: (0, glCore_1.round2)(Number(r.amount_currency)),
    }));
    const pairTotal = new Map();
    rows.filter((r) => r.reversal_of || r.reversed_by).forEach((r) => {
        const cur = pairTotal.get(Number(r.pair_id)) ?? { total: 0, count: 0 };
        pairTotal.set(Number(r.pair_id), { total: cur.total + Number(r.amount_currency), count: cur.count + 1 });
    });
    // ແຖວປັບມູນຄ່າເປັນກີບ (ຍອດສະກຸນ 0) ແລະ ຄູ່ທີ່ຫັກລ້າງກັນ ບໍ່ເຄີຍຜ່ານທະນາຄານ — ຕິກໃຫ້ເອງ
    const netZero = (l) => {
        if (Math.abs(l.amount) < 0.005)
            return true;
        const p = pairTotal.get(l.pair_id);
        return !!p && p.count >= 2 && Math.abs(p.total) < 0.005;
    };
    return { visible: lines.filter((l) => !netZero(l)), auto: lines.filter(netZero).map((l) => l.line_id) };
};
/** POST /bank-rec/open { treasury_account_id, statement_date } — ຂໍ້ມູນສຳລັບກະທົບຍອດຄັ້ງໃໝ່ */
const openBankRec = async (req, res) => {
    try {
        if (!(await (0, glCore_1.glReady)()))
            return notReady(res);
        const treasuryId = Number(req.body?.treasury_account_id);
        const date = (0, bansiHelpers_1.toDateOnly)(req.body?.statement_date);
        if (!treasuryId || !date)
            throw new glCore_1.GlError("ກະລຸນາເລືອກບັນຊີ ແລະ ວັນທີໃນໃບແຈ້ງຍອດ");
        const last = await lastReconciliation(treasuryId);
        const { visible } = await openLines(treasuryId, date);
        res.status(200).json({
            last: last && { id: last._uuid, statement_date: last.statement_date, statement_balance: Number(last.statement_balance) },
            opening: last ? Number(last.statement_balance) : 0,
            book_balance: await bookBalance(treasuryId, date),
            lines: visible,
        });
    }
    catch (error) {
        fail(res, error, "Error opening bank reconciliation");
    }
};
exports.openBankRec = openBankRec;
/**
 * POST /bank-rec/save { treasury_account_id, statement_date, statement_balance, line_ids, note? } —
 * ຍອດຄັ້ງກ່ອນ + ລາຍການທີ່ຕິກ ຕ້ອງເທົ່າກັບຍອດໃນໃບແຈ້ງຍອດ
 */
const saveBankRec = async (req, res) => {
    const t = await database_1.default.transaction();
    try {
        const treasuryId = Number(req.body?.treasury_account_id);
        const date = (0, bansiHelpers_1.toDateOnly)(req.body?.statement_date);
        const statementBalance = (0, glCore_1.round2)(Number(req.body?.statement_balance));
        if (!treasuryId || !date || !Number.isFinite(statementBalance))
            throw new glCore_1.GlError("ຂໍ້ມູນການກະທົບຍອດບໍ່ຄົບ");
        const last = await lastReconciliation(treasuryId);
        if (last && String(last.statement_date) >= date) {
            throw new glCore_1.GlError(`ວັນທີຕ້ອງຫຼັງການກະທົບຍອດຄັ້ງລ່າສຸດ (${(0, moment_1.default)(last.statement_date).format("DD/MM/YYYY")})`);
        }
        const { visible, auto } = await openLines(treasuryId, date);
        const wanted = new Set((Array.isArray(req.body?.line_ids) ? req.body.line_ids : []).map(Number));
        const picked = visible.filter((l) => wanted.has(l.line_id));
        const opening = last ? Number(last.statement_balance) : 0;
        const diff = (0, glCore_1.round2)(opening + picked.reduce((n, l) => n + l.amount, 0) - statementBalance);
        if (Math.abs(diff) >= 0.005)
            throw new glCore_1.GlError(`ຍອດຍັງບໍ່ກົງກັບໃບແຈ້ງຍອດ — ຕ່າງ ${diff.toLocaleString("en-US")}`);
        const rec = await bankReconciliation_1.default.create({
            treasury_account_id: treasuryId,
            statement_date: date,
            statement_balance: statementBalance,
            book_balance: await bookBalance(treasuryId, date),
            cleared_count: picked.length,
            note: String(req.body?.note ?? "").trim().slice(0, 255) || null,
            created_by: Number((0, bansiHelpers_1.actorOf)(req)) || null,
        }, { transaction: t });
        const ids = [...picked.map((l) => l.line_id), ...auto];
        if (ids.length)
            await journalLine_1.default.update({ reconciliation_id: rec._uuid }, { where: { _uuid: ids }, transaction: t });
        await t.commit();
        res.status(200).json({ message: "Successfully saved bank reconciliation", data: rec });
    }
    catch (error) {
        await t.rollback();
        fail(res, error, "Error saving bank reconciliation");
    }
};
exports.saveBankRec = saveBankRec;
/** DELETE /bank-rec/:id — ຍົກເລີກການກະທົບຍອດຄັ້ງລ່າສຸດຂອງບັນຊີນັ້ນເທົ່ານັ້ນ */
const deleteBankRec = async (req, res) => {
    const t = await database_1.default.transaction();
    try {
        const rec = await bankReconciliation_1.default.findByPk(Number(req.params.id), { transaction: t });
        if (!rec)
            throw new glCore_1.GlError("ບໍ່ພົບການກະທົບຍອດ");
        const last = await lastReconciliation(rec.treasury_account_id);
        if (last && last._uuid !== rec._uuid)
            throw new glCore_1.GlError("ຍົກເລີກໄດ້ສະເພາະການກະທົບຍອດຄັ້ງລ່າສຸດ");
        await journalLine_1.default.update({ reconciliation_id: null }, { where: { reconciliation_id: rec._uuid }, transaction: t });
        await rec.destroy({ transaction: t });
        await t.commit();
        res.status(200).json({ message: "Successfully deleted bank reconciliation" });
    }
    catch (error) {
        await t.rollback();
        fail(res, error, "Error deleting bank reconciliation");
    }
};
exports.deleteBankRec = deleteBankRec;
