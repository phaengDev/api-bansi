"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMyMoneySummary = exports.getMyMoneyEntryPhoto = exports.deleteMyMoneyEntry = exports.updateMyMoneyEntry = exports.createMyMoneyEntry = exports.getMyMoneyEntries = exports.deleteMyMoneyCategory = exports.updateMyMoneyCategory = exports.createMyMoneyCategory = exports.getMyMoneyCategories = exports.deleteMyMoneyAccount = exports.updateMyMoneyAccount = exports.createMyMoneyAccount = exports.getMyMoneyBanks = exports.getMyMoneyAccounts = exports.CURRENCIES = exports.KINDS = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const moment_1 = __importDefault(require("moment"));
const sequelize_1 = require("sequelize");
const bankModel_1 = __importDefault(require("../../models/bankModel"));
const moneyAccount_1 = __importDefault(require("../../models/moneyAccount"));
const moneyCategory_1 = __importDefault(require("../../models/moneyCategory"));
const moneyEntry_1 = __importDefault(require("../../models/moneyEntry"));
const utils_1 = require("../../utils");
const bansiHelpers_1 = require("../bansi/bansiHelpers");
const attendanceController_1 = require("./attendanceController");
const hrHelpers_1 = require("./hrHelpers");
const workCalendar_1 = require("./workCalendar");
/**
 * ບັນຊີເງິນສ່ວນຕົວຂອງພະນັກງານ (app ມືຖື — token ຂອງພະນັກງານ, ເຫັນສະເພາະຂອງຕົນເອງ, ບໍ່ກ່ຽວກັບຂໍ້ມູນ HR):
 * - GET /money/me/accounts — ບັນຊີ (ເງິນສົດ / ທະນາຄານ / e-wallet) ພ້ອມຍອດປັດຈຸບັນ · GET /money/me/banks — ທະນາຄານໃຫ້ເລືອກ
 * - POST /money/me/accounts { name, kind, bank_id?, account_no?, currency, opening_balance } — ສະກຸນ ແລະ ຍອດເລີ່ມຕົ້ນ
 *   ໃສ່ໄດ້ສະເພາະຕອນສ້າງ · PUT /money/me/accounts/:id { name?, kind?, bank_id?, account_no? } · DELETE (soft — ລາຍການເກົ່າຍັງຢູ່)
 * - GET /money/me/categories · POST / PUT / DELETE /money/me/categories/:id — ໝວດ (ເປີດເທື່ອທຳອິດ = ສ້າງຊຸດເລີ່ມຕົ້ນໃຫ້)
 * - GET /money/me/entries?from=&to=&account_id=&kind=&offset= — ລາຍການໃນຊ່ວງ (ໃໝ່ສຸດກ່ອນ, ເທື່ອລະ 50; account_id = ລວມການໂອນເຂົ້າ;
 *   kind = income | expense | transfer ສະເພາະປະເພດນັ້ນ ເທື່ອລະ 500 — ແອັບຈັດກຸ່ມຕາມໝວດ / ບັນຊີ)
 *   + ລາຍຮັບ / ລາຍຈ່າຍ ຂອງຊ່ວງແຍກຕາມສະກຸນ (ບໍ່ນັບການໂອນ, ບໍ່ຂຶ້ນກັບ kind)
 * - POST /money/me/entries (multipart) — ລາຍຮັບ / ລາຍຈ່າຍ: account_id, category_id (ປະເພດຕາມໝວດ), amount, entry_date, note, photo?;
 *   ໂອນ: kind=transfer, account_id (ຕົ້ນທາງ), to_account_id, amount, to_amount (ສະກຸນຕ່າງກັນ = ແລກເງິນ), entry_date, note
 * - PUT /money/me/entries/:id (multipart: ຟີວທີ່ປ່ຽນ, photo ໃໝ່ ຫຼື remove_photo=1) · DELETE · GET …/:id/photo (ຮູບໃບບິນ)
 * - GET /money/me/summary?from=&to=&currency=&account_id= — ລາຍງານ: ຍອດລວມ, ແຍກຕາມໝວດ, ແນວໂນ້ມລາຍວັນ (≤ 62 ມື້) / ລາຍເດືອນ
 *   + ແຍກຕາມບັນຊີ (ທຸກສະກຸນ: ຮັບ, ຈ່າຍ, ໂອນເຂົ້າ-ອອກ ໃນຊ່ວງ ແລະ ຍອດປັດຈຸບັນ)
 * ສະກຸນຂອງລາຍການ = ສະກຸນຂອງບັນຊີ, ບໍ່ແປງຄ່າ (ອັດຕາແລກປ່ຽນປ່ຽນທຸກມື້) — ລາຍງານເທື່ອລະສະກຸນ.
 * ລາຍການກ່ອນມີບັນຊີ (account_id null) = "ບໍ່ລະບຸບັນຊີ" — ບໍ່ນັບໃນຍອດບັນຊີໃດ
 */
exports.KINDS = ["income", "expense"];
exports.CURRENCIES = ["LAK", "THB", "USD"];
const TRANSFER = "transfer";
const ACCOUNT_KINDS = ["cash", "bank", "wallet"];
const MAX_NAME = 60;
const MAX_NOTE = 500;
const MAX_CATEGORIES = 60;
const MAX_ACCOUNTS = 30;
const ACCOUNT_NO = /^[0-9A-Za-z\- ]{1,30}$/;
/** DECIMAL(16, 2) */
const MAX_AMOUNT = 1e13;
const PAGE = 50;
/** ຂໍສະເພາະປະເພດ ຫຼື kind=all (ຈັດກຸ່ມທັງເດືອນໃນແອັບ) */
const KIND_PAGE = 500;
/** ເບິ່ງ / ລາຍງານໄດ້ບໍ່ເກີນ 1 ປີຕໍ່ເທື່ອ; ຍາວກວ່າ 62 ມື້ = ແນວໂນ້ມລາຍເດືອນ */
const MAX_RANGE_DAYS = 366;
const DAILY_TREND_DAYS = 62;
const ICON = /^[a-z_]{1,30}$/;
const COLOR = /^#[0-9A-Fa-f]{6}$/;
/** ໝວດເລີ່ມຕົ້ນຂອງທຸກຄົນ — icon ກົງກັບ moneyIcons ຂອງແອັບ */
const DEFAULTS = [
    { kind: "income", name: "ເງິນເດືອນ", icon: "salary", color: "#0E7A52" },
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
const isCurrency = (value) => exports.CURRENCIES.includes(value);
const daysBetween = (from, to) => (0, moment_1.default)(to, "YYYY-MM-DD").diff((0, moment_1.default)(from, "YYYY-MM-DD"), "days");
const amountOf = (value) => Math.round((Number(value) || 0) * 100) / 100;
const idOf = (req) => {
    const id = Number((0, bansiHelpers_1.decodeId)(req));
    return Number.isInteger(id) && id > 0 ? id : null;
};
/** id ຈາກ query / body (ຕົວເລກທຳມະດາ) — ບໍ່ມີ / ຜິດ = null */
const plainId = (value) => {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
};
/** ສ້າງຊຸດໝວດເລີ່ມຕົ້ນເທື່ອດຽວຕໍ່ຄົນ — ຄຳຂໍທີ່ມາພ້ອມກັນລໍຖ້າອັນດຽວກັນ ບໍ່ສ້າງຊ້ຳ */
const seeding = new Map();
const ensureCategories = (employeeId) => {
    const running = seeding.get(employeeId);
    if (running)
        return running;
    const job = (async () => {
        if (await moneyCategory_1.default.count({ where: { employee_id: employeeId } }))
            return;
        await moneyCategory_1.default.bulkCreate(DEFAULTS.map((d, sort) => ({ ...d, employee_id: employeeId, sort })));
    })().finally(() => seeding.delete(employeeId));
    seeding.set(employeeId, job);
    return job;
};
const categoryOf = (c) => ({
    _uuid: c._uuid,
    kind: c.kind,
    name: c.name,
    icon: c.icon,
    color: c.color,
    active: Number(c.status) === 1,
});
/** ທຸກໝວດຂອງຄົນນີ້ (ລວມທີ່ລຶບແລ້ວ — ລາຍການເກົ່າຍັງຕ້ອງສະແດງຊື່) */
const categoryMap = async (employeeId) => new Map((await moneyCategory_1.default.findAll({ where: { employee_id: employeeId } })).map((c) => [c._uuid, categoryOf(c)]));
const bankOf = (b) => b ? { _uuid: Number(b._uuid), abbr: b.abbr, name: b.name_la || b.abbr, logo: b.logo ? `${(0, utils_1.url)()}/logo/${b.logo}` : null } : null;
const bankMap = async (ids) => {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length)
        return new Map();
    const rows = (await bankModel_1.default.findAll({
        where: { _uuid: { [sequelize_1.Op.in]: unique } },
        attributes: ["_uuid", "abbr", "name_la", "logo"],
        raw: true,
    }));
    return new Map(rows.map((b) => [Number(b._uuid), b]));
};
/** ການເຄື່ອນໄຫວຂອງແຕ່ລະບັນຊີ: ລາຍຮັບ − ລາຍຈ່າຍ − ໂອນອອກ + ໂອນເຂົ້າ ([where] ເພີ່ມເງື່ອນໄຂ ເຊັ່ນ ຊ່ວງວັນທີ) */
const flowsOf = async (employeeId, where = {}) => {
    const [own, incoming] = await Promise.all([
        moneyEntry_1.default.findAll({
            attributes: ["account_id", "kind", [(0, sequelize_1.fn)("SUM", (0, sequelize_1.col)("amount")), "total"], [(0, sequelize_1.fn)("COUNT", (0, sequelize_1.col)("_uuid")), "count"]],
            where: { ...where, employee_id: employeeId, account_id: { [sequelize_1.Op.ne]: null } },
            group: ["account_id", "kind"],
            raw: true,
        }),
        moneyEntry_1.default.findAll({
            attributes: ["to_account_id", [(0, sequelize_1.fn)("SUM", (0, sequelize_1.col)("to_amount")), "total"], [(0, sequelize_1.fn)("COUNT", (0, sequelize_1.col)("_uuid")), "count"]],
            where: { ...where, employee_id: employeeId, kind: TRANSFER, to_account_id: { [sequelize_1.Op.ne]: null } },
            group: ["to_account_id"],
            raw: true,
        }),
    ]);
    const flows = new Map();
    const of = (id) => {
        if (!flows.has(id))
            flows.set(id, { income: 0, expense: 0, transfer_out: 0, transfer_in: 0, count: 0 });
        return flows.get(id);
    };
    for (const r of own) {
        const flow = of(Number(r.account_id));
        const key = r.kind === TRANSFER ? "transfer_out" : isKind(r.kind) ? r.kind : null;
        if (!key)
            continue;
        flow[key] = amountOf(flow[key] + amountOf(r.total));
        flow.count += Number(r.count) || 0;
    }
    for (const r of incoming) {
        const flow = of(Number(r.to_account_id));
        flow.transfer_in = amountOf(flow.transfer_in + amountOf(r.total));
        flow.count += Number(r.count) || 0;
    }
    return flows;
};
const netOf = (f) => f ? f.income - f.expense - f.transfer_out + f.transfer_in : 0;
const accountOf = (a, bank, balance) => ({
    _uuid: a._uuid,
    name: a.name,
    kind: a.kind,
    bank: bankOf(bank),
    account_no: a.account_no || null,
    currency: a.currency,
    opening_balance: Number(a.opening_balance),
    ...(balance === undefined ? {} : { balance: amountOf(balance) }),
    active: Number(a.status) === 1,
});
/** ບັນຊີຂອງຄົນນີ້ (ລວມທີ່ລຶບແລ້ວ ຖ້າ [all]) ພ້ອມຍອດປັດຈຸບັນ */
const accountList = async (employeeId, all = false) => {
    const rows = await moneyAccount_1.default.findAll({
        where: { employee_id: employeeId, ...(all ? {} : { status: 1 }) },
        order: [["sort", "ASC"], ["_uuid", "ASC"]],
    });
    const [flows, banks] = await Promise.all([flowsOf(employeeId), bankMap(rows.map((a) => Number(a.bank_id)))]);
    return rows.map((a) => accountOf(a, banks.get(Number(a.bank_id)), Number(a.opening_balance) + netOf(flows.get(a._uuid))));
};
/** ທຸກບັນຊີຂອງຄົນນີ້ (ລວມທີ່ລຶບແລ້ວ) ສຳລັບສະແດງໃນລາຍການ — ບໍ່ຄິດຍອດ */
const accountMap = async (employeeId) => {
    const rows = await moneyAccount_1.default.findAll({ where: { employee_id: employeeId } });
    const banks = await bankMap(rows.map((a) => Number(a.bank_id)));
    return new Map(rows.map((a) => [a._uuid, accountOf(a, banks.get(Number(a.bank_id)))]));
};
/** ບັນຊີຂອງຂ້ອຍທີ່ຍັງໃຊ້ງານ — ບໍ່ແມ່ນຂອງຂ້ອຍ / ບໍ່ມີ = null */
const myAccount = (id, employeeId) => id ? moneyAccount_1.default.findOne({ where: { _uuid: id, employee_id: employeeId, status: 1 } }) : Promise.resolve(null);
/** ພະນັກງານທີ່ login — ບໍ່ແມ່ນ = ຕອບ error ແລ້ວຄືນ null */
const me = async (req, res) => {
    const self = await (0, attendanceController_1.selfEmployee)(req);
    if ("code" in self) {
        res.status(self.code).json({ message: self.message });
        return null;
    }
    return self.employee._uuid;
};
/** GET /money/me/accounts */
const getMyMoneyAccounts = async (req, res) => {
    try {
        const employeeId = await me(req, res);
        if (employeeId === null)
            return;
        res.status(200).json({ data: await accountList(employeeId) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting money accounts");
    }
};
exports.getMyMoneyAccounts = getMyMoneyAccounts;
/** GET /money/me/banks — ທະນາຄານທີ່ເປີດໃຊ້ (ໂລໂກ້) ໃຫ້ເລືອກຕອນສ້າງບັນຊີ */
const getMyMoneyBanks = async (req, res) => {
    try {
        const employeeId = await me(req, res);
        if (employeeId === null)
            return;
        const rows = (await bankModel_1.default.findAll({ where: { status: 1 }, attributes: ["_uuid", "abbr", "name_la", "logo"], raw: true }));
        res.status(200).json({ data: rows.map(bankOf) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting banks");
    }
};
exports.getMyMoneyBanks = getMyMoneyBanks;
/** ຂໍ້ມູນບັນຊີຈາກ body — ສະກຸນ ແລະ ຍອດເລີ່ມຕົ້ນ ອ່ານສະເພາະຕອນສ້າງ (ແກ້ໄຂບໍ່ໄດ້) */
const readAccount = async (body, existing) => {
    const creating = !existing;
    const has = (key) => creating || body[key] !== undefined;
    const input = {};
    if (has("name")) {
        const name = String(body.name ?? "").trim();
        if (!name)
            return { error: "ກະລຸນາປ້ອນຊື່ບັນຊີ" };
        if (name.length > MAX_NAME)
            return { error: `ຊື່ບັນຊີຍາວໄດ້ບໍ່ເກີນ ${MAX_NAME} ຕົວອັກສອນ` };
        input.name = name;
    }
    const kind = has("kind") ? String(body.kind ?? "") : existing.kind;
    if (!ACCOUNT_KINDS.includes(kind))
        return { error: "ກະລຸນາເລືອກປະເພດບັນຊີ" };
    input.kind = kind;
    if (kind === "bank") {
        const bankId = has("bank_id") ? plainId(body.bank_id) : Number(existing.bank_id) || null;
        if (!bankId || !(await bankModel_1.default.findOne({ where: { _uuid: bankId, status: 1 } })))
            return { error: "ກະລຸນາເລືອກທະນາຄານ" };
        input.bank_id = bankId;
    }
    else {
        input.bank_id = null;
    }
    if (has("account_no")) {
        const accountNo = String(body.account_no ?? "").trim();
        if (accountNo && !ACCOUNT_NO.test(accountNo))
            return { error: "ເລກບັນຊີບໍ່ຖືກຕ້ອງ" };
        input.account_no = accountNo || null;
    }
    if (creating) {
        const currency = String(body.currency ?? "LAK").toUpperCase();
        if (!isCurrency(currency))
            return { error: "ສະກຸນເງິນບໍ່ຖືກຕ້ອງ" };
        const opening = amountOf(body.opening_balance);
        if (Math.abs(opening) >= MAX_AMOUNT)
            return { error: "ຍອດເງິນຫຼາຍເກີນໄປ" };
        input.currency = currency;
        input.opening_balance = opening;
    }
    return { input };
};
/** POST /money/me/accounts */
const createMyMoneyAccount = async (req, res) => {
    try {
        const employeeId = await me(req, res);
        if (employeeId === null)
            return;
        const result = await readAccount(req.body ?? {});
        if (result.error) {
            res.status(400).json({ message: result.error });
            return;
        }
        if ((await moneyAccount_1.default.count({ where: { employee_id: employeeId, status: 1 } })) >= MAX_ACCOUNTS) {
            res.status(400).json({ message: `ມີບັນຊີໄດ້ບໍ່ເກີນ ${MAX_ACCOUNTS} ບັນຊີ` });
            return;
        }
        const sort = Number(await moneyAccount_1.default.max("sort", { where: { employee_id: employeeId } })) || 0;
        const row = await moneyAccount_1.default.create({ ...result.input, employee_id: employeeId, sort: sort + 1 });
        const banks = await bankMap([Number(row.bank_id)]);
        res.status(200).json({ message: "ເພີ່ມບັນຊີແລ້ວ", data: accountOf(row, banks.get(Number(row.bank_id)), Number(row.opening_balance)) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error creating money account");
    }
};
exports.createMyMoneyAccount = createMyMoneyAccount;
/** PUT /money/me/accounts/:id */
const updateMyMoneyAccount = async (req, res) => {
    try {
        const employeeId = await me(req, res);
        if (employeeId === null)
            return;
        const account = await myAccount(idOf(req), employeeId);
        if (!account) {
            res.status(404).json({ message: "ບໍ່ພົບບັນຊີນີ້" });
            return;
        }
        const result = await readAccount(req.body ?? {}, account);
        if (result.error) {
            res.status(400).json({ message: result.error });
            return;
        }
        await account.update({ ...result.input, updatedAt: new Date() });
        res.status(200).json({ message: "ບັນທຶກບັນຊີແລ້ວ" });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error updating money account");
    }
};
exports.updateMyMoneyAccount = updateMyMoneyAccount;
/** DELETE /money/me/accounts/:id — ລາຍການເກົ່າຍັງຢູ່ (ເບິ່ງໄດ້ໃນ "ທັງໝົດ") */
const deleteMyMoneyAccount = async (req, res) => {
    try {
        const employeeId = await me(req, res);
        if (employeeId === null)
            return;
        const account = await myAccount(idOf(req), employeeId);
        if (!account) {
            res.status(404).json({ message: "ບໍ່ພົບບັນຊີນີ້" });
            return;
        }
        await account.update({ status: 0, updatedAt: new Date() });
        res.status(200).json({ message: "ລຶບບັນຊີແລ້ວ — ລາຍການເກົ່າຍັງຢູ່ຄືເດີມ" });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error deleting money account");
    }
};
exports.deleteMyMoneyAccount = deleteMyMoneyAccount;
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
        await category.update({ status: 0, updatedAt: new Date() });
        res.status(200).json({ message: "ລຶບໝວດແລ້ວ — ລາຍການເກົ່າຍັງຢູ່ຄືເດີມ" });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error deleting money category");
    }
};
exports.deleteMyMoneyCategory = deleteMyMoneyCategory;
const accountBrief = (a) => a ? { _uuid: a._uuid, name: a.name, kind: a.kind, logo: a.bank?.logo ?? null, currency: a.currency, active: a.active } : null;
const entryOf = (e, categories, accounts) => {
    const category = e.kind === TRANSFER ? undefined : categories.get(Number(e.category_id));
    return {
        _uuid: e._uuid,
        kind: e.kind,
        category_id: e.kind === TRANSFER ? null : e.category_id,
        category: category ? { name: category.name, icon: category.icon, color: category.color } : null,
        account_id: e.account_id ?? null,
        account: accountBrief(accounts.get(Number(e.account_id))),
        to_account_id: e.to_account_id ?? null,
        to_account: accountBrief(accounts.get(Number(e.to_account_id))),
        amount: Number(e.amount),
        to_amount: e.to_amount === null || e.to_amount === undefined ? null : Number(e.to_amount),
        currency: e.currency,
        entry_date: e.entry_date,
        note: e.note || null,
        has_photo: !!e.photo,
        /** PAYROLL = ລາຍການທີ່ລະບົບເຄີຍເພີ່ມຕອນ HR ຈ່າຍເງິນເດືອນ (ເລີກແລ້ວ) */
        source: e.source ?? null,
        createdAt: e.createdAt,
    };
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
/** ເງື່ອນໄຂ "ລາຍການຂອງບັນຊີນີ້" — ລວມການໂອນເຂົ້າ */
const ofAccount = (accountId) => accountId ? { [sequelize_1.Op.or]: [{ account_id: accountId }, { to_account_id: accountId }] } : {};
/** GET /money/me/entries?from=&to=&account_id=&kind=&offset= */
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
        const accountId = plainId(req.query.account_id);
        const kind = [...exports.KINDS, TRANSFER].includes(String(req.query.kind)) ? String(req.query.kind) : null;
        // kind=all = ທຸກປະເພດ ທັງເດືອນ (ໜ້າບັນຊີ ກັ່ນຕອງ / ແຍກຕາມໝວດໃນແອັບ)
        const page = kind || req.query.kind === "all" ? KIND_PAGE : PAGE;
        const offset = Math.max(0, Math.floor(Number(req.query.offset) || 0));
        const inRange = { employee_id: employeeId, entry_date: { [sequelize_1.Op.between]: [range.from, range.to] } };
        const [rows, sums, categories, accounts] = await Promise.all([
            moneyEntry_1.default.findAll({
                where: { ...inRange, ...ofAccount(accountId), ...(kind ? { kind } : {}) },
                order: [["entry_date", "DESC"], ["_uuid", "DESC"]],
                limit: page + 1,
                offset,
            }),
            moneyEntry_1.default.findAll({
                attributes: ["currency", "kind", [(0, sequelize_1.fn)("SUM", (0, sequelize_1.col)("amount")), "total"]],
                where: { ...inRange, kind: { [sequelize_1.Op.in]: [...exports.KINDS] }, ...(accountId ? { account_id: accountId } : {}) },
                group: ["currency", "kind"],
                raw: true,
            }),
            categoryMap(employeeId),
            accountMap(employeeId),
        ]);
        const totals = exports.CURRENCIES.map((currency) => ({
            currency,
            income: amountOf(sums.find((s) => s.currency === currency && s.kind === "income")?.total),
            expense: amountOf(sums.find((s) => s.currency === currency && s.kind === "expense")?.total),
        })).filter((t) => t.income || t.expense);
        res.status(200).json({
            ...range,
            today: (0, workCalendar_1.todayLao)(),
            data: rows.slice(0, page).map((e) => entryOf(e, categories, accounts)),
            has_more: rows.length > page,
            totals,
        });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting money entries");
    }
};
exports.getMyMoneyEntries = getMyMoneyEntries;
/**
 * ບັນຊີຂອງລາຍການ: ຕ້ອງເປັນບັນຊີທີ່ໃຊ້ງານ — ແກ້ໄຂລາຍການເກົ່າ ໂດຍສົ່ງບັນຊີເດີມ = ບໍ່ກວດ (ບັນຊີທີ່ລຶບແລ້ວບັນທຶກໄດ້ໂດຍບໍ່ຕ້ອງປ່ຽນ)
 */
const accountFor = async (value, employeeId, current) => {
    const id = plainId(value);
    if (id && current && id === Number(current))
        return moneyAccount_1.default.findOne({ where: { _uuid: id, employee_id: employeeId } });
    return myAccount(id, employeeId);
};
/** ວັນທີ / ບັນທຶກ / ຈຳນວນ — ໃຊ້ຮ່ວມກັນທຸກປະເພດ */
const readCommon = (body, has, input) => {
    if (has("amount")) {
        const amount = amountOf(body.amount);
        if (!(amount > 0))
            return "ກະລຸນາປ້ອນຈຳນວນເງິນ";
        if (amount >= MAX_AMOUNT)
            return "ຈຳນວນເງິນຫຼາຍເກີນໄປ";
        input.amount = amount;
    }
    if (has("entry_date")) {
        const date = (0, bansiHelpers_1.toDateOnly)(body.entry_date);
        const latest = (0, moment_1.default)((0, workCalendar_1.todayLao)(), "YYYY-MM-DD").add(1, "year").format("YYYY-MM-DD");
        if (!date || date < "2000-01-01" || date > latest)
            return "ວັນທີບໍ່ຖືກຕ້ອງ";
        input.entry_date = date;
    }
    if (body.note !== undefined) {
        const note = String(body.note ?? "").trim();
        if (note.length > MAX_NOTE)
            return `ບັນທຶກຍາວໄດ້ບໍ່ເກີນ ${MAX_NOTE} ຕົວອັກສອນ`;
        input.note = note || null;
    }
    return null;
};
/**
 * ກວດຂໍ້ມູນລາຍການຈາກ body (multipart = ທຸກຄ່າເປັນ string) — ບໍ່ມີ existing (ເພີ່ມໃໝ່) = ຕ້ອງມີຄົບ.
 * ລາຍຮັບ / ລາຍຈ່າຍ: ປະເພດຕາມໝວດ, ສະກຸນຕາມບັນຊີ. ໂອນ: ສົ່ງຄົບທຸກເທື່ອ (ຕົ້ນທາງ, ປາຍທາງ, ຈຳນວນ); ສະກຸນດຽວກັນ = ເຂົ້າເທົ່າທີ່ອອກ.
 * ປະເພດຂອງລາຍການທີ່ມີແລ້ວປ່ຽນລະຫວ່າງ ໂອນ ↔ ຮັບ/ຈ່າຍ ບໍ່ໄດ້
 */
const readEntry = async (body, employeeId, existing) => {
    const creating = !existing;
    const transfer = existing ? existing.kind === TRANSFER : body.kind === TRANSFER;
    if (existing && !transfer && body.kind === TRANSFER)
        return { error: "ປ່ຽນລາຍຮັບ / ລາຍຈ່າຍ ເປັນການໂອນບໍ່ໄດ້ — ລຶບແລ້ວບັນທຶກໃໝ່" };
    const input = {};
    if (transfer) {
        const from = await accountFor(body.account_id, employeeId, existing?.account_id);
        if (!from)
            return { error: "ກະລຸນາເລືອກບັນຊີທີ່ໂອນອອກ" };
        const to = await accountFor(body.to_account_id, employeeId, existing?.to_account_id);
        if (!to)
            return { error: "ກະລຸນາເລືອກບັນຊີທີ່ໂອນເຂົ້າ" };
        if (from._uuid === to._uuid)
            return { error: "ບັນຊີໂອນອອກ ແລະ ໂອນເຂົ້າ ຕ້ອງບໍ່ແມ່ນບັນຊີດຽວກັນ" };
        const error = readCommon(body, () => true, input);
        if (error)
            return { error };
        let toAmount = input.amount;
        if (from.currency !== to.currency) {
            toAmount = amountOf(body.to_amount);
            if (!(toAmount > 0))
                return { error: `ກະລຸນາປ້ອນຈຳນວນທີ່ໄດ້ຮັບ (${to.currency})` };
            if (toAmount >= MAX_AMOUNT)
                return { error: "ຈຳນວນເງິນຫຼາຍເກີນໄປ" };
        }
        Object.assign(input, { kind: TRANSFER, category_id: 0, account_id: from._uuid, to_account_id: to._uuid, to_amount: toAmount, currency: from.currency });
        return { input };
    }
    const has = (key) => creating || (body[key] !== undefined && body[key] !== "");
    const sameCategory = !!existing && Number(body.category_id) === Number(existing.category_id);
    if (has("category_id") && !sameCategory) {
        const category = await myCategory(plainId(body.category_id), employeeId);
        if (!category)
            return { error: "ກະລຸນາເລືອກໝວດ" };
        input.category_id = category._uuid;
        input.kind = category.kind;
    }
    if (has("account_id")) {
        const account = await accountFor(body.account_id, employeeId, existing?.account_id);
        if (!account)
            return { error: "ກະລຸນາເລືອກບັນຊີ" };
        input.account_id = account._uuid;
        input.currency = account.currency;
    }
    const error = readCommon(body, has, input);
    if (error)
        return { error };
    return { input };
};
/** ລາຍການຂອງຂ້ອຍ — ບໍ່ແມ່ນຂອງຂ້ອຍ / ບໍ່ມີ = null (ຕອບ 404 ຄືກັນ ບໍ່ບອກວ່າມີຢູ່) */
const myEntry = (id, employeeId) => id ? moneyEntry_1.default.findOne({ where: { _uuid: id, employee_id: employeeId } }) : Promise.resolve(null);
const receiptPath = (file) => path_1.default.join(hrHelpers_1.RECEIPT_DIR, path_1.default.basename(file));
const SAVED = { income: "ບັນທຶກລາຍຮັບແລ້ວ", expense: "ບັນທຶກລາຍຈ່າຍແລ້ວ", [TRANSFER]: "ບັນທຶກການໂອນແລ້ວ" };
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
            message: SAVED[row.kind] ?? "ບັນທຶກແລ້ວ",
            data: entryOf(row, await categoryMap(employeeId), await accountMap(employeeId)),
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
        res.status(200).json({
            message: "ບັນທຶກການແກ້ໄຂແລ້ວ",
            data: entryOf(entry, await categoryMap(employeeId), await accountMap(employeeId)),
        });
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
/** GET /money/me/summary?from=&to=&currency=&account_id= */
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
        if (!isCurrency(currency)) {
            res.status(400).json({ message: "ສະກຸນເງິນບໍ່ຖືກຕ້ອງ" });
            return;
        }
        const accountId = plainId(req.query.account_id);
        const dates = { entry_date: { [sequelize_1.Op.between]: [range.from, range.to] } };
        const inRange = { employee_id: employeeId, ...dates };
        // ລາຍຮັບ-ລາຍຈ່າຍ (ບໍ່ນັບການໂອນ) ຂອງສະກຸນນີ້ (ແລະ ບັນຊີນີ້ ຖ້າເລືອກ)
        const where = { ...inRange, currency, kind: { [sequelize_1.Op.in]: [...exports.KINDS] }, ...(accountId ? { account_id: accountId } : {}) };
        const [byCategory, byDay, used, categories, accounts, flows, legacy] = await Promise.all([
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
            accountList(employeeId, true),
            flowsOf(employeeId, dates),
            // ລາຍການກ່ອນມີບັນຊີ — ລວມເປັນ "ບໍ່ລະບຸບັນຊີ" ແຍກຕາມສະກຸນ
            moneyEntry_1.default.findAll({
                attributes: ["currency", "kind", [(0, sequelize_1.fn)("SUM", (0, sequelize_1.col)("amount")), "total"], [(0, sequelize_1.fn)("COUNT", (0, sequelize_1.col)("_uuid")), "count"]],
                where: { ...inRange, account_id: null, kind: { [sequelize_1.Op.in]: [...exports.KINDS] } },
                group: ["currency", "kind"],
                raw: true,
            }),
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
        // ແຍກຕາມບັນຊີ: ບັນຊີທີ່ໃຊ້ງານທັງໝົດ + ບັນຊີທີ່ລຶບແລ້ວແຕ່ມີລາຍການໃນຊ່ວງ + ບໍ່ລະບຸບັນຊີ
        const byAccount = accounts
            .filter((a) => a.active || flows.has(a._uuid))
            .map((a) => ({ account_id: a._uuid, name: a.name, kind: a.kind, logo: a.bank?.logo ?? null, currency: a.currency, active: a.active, balance: a.balance, income: 0, expense: 0, transfer_in: 0, transfer_out: 0, count: 0, ...flows.get(a._uuid) }));
        for (const c of exports.CURRENCIES) {
            const of = (kind) => legacy.find((l) => l.currency === c && l.kind === kind);
            const count = (Number(of("income")?.count) || 0) + (Number(of("expense")?.count) || 0);
            if (!count)
                continue;
            byAccount.push({
                account_id: null, name: "ບໍ່ລະບຸບັນຊີ", kind: null, logo: null, currency: c, active: false, balance: null,
                income: amountOf(of("income")?.total), expense: amountOf(of("expense")?.total), transfer_in: 0, transfer_out: 0, count,
            });
        }
        res.status(200).json({
            ...range,
            currency,
            currencies: exports.CURRENCIES.filter((c) => c === currency || used.some((u) => u.currency === c) || accounts.some((a) => a.active && a.currency === c)),
            totals: { income, expense, balance: amountOf(income - expense), count: rows.reduce((s, r) => s + r.count, 0) },
            categories: rows,
            trend: { group: daily ? "day" : "month", points: [...points.values()] },
            accounts: byAccount,
        });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting money summary");
    }
};
exports.getMyMoneySummary = getMyMoneySummary;
