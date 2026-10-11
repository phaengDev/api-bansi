"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkBudget = exports.getBudgetExpenses = exports.deleteBudget = exports.updateBudget = exports.createBudget = exports.getBudgets = void 0;
const sequelize_1 = require("sequelize");
const moment_1 = __importDefault(require("moment"));
const budget_1 = __importDefault(require("../../models/budget"));
const budgetMonth_1 = __importDefault(require("../../models/budgetMonth"));
const fiscalYear_1 = __importDefault(require("../../models/fiscalYear"));
const typeIncomeModel_1 = __importDefault(require("../../models/typeIncomeModel"));
const expenseModel_1 = __importDefault(require("../../models/expenseModel"));
const treasuryAcount_1 = __importDefault(require("../../models/treasuryAcount"));
const typeTreasury_1 = __importDefault(require("../../models/typeTreasury"));
const currencyModel_1 = __importDefault(require("../../models/currencyModel"));
const exchangeRate_1 = __importDefault(require("../../models/exchangeRate"));
const bansiHelpers_1 = require("./bansiHelpers");
const journalHelpers_1 = require("./journalHelpers");
const glCore_1 = require("./glCore");
/**
 * ງົບປະມານລາຍຈ່າຍ — ຕັ້ງຕາມໝວດລາຍຈ່າຍ ຕໍ່ປີການເງິນ (ແບ່ງລາຍເດືອນໄດ້), ເປັນ LAK.
 * ຍອດໃຊ້ຈິງ = ຍອດຈ່າຍອອກແທ້ (balance_expense ລວມອາກອນ) ຂອງລາຍຈ່າຍທີ່ໃຊ້ງານ ຕາມວັນທີຈ່າຍ, ແປງເປັນ LAK
 * ດ້ວຍອັດຕາແລກປ່ຽນຂອງວັນນັ້ນ (ຄືກັບການລົງບັນຊີ GL). ເກີນງົບ = ເຕືອນເທົ່ານັ້ນ ບໍ່ກັ້ນການບັນທຶກລາຍຈ່າຍ
 * (ຟອມລາຍຈ່າຍຖາມ POST /budget/check)
 */
/** ປະເພດລາຍຈ່າຍ = tbl_finance_categories.typestatus 2 */
const EXPENSE_KIND = 2;
/** tbl_fiscal_year.status 2 = ປິດບັນຊີແລ້ວ — ງົບຂອງປີນັ້ນແກ້/ລຶບບໍ່ໄດ້ */
const CLOSED = 2;
const NO_SPEND = { total: 0, months: {}, count: 0 };
const categoryInclude = { model: typeIncomeModel_1.default, as: "category", attributes: ["_uuid", "type_code", "type_name", "status"] };
/** ບັນຊີທີ່ຈ່າຍ → ສະກຸນເງິນ (ແປງເປັນ LAK) */
const currencyInclude = {
    model: treasuryAcount_1.default,
    as: "acount",
    attributes: ["_uuid", "acountName"],
    include: [{
            model: typeTreasury_1.default,
            as: "treasury",
            attributes: ["_uuid", "currencyId"],
            include: [{ model: currencyModel_1.default, as: "currency", attributes: ["_id", "name", "genus"] }],
        }],
};
/** ເດືອນທັງໝົດຂອງປີການເງິນ "YYYY-MM" — ປີທີ່ບໍ່ເລີ່ມເດືອນ 1 ຫຼື ສັ້ນກວ່າ 12 ເດືອນ ກໍ່ໄດ້ */
const monthsOf = (fiscal) => {
    const list = [];
    const cursor = (0, moment_1.default)(fiscal.start_date, "YYYY-MM-DD").startOf("month");
    const last = (0, moment_1.default)(fiscal.end_date, "YYYY-MM-DD").format("YYYY-MM");
    while (cursor.format("YYYY-MM") <= last && list.length < 36) {
        list.push(cursor.format("YYYY-MM"));
        cursor.add(1, "month");
    }
    return list;
};
const fiscalById = async (id) => {
    const n = Number(id);
    return Number.isInteger(n) && n > 0 ? (await fiscalYear_1.default.findByPk(n, { raw: true })) : null;
};
/** fiscal_id ທີ່ສົ່ງມາ — ບໍ່ສົ່ງ = ປີປັດຈຸບັນ (ບໍ່ມີປີປັດຈຸບັນ → ປີທີ່ມີມື້ນີ້) */
const fiscalOf = async (id) => {
    if (Number(id) > 0)
        return fiscalById(id);
    const current = await fiscalYear_1.default.findOne({ where: { is_current: 1 }, raw: true });
    if (current)
        return current;
    const today = (0, journalHelpers_1.todayLao)();
    return (await fiscalYear_1.default.findOne({
        where: { start_date: { [sequelize_1.Op.lte]: today }, end_date: { [sequelize_1.Op.gte]: today } },
        raw: true,
    }));
};
/**
 * ຕົວແປງເງິນເປັນ LAK — ອັດຕາຫຼ້າສຸດທີ່ rate_date ≤ ວັນທີ (ບໍ່ມີ → tbl_currency.reate) ຄືກັບ rateOf ຂອງ glCore,
 * ແຕ່ໂຫຼດອັດຕາເທື່ອດຽວແລ້ວຊອກໃນໜ່ວຍຄວາມຈຳ. ບໍ່ມີອັດຕາເລີຍ = null (ຜູ້ເອີ້ນນັບເປັນ "ຍັງບໍ່ມີອັດຕາ")
 */
const lakConverter = async (until) => {
    const currencies = await currencyModel_1.default.findAll({ attributes: ["_id", "name", "reate"], raw: true });
    const rates = await exchangeRate_1.default.findAll({
        where: { status: 1, rate_date: { [sequelize_1.Op.lte]: until } },
        attributes: ["currencyId", "rate", "rate_date"],
        order: [["rate_date", "DESC"], ["createdAt", "DESC"]],
        raw: true,
    });
    return (amount, currencyId, date) => {
        if (!currencyId)
            return (0, glCore_1.round2)(amount);
        const currency = currencies.find((c) => Number(c._id) === Number(currencyId));
        if (!currency || String(currency.name ?? "").toUpperCase() === glCore_1.BASE_CURRENCY)
            return (0, glCore_1.round2)(amount);
        const row = rates.find((r) => Number(r.currencyId) === Number(currencyId) && String(r.rate_date) <= date);
        const rate = Number(row?.rate) || Number(currency.reate) || 0;
        return rate > 0 ? (0, glCore_1.round2)(amount * rate) : null;
    };
};
/** ລາຍຈ່າຍທີ່ໃຊ້ງານ ທີ່ວັນທີຈ່າຍຢູ່ໃນຊ່ວງ (+ ສະກຸນເງິນຂອງບັນຊີທີ່ຈ່າຍ) */
const expensesIn = (fiscal, where = {}) => expenseModel_1.default.findAll({
    where: { status: journalHelpers_1.ACTIVE, expense_date: { [sequelize_1.Op.between]: [fiscal.start_date, fiscal.end_date] }, ...where },
    attributes: ["_uuid", "number", "expense_date", "expense_title", "type_expense_fk", "payee_name", "balance_expense", "acount_id_fk"],
    include: [currencyInclude],
    order: [["expense_date", "DESC"], ["_uuid", "DESC"]],
});
const lakOf = (row, convert) => convert(Number(row.balance_expense) || 0, row.acount?.treasury?.currencyId, String(row.expense_date));
/** ລວມຍອດໃຊ້ຈິງ (LAK) ຕາມໝວດ — ທັງປີ ແລະ ລາຍເດືອນ; ລາຍການທີ່ແປງບໍ່ໄດ້ (ບໍ່ມີອັດຕາ) ນັບແຍກໄວ້ */
const spendOf = (rows, convert) => {
    const byCategory = new Map();
    let missingRate = 0;
    for (const row of rows) {
        const r = row.get({ plain: true });
        const lak = lakOf(r, convert);
        if (lak === null) {
            missingRate += 1;
            continue;
        }
        const key = Number(r.type_expense_fk);
        const period = String(r.expense_date).slice(0, 7);
        const item = byCategory.get(key) ?? { total: 0, months: {}, count: 0 };
        item.total = (0, glCore_1.round2)(item.total + lak);
        item.months[period] = (0, glCore_1.round2)((item.months[period] ?? 0) + lak);
        item.count += 1;
        byCategory.set(key, item);
    }
    return { byCategory, missingRate };
};
const monthMap = (months = []) => Object.fromEntries(months.map((m) => [m.period, Number(m.amount) || 0]));
const byCode = (a, b) => String(a.category?.type_code ?? "").localeCompare(String(b.category?.type_code ?? ""), undefined, { numeric: true });
/**
 * POST /budget/fetch { fiscal_id? } — ງົບທຸກໝວດຂອງປີ + ຍອດໃຊ້ຈິງ (ທັງປີ / ລາຍເດືອນ) ແລະ ໝວດທີ່ມີລາຍຈ່າຍ
 * ແຕ່ຍັງບໍ່ໄດ້ຕັ້ງງົບ (unbudgeted). missing_rate = ຈຳນວນລາຍຈ່າຍທີ່ບໍ່ໄດ້ນັບ ເພາະສະກຸນນັ້ນຍັງບໍ່ມີອັດຕາແລກປ່ຽນ
 */
const getBudgets = async (req, res) => {
    try {
        const fiscal = await fiscalOf(req.body?.fiscal_id);
        if (!fiscal) {
            res.status(404).json({ message: "ບໍ່ພົບປີການເງິນ — ສ້າງຢູ່ ຕັ້ງຄ່າບັນຊີ → ປີການເງິນ" });
            return;
        }
        const [budgets, expenses, convert] = await Promise.all([
            budget_1.default.findAll({ where: { fiscal_id: fiscal._uuid }, include: [categoryInclude, { model: budgetMonth_1.default, as: "months" }] }),
            expensesIn(fiscal),
            lakConverter(fiscal.end_date),
        ]);
        const { byCategory, missingRate } = spendOf(expenses, convert);
        const data = budgets.map((budget) => {
            const r = budget.get({ plain: true });
            const spend = byCategory.get(Number(r.category_id)) ?? NO_SPEND;
            return {
                _uuid: r._uuid,
                fiscal_id: r.fiscal_id,
                category_id: r.category_id,
                category: r.category ?? null,
                amount: Number(r.amount) || 0,
                is_monthly: Number(r.is_monthly) === 1 ? 1 : 0,
                description: r.description,
                months: monthMap(r.months),
                actual: spend.total,
                actual_months: spend.months,
                count: spend.count,
            };
        }).sort(byCode);
        const budgeted = new Set(data.map((d) => Number(d.category_id)));
        const looseIds = [...byCategory.keys()].filter((id) => !budgeted.has(id));
        const looseCategories = looseIds.length
            ? await typeIncomeModel_1.default.findAll({ where: { _uuid: looseIds }, attributes: categoryInclude.attributes, raw: true })
            : [];
        const unbudgeted = looseIds.map((id) => {
            const spend = byCategory.get(id);
            return {
                category_id: id,
                category: looseCategories.find((c) => Number(c._uuid) === id) ?? null,
                actual: spend.total,
                actual_months: spend.months,
                count: spend.count,
            };
        }).sort((a, b) => b.actual - a.actual);
        res.status(200).json({ fiscal, months: monthsOf(fiscal), data, unbudgeted, missing_rate: missingRate });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting budgets");
    }
};
exports.getBudgets = getBudgets;
/**
 * ງົບຈາກ body { amount, is_monthly, months: { "YYYY-MM": ຍອດ }, description } — ແບ່ງລາຍເດືອນ: ເອົາສະເພາະເດືອນ
 * ໃນປີການເງິນ ແລະ amount = ຜົນລວມຂອງທຸກເດືອນ (ບໍ່ເຊື່ອ amount ທີ່ສົ່ງມາ)
 */
const parseBudget = (body, fiscal) => {
    const isMonthly = Number(body.is_monthly) === 1 ? 1 : 0;
    const description = String(body.description ?? "").trim().slice(0, 255) || null;
    if (!isMonthly) {
        const amount = (0, glCore_1.round2)(Number(body.amount));
        if (!Number.isFinite(amount) || amount <= 0)
            return { error: "ກະລຸນາປ້ອນງົບປະມານໃຫ້ຫຼາຍກວ່າ 0" };
        return { amount, isMonthly, months: [], description };
    }
    const raw = body.months && typeof body.months === "object" ? body.months : {};
    const months = [];
    for (const period of monthsOf(fiscal)) {
        const value = Number(raw[period] ?? 0);
        if (!Number.isFinite(value) || value < 0)
            return { error: `ງົບເດືອນ ${(0, moment_1.default)(period, "YYYY-MM").format("MM/YYYY")} ບໍ່ຖືກຕ້ອງ` };
        if (value > 0)
            months.push({ period, amount: (0, glCore_1.round2)(value) });
    }
    const amount = (0, glCore_1.round2)(months.reduce((n, m) => n + m.amount, 0));
    if (amount <= 0)
        return { error: "ກະລຸນາປ້ອນງົບຢ່າງໜ້ອຍ 1 ເດືອນ" };
    return { amount, isMonthly, months, description };
};
const closedMessage = (fiscal) => `ປີການເງິນ ${fiscal.fiscal_code} ປິດບັນຊີແລ້ວ — ແກ້ງົບປະມານບໍ່ໄດ້`;
/** POST /budget/create { fiscal_id, category_id, amount | months, is_monthly, description? } — ໜຶ່ງໝວດມີງົບໄດ້ອັນດຽວຕໍ່ປີ */
const createBudget = async (req, res) => {
    const t = await budget_1.default.sequelize.transaction();
    const fail = async (code, message) => {
        await t.rollback();
        res.status(code).json({ message });
    };
    try {
        const body = req.body || {};
        const fiscal = await fiscalById(body.fiscal_id);
        if (!fiscal)
            return fail(400, "ກະລຸນາເລືອກປີການເງິນ");
        if (Number(fiscal.status) === CLOSED)
            return fail(400, closedMessage(fiscal));
        const categoryId = Number(body.category_id);
        const category = Number.isInteger(categoryId) && categoryId > 0
            ? await typeIncomeModel_1.default.findOne({ where: { _uuid: categoryId, typestatus: EXPENSE_KIND }, transaction: t })
            : null;
        if (!category)
            return fail(400, "ກະລຸນາເລືອກປະເພດລາຍຈ່າຍ");
        const taken = await budget_1.default.count({ where: { fiscal_id: fiscal._uuid, category_id: categoryId }, transaction: t });
        if (taken)
            return fail(400, `ປະເພດ ${category.type_name} ມີງົບໃນປີ ${fiscal.fiscal_code} ແລ້ວ — ແກ້ໄຂງົບເດີມແທນ`);
        const parsed = parseBudget(body, fiscal);
        if ("error" in parsed)
            return fail(400, parsed.error);
        const row = await budget_1.default.create({
            fiscal_id: fiscal._uuid,
            category_id: categoryId,
            amount: parsed.amount,
            is_monthly: parsed.isMonthly,
            description: parsed.description,
            createdbyid: Number((0, bansiHelpers_1.actorOf)(req)) || null,
        }, { transaction: t });
        if (parsed.months.length) {
            await budgetMonth_1.default.bulkCreate(parsed.months.map((m) => ({ ...m, budget_id: row._uuid })), { transaction: t });
        }
        await t.commit();
        res.status(200).json({ message: "Successfully created budget", data: row });
    }
    catch (error) {
        await t.rollback();
        (0, bansiHelpers_1.sendError)(res, error, "Error creating budget");
    }
};
exports.createBudget = createBudget;
/** PUT /budget/:id { amount | months, is_monthly, description? } — ປີການເງິນ ແລະ ໝວດ ປ່ຽນບໍ່ໄດ້ (ລຶບແລ້ວຕັ້ງໃໝ່) */
const updateBudget = async (req, res) => {
    const t = await budget_1.default.sequelize.transaction();
    const fail = async (code, message) => {
        await t.rollback();
        res.status(code).json({ message });
    };
    try {
        const row = await budget_1.default.findByPk((0, bansiHelpers_1.decodeId)(req), { transaction: t, lock: t.LOCK.UPDATE });
        if (!row)
            return fail(404, "ບໍ່ພົບງົບປະມານ");
        const fiscal = await fiscalById(row.fiscal_id);
        if (!fiscal)
            return fail(400, "ບໍ່ພົບປີການເງິນຂອງງົບນີ້");
        if (Number(fiscal.status) === CLOSED)
            return fail(400, closedMessage(fiscal));
        const parsed = parseBudget(req.body || {}, fiscal);
        if ("error" in parsed)
            return fail(400, parsed.error);
        await row.update({ amount: parsed.amount, is_monthly: parsed.isMonthly, description: parsed.description, updatedAt: new Date() }, { transaction: t });
        await budgetMonth_1.default.destroy({ where: { budget_id: row._uuid }, transaction: t });
        if (parsed.months.length) {
            await budgetMonth_1.default.bulkCreate(parsed.months.map((m) => ({ ...m, budget_id: row._uuid })), { transaction: t });
        }
        await t.commit();
        res.status(200).json({ message: "Successfully updated budget", data: row });
    }
    catch (error) {
        await t.rollback();
        (0, bansiHelpers_1.sendError)(res, error, "Error updating budget");
    }
};
exports.updateBudget = updateBudget;
/** DELETE /budget/:id — ລາຍຈ່າຍບໍ່ກ່ຽວ (ງົບບໍ່ມີໃຜອ້າງອີງ); ປີທີ່ປິດບັນຊີແລ້ວລຶບບໍ່ໄດ້ */
const deleteBudget = async (req, res) => {
    const t = await budget_1.default.sequelize.transaction();
    try {
        const row = await budget_1.default.findByPk((0, bansiHelpers_1.decodeId)(req), { transaction: t });
        const fiscal = row && (await fiscalById(row.fiscal_id));
        if (!row || (fiscal && Number(fiscal.status) === CLOSED)) {
            await t.rollback();
            res.status(row ? 400 : 404).json({ message: row ? closedMessage(fiscal) : "ບໍ່ພົບງົບປະມານ" });
            return;
        }
        await budgetMonth_1.default.destroy({ where: { budget_id: row._uuid }, transaction: t });
        await row.destroy({ transaction: t });
        await t.commit();
        res.status(200).json({ message: "Successfully deleted budget" });
    }
    catch (error) {
        await t.rollback();
        (0, bansiHelpers_1.sendError)(res, error, "Error deleting budget");
    }
};
exports.deleteBudget = deleteBudget;
/** POST /budget/expenses { fiscal_id, category_id } — ລາຍຈ່າຍຂອງໝວດໃນປີ (ໃໝ່ສຸດກ່ອນ) ພ້ອມຍອດ LAK */
const getBudgetExpenses = async (req, res) => {
    try {
        const body = req.body || {};
        const fiscal = await fiscalOf(body.fiscal_id);
        const categoryId = Number(body.category_id);
        if (!fiscal || !Number.isInteger(categoryId) || categoryId <= 0) {
            res.status(400).json({ message: "ກະລຸນາເລືອກປີການເງິນ ແລະ ປະເພດລາຍຈ່າຍ" });
            return;
        }
        const [rows, convert] = await Promise.all([expensesIn(fiscal, { type_expense_fk: categoryId }), lakConverter(fiscal.end_date)]);
        const data = rows.map((row) => {
            const r = row.get({ plain: true });
            return {
                _uuid: r._uuid,
                number: r.number,
                expense_date: r.expense_date,
                expense_title: r.expense_title,
                payee_name: r.payee_name,
                account_name: r.acount?.acountName ?? null,
                currency: r.acount?.treasury?.currency ?? null,
                balance_expense: Number(r.balance_expense) || 0,
                amount_lak: lakOf(r, convert),
            };
        });
        res.status(200).json({ data });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting budget expenses");
    }
};
exports.getBudgetExpenses = getBudgetExpenses;
/**
 * POST /budget/check { category_id, expense_date?, acount_id_fk?, amount?, exclude_id? } — ສຳລັບຟອມລາຍຈ່າຍ:
 * ງົບຂອງໝວດໃນປີການເງິນທີ່ມີວັນທີຈ່າຍ, ຍອດໃຊ້ແລ້ວ ແລະ ຍອດເຫຼືອຫຼັງບັນທຶກລາຍຈ່າຍນີ້ (amount ເປັນສະກຸນຂອງ
 * ບັນຊີທີ່ຈ່າຍ → ແປງເປັນ LAK). exclude_id = ລາຍຈ່າຍທີ່ກຳລັງແກ້ໄຂ (ບໍ່ນັບຊ້ຳ). ບໍ່ມີງົບ = has_budget false
 */
const checkBudget = async (req, res) => {
    try {
        const body = req.body || {};
        const categoryId = Number(body.category_id);
        if (!Number.isInteger(categoryId) || categoryId <= 0) {
            res.status(400).json({ message: "ກະລຸນາເລືອກປະເພດລາຍຈ່າຍ" });
            return;
        }
        const date = (0, bansiHelpers_1.toDateOnly)(body.expense_date) ?? (0, journalHelpers_1.todayLao)();
        const fiscal = (await fiscalYear_1.default.findOne({
            where: { start_date: { [sequelize_1.Op.lte]: date }, end_date: { [sequelize_1.Op.gte]: date } },
            raw: true,
        }));
        const budget = fiscal && await budget_1.default.findOne({
            where: { fiscal_id: fiscal._uuid, category_id: categoryId },
            include: [{ model: budgetMonth_1.default, as: "months" }],
        });
        if (!fiscal || !budget) {
            res.status(200).json({ data: { has_budget: false, fiscal_code: fiscal?.fiscal_code ?? null } });
            return;
        }
        const excludeId = Number(body.exclude_id);
        const [rows, convert] = await Promise.all([
            expensesIn(fiscal, { type_expense_fk: categoryId, ...(excludeId > 0 ? { _uuid: { [sequelize_1.Op.ne]: excludeId } } : {}) }),
            lakConverter(fiscal.end_date),
        ]);
        const { byCategory, missingRate } = spendOf(rows, convert);
        const spend = byCategory.get(categoryId) ?? NO_SPEND;
        const amount = Number(body.amount) || 0;
        let amountLak = 0;
        if (amount > 0) {
            const accountId = Number(body.acount_id_fk);
            const account = accountId > 0
                ? await treasuryAcount_1.default.findByPk(accountId, { include: [{ model: typeTreasury_1.default, as: "treasury", attributes: ["currencyId"] }] })
                : null;
            amountLak = convert(amount, account?.treasury?.currencyId, date);
        }
        const adding = amountLak ?? 0;
        const plain = budget.get({ plain: true });
        const total = Number(plain.amount) || 0;
        const period = date.slice(0, 7);
        const monthBudget = monthMap(plain.months)[period] ?? 0;
        const monthUsed = spend.months[period] ?? 0;
        res.status(200).json({
            data: {
                has_budget: true,
                budget_id: plain._uuid,
                fiscal_code: fiscal.fiscal_code,
                period,
                budget: total,
                used: spend.total,
                amount_lak: amountLak,
                after: (0, glCore_1.round2)(total - spend.total - adding),
                month: Number(plain.is_monthly) === 1
                    ? { budget: monthBudget, used: monthUsed, after: (0, glCore_1.round2)(monthBudget - monthUsed - adding) }
                    : null,
                missing_rate: missingRate,
            },
        });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error checking budget");
    }
};
exports.checkBudget = checkBudget;
