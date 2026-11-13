"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelWithholding = exports.createWithholding = exports.getWithholdings = exports.postProfitTax = exports.getProfitTax = exports.getVatReport = exports.roleAccount = void 0;
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../../config/database"));
const glMapping_1 = __importDefault(require("../../models/glMapping"));
const fiscalYear_1 = __importDefault(require("../../models/fiscalYear"));
const chartAccount_1 = __importDefault(require("../../models/chartAccount"));
const taxRecords_1 = require("../../models/taxRecords");
const glCore_1 = require("./glCore");
const bansiHelpers_1 = require("./bansiHelpers");
const journalHelpers_1 = require("./journalHelpers");
const accountSettingController_1 = require("./accountSettingController");
/**
 * ລາຍງານອາກອນ — ດຶງຈາກສະໝຸດບັນຊີ (tbl_journal_line) ບໍ່ແມ່ນຈາກເອກະສານໂດຍກົງ ຈຶ່ງລວມທຸກແຫຼ່ງ
 * (ລາຍຮັບ, ລາຍຈ່າຍ, ໃບແຈ້ງໜີ້/ໃບບິນ, ບັນທຶກທົ່ວໄປ) ແລະ ໃບກັບລາຍການ (ຍົກເລີກ = ຕິດລົບ) ໃຫ້ເອງ
 */
const fail = (res, error, fallback) => {
    if (error instanceof glCore_1.GlError) {
        res.status(400).json({ message: error.message });
        return;
    }
    (0, bansiHelpers_1.sendError)(res, error, fallback);
};
/** ບັນຊີທີ່ຜູກກັບບົດບາດ (ຜັງບັນຊີ → ຜູກບັນຊີ) — ບໍ່ມີ = null */
const roleAccount = async (role) => {
    const row = await glMapping_1.default.findOne({ where: { source_type: "ROLE", source_key: role }, raw: true });
    return row ? Number(row.account_id) : null;
};
exports.roleAccount = roleAccount;
/** ຄູ່ຄ້າ (ຊື່ + ເລກອາກອນ) ແລະ ເລກໃບບິນຂອງຜູ້ຂາຍ ຂອງເອກະສານຕົ້ນທາງ */
const partiesOf = async (entries) => {
    const idsOf = (types) => [...new Set(entries.filter((e) => types.includes(e.source_type) && e.source_id).map((e) => Number(e.source_id)))].filter(Boolean);
    const map = new Map();
    const load = async (types, sql) => {
        const ids = idsOf(types);
        if (!ids.length)
            return;
        const rows = await database_1.default.query(sql, { type: sequelize_1.QueryTypes.SELECT, replacements: { ids } });
        rows.forEach((r) => types.forEach((type) => map.set(`${type}:${r.id}`, { party: r.party ?? null, tax_number: r.tax_number ?? null, doc_ref: r.doc_ref ?? null })));
    };
    await load(["INCOME"], `SELECT i._uuid AS id, COALESCE(p.name, i.payer_name) AS party, p.tax_number, NULL AS doc_ref
    FROM tbl_incomes i LEFT JOIN tbl_partner p ON p._uuid = i.partner_id WHERE i._uuid IN (:ids)`);
    await load(["EXPENSE"], `SELECT x._uuid AS id, COALESCE(p.name, x.payee_name) AS party, p.tax_number, x.bill_no AS doc_ref
    FROM tbl_expenses x LEFT JOIN tbl_partner p ON p._uuid = x.partner_id WHERE x._uuid IN (:ids)`);
    await load(["AR_INVOICE", "AP_BILL"], `SELECT d._uuid AS id, p.name AS party, p.tax_number, d.reference AS doc_ref
    FROM tbl_partner_doc d LEFT JOIN tbl_partner p ON p._uuid = d.partner_id WHERE d._uuid IN (:ids)`);
    return (e) => map.get(`${e.source_type}:${e.source_id}`) ?? { party: null, tax_number: null, doc_ref: null };
};
/**
 * POST /tax/vat-report { start_date, end_date } — ອາກອນມູນຄ່າເພີ່ມຂອງງວດ:
 * sales = ໃບທີ່ມີ ອາກອນຂາອອກ (ມີ − ໜີ້), purchases = ໃບທີ່ມີ ອາກອນຂາເຂົ້າ (ໜີ້ − ມີ).
 * ມູນຄ່າກ່ອນອາກອນ = ຍອດລວມຂອງໃບ − ອາກອນ (ໃບຂາຍ: ເງິນ/ລູກໜີ້ = ລາຍຮັບ + ອາກອນ), ເຄື່ອງໝາຍຕາມອາກອນ (ກັບລາຍການ = ຕິດລົບ).
 * payable = ຂາອອກ − ຂາເຂົ້າ (ຕິດລົບ = ອາກອນຂາເຂົ້າເຫຼືອຍົກໄປ)
 */
const getVatReport = async (req, res) => {
    try {
        if (!(await (0, glCore_1.glReady)())) {
            res.status(503).json({ message: "ຍັງບໍ່ໄດ້ເປີດໃຊ້ລະບົບບັນຊີຄູ່", notReady: true });
            return;
        }
        const start = (0, bansiHelpers_1.toDateOnly)(req.body?.start_date);
        const end = (0, bansiHelpers_1.toDateOnly)(req.body?.end_date) ?? (0, journalHelpers_1.todayLao)();
        if (!start)
            throw new glCore_1.GlError("ກະລຸນາເລືອກງວດ");
        const [vatIn, vatOut] = await Promise.all([(0, exports.roleAccount)("VAT_INPUT"), (0, exports.roleAccount)("VAT_OUTPUT")]);
        if (!vatIn && !vatOut)
            throw new glCore_1.GlError('ຍັງບໍ່ໄດ້ຜູກບັນຊີ "ອາກອນຂາເຂົ້າ / ຂາອອກ" — ຕັ້ງຢູ່ ຜັງບັນຊີ → ຜູກບັນຊີ');
        const entries = await database_1.default.query(`SELECT e._uuid AS entry_id, e.entry_number, e.entry_date, e.source_type, e.source_id, e.reference, e.description, e.total_debit,
              SUM(CASE WHEN l.account_id = :vatOut THEN l.credit - l.debit ELSE 0 END) AS vat_out,
              SUM(CASE WHEN l.account_id = :vatIn THEN l.debit - l.credit ELSE 0 END) AS vat_in
       FROM tbl_journal_entry e JOIN tbl_journal_line l ON l.entry_id = e._uuid
       WHERE e.entry_date BETWEEN :start AND :end AND l.account_id IN (:accounts)
       GROUP BY e._uuid, e.entry_number, e.entry_date, e.source_type, e.source_id, e.reference, e.description, e.total_debit
       ORDER BY e.entry_date ASC, e._uuid ASC`, {
            type: sequelize_1.QueryTypes.SELECT,
            replacements: { start, end, vatIn: vatIn ?? -1, vatOut: vatOut ?? -1, accounts: [vatIn ?? -1, vatOut ?? -1] },
        });
        const partyOf = await partiesOf(entries);
        const rowsOf = (key) => entries
            .filter((e) => Math.abs(Number(e[key])) >= 0.005)
            .map((e) => {
            const vat = (0, glCore_1.round2)(Number(e[key]));
            const otherVat = Math.abs(Number(key === "vat_out" ? e.vat_in : e.vat_out));
            const base = (0, glCore_1.round2)(Math.sign(vat) * (Number(e.total_debit) - Math.abs(vat) - otherVat));
            return {
                entry_id: Number(e.entry_id),
                entry_number: e.entry_number,
                date: e.entry_date,
                source_type: e.source_type,
                reference: e.reference,
                description: e.description,
                ...partyOf(e),
                base,
                vat,
            };
        });
        const sales = rowsOf("vat_out");
        const purchases = rowsOf("vat_in");
        const sum = (list, k) => (0, glCore_1.round2)(list.reduce((n, r) => n + r[k], 0));
        const output = sum(sales, "vat");
        const input = sum(purchases, "vat");
        res.status(200).json({
            start_date: start,
            end_date: end,
            sales,
            purchases,
            summary: {
                sales_base: sum(sales, "base"),
                output,
                purchase_base: sum(purchases, "base"),
                input,
                payable: (0, glCore_1.round2)(output - input),
            },
        });
    }
    catch (error) {
        fail(res, error, "Error building VAT report");
    }
};
exports.getVatReport = getVatReport;
// ================= ອາກອນກຳໄລ
/** ປີການເງິນ — ບໍ່ສົ່ງ = ປີປັດຈຸບັນ */
const fiscalOf = async (id) => {
    const fiscal = Number(id)
        ? await fiscalYear_1.default.findByPk(Number(id))
        : (await fiscalYear_1.default.findOne({ where: { is_current: 1 } })) ?? (await fiscalYear_1.default.findOne({ order: [["start_date", "DESC"]] }));
    if (!fiscal)
        throw new glCore_1.GlError("ຍັງບໍ່ມີປີການເງິນ");
    return fiscal;
};
/** ລາຍຮັບ, ລາຍຈ່າຍ (ບໍ່ລວມອາກອນກຳໄລ) ແລະ ອາກອນກຳໄລທີ່ລົງແລ້ວ ຂອງຊ່ວງ */
const pnlOf = async (start, end) => {
    const rows = await database_1.default.query(`SELECT a.account_group, a.account_type, SUM(l.debit - l.credit) AS net
     FROM tbl_journal_line l
     JOIN tbl_journal_entry e ON e._uuid = l.entry_id
     JOIN tbl_chart_account a ON a._uuid = l.account_id
     WHERE e.entry_date BETWEEN :start AND :end AND a.account_group IN (4, 5)
     GROUP BY a.account_group, a.account_type`, { type: sequelize_1.QueryTypes.SELECT, replacements: { start, end } });
    const sum = (pick) => (0, glCore_1.round2)(rows.filter(pick).reduce((n, r) => n + Number(r.net), 0));
    const revenue = -sum((r) => Number(r.account_group) === 4);
    const expense = sum((r) => Number(r.account_group) === 5 && r.account_type !== "TAX_EXPENSE");
    const booked = sum((r) => Number(r.account_group) === 5 && r.account_type === "TAX_EXPENSE");
    return { revenue, expense, profit: (0, glCore_1.round2)(revenue - expense), booked };
};
/** ວັນທີລົງອາກອນກຳໄລ — ທ້າຍປີ ຫຼື ມື້ນີ້ ຖ້າປີຍັງບໍ່ຈົບ (ລົງຄ້າງຈ່າຍຮອດປັດຈຸບັນ) */
const taxDateOf = (fiscal) => {
    const today = (0, journalHelpers_1.todayLao)();
    return String(fiscal.end_date) < today ? String(fiscal.end_date) : today;
};
/** POST /tax/profit-tax { fiscal_id? } — ກຳໄລກ່ອນອາກອນ ຂອງປີ (ຮອດມື້ນີ້) + ການຄິດທີ່ບັນທຶກໄວ້ */
const getProfitTax = async (req, res) => {
    try {
        if (!(await (0, glCore_1.glReady)())) {
            res.status(503).json({ message: "ຍັງບໍ່ໄດ້ເປີດໃຊ້ລະບົບບັນຊີຄູ່", notReady: true });
            return;
        }
        const fiscal = await fiscalOf(req.body?.fiscal_id);
        const setting = await (0, accountSettingController_1.loadAccountSetting)();
        const saved = await taxRecords_1.ProfitTax.findOne({ where: { fiscal_id: fiscal._uuid } });
        res.status(200).json({
            fiscal,
            pnl: await pnlOf(fiscal.start_date, fiscal.end_date),
            rate: Number(saved?.rate ?? setting.profit_tax_rate),
            saved,
            date: taxDateOf(fiscal),
        });
    }
    catch (error) {
        fail(res, error, "Error getting profit tax");
    }
};
exports.getProfitTax = getProfitTax;
/**
 * POST /tax/profit-tax/post { fiscal_id, add_back, deduction, rate, note? } — ຄິດ ແລະ ລົງອາກອນກຳໄລຄ້າງຈ່າຍ:
 * (ກຳໄລກ່ອນອາກອນ + ບໍ່ຫັກໄດ້ − ບໍ່ຕ້ອງເສຍ) × ອັດຕາ; ຂາດທຶນ = 0. ລົງຊ້ຳ = ກັບໃບເກົ່າ ແລ້ວລົງໃໝ່
 */
const postProfitTax = async (req, res) => {
    const t = await database_1.default.transaction();
    try {
        const fiscal = await fiscalOf(req.body?.fiscal_id);
        const { profit } = await pnlOf(fiscal.start_date, fiscal.end_date);
        const addBack = (0, glCore_1.round2)(Math.max(0, Number(req.body?.add_back) || 0));
        const deduction = (0, glCore_1.round2)(Math.max(0, Number(req.body?.deduction) || 0));
        const rate = Number(req.body?.rate);
        if (!Number.isFinite(rate) || rate < 0 || rate > 100)
            throw new glCore_1.GlError("ອັດຕາອາກອນຕ້ອງຢູ່ລະຫວ່າງ 0–100%");
        const taxable = (0, glCore_1.round2)(profit + addBack - deduction);
        const tax = (0, glCore_1.round2)(Math.max(0, taxable) * rate / 100);
        const date = taxDateOf(fiscal);
        const actorId = Number((0, bansiHelpers_1.actorOf)(req)) || null;
        const sourceId = `FY-${fiscal._uuid}`;
        if (tax > 0) {
            await (0, glCore_1.postSource)({
                date, sourceType: "PROFIT_TAX", sourceId, reference: `PT-${fiscal.fiscal_code}`,
                description: `ອາກອນກຳໄລ ປີການເງິນ ${fiscal.fiscal_code} (${rate}% × ${taxable.toLocaleString("en-US")})`,
                lines: [
                    { accountId: await (0, glCore_1.roleAccountId)("INCOME_TAX_EXPENSE", t), side: glCore_1.DEBIT, amount: tax },
                    { accountId: await (0, glCore_1.roleAccountId)("PROFIT_TAX_PAYABLE", t), side: glCore_1.CREDIT, amount: tax },
                ],
                actorId,
            }, t);
        }
        else {
            await (0, glCore_1.reverseSource)("PROFIT_TAX", sourceId, t, actorId);
        }
        const values = {
            fiscal_id: fiscal._uuid, profit_before_tax: profit, add_back: addBack, deduction, rate, taxable, tax, entry_date: date,
            note: String(req.body?.note ?? "").trim().slice(0, 255) || null, created_by: actorId,
        };
        const saved = await taxRecords_1.ProfitTax.findOne({ where: { fiscal_id: fiscal._uuid }, transaction: t });
        if (saved)
            await saved.update({ ...values, updatedAt: new Date() }, { transaction: t });
        else
            await taxRecords_1.ProfitTax.create(values, { transaction: t });
        await t.commit();
        res.status(200).json({ message: "Successfully posted profit tax", data: values });
    }
    catch (error) {
        await t.rollback();
        fail(res, error, "Error posting profit tax");
    }
};
exports.postProfitTax = postProfitTax;
// ================= ອາກອນຫັກ ນ ທີ່ຈ່າຍ
/** POST /wht/fetch { start_date, end_date } — ລາຍການ + ສະຫຼຸບຕາມປະເພດລາຍໄດ້ (ສະເພາະທີ່ໃຊ້ງານ) */
const getWithholdings = async (req, res) => {
    try {
        const start = (0, bansiHelpers_1.toDateOnly)(req.body?.start_date);
        const end = (0, bansiHelpers_1.toDateOnly)(req.body?.end_date) ?? (0, journalHelpers_1.todayLao)();
        const where = { wht_date: { [sequelize_1.Op.lte]: end, ...(start ? { [sequelize_1.Op.gte]: start } : {}) } };
        const rows = await taxRecords_1.WithholdingTax.findAll({ where, order: [["wht_date", "DESC"], ["_uuid", "DESC"]] });
        const active = rows.filter((r) => Number(r.status) === 1);
        const byType = new Map();
        active.forEach((r) => {
            const cur = byType.get(Number(r.income_type)) ?? { income_type: Number(r.income_type), count: 0, gross: 0, wht: 0 };
            byType.set(Number(r.income_type), { ...cur, count: cur.count + 1, gross: (0, glCore_1.round2)(cur.gross + Number(r.gross_amount)), wht: (0, glCore_1.round2)(cur.wht + Number(r.wht_amount)) });
        });
        res.status(200).json({
            data: rows,
            summary: [...byType.values()],
            total: (0, glCore_1.round2)(active.reduce((n, r) => n + Number(r.wht_amount), 0)),
        });
    }
    catch (error) {
        fail(res, error, "Error getting withholding tax");
    }
};
exports.getWithholdings = getWithholdings;
/** POST /wht/create — ບັນທຶກ ແລະ ລົງບັນຊີ (ໜີ້ ລາຍຈ່າຍ/ເຈົ້າໜີ້ / ມີ ອາກອນຫັກ ນ ທີ່ຈ່າຍ ຄ້າງນຳສົ່ງ) */
const createWithholding = async (req, res) => {
    const t = await database_1.default.transaction();
    try {
        const body = req.body || {};
        const date = (0, bansiHelpers_1.toDateOnly)(body.wht_date);
        const payee = String(body.payee_name ?? "").trim().slice(0, 200);
        const gross = (0, glCore_1.round2)(Number(body.gross_amount));
        const rate = (0, glCore_1.round2)(Number(body.rate) || 0);
        const wht = body.wht_amount !== undefined && body.wht_amount !== null && body.wht_amount !== ""
            ? (0, glCore_1.round2)(Number(body.wht_amount)) : (0, glCore_1.round2)(gross * rate / 100);
        if (!date || !payee)
            throw new glCore_1.GlError("ກະລຸນາປ້ອນວັນທີ ແລະ ຜູ້ຮັບເງິນ");
        if (!(gross > 0) || !(wht > 0) || wht > gross)
            throw new glCore_1.GlError("ຈຳນວນເງິນ ຫຼື ອາກອນທີ່ຫັກ ບໍ່ຖືກຕ້ອງ");
        const debitAccountId = Number(body.debit_account_id) || null;
        if (debitAccountId) {
            const account = await chartAccount_1.default.findByPk(debitAccountId, { transaction: t });
            if (!account || Number(account.is_postable) !== 1 || Number(account.status) !== 1)
                throw new glCore_1.GlError("ບັນຊີທີ່ເລືອກລົງລາຍການບໍ່ໄດ້");
        }
        const actorId = Number((0, bansiHelpers_1.actorOf)(req)) || null;
        const row = await taxRecords_1.WithholdingTax.create({
            wht_date: date, payee_name: payee, payee_tax_id: String(body.payee_tax_id ?? "").trim().slice(0, 50) || null,
            income_type: Number(body.income_type) || 9, gross_amount: gross, rate, wht_amount: wht,
            reference: String(body.reference ?? "").trim().slice(0, 100) || null, debit_account_id: debitAccountId,
            note: String(body.note ?? "").trim().slice(0, 255) || null, status: 1, created_by: actorId,
        }, { transaction: t });
        await (0, glCore_1.postEntry)({
            date, sourceType: "WHT", sourceId: row._uuid, reference: row.reference ?? `WHT-${row._uuid}`,
            description: `ອາກອນຫັກ ນ ທີ່ຈ່າຍ — ${payee}`,
            lines: [
                { accountId: debitAccountId ?? (await (0, glCore_1.roleAccountId)("DEFAULT_EXPENSE", t)), side: glCore_1.DEBIT, amount: wht },
                { accountId: await (0, glCore_1.roleAccountId)("WHT_PAYABLE", t), side: glCore_1.CREDIT, amount: wht },
            ],
            actorId,
        }, t);
        await t.commit();
        res.status(200).json({ message: "Successfully recorded withholding tax", data: row });
    }
    catch (error) {
        await t.rollback();
        fail(res, error, "Error recording withholding tax");
    }
};
exports.createWithholding = createWithholding;
/** PUT /wht/cancel/:id — ຍົກເລີກ (ກັບລາຍການ) */
const cancelWithholding = async (req, res) => {
    const t = await database_1.default.transaction();
    try {
        const row = await taxRecords_1.WithholdingTax.findByPk(Number(req.params.id), { transaction: t });
        if (!row || Number(row.status) !== 1)
            throw new glCore_1.GlError("ບໍ່ພົບລາຍການ ຫຼື ຍົກເລີກແລ້ວ");
        await (0, glCore_1.reverseSource)("WHT", row._uuid, t, Number((0, bansiHelpers_1.actorOf)(req)) || null);
        await row.update({ status: 2, updatedAt: new Date() }, { transaction: t });
        await t.commit();
        res.status(200).json({ message: "Successfully cancelled withholding tax" });
    }
    catch (error) {
        await t.rollback();
        fail(res, error, "Error cancelling withholding tax");
    }
};
exports.cancelWithholding = cancelWithholding;
