"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeSalaryIncome = exports.recordSalaryIncome = exports.getMyMoneySummary = exports.getMyMoneyEntryPhoto = exports.deleteMyMoneyEntry = exports.updateMyMoneyEntry = exports.createMyMoneyEntry = exports.getMyMoneyEntries = exports.deleteMyMoneyCategory = exports.updateMyMoneyCategory = exports.createMyMoneyCategory = exports.getMyMoneyCategories = exports.CURRENCIES = exports.KINDS = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const moment_1 = __importDefault(require("moment"));
const sequelize_1 = require("sequelize");
const moneyCategory_1 = __importDefault(require("../../models/moneyCategory"));
const moneyEntry_1 = __importDefault(require("../../models/moneyEntry"));
const bansiHelpers_1 = require("../bansi/bansiHelpers");
const attendanceController_1 = require("./attendanceController");
const hrHelpers_1 = require("./hrHelpers");
const workCalendar_1 = require("./workCalendar");
/**
 * ລາຍຮັບ-ລາຍຈ່າຍສ່ວນຕົວຂອງພະນັກງານ (app ມືຖື — token ຂອງພະນັກງານ, ເຫັນສະເພາະຂອງຕົນເອງ):
 * - GET /money/me/categories — ໝວດໝູ່ທີ່ໃຊ້ງານ (ເປີດເທື່ອທຳອິດ = ສ້າງຊຸດເລີ່ມຕົ້ນໃຫ້)
 * - POST /money/me/categories { kind, name, icon, color } · PUT /money/me/categories/:id { name?, icon?, color? }
 * - DELETE /money/me/categories/:id — ລຶບແບບ soft (ລາຍການເກົ່າຍັງສະແດງຊື່ໝວດ); ໝວດເງິນເດືອນລຶບບໍ່ໄດ້
 * - GET /money/me/entries?from=&to=&offset= — ລາຍການໃນຊ່ວງວັນທີ (ໃໝ່ສຸດກ່ອນ, ເທື່ອລະ 50) + ຍອດລວມຂອງຊ່ວງແຍກຕາມສະກຸນເງິນ
 * - POST /money/me/entries (multipart: category_id, amount, currency, entry_date, note, photo?) — ປະເພດ (ຮັບ/ຈ່າຍ) ຕາມໝວດ
 * - PUT /money/me/entries/:id (multipart: ຟີວທີ່ປ່ຽນ, photo ໃໝ່ ຫຼື remove_photo=1) · DELETE /money/me/entries/:id
 * - GET /money/me/entries/:id/photo — ຮູບໃບບິນ
 * - GET /money/me/summary?from=&to=&currency= — ລາຍງານ: ຍອດລວມ, ແຍກຕາມໝວດ, ແນວໂນ້ມລາຍວັນ (≤ 62 ມື້) / ລາຍເດືອນ
 * ບໍ່ແປງສະກຸນເງິນ (ອັດຕາແລກປ່ຽນປ່ຽນທຸກມື້) — ລາຍງານເທື່ອລະສະກຸນ.
 * HR ຈ່າຍເງິນເດືອນ = ລະບົບເພີ່ມລາຍຮັບ "ເງິນເດືອນ" ໃຫ້ເອງ (recordSalaryIncome), ຍົກເລີກການຈ່າຍ = ລຶບອອກ (removeSalaryIncome)
 */
exports.KINDS = ["income", "expense"];
exports.CURRENCIES = ["LAK", "THB", "USD"];
const SALARY = "salary";
const PAYROLL = "PAYROLL";
const MAX_NAME = 60;
const MAX_NOTE = 500;
const MAX_CATEGORIES = 60;
/** DECIMAL(16, 2) */
const MAX_AMOUNT = 1e13;
const PAGE = 50;
/** ເບິ່ງ / ລາຍງານໄດ້ບໍ່ເກີນ 1 ປີຕໍ່ເທື່ອ; ຍາວກວ່າ 62 ມື້ = ແນວໂນ້ມລາຍເດືອນ */
const MAX_RANGE_DAYS = 366;
const DAILY_TREND_DAYS = 62;
const ICON = /^[a-z_]{1,30}$/;
const COLOR = /^#[0-9A-Fa-f]{6}$/;
/** ໝວດເລີ່ມຕົ້ນຂອງທຸກຄົນ — icon ກົງກັບ moneyIcons ຂອງແອັບ */
const DEFAULTS = [
    { kind: "income", name: "ເງິນເດືອນ", icon: "salary", color: "#0E7A52", code: SALARY },
    { kind: "income", name: "ໂບນັດ / ຄ່ານາຍໜ້າ", icon: "bonus", color: "#16A34A" },
    { kind: "income", name: "ລາຍຮັບອື່ນ", icon: "savings", color: "#0D9488" },
    { kind: "expense", name: "ອາຫານ", icon: "food", color: "#F97316" },
    { kind: "expense", name: "ເດີນທາງ / ນ້ຳມັນ", icon: "transport", color: "#2563EB" },
    { kind: "expense", name: "ຄ່າໂທ / ອິນເຕີເນັດ", icon: "phone", color: "#7C3AED" },
    { kind: "expense", name: "ຊື້ເຄື່ອງ", icon: "shopping", color: "#DB2777" },
    { kind: "expense", name: "ທີ່ພັກ / ຄ່າເຊົ່າ", icon: "home", color: "#0891B2" },
    { kind: "expense", name: "ສຸຂະພາບ", icon: "health", color: "#DC2626" },
    { kind: "expense", name: "ຄອບຄົວ", icon: "family", color: "#CA8A04" },
    { kind: "expense", name: "ອື່ນໆ", icon: "other", color: "#64748B" },
];
const isKind = (value) => exports.KINDS.includes(value);
const daysBetween = (from, to) => (0, moment_1.default)(to, "YYYY-MM-DD").diff((0, moment_1.default)(from, "YYYY-MM-DD"), "days");
const amountOf = (value) => Math.round((Number(value) || 0) * 100) / 100;
const idOf = (req) => {
    const id = Number((0, bansiHelpers_1.decodeId)(req));
    return Number.isInteger(id) && id > 0 ? id : null;
};
/** ສ້າງຊຸດເລີ່ມຕົ້ນເທື່ອດຽວຕໍ່ຄົນ — ຄຳຂໍທີ່ມາພ້ອມກັນ (ເປີດແອັບ + HR ຈ່າຍເງິນເດືອນ) ລໍຖ້າອັນດຽວກັນ ບໍ່ສ້າງຊ້ຳ */
const seeding = new Map();
const ensureCategories = (employeeId) => {
    const running = seeding.get(employeeId);
    if (running)
        return running;
    const job = (async () => {
        if (await moneyCategory_1.default.count({ where: { employee_id: employeeId } }))
            return;
        await moneyCategory_1.default.bulkCreate(DEFAULTS.map((d, sort) => ({ ...d, code: d.code ?? null, employee_id: employeeId, sort })));
    })().finally(() => seeding.delete(employeeId));
    seeding.set(employeeId, job);
    return job;
};
/** ໝວດເງິນເດືອນຂອງຄົນນີ້ — ບໍ່ມີ (ຂໍ້ມູນເກົ່າ) = ສ້າງໃໝ່ */
const salaryCategoryOf = async (employeeId) => {
    await ensureCategories(employeeId);
    const found = await moneyCategory_1.default.findOne({ where: { employee_id: employeeId, code: SALARY } });
    if (found)
        return found;
    const salary = DEFAULTS[0];
    return moneyCategory_1.default.create({ ...salary, employee_id: employeeId, sort: 0 });
};
const categoryOf = (c) => ({
    _uuid: c._uuid,
    kind: c.kind,
    name: c.name,
    icon: c.icon,
    color: c.color,
    code: c.code ?? null,
    active: Number(c.status) === 1,
});
/** ທຸກໝວດຂອງຄົນນີ້ (ລວມທີ່ລຶບແລ້ວ — ລາຍການເກົ່າຍັງຕ້ອງສະແດງຊື່) */
const categoryMap = async (employeeId) => new Map((await moneyCategory_1.default.findAll({ where: { employee_id: employeeId } })).map((c) => [c._uuid, categoryOf(c)]));
const entryOf = (e, categories) => {
    const category = categories.get(Number(e.category_id));
    return {
        _uuid: e._uuid,
        kind: e.kind,
        category_id: e.category_id,
        category: category ? { name: category.name, icon: category.icon, color: category.color } : null,
        amount: Number(e.amount),
        currency: e.currency,
        entry_date: e.entry_date,
        note: e.note || null,
        has_photo: !!e.photo,
        /** PAYROLL = ລະບົບເພີ່ມເອງຕອນຈ່າຍເງິນເດືອນ */
        source: e.source ?? null,
        createdAt: e.createdAt,
    };
};
/** ພະນັກງານທີ່ login — ບໍ່ແມ່ນ = ຕອບ error ແລ້ວຄືນ null */
const me = async (req, res) => {
    const self = await (0, attendanceController_1.selfEmployee)(req);
    if ("code" in self) {
        res.status(self.code).json({ message: self.message });
        return null;
    }
    return self.employee._uuid;
};
/** from / to ຂອງ query — ບໍ່ສົ່ງ = ເດືອນນີ້ */
const rangeOf = (query) => {
    const month = (0, moment_1.default)((0, workCalendar_1.todayLao)(), "YYYY-MM-DD");
    const from = query.from === undefined ? month.clone().startOf("month").format("YYYY-MM-DD") : (0, bansiHelpers_1.toDateOnly)(query.from);
    const to = query.to === undefined ? month.clone().endOf("month").format("YYYY-MM-DD") : (0, bansiHelpers_1.toDateOnly)(query.to);
    if (!from || !to || to < from || daysBetween(from, to) >= MAX_RANGE_DAYS)
        return null;
    return { from, to };
};
// ================= ໝວດໝູ່
/** GET /money/me/categories */
const getMyMoneyCategories = async (req, res) => {
    try {
        const employeeId = await me(req, res);
        if (employeeId === null)
            return;
        await ensureCategories(employeeId);
        const rows = await moneyCategory_1.default.findAll({
            where: { employee_id: employeeId, status: 1 },
            order: [["kind", "DESC"], ["sort", "ASC"], ["_uuid", "ASC"]],
        });
        res.status(200).json({ data: rows.map(categoryOf) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting money categories");
    }
};
exports.getMyMoneyCategories = getMyMoneyCategories;
/** ຊື່ / ໄອຄອນ / ສີ ຈາກ body — has = ສົ່ງມາບໍ່ (ແກ້ໄຂສົ່ງສະເພາະທີ່ປ່ຽນ) */
const readCategory = (body, creating) => {
    const has = (key) => creating || body[key] !== undefined;
    const input = {};
    if (has("name")) {
        const name = String(body.name ?? "").trim();
        if (!name)
            return { error: "ກະລຸນາປ້ອນຊື່ໝວດ" };
        if (name.length > MAX_NAME)
            return { error: `ຊື່ໝວດຍາວໄດ້ບໍ່ເກີນ ${MAX_NAME} ຕົວອັກສອນ` };
        input.name = name;
    }
    if (has("icon")) {
        const icon = String(body.icon ?? "other");
        if (!ICON.test(icon))
            return { error: "ໄອຄອນບໍ່ຖືກຕ້ອງ" };
        input.icon = icon;
    }
    if (has("color")) {
        const color = String(body.color ?? "#64748B");
        if (!COLOR.test(color))
            return { error: "ສີບໍ່ຖືກຕ້ອງ" };
        input.color = color.toUpperCase();
    }
    return { input };
};
/** POST /money/me/categories */
const createMyMoneyCategory = async (req, res) => {
    try {
        const employeeId = await me(req, res);
        if (employeeId === null)
            return;
        const body = req.body ?? {};
        if (!isKind(body.kind)) {
            res.status(400).json({ message: "ກະລຸນາເລືອກ ລາຍຮັບ ຫຼື ລາຍຈ່າຍ" });
            return;
        }
        const result = readCategory(body, true);
        if ("error" in result) {
            res.status(400).json({ message: result.error });
            return;
        }
        await ensureCategories(employeeId);
        const active = { employee_id: employeeId, status: 1 };
        if ((await moneyCategory_1.default.count({ where: active })) >= MAX_CATEGORIES) {
            res.status(400).json({ message: `ມີໝວດໄດ້ບໍ່ເກີນ ${MAX_CATEGORIES} ໝວດ` });
            return;
        }
        const sort = Number(await moneyCategory_1.default.max("sort", { where: { employee_id: employeeId } })) || 0;
        const row = await moneyCategory_1.default.create({ ...result.input, kind: body.kind, employee_id: employeeId, sort: sort + 1 });
        res.status(200).json({ message: "ເພີ່ມໝວດແລ້ວ", data: categoryOf(row) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error creating money category");
    }
};
exports.createMyMoneyCategory = createMyMoneyCategory;
/** ໝວດຂອງຂ້ອຍທີ່ຍັງໃຊ້ງານ — ບໍ່ແມ່ນຂອງຂ້ອຍ / ບໍ່ມີ = null */
const myCategory = (id, employeeId) => id ? moneyCategory_1.default.findOne({ where: { _uuid: id, employee_id: employeeId, status: 1 } }) : Promise.resolve(null);
/** PUT /money/me/categories/:id */
const updateMyMoneyCategory = async (req, res) => {
    try {
        const employeeId = await me(req, res);
        if (employeeId === null)
            return;
        const category = await myCategory(idOf(req), employeeId);
        if (!category) {
            res.status(404).json({ message: "ບໍ່ພົບໝວດນີ້" });
            return;
        }
        const result = readCategory(req.body ?? {}, false);
        if ("error" in result) {
            res.status(400).json({ message: result.error });
            return;
        }
        await category.update({ ...result.input, updatedAt: new Date() });
        res.status(200).json({ message: "ບັນທຶກໝວດແລ້ວ", data: categoryOf(category) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error updating money category");
    }
};
exports.updateMyMoneyCategory = updateMyMoneyCategory;
/** DELETE /money/me/categories/:id */
const deleteMyMoneyCategory = async (req, res) => {
    try {
        const employeeId = await me(req, res);
        if (employeeId === null)
            return;
        const category = await myCategory(idOf(req), employeeId);
        if (!category) {
            res.status(404).json({ message: "ບໍ່ພົບໝວດນີ້" });
            return;
        }
        if (category.code === SALARY) {
            res.status(400).json({ message: "ໝວດເງິນເດືອນລຶບບໍ່ໄດ້ — ລະບົບໃຊ້ບັນທຶກເງິນເດືອນໃຫ້ເອງ" });
            return;
        }
        await category.update({ status: 0, updatedAt: new Date() });
        res.status(200).json({ message: "ລຶບໝວດແລ້ວ — ລາຍການເກົ່າຍັງຢູ່ຄືເດີມ" });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error deleting money category");
    }
};
exports.deleteMyMoneyCategory = deleteMyMoneyCategory;
// ================= ລາຍການ
/** GET /money/me/entries?from=&to=&offset= */
const getMyMoneyEntries = async (req, res) => {
    try {
        const employeeId = await me(req, res);
        if (employeeId === null)
            return;
        const range = rangeOf(req.query);
        if (!range) {
            res.status(400).json({ message: "ຊ່ວງວັນທີບໍ່ຖືກຕ້ອງ (ບໍ່ເກີນ 1 ປີ)" });
            return;
        }
        const offset = Math.max(0, Math.floor(Number(req.query.offset) || 0));
        const where = { employee_id: employeeId, entry_date: { [sequelize_1.Op.between]: [range.from, range.to] } };
        const [rows, sums, categories] = await Promise.all([
            moneyEntry_1.default.findAll({ where, order: [["entry_date", "DESC"], ["_uuid", "DESC"]], limit: PAGE + 1, offset }),
            moneyEntry_1.default.findAll({
                attributes: ["currency", "kind", [(0, sequelize_1.fn)("SUM", (0, sequelize_1.col)("amount")), "total"]],
                where,
                group: ["currency", "kind"],
                raw: true,
            }),
            categoryMap(employeeId),
        ]);
        const totals = exports.CURRENCIES.map((currency) => ({
            currency,
            income: amountOf(sums.find((s) => s.currency === currency && s.kind === "income")?.total),
            expense: amountOf(sums.find((s) => s.currency === currency && s.kind === "expense")?.total),
        })).filter((t) => t.income || t.expense);
        res.status(200).json({
            ...range,
            today: (0, workCalendar_1.todayLao)(),
            data: rows.slice(0, PAGE).map((e) => entryOf(e, categories)),
            has_more: rows.length > PAGE,
            totals,
        });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting money entries");
    }
};
exports.getMyMoneyEntries = getMyMoneyEntries;
/**
 * ກວດຂໍ້ມູນລາຍການຈາກ body (multipart = ທຸກຄ່າເປັນ string) — ບໍ່ມີ existing (ເພີ່ມໃໝ່) = ຕ້ອງມີຄົບ.
 * ແກ້ໄຂລາຍການທີ່ໝວດຖືກລຶບແລ້ວ ໂດຍສົ່ງໝວດເດີມ = ບໍ່ກວດໝວດ (ບັນທຶກໄດ້ໂດຍບໍ່ຕ້ອງປ່ຽນໝວດ)
 */
const readEntry = async (body, employeeId, existing) => {
    const creating = !existing;
    const has = (key) => creating || (body[key] !== undefined && body[key] !== "");
    const input = {};
    const sameCategory = !!existing && Number(body.category_id) === Number(existing.category_id);
    if (has("category_id") && !sameCategory) {
        const category = await myCategory(Number(body.category_id) || null, employeeId);
        if (!category)
            return { error: "ກະລຸນາເລືອກໝວດ" };
        input.category_id = category._uuid;
        input.kind = category.kind;
    }
    if (has("amount")) {
        const amount = amountOf(body.amount);
        if (!(amount > 0))
            return { error: "ກະລຸນາປ້ອນຈຳນວນເງິນ" };
        if (amount >= MAX_AMOUNT)
            return { error: "ຈຳນວນເງິນຫຼາຍເກີນໄປ" };
        input.amount = amount;
    }
    if (has("currency")) {
        const currency = String(body.currency ?? "LAK").toUpperCase();
        if (!exports.CURRENCIES.includes(currency))
            return { error: "ສະກຸນເງິນບໍ່ຖືກຕ້ອງ" };
        input.currency = currency;
    }
    if (has("entry_date")) {
        const date = (0, bansiHelpers_1.toDateOnly)(body.entry_date);
        const latest = (0, moment_1.default)((0, workCalendar_1.todayLao)(), "YYYY-MM-DD").add(1, "year").format("YYYY-MM-DD");
        if (!date || date < "2000-01-01" || date > latest)
            return { error: "ວັນທີບໍ່ຖືກຕ້ອງ" };
        input.entry_date = date;
    }
    if (body.note !== undefined) {
        const note = String(body.note ?? "").trim();
        if (note.length > MAX_NOTE)
            return { error: `ບັນທຶກຍາວໄດ້ບໍ່ເກີນ ${MAX_NOTE} ຕົວອັກສອນ` };
        input.note = note || null;
    }
    return { input };
};
/** ລາຍການຂອງຂ້ອຍ — ບໍ່ແມ່ນຂອງຂ້ອຍ / ບໍ່ມີ = null (ຕອບ 404 ຄືກັນ ບໍ່ບອກວ່າມີຢູ່) */
const myEntry = (id, employeeId) => id ? moneyEntry_1.default.findOne({ where: { _uuid: id, employee_id: employeeId } }) : Promise.resolve(null);
const receiptPath = (file) => path_1.default.join(hrHelpers_1.RECEIPT_DIR, path_1.default.basename(file));
/** POST /money/me/entries */
const createMyMoneyEntry = async (req, res) => {
    const uploaded = req.file?.filename;
    const fail = (code, message) => {
        if (uploaded)
            (0, hrHelpers_1.removeQuietly)(receiptPath(uploaded));
        res.status(code).json({ message });
    };
    try {
        const employeeId = await me(req, res);
        if (employeeId === null) {
            if (uploaded)
                (0, hrHelpers_1.removeQuietly)(receiptPath(uploaded));
            return;
        }
        await ensureCategories(employeeId);
        const result = await readEntry(req.body ?? {}, employeeId);
        if (result.error)
            return fail(400, result.error);
        const row = await moneyEntry_1.default.create({ ...result.input, employee_id: employeeId, photo: uploaded ?? null });
        res.status(200).json({
            message: row.kind === "income" ? "ບັນທຶກລາຍຮັບແລ້ວ" : "ບັນທຶກລາຍຈ່າຍແລ້ວ",
            data: entryOf(row, await categoryMap(employeeId)),
        });
    }
    catch (error) {
        if (uploaded)
            (0, hrHelpers_1.removeQuietly)(receiptPath(uploaded));
        (0, bansiHelpers_1.sendError)(res, error, "Error creating money entry");
    }
};
exports.createMyMoneyEntry = createMyMoneyEntry;
/** PUT /money/me/entries/:id */
const updateMyMoneyEntry = async (req, res) => {
    const uploaded = req.file?.filename;
    const fail = (code, message) => {
        if (uploaded)
            (0, hrHelpers_1.removeQuietly)(receiptPath(uploaded));
        res.status(code).json({ message });
    };
    try {
        const employeeId = await me(req, res);
        if (employeeId === null) {
            if (uploaded)
                (0, hrHelpers_1.removeQuietly)(receiptPath(uploaded));
            return;
        }
        const entry = await myEntry(idOf(req), employeeId);
        if (!entry)
            return fail(404, "ບໍ່ພົບລາຍການນີ້");
        const body = req.body ?? {};
        const result = await readEntry(body, employeeId, entry);
        if (result.error)
            return fail(400, result.error);
        const old = entry.photo;
        const removePhoto = ["1", "true"].includes(String(body.remove_photo));
        const photo = uploaded ?? (removePhoto ? null : old);
        await entry.update({ ...result.input, photo, updatedAt: new Date() });
        if (old && old !== photo)
            (0, hrHelpers_1.removeQuietly)(receiptPath(old));
        res.status(200).json({ message: "ບັນທຶກການແກ້ໄຂແລ້ວ", data: entryOf(entry, await categoryMap(employeeId)) });
    }
    catch (error) {
        if (uploaded)
            (0, hrHelpers_1.removeQuietly)(receiptPath(uploaded));
        (0, bansiHelpers_1.sendError)(res, error, "Error updating money entry");
    }
};
exports.updateMyMoneyEntry = updateMyMoneyEntry;
/** DELETE /money/me/entries/:id */
const deleteMyMoneyEntry = async (req, res) => {
    try {
        const employeeId = await me(req, res);
        if (employeeId === null)
            return;
        const entry = await myEntry(idOf(req), employeeId);
        if (!entry) {
            res.status(404).json({ message: "ບໍ່ພົບລາຍການນີ້" });
            return;
        }
        await entry.destroy();
        if (entry.photo)
            (0, hrHelpers_1.removeQuietly)(receiptPath(entry.photo));
        res.status(200).json({ message: "ລຶບລາຍການແລ້ວ" });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error deleting money entry");
    }
};
exports.deleteMyMoneyEntry = deleteMyMoneyEntry;
/** GET /money/me/entries/:id/photo */
const getMyMoneyEntryPhoto = async (req, res) => {
    try {
        const employeeId = await me(req, res);
        if (employeeId === null)
            return;
        const entry = await myEntry(idOf(req), employeeId);
        const file = entry?.photo ? receiptPath(entry.photo) : null;
        if (!file || !fs_1.default.existsSync(file)) {
            res.status(404).json({ message: "ບໍ່ພົບຮູບ" });
            return;
        }
        res.setHeader("Cache-Control", "private, max-age=86400");
        res.sendFile(file);
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting receipt photo");
    }
};
exports.getMyMoneyEntryPhoto = getMyMoneyEntryPhoto;
// ================= ລາຍງານ
/** GET /money/me/summary?from=&to=&currency= */
const getMyMoneySummary = async (req, res) => {
    try {
        const employeeId = await me(req, res);
        if (employeeId === null)
            return;
        const range = rangeOf(req.query);
        if (!range) {
            res.status(400).json({ message: "ຊ່ວງວັນທີບໍ່ຖືກຕ້ອງ (ບໍ່ເກີນ 1 ປີ)" });
            return;
        }
        const currency = String(req.query.currency ?? "LAK").toUpperCase();
        if (!exports.CURRENCIES.includes(currency)) {
            res.status(400).json({ message: "ສະກຸນເງິນບໍ່ຖືກຕ້ອງ" });
            return;
        }
        const inRange = { employee_id: employeeId, entry_date: { [sequelize_1.Op.between]: [range.from, range.to] } };
        const where = { ...inRange, currency };
        const [byCategory, byDay, used, categories] = await Promise.all([
            moneyEntry_1.default.findAll({
                attributes: ["category_id", "kind", [(0, sequelize_1.fn)("SUM", (0, sequelize_1.col)("amount")), "total"], [(0, sequelize_1.fn)("COUNT", (0, sequelize_1.col)("_uuid")), "count"]],
                where,
                group: ["category_id", "kind"],
                raw: true,
            }),
            // raw ບໍ່ຜ່ານ model — DATE ອາດມາເປັນ Date object, ໃຫ້ MySQL ແປງເປັນ "YYYY-MM-DD" ເອງ
            moneyEntry_1.default.findAll({
                attributes: [[(0, sequelize_1.fn)("DATE_FORMAT", (0, sequelize_1.col)("entry_date"), "%Y-%m-%d"), "day"], "kind", [(0, sequelize_1.fn)("SUM", (0, sequelize_1.col)("amount")), "total"]],
                where,
                group: ["day", "kind"],
                raw: true,
            }),
            moneyEntry_1.default.findAll({ attributes: ["currency"], where: inRange, group: ["currency"], raw: true }),
            categoryMap(employeeId),
        ]);
        const rows = byCategory.map((r) => {
            const category = categories.get(Number(r.category_id));
            return {
                category_id: Number(r.category_id),
                kind: r.kind,
                name: category?.name ?? "—",
                icon: category?.icon ?? "other",
                color: category?.color ?? "#64748B",
                total: amountOf(r.total),
                count: Number(r.count) || 0,
            };
        }).sort((a, b) => b.total - a.total);
        const sum = (kind) => amountOf(rows.filter((r) => r.kind === kind).reduce((s, r) => s + r.total, 0));
        const income = sum("income");
        const expense = sum("expense");
        // ແນວໂນ້ມ: ທຸກມື້ / ທຸກເດືອນໃນຊ່ວງ (ມື້ທີ່ບໍ່ມີລາຍການ = 0)
        const daily = daysBetween(range.from, range.to) < DAILY_TREND_DAYS;
        const keyOf = (date) => (daily ? date : date.slice(0, 7));
        const points = new Map();
        const step = daily ? "day" : "month";
        for (let d = (0, moment_1.default)(range.from, "YYYY-MM-DD").startOf(step); d.format("YYYY-MM-DD") <= range.to; d.add(1, step)) {
            const key = keyOf(d.format("YYYY-MM-DD"));
            points.set(key, { key, income: 0, expense: 0 });
        }
        for (const r of byDay) {
            const point = points.get(keyOf(String(r.day)));
            if (point && isKind(r.kind))
                point[r.kind] = amountOf(point[r.kind] + amountOf(r.total));
        }
        res.status(200).json({
            ...range,
            currency,
            currencies: exports.CURRENCIES.filter((c) => c === currency || used.some((u) => u.currency === c)),
            totals: { income, expense, balance: amountOf(income - expense), count: rows.reduce((s, r) => s + r.count, 0) },
            categories: rows,
            trend: { group: daily ? "day" : "month", points: [...points.values()] },
        });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting money summary");
    }
};
exports.getMyMoneySummary = getMyMoneySummary;
// ================= ເງິນເດືອນ (payrollController)
/**
 * HR ຈ່າຍເງິນເດືອນ → ລາຍຮັບ "ເງິນເດືອນ" (ຍອດສຸດທິ, ກີບ, ວັນທີຈ່າຍ) ໃນບັນຊີສ່ວນຕົວຂອງແຕ່ລະຄົນ.
 * ເອີ້ນຫຼັງ commit — ບໍ່ສຳເລັດ ບໍ່ກະທົບການຈ່າຍເງິນເດືອນ. ເອີ້ນຊ້ຳ = ແທນລາຍການເກົ່າຂອງໃບເງິນເດືອນນີ້ (ບໍ່ຊ້ຳ)
 */
const recordSalaryIncome = async (payrollId, payDate, note, lines) => {
    await (0, exports.removeSalaryIncome)(payrollId);
    for (const line of lines) {
        const employeeId = Number(line.employee_id);
        const amount = amountOf(line.net);
        if (!employeeId || !(amount > 0))
            continue;
        const category = await salaryCategoryOf(employeeId);
        await moneyEntry_1.default.create({
            employee_id: employeeId,
            kind: "income",
            category_id: category._uuid,
            amount,
            currency: "LAK",
            entry_date: payDate,
            note,
            source: PAYROLL,
            source_id: payrollId,
        });
    }
};
exports.recordSalaryIncome = recordSalaryIncome;
/** HR ຍົກເລີກການຈ່າຍເງິນເດືອນ → ລຶບລາຍຮັບເງິນເດືອນຂອງໃບນັ້ນອອກຈາກທຸກຄົນ */
const removeSalaryIncome = (payrollId) => moneyEntry_1.default.destroy({ where: { source: PAYROLL, source_id: payrollId } });
exports.removeSalaryIncome = removeSalaryIncome;
