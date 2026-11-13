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
exports.getAssetSchedule = exports.restoreFixedAsset = exports.disposeFixedAsset = exports.getDepreciationRuns = exports.undoDepreciation = exports.runDepreciation = exports.previewDepreciation = exports.computeMonth = exports.deleteFixedAsset = exports.updateFixedAsset = exports.createFixedAsset = exports.getFixedAssets = void 0;
const sequelize_1 = require("sequelize");
const moment_1 = __importDefault(require("moment"));
const database_1 = __importDefault(require("../../config/database"));
const fixedAsset_1 = __importStar(require("../../models/fixedAsset"));
const chartAccount_1 = __importDefault(require("../../models/chartAccount"));
const journalEntry_1 = __importDefault(require("../../models/journalEntry"));
const glCore_1 = require("./glCore");
const bansiHelpers_1 = require("./bansiHelpers");
/**
 * ຊັບສົມບັດຄົງທີ່ (IFRS for SMEs ພາກ 17, ກົດໝາຍບັນຊີ ມາດຕາ 23 ຂໍ້ 3): ທະບຽນ, ຄ່າຫຼຸ້ຍຫ້ຽນແບບເສັ້ນຊື່ລາຍເດືອນ,
 * ການຈຳໜ່າຍ ແລະ ຕາຕະລາງຊັບສົມບັດ. ລົງບັນຊີ:
 * - ຍອດຍົກມາ (ASSET_OPENING): ໜີ້ ຊັບສົມບັດ (ລາຄາທຶນ) / ມີ ທຶນຍອດຍົກມາ; ໜີ້ ທຶນຍອດຍົກມາ / ມີ ຄ່າຫຼຸ້ຍຫ້ຽນສະສົມ (ສະສົມຍົກມາ)
 * - ຄ່າຫຼຸ້ຍຫ້ຽນ (DEPRECIATION, source_id = YYYY-MM): ໜີ້ ລາຍຈ່າຍຄ່າຫຼຸ້ຍຫ້ຽນ / ມີ ຄ່າຫຼຸ້ຍຫ້ຽນສະສົມ — ໃບດຽວຕໍ່ເດືອນ ວັນທີທ້າຍເດືອນ
 * - ຈຳໜ່າຍ (ASSET_DISPOSAL): ໜີ້ ຄ່າຫຼຸ້ຍຫ້ຽນສະສົມ + ໜີ້ ຂາດທຶນຈາກການຈຳໜ່າຍ (ມູນຄ່າຍັງເຫຼືອ) / ມີ ຊັບສົມບັດ (ລາຄາທຶນ);
 *   ເງິນທີ່ຂາຍໄດ້ ບັນທຶກເປັນລາຍຮັບຕາມປົກກະຕິ
 */
const ACTIVE = 1;
const DISPOSED = 2;
const fail = (res, error, fallback) => {
    if (error instanceof glCore_1.GlError) {
        res.status(400).json({ message: error.message });
        return;
    }
    (0, bansiHelpers_1.sendError)(res, error, fallback);
};
const notReady = (res) => res.status(503).json({ message: "ຍັງບໍ່ໄດ້ເປີດໃຊ້ລະບົບບັນຊີຄູ່", notReady: true });
const monthOf = (date) => (0, moment_1.default)(date).format("YYYY-MM");
const monthEnd = (month) => (0, moment_1.default)(month, "YYYY-MM").endOf("month").format("YYYY-MM-DD");
const parseMonth = (value) => {
    const m = (0, moment_1.default)(String(value ?? ""), "YYYY-MM", true);
    if (!m.isValid())
        throw new glCore_1.GlError("ກະລຸນາເລືອກເດືອນ");
    return m.format("YYYY-MM");
};
/** ຄ່າຫຼຸ້ຍຫ້ຽນສະສົມທີ່ລົງແລ້ວ ຕໍ່ຊັບສົມບັດ (ກ່ອນເດືອນ before ຖ້າສົ່ງ) */
const postedTotals = async (before, t) => {
    const rows = await database_1.default.query(`SELECT asset_id, SUM(amount) AS total, MAX(period) AS last FROM tbl_fixed_asset_depreciation
     ${before ? "WHERE period < :before" : ""} GROUP BY asset_id`, { type: sequelize_1.QueryTypes.SELECT, replacements: { before }, transaction: t });
    return new Map(rows.map((r) => [Number(r.asset_id), { total: (0, glCore_1.round2)(Number(r.total)), last: r.last }]));
};
const depreciable = (a) => (0, glCore_1.round2)(Number(a.cost) - Number(a.salvage_value));
const monthlyOf = (a) => (a.useful_life_months > 0 ? depreciable(a) / a.useful_life_months : 0);
/** ຄ່າຫຼຸ້ຍຫ້ຽນຂອງເດືອນ — ບໍ່ເກີນຍອດທີ່ຍັງເຫຼືອ (ເດືອນສຸດທ້າຍຮັບເສດ) */
const amountFor = (a, month, accumulated) => {
    if (Number(a.status) !== ACTIVE)
        return 0;
    if (month < monthOf(a.depreciation_start))
        return 0;
    const remaining = (0, glCore_1.round2)(depreciable(a) - accumulated);
    if (remaining <= 0)
        return 0;
    return (0, glCore_1.round2)(Math.min(monthlyOf(a), remaining));
};
const present = (a, posted) => {
    const accumulated = (0, glCore_1.round2)(Number(a.opening_accumulated) + (posted?.total ?? 0));
    return {
        ...a.get({ plain: true }),
        cost: Number(a.cost),
        salvage_value: Number(a.salvage_value),
        opening_accumulated: Number(a.opening_accumulated),
        monthly: (0, glCore_1.round2)(monthlyOf(a)),
        accumulated,
        nbv: (0, glCore_1.round2)(Number(a.cost) - accumulated),
        last_period: posted?.last ?? null,
        fully_depreciated: accumulated >= depreciable(a) - 0.005,
    };
};
/** ກວດບັນຊີທີ່ເລືອກ — ລົງລາຍການໄດ້, ໃຊ້ງານ ແລະ ຢູ່ກຸ່ມທີ່ຖືກ */
const assertAccount = async (id, groups, label) => {
    if (!id)
        return;
    const account = await chartAccount_1.default.findByPk(id);
    if (!account || Number(account.status) !== 1 || Number(account.is_postable) !== 1 || !groups.includes(Number(account.account_group))) {
        throw new glCore_1.GlError(`${label}: ເລືອກບັນຊີກຸ່ມ ${groups.join(", ")} ທີ່ລົງລາຍການໄດ້`);
    }
};
const nextCode = async () => {
    const rows = await fixedAsset_1.default.findAll({ attributes: ["asset_code"], where: { asset_code: { [sequelize_1.Op.like]: "FA-%" } }, raw: true });
    const max = rows.reduce((n, r) => Math.max(n, Number(String(r.asset_code).replace(/^FA-/, "")) || 0), 0);
    return `FA-${String(max + 1).padStart(4, "0")}`;
};
/** ກວດ ແລະ ແປງຂໍ້ມູນຈາກຟອມ */
const parseInput = async (body, current) => {
    const name = String(body.name ?? current?.name ?? "").trim().slice(0, 200);
    if (!name)
        throw new glCore_1.GlError("ກະລຸນາປ້ອນຊື່ຊັບສົມບັດ");
    const acquisition = (0, bansiHelpers_1.toDateOnly)(body.acquisition_date ?? current?.acquisition_date);
    if (!acquisition)
        throw new glCore_1.GlError("ກະລຸນາເລືອກວັນທີຊື້");
    const start = (0, bansiHelpers_1.toDateOnly)(body.depreciation_start ?? current?.depreciation_start) ?? acquisition;
    const cost = (0, glCore_1.round2)(Number(body.cost ?? current?.cost));
    const salvage = (0, glCore_1.round2)(Number(body.salvage_value ?? current?.salvage_value ?? 0));
    const life = Math.round(Number(body.useful_life_months ?? current?.useful_life_months));
    const openingAccum = (0, glCore_1.round2)(Number(body.opening_accumulated ?? current?.opening_accumulated ?? 0));
    if (!(cost > 0))
        throw new glCore_1.GlError("ລາຄາທຶນຕ້ອງຫຼາຍກວ່າ 0");
    if (!(life >= 1 && life <= 1200))
        throw new glCore_1.GlError("ອາຍຸການໃຊ້ງານ ຕ້ອງ 1–1200 ເດືອນ");
    if (salvage < 0 || salvage >= cost)
        throw new glCore_1.GlError("ມູນຄ່າຊາກ ຕ້ອງນ້ອຍກວ່າລາຄາທຶນ");
    if (openingAccum < 0 || openingAccum > cost - salvage)
        throw new glCore_1.GlError("ຄ່າຫຼຸ້ຍຫ້ຽນສະສົມຍົກມາ ເກີນມູນຄ່າທີ່ຫຼຸ້ຍຫ້ຽນໄດ້");
    const mode = Number(body.acquisition_mode ?? current?.acquisition_mode ?? 0) === 1 ? 1 : 0;
    const openingDate = mode === 1 ? (0, bansiHelpers_1.toDateOnly)(body.opening_date ?? current?.opening_date) : null;
    if (mode === 1 && !openingDate)
        throw new glCore_1.GlError("ກະລຸນາເລືອກວັນທີລົງຍອດຍົກມາ");
    const accountId = Number(body.asset_account_id ?? current?.asset_account_id) || null;
    if (!accountId)
        throw new glCore_1.GlError("ກະລຸນາເລືອກບັນຊີຊັບສົມບັດ");
    const accumId = body.accum_account_id !== undefined ? Number(body.accum_account_id) || null : current?.accum_account_id ?? null;
    const expenseId = body.expense_account_id !== undefined ? Number(body.expense_account_id) || null : current?.expense_account_id ?? null;
    await assertAccount(accountId, [1], "ບັນຊີຊັບສົມບັດ");
    await assertAccount(accumId, [1], "ບັນຊີຄ່າຫຼຸ້ຍຫ້ຽນສະສົມ");
    await assertAccount(expenseId, [5], "ບັນຊີລາຍຈ່າຍຄ່າຫຼຸ້ຍຫ້ຽນ");
    const text = (key, max) => body[key] !== undefined ? String(body[key] ?? "").trim().slice(0, max) || null : current?.[key] ?? null;
    return {
        name,
        asset_account_id: accountId,
        accum_account_id: accumId,
        expense_account_id: expenseId,
        acquisition_date: acquisition,
        depreciation_start: start,
        cost,
        salvage_value: salvage,
        useful_life_months: life,
        opening_accumulated: openingAccum,
        acquisition_mode: mode,
        opening_date: openingDate,
        location: text("location", 150),
        serial_no: text("serial_no", 100),
        note: text("note", 255),
    };
};
/** ລົງ/ກັບ ໃບຍອດຍົກມາຂອງຊັບສົມບັດ (mode 1) ໃຫ້ກົງກັບຂໍ້ມູນປັດຈຸບັນ */
const syncOpening = async (a, t, actorId) => {
    if (Number(a.acquisition_mode) !== 1 || !a.opening_date) {
        await (0, glCore_1.reverseSource)("ASSET_OPENING", a._uuid, t, actorId);
        return;
    }
    const equity = await (0, glCore_1.roleAccountId)("OPENING_EQUITY", t);
    const accum = a.accum_account_id ?? (await (0, glCore_1.roleAccountId)("ACCUM_DEPRECIATION", t));
    const lines = [
        { accountId: a.asset_account_id, side: glCore_1.DEBIT, amount: Number(a.cost), description: `${a.asset_code} ${a.name}` },
        { accountId: equity, side: glCore_1.CREDIT, amount: Number(a.cost) },
    ];
    if (Number(a.opening_accumulated) > 0) {
        lines.push({ accountId: equity, side: glCore_1.DEBIT, amount: Number(a.opening_accumulated) }, { accountId: accum, side: glCore_1.CREDIT, amount: Number(a.opening_accumulated), description: `${a.asset_code} ຄ່າຫຼຸ້ຍຫ້ຽນສະສົມຍົກມາ` });
    }
    await (0, glCore_1.postSource)({
        date: a.opening_date, sourceType: "ASSET_OPENING", sourceId: a._uuid, reference: a.asset_code,
        description: `ຍອດຍົກມາຊັບສົມບັດ ${a.asset_code} ${a.name}`, lines, actorId,
    }, t);
};
/** GET /fixed-asset/fetch — ທຸກຊັບສົມບັດ ພ້ອມຄ່າຫຼຸ້ຍຫ້ຽນສະສົມ ແລະ ມູນຄ່າຍັງເຫຼືອ */
const getFixedAssets = async (_req, res) => {
    try {
        if (!(await (0, glCore_1.glReady)()))
            return notReady(res);
        const [rows, posted] = await Promise.all([fixedAsset_1.default.findAll({ order: [["asset_code", "ASC"]] }), postedTotals()]);
        res.status(200).json({ data: rows.map((a) => present(a, posted.get(a._uuid))), next_code: await nextCode() });
    }
    catch (error) {
        fail(res, error, "Error getting fixed assets");
    }
};
exports.getFixedAssets = getFixedAssets;
/** POST /fixed-asset/create */
const createFixedAsset = async (req, res) => {
    const t = await database_1.default.transaction();
    try {
        const input = await parseInput(req.body || {});
        const code = String(req.body?.asset_code ?? "").trim().slice(0, 30) || (await nextCode());
        if (await fixedAsset_1.default.count({ where: { asset_code: code }, transaction: t }))
            throw new glCore_1.GlError(`ລະຫັດ ${code} ມີແລ້ວ`);
        const actorId = Number((0, bansiHelpers_1.actorOf)(req)) || null;
        const row = await fixedAsset_1.default.create({ ...input, asset_code: code, status: ACTIVE, created_by: actorId }, { transaction: t });
        await syncOpening(row, t, actorId);
        await t.commit();
        res.status(200).json({ message: "Successfully created fixed asset", data: row });
    }
    catch (error) {
        await t.rollback();
        fail(res, error, "Error creating fixed asset");
    }
};
exports.createFixedAsset = createFixedAsset;
/** PUT /fixed-asset/:id — ປ່ຽນລາຄາ/ອາຍຸ ມີຜົນກັບເດືອນທີ່ຍັງບໍ່ລົງ; ໃບຍອດຍົກມາ ກັບລາຍການ+ລົງໃໝ່ເອງເມື່ອຕົວເລກປ່ຽນ */
const updateFixedAsset = async (req, res) => {
    const t = await database_1.default.transaction();
    try {
        const row = await fixedAsset_1.default.findByPk(Number(req.params.id), { transaction: t, lock: t.LOCK.UPDATE });
        if (!row)
            throw new glCore_1.GlError("ບໍ່ພົບຊັບສົມບັດ");
        if (Number(row.status) === DISPOSED)
            throw new glCore_1.GlError("ຊັບສົມບັດນີ້ຈຳໜ່າຍແລ້ວ — ຍົກເລີກການຈຳໜ່າຍກ່ອນຈຶ່ງແກ້ໄດ້");
        const input = await parseInput(req.body || {}, row);
        const code = String(req.body?.asset_code ?? row.asset_code).trim().slice(0, 30) || row.asset_code;
        if (code !== row.asset_code && (await fixedAsset_1.default.count({ where: { asset_code: code }, transaction: t }))) {
            throw new glCore_1.GlError(`ລະຫັດ ${code} ມີແລ້ວ`);
        }
        await row.update({ ...input, asset_code: code, updatedAt: new Date() }, { transaction: t });
        await syncOpening(row, t, Number((0, bansiHelpers_1.actorOf)(req)) || null);
        await t.commit();
        res.status(200).json({ message: "Successfully updated fixed asset", data: row });
    }
    catch (error) {
        await t.rollback();
        fail(res, error, "Error updating fixed asset");
    }
};
exports.updateFixedAsset = updateFixedAsset;
/** DELETE /fixed-asset/:id — ລຶບໄດ້ສະເພາະທີ່ຍັງບໍ່ເຄີຍລົງຄ່າຫຼຸ້ຍຫ້ຽນ ແລະ ບໍ່ໄດ້ຈຳໜ່າຍ (ໃບຍອດຍົກມາຖືກກັບລາຍການ) */
const deleteFixedAsset = async (req, res) => {
    const t = await database_1.default.transaction();
    try {
        const row = await fixedAsset_1.default.findByPk(Number(req.params.id), { transaction: t });
        if (!row)
            throw new glCore_1.GlError("ບໍ່ພົບຊັບສົມບັດ");
        if (Number(row.status) === DISPOSED)
            throw new glCore_1.GlError("ຊັບສົມບັດທີ່ຈຳໜ່າຍແລ້ວ ລຶບບໍ່ໄດ້");
        if (await fixedAsset_1.FixedAssetDepreciation.count({ where: { asset_id: row._uuid }, transaction: t })) {
            throw new glCore_1.GlError("ລົງຄ່າຫຼຸ້ຍຫ້ຽນແລ້ວ ລຶບບໍ່ໄດ້ — ໃຊ້ ຈຳໜ່າຍ ແທນ");
        }
        await (0, glCore_1.reverseSource)("ASSET_OPENING", row._uuid, t, Number((0, bansiHelpers_1.actorOf)(req)) || null);
        await row.destroy({ transaction: t });
        await t.commit();
        res.status(200).json({ message: "Successfully deleted fixed asset" });
    }
    catch (error) {
        await t.rollback();
        fail(res, error, "Error deleting fixed asset");
    }
};
exports.deleteFixedAsset = deleteFixedAsset;
/** ຄ່າຫຼຸ້ຍຫ້ຽນຂອງເດືອນ ຕໍ່ຊັບສົມບັດ (ບໍ່ລົງບັນຊີ) — ສະສົມ = ຍົກມາ + ທີ່ລົງແລ້ວກ່ອນເດືອນນີ້ */
const computeMonth = async (month, t) => {
    const end = monthEnd(month);
    const [assets, posted] = await Promise.all([
        fixedAsset_1.default.findAll({ where: { status: ACTIVE, depreciation_start: { [sequelize_1.Op.lte]: end } }, order: [["asset_code", "ASC"]], transaction: t }),
        postedTotals(month, t),
    ]);
    return assets
        .map((a) => {
        const accumulated = (0, glCore_1.round2)(Number(a.opening_accumulated) + (posted.get(a._uuid)?.total ?? 0));
        return { asset: a, accumulated, amount: amountFor(a, month, accumulated) };
    })
        .filter((r) => r.amount > 0);
};
exports.computeMonth = computeMonth;
/** ໃບຄ່າຫຼຸ້ຍຫ້ຽນຂອງເດືອນທີ່ຍັງມີຜົນ */
const activeRunEntry = (month, t) => journalEntry_1.default.findOne({ where: { source_type: "DEPRECIATION", source_id: month, reversal_of: null, reversed_by: null }, transaction: t });
/** ເດືອນລ່າສຸດທີ່ລົງຄ່າຫຼຸ້ຍຫ້ຽນແລ້ວ */
const latestRun = async (t) => {
    const row = await fixedAsset_1.FixedAssetDepreciation.findOne({ order: [["period", "DESC"]], attributes: ["period"], transaction: t });
    return row ? String(row.period) : null;
};
/** POST /fixed-asset/depreciation-preview { month } — ຍອດທີ່ຈະລົງ + ລົງແລ້ວບໍ່ */
const previewDepreciation = async (req, res) => {
    try {
        if (!(await (0, glCore_1.glReady)()))
            return notReady(res);
        const month = parseMonth(req.body?.month);
        const posted = await activeRunEntry(month);
        const rows = posted
            ? (await fixedAsset_1.FixedAssetDepreciation.findAll({ where: { period: month } })).map((d) => ({ asset_id: d.asset_id, amount: Number(d.amount) }))
            : (await (0, exports.computeMonth)(month)).map((r) => ({ asset_id: r.asset._uuid, amount: r.amount, accumulated: r.accumulated }));
        res.status(200).json({
            month,
            posted: posted ? { entry_id: posted._uuid, entry_number: posted.entry_number, entry_date: posted.entry_date } : null,
            latest: await latestRun(),
            rows,
            total: (0, glCore_1.round2)(rows.reduce((n, r) => n + r.amount, 0)),
        });
    }
    catch (error) {
        fail(res, error, "Error previewing depreciation");
    }
};
exports.previewDepreciation = previewDepreciation;
/** ລົບການລົງຄ່າຫຼຸ້ຍຫ້ຽນຂອງເດືອນ (ກັບໃບ + ລຶບແຖວ) */
const undoMonth = async (month, t, actorId) => {
    const entry = await activeRunEntry(month, t);
    if (entry)
        await (0, glCore_1.reverseEntry)(entry, t, { actorId, description: `ຍົກເລີກຄ່າຫຼຸ້ຍຫ້ຽນ ${(0, moment_1.default)(month).format("MM/YYYY")}` });
    await fixedAsset_1.FixedAssetDepreciation.destroy({ where: { period: month }, transaction: t });
};
/**
 * POST /fixed-asset/depreciate { month } — ລົງຄ່າຫຼຸ້ຍຫ້ຽນເດືອນນັ້ນ (ໃບດຽວ ວັນທີທ້າຍເດືອນ). ລົງຊ້ຳເດືອນລ່າສຸດໄດ້ (ກັບໃບເກົ່າ ແລ້ວຄິດໃໝ່);
 * ເດືອນກ່ອນເດືອນລ່າສຸດທີ່ລົງແລ້ວ ລົງບໍ່ໄດ້ (ຈະເຮັດໃຫ້ຍອດສະສົມຂອງເດືອນຫຼັງຜິດ)
 */
const runDepreciation = async (req, res) => {
    const t = await database_1.default.transaction();
    try {
        if (!(await (0, glCore_1.glReady)(t))) {
            await t.rollback();
            return notReady(res);
        }
        const month = parseMonth(req.body?.month);
        const date = monthEnd(month);
        if (date > (0, moment_1.default)().utcOffset("+07:00").endOf("month").format("YYYY-MM-DD"))
            throw new glCore_1.GlError("ລົງຄ່າຫຼຸ້ຍຫ້ຽນເດືອນທີ່ຍັງບໍ່ເຖິງບໍ່ໄດ້");
        await (0, glCore_1.assertOpenPeriod)(date, t);
        const latest = await latestRun(t);
        if (latest && month < latest)
            throw new glCore_1.GlError(`ລົງຄ່າຫຼຸ້ຍຫ້ຽນຮອດ ${(0, moment_1.default)(latest).format("MM/YYYY")} ແລ້ວ — ລົງເດືອນກ່ອນໜ້ານັ້ນບໍ່ໄດ້`);
        const actorId = Number((0, bansiHelpers_1.actorOf)(req)) || null;
        if (latest === month)
            await undoMonth(month, t, actorId);
        const rows = await (0, exports.computeMonth)(month, t);
        if (!rows.length)
            throw new glCore_1.GlError("ບໍ່ມີຊັບສົມບັດທີ່ຕ້ອງຄິດຄ່າຫຼຸ້ຍຫ້ຽນເດືອນນີ້");
        const accumDefault = await (0, glCore_1.roleAccountId)("ACCUM_DEPRECIATION", t);
        const expenseDefault = await (0, glCore_1.roleAccountId)("DEPRECIATION_EXPENSE", t);
        const lines = rows.flatMap((r) => {
            const label = `${r.asset.asset_code} ${r.asset.name}`;
            return [
                { accountId: r.asset.expense_account_id ?? expenseDefault, side: glCore_1.DEBIT, amount: r.amount, description: label },
                { accountId: r.asset.accum_account_id ?? accumDefault, side: glCore_1.CREDIT, amount: r.amount, description: label },
            ];
        });
        const entry = await (0, glCore_1.postEntry)({
            date, sourceType: "DEPRECIATION", sourceId: month, reference: `DEP-${month}`,
            description: `ຄ່າຫຼຸ້ຍຫ້ຽນຊັບສົມບັດຄົງທີ່ ${(0, moment_1.default)(month).format("MM/YYYY")}`, lines, actorId,
        }, t);
        await fixedAsset_1.FixedAssetDepreciation.bulkCreate(rows.map((r) => ({ asset_id: r.asset._uuid, period: month, amount: r.amount, entry_id: entry._uuid })), { transaction: t });
        await t.commit();
        res.status(200).json({ message: "Successfully posted depreciation", data: { entry_number: entry.entry_number, total: (0, glCore_1.round2)(rows.reduce((n, r) => n + r.amount, 0)) } });
    }
    catch (error) {
        await t.rollback();
        fail(res, error, "Error posting depreciation");
    }
};
exports.runDepreciation = runDepreciation;
/** DELETE /fixed-asset/depreciate/:month — ຍົກເລີກສະເພາະເດືອນລ່າສຸດທີ່ລົງແລ້ວ */
const undoDepreciation = async (req, res) => {
    const t = await database_1.default.transaction();
    try {
        const month = parseMonth(req.params.month);
        if ((await latestRun(t)) !== month)
            throw new glCore_1.GlError("ຍົກເລີກໄດ້ສະເພາະເດືອນລ່າສຸດທີ່ລົງຄ່າຫຼຸ້ຍຫ້ຽນ");
        await (0, glCore_1.assertOpenPeriod)(monthEnd(month), t);
        await undoMonth(month, t, Number((0, bansiHelpers_1.actorOf)(req)) || null);
        await t.commit();
        res.status(200).json({ message: "Successfully removed depreciation" });
    }
    catch (error) {
        await t.rollback();
        fail(res, error, "Error removing depreciation");
    }
};
exports.undoDepreciation = undoDepreciation;
/** GET /fixed-asset/runs — ເດືອນທີ່ລົງຄ່າຫຼຸ້ຍຫ້ຽນແລ້ວ (ໃໝ່ສຸດກ່ອນ) */
const getDepreciationRuns = async (_req, res) => {
    try {
        const rows = await database_1.default.query(`SELECT d.period, SUM(d.amount) AS total, COUNT(*) AS assets, MAX(e.entry_number) AS entry_number
       FROM tbl_fixed_asset_depreciation d LEFT JOIN tbl_journal_entry e ON e._uuid = d.entry_id
       GROUP BY d.period ORDER BY d.period DESC`, { type: sequelize_1.QueryTypes.SELECT });
        res.status(200).json({ data: rows.map((r) => ({ ...r, total: (0, glCore_1.round2)(Number(r.total)), assets: Number(r.assets) })) });
    }
    catch (error) {
        fail(res, error, "Error getting depreciation runs");
    }
};
exports.getDepreciationRuns = getDepreciationRuns;
/**
 * POST /fixed-asset/dispose/:id { date, note? } — ຈຳໜ່າຍ/ຂາຍ/ເສຍຫາຍ: ລ້າງລາຄາທຶນ ແລະ ຄ່າຫຼຸ້ຍຫ້ຽນສະສົມ,
 * ມູນຄ່າຍັງເຫຼືອ → ຂາດທຶນຈາກການຈຳໜ່າຍ. ຄວນລົງຄ່າຫຼຸ້ຍຫ້ຽນຮອດເດືອນທີ່ຈຳໜ່າຍກ່ອນ
 */
const disposeFixedAsset = async (req, res) => {
    const t = await database_1.default.transaction();
    try {
        const row = await fixedAsset_1.default.findByPk(Number(req.params.id), { transaction: t, lock: t.LOCK.UPDATE });
        if (!row)
            throw new glCore_1.GlError("ບໍ່ພົບຊັບສົມບັດ");
        if (Number(row.status) === DISPOSED)
            throw new glCore_1.GlError("ຊັບສົມບັດນີ້ຈຳໜ່າຍແລ້ວ");
        const date = (0, bansiHelpers_1.toDateOnly)(req.body?.date);
        if (!date)
            throw new glCore_1.GlError("ກະລຸນາເລືອກວັນທີຈຳໜ່າຍ");
        if (date < row.acquisition_date)
            throw new glCore_1.GlError("ວັນທີຈຳໜ່າຍ ຕ້ອງຫຼັງວັນທີຊື້");
        const later = await fixedAsset_1.FixedAssetDepreciation.count({ where: { asset_id: row._uuid, period: { [sequelize_1.Op.gt]: monthOf(date) } }, transaction: t });
        if (later)
            throw new glCore_1.GlError("ມີຄ່າຫຼຸ້ຍຫ້ຽນທີ່ລົງຫຼັງເດືອນຈຳໜ່າຍ — ຍົກເລີກເດືອນເຫຼົ່ານັ້ນກ່ອນ");
        const posted = (await postedTotals(undefined, t)).get(row._uuid)?.total ?? 0;
        const accumulated = (0, glCore_1.round2)(Number(row.opening_accumulated) + posted);
        const nbv = (0, glCore_1.round2)(Number(row.cost) - accumulated);
        const actorId = Number((0, bansiHelpers_1.actorOf)(req)) || null;
        const label = `${row.asset_code} ${row.name}`;
        const lines = [{ accountId: row.asset_account_id, side: glCore_1.CREDIT, amount: Number(row.cost), description: label }];
        if (accumulated > 0) {
            lines.push({ accountId: row.accum_account_id ?? (await (0, glCore_1.roleAccountId)("ACCUM_DEPRECIATION", t)), side: glCore_1.DEBIT, amount: accumulated, description: label });
        }
        if (nbv > 0)
            lines.push({ accountId: await (0, glCore_1.roleAccountId)("ASSET_DISPOSAL_LOSS", t), side: glCore_1.DEBIT, amount: nbv, description: label });
        await (0, glCore_1.postEntry)({
            date, sourceType: "ASSET_DISPOSAL", sourceId: row._uuid, reference: row.asset_code,
            description: `ຈຳໜ່າຍຊັບສົມບັດ ${label}`, lines, actorId,
        }, t);
        const note = String(req.body?.note ?? "").trim().slice(0, 255) || null;
        await row.update({ status: DISPOSED, disposal_date: date, disposal_note: note, updatedAt: new Date() }, { transaction: t });
        await t.commit();
        res.status(200).json({ message: "Successfully disposed fixed asset", data: { accumulated, nbv } });
    }
    catch (error) {
        await t.rollback();
        fail(res, error, "Error disposing fixed asset");
    }
};
exports.disposeFixedAsset = disposeFixedAsset;
/** PUT /fixed-asset/restore/:id — ຍົກເລີກການຈຳໜ່າຍ (ກັບໃບຈຳໜ່າຍ) */
const restoreFixedAsset = async (req, res) => {
    const t = await database_1.default.transaction();
    try {
        const row = await fixedAsset_1.default.findByPk(Number(req.params.id), { transaction: t, lock: t.LOCK.UPDATE });
        if (!row || Number(row.status) !== DISPOSED)
            throw new glCore_1.GlError("ຊັບສົມບັດນີ້ບໍ່ໄດ້ຈຳໜ່າຍ");
        await (0, glCore_1.reverseSource)("ASSET_DISPOSAL", row._uuid, t, Number((0, bansiHelpers_1.actorOf)(req)) || null);
        await row.update({ status: ACTIVE, disposal_date: null, disposal_note: null, updatedAt: new Date() }, { transaction: t });
        await t.commit();
        res.status(200).json({ message: "Successfully restored fixed asset" });
    }
    catch (error) {
        await t.rollback();
        fail(res, error, "Error restoring fixed asset");
    }
};
exports.restoreFixedAsset = restoreFixedAsset;
/**
 * POST /fixed-asset/schedule { start_date, end_date } — ຕາຕະລາງຊັບສົມບັດຂອງງວດ (ບົດອະທິບາຍງົບ):
 * ລາຄາທຶນ, ສະສົມຕົ້ນງວດ, ຄ່າຫຼຸ້ຍຫ້ຽນໃນງວດ, ສະສົມທ້າຍງວດ, ມູນຄ່າຍັງເຫຼືອ — ສະເພາະທີ່ມີຢູ່ໃນງວດ
 */
const getAssetSchedule = async (req, res) => {
    try {
        const start = (0, bansiHelpers_1.toDateOnly)(req.body?.start_date);
        const end = (0, bansiHelpers_1.toDateOnly)(req.body?.end_date);
        if (!start || !end)
            throw new glCore_1.GlError("ກະລຸນາເລືອກງວດ");
        const [assets, sums] = await Promise.all([
            fixedAsset_1.default.findAll({ where: { acquisition_date: { [sequelize_1.Op.lte]: end } }, order: [["asset_code", "ASC"]] }),
            database_1.default.query(`SELECT asset_id,
           SUM(CASE WHEN period < :startMonth THEN amount ELSE 0 END) AS \`before\`,
           SUM(CASE WHEN period >= :startMonth AND period <= :endMonth THEN amount ELSE 0 END) AS within
         FROM tbl_fixed_asset_depreciation GROUP BY asset_id`, { type: sequelize_1.QueryTypes.SELECT, replacements: { startMonth: monthOf(start), endMonth: monthOf(end) } }),
        ]);
        const data = assets
            .filter((a) => !(Number(a.status) === DISPOSED && a.disposal_date && a.disposal_date < start))
            .map((a) => {
            const s = sums.find((r) => Number(r.asset_id) === a._uuid);
            const opening = (0, glCore_1.round2)(Number(a.opening_accumulated) + Number(s?.before ?? 0));
            const within = (0, glCore_1.round2)(Number(s?.within ?? 0));
            const disposed = Number(a.status) === DISPOSED && !!a.disposal_date && a.disposal_date <= end;
            const closing = (0, glCore_1.round2)(opening + within);
            return {
                _uuid: a._uuid, asset_code: a.asset_code, name: a.name, asset_account_id: a.asset_account_id,
                acquisition_date: a.acquisition_date, cost: Number(a.cost), opening_accumulated: opening, depreciation: within,
                closing_accumulated: closing, nbv: disposed ? 0 : (0, glCore_1.round2)(Number(a.cost) - closing), disposed, disposal_date: a.disposal_date,
            };
        });
        res.status(200).json({ data });
    }
    catch (error) {
        fail(res, error, "Error building asset schedule");
    }
};
exports.getAssetSchedule = getAssetSchedule;
