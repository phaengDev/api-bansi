import { Request, Response } from "express";
import { Op } from "sequelize";
import moment from "moment";
import Budget from "../../models/budget";
import BudgetMonth from "../../models/budgetMonth";
import FiscalYear from "../../models/fiscalYear";
import FinanceCategories from "../../models/typeIncomeModel";
import Expenses from "../../models/expenseModel";
import TreasuryAccount from "../../models/treasuryAcount";
import TypeTreasury from "../../models/typeTreasury";
import Currency from "../../models/currencyModel";
import ExchangeRate from "../../models/exchangeRate";
import { actorOf, decodeId, sendError, toDateOnly } from "./bansiHelpers";
import { ACTIVE, todayLao } from "./journalHelpers";
import { BASE_CURRENCY, round2 } from "./glCore";

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

type Fiscal = {
  _uuid: number;
  fiscal_code: string;
  fiscal_name: string | null;
  start_date: string;
  end_date: string;
  is_current: number;
  status: number;
};
type Spend = { total: number; months: Record<string, number>; count: number };

const NO_SPEND: Spend = { total: 0, months: {}, count: 0 };

const categoryInclude = { model: FinanceCategories, as: "category", attributes: ["_uuid", "type_code", "type_name", "status"] };
/** ບັນຊີທີ່ຈ່າຍ → ສະກຸນເງິນ (ແປງເປັນ LAK) */
const currencyInclude = {
  model: TreasuryAccount,
  as: "acount",
  attributes: ["_uuid", "acountName"],
  include: [{
    model: TypeTreasury,
    as: "treasury",
    attributes: ["_uuid", "currencyId"],
    include: [{ model: Currency, as: "currency", attributes: ["_id", "name", "genus"] }],
  }],
};

/** ເດືອນທັງໝົດຂອງປີການເງິນ "YYYY-MM" — ປີທີ່ບໍ່ເລີ່ມເດືອນ 1 ຫຼື ສັ້ນກວ່າ 12 ເດືອນ ກໍ່ໄດ້ */
const monthsOf = (fiscal: Fiscal) => {
  const list: string[] = [];
  const cursor = moment(fiscal.start_date, "YYYY-MM-DD").startOf("month");
  const last = moment(fiscal.end_date, "YYYY-MM-DD").format("YYYY-MM");
  while (cursor.format("YYYY-MM") <= last && list.length < 36) {
    list.push(cursor.format("YYYY-MM"));
    cursor.add(1, "month");
  }
  return list;
};

const fiscalById = async (id: unknown) => {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? ((await FiscalYear.findByPk(n, { raw: true })) as Fiscal | null) : null;
};

/** fiscal_id ທີ່ສົ່ງມາ — ບໍ່ສົ່ງ = ປີປັດຈຸບັນ (ບໍ່ມີປີປັດຈຸບັນ → ປີທີ່ມີມື້ນີ້) */
const fiscalOf = async (id: unknown) => {
  if (Number(id) > 0) return fiscalById(id);
  const current = await FiscalYear.findOne({ where: { is_current: 1 }, raw: true });
  if (current) return current as Fiscal;
  const today = todayLao();
  return (await FiscalYear.findOne({
    where: { start_date: { [Op.lte]: today }, end_date: { [Op.gte]: today } },
    raw: true,
  })) as Fiscal | null;
};

/**
 * ຕົວແປງເງິນເປັນ LAK — ອັດຕາຫຼ້າສຸດທີ່ rate_date ≤ ວັນທີ (ບໍ່ມີ → tbl_currency.reate) ຄືກັບ rateOf ຂອງ glCore,
 * ແຕ່ໂຫຼດອັດຕາເທື່ອດຽວແລ້ວຊອກໃນໜ່ວຍຄວາມຈຳ. ບໍ່ມີອັດຕາເລີຍ = null (ຜູ້ເອີ້ນນັບເປັນ "ຍັງບໍ່ມີອັດຕາ")
 */
const lakConverter = async (until: string) => {
  const currencies: any[] = await Currency.findAll({ attributes: ["_id", "name", "reate"], raw: true });
  const rates: any[] = await ExchangeRate.findAll({
    where: { status: 1, rate_date: { [Op.lte]: until } },
    attributes: ["currencyId", "rate", "rate_date"],
    order: [["rate_date", "DESC"], ["createdAt", "DESC"]],
    raw: true,
  });
  return (amount: number, currencyId: number | null | undefined, date: string): number | null => {
    if (!currencyId) return round2(amount);
    const currency = currencies.find((c) => Number(c._id) === Number(currencyId));
    if (!currency || String(currency.name ?? "").toUpperCase() === BASE_CURRENCY) return round2(amount);
    const row = rates.find((r) => Number(r.currencyId) === Number(currencyId) && String(r.rate_date) <= date);
    const rate = Number(row?.rate) || Number(currency.reate) || 0;
    return rate > 0 ? round2(amount * rate) : null;
  };
};
type Converter = Awaited<ReturnType<typeof lakConverter>>;

/** ລາຍຈ່າຍທີ່ໃຊ້ງານ ທີ່ວັນທີຈ່າຍຢູ່ໃນຊ່ວງ (+ ສະກຸນເງິນຂອງບັນຊີທີ່ຈ່າຍ) */
const expensesIn = (fiscal: Fiscal, where: Record<string, unknown> = {}) =>
  Expenses.findAll({
    where: { status: ACTIVE, expense_date: { [Op.between]: [fiscal.start_date, fiscal.end_date] }, ...where },
    attributes: ["_uuid", "number", "expense_date", "expense_title", "type_expense_fk", "payee_name", "balance_expense", "acount_id_fk"],
    include: [currencyInclude],
    order: [["expense_date", "DESC"], ["_uuid", "DESC"]],
  });

const lakOf = (row: any, convert: Converter) =>
  convert(Number(row.balance_expense) || 0, row.acount?.treasury?.currencyId, String(row.expense_date));

/** ລວມຍອດໃຊ້ຈິງ (LAK) ຕາມໝວດ — ທັງປີ ແລະ ລາຍເດືອນ; ລາຍການທີ່ແປງບໍ່ໄດ້ (ບໍ່ມີອັດຕາ) ນັບແຍກໄວ້ */
const spendOf = (rows: any[], convert: Converter) => {
  const byCategory = new Map<number, Spend>();
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
    item.total = round2(item.total + lak);
    item.months[period] = round2((item.months[period] ?? 0) + lak);
    item.count += 1;
    byCategory.set(key, item);
  }
  return { byCategory, missingRate };
};

const monthMap = (months: any[] = []): Record<string, number> =>
  Object.fromEntries(months.map((m) => [m.period, Number(m.amount) || 0]));

const byCode = (a: any, b: any) =>
  String(a.category?.type_code ?? "").localeCompare(String(b.category?.type_code ?? ""), undefined, { numeric: true });

/**
 * POST /budget/fetch { fiscal_id? } — ງົບທຸກໝວດຂອງປີ + ຍອດໃຊ້ຈິງ (ທັງປີ / ລາຍເດືອນ) ແລະ ໝວດທີ່ມີລາຍຈ່າຍ
 * ແຕ່ຍັງບໍ່ໄດ້ຕັ້ງງົບ (unbudgeted). missing_rate = ຈຳນວນລາຍຈ່າຍທີ່ບໍ່ໄດ້ນັບ ເພາະສະກຸນນັ້ນຍັງບໍ່ມີອັດຕາແລກປ່ຽນ
 */
export const getBudgets = async (req: Request, res: Response) => {
  try {
    const fiscal = await fiscalOf(req.body?.fiscal_id);
    if (!fiscal) {
      res.status(404).json({ message: "ບໍ່ພົບປີການເງິນ — ສ້າງຢູ່ ຕັ້ງຄ່າບັນຊີ → ປີການເງິນ" });
      return;
    }
    const [budgets, expenses, convert] = await Promise.all([
      Budget.findAll({ where: { fiscal_id: fiscal._uuid }, include: [categoryInclude, { model: BudgetMonth, as: "months" }] }),
      expensesIn(fiscal),
      lakConverter(fiscal.end_date),
    ]);
    const { byCategory, missingRate } = spendOf(expenses, convert);

    const data = budgets.map((budget) => {
      const r: any = budget.get({ plain: true });
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
    const looseCategories: any[] = looseIds.length
      ? await FinanceCategories.findAll({ where: { _uuid: looseIds }, attributes: categoryInclude.attributes, raw: true })
      : [];
    const unbudgeted = looseIds.map((id) => {
      const spend = byCategory.get(id)!;
      return {
        category_id: id,
        category: looseCategories.find((c) => Number(c._uuid) === id) ?? null,
        actual: spend.total,
        actual_months: spend.months,
        count: spend.count,
      };
    }).sort((a, b) => b.actual - a.actual);

    res.status(200).json({ fiscal, months: monthsOf(fiscal), data, unbudgeted, missing_rate: missingRate });
  } catch (error) {
    sendError(res, error, "Error getting budgets");
  }
};

type BudgetInput = { amount: number; isMonthly: number; months: { period: string; amount: number }[]; description: string | null };

/**
 * ງົບຈາກ body { amount, is_monthly, months: { "YYYY-MM": ຍອດ }, description } — ແບ່ງລາຍເດືອນ: ເອົາສະເພາະເດືອນ
 * ໃນປີການເງິນ ແລະ amount = ຜົນລວມຂອງທຸກເດືອນ (ບໍ່ເຊື່ອ amount ທີ່ສົ່ງມາ)
 */
const parseBudget = (body: any, fiscal: Fiscal): BudgetInput | { error: string } => {
  const isMonthly = Number(body.is_monthly) === 1 ? 1 : 0;
  const description = String(body.description ?? "").trim().slice(0, 255) || null;
  if (!isMonthly) {
    const amount = round2(Number(body.amount));
    if (!Number.isFinite(amount) || amount <= 0) return { error: "ກະລຸນາປ້ອນງົບປະມານໃຫ້ຫຼາຍກວ່າ 0" };
    return { amount, isMonthly, months: [], description };
  }
  const raw = body.months && typeof body.months === "object" ? body.months : {};
  const months: BudgetInput["months"] = [];
  for (const period of monthsOf(fiscal)) {
    const value = Number(raw[period] ?? 0);
    if (!Number.isFinite(value) || value < 0) return { error: `ງົບເດືອນ ${moment(period, "YYYY-MM").format("MM/YYYY")} ບໍ່ຖືກຕ້ອງ` };
    if (value > 0) months.push({ period, amount: round2(value) });
  }
  const amount = round2(months.reduce((n, m) => n + m.amount, 0));
  if (amount <= 0) return { error: "ກະລຸນາປ້ອນງົບຢ່າງໜ້ອຍ 1 ເດືອນ" };
  return { amount, isMonthly, months, description };
};

const closedMessage = (fiscal: Fiscal) => `ປີການເງິນ ${fiscal.fiscal_code} ປິດບັນຊີແລ້ວ — ແກ້ງົບປະມານບໍ່ໄດ້`;

/** POST /budget/create { fiscal_id, category_id, amount | months, is_monthly, description? } — ໜຶ່ງໝວດມີງົບໄດ້ອັນດຽວຕໍ່ປີ */
export const createBudget = async (req: Request, res: Response) => {
  const t = await Budget.sequelize!.transaction();
  const fail = async (code: number, message: string) => {
    await t.rollback();
    res.status(code).json({ message });
  };
  try {
    const body = req.body || {};
    const fiscal = await fiscalById(body.fiscal_id);
    if (!fiscal) return fail(400, "ກະລຸນາເລືອກປີການເງິນ");
    if (Number(fiscal.status) === CLOSED) return fail(400, closedMessage(fiscal));
    const categoryId = Number(body.category_id);
    const category: any = Number.isInteger(categoryId) && categoryId > 0
      ? await FinanceCategories.findOne({ where: { _uuid: categoryId, typestatus: EXPENSE_KIND }, transaction: t })
      : null;
    if (!category) return fail(400, "ກະລຸນາເລືອກປະເພດລາຍຈ່າຍ");
    const taken = await Budget.count({ where: { fiscal_id: fiscal._uuid, category_id: categoryId }, transaction: t });
    if (taken) return fail(400, `ປະເພດ ${category.type_name} ມີງົບໃນປີ ${fiscal.fiscal_code} ແລ້ວ — ແກ້ໄຂງົບເດີມແທນ`);
    const parsed = parseBudget(body, fiscal);
    if ("error" in parsed) return fail(400, parsed.error);

    const row = await Budget.create(
      {
        fiscal_id: fiscal._uuid,
        category_id: categoryId,
        amount: parsed.amount,
        is_monthly: parsed.isMonthly,
        description: parsed.description,
        createdbyid: Number(actorOf(req)) || null,
      },
      { transaction: t }
    );
    if (parsed.months.length) {
      await BudgetMonth.bulkCreate(parsed.months.map((m) => ({ ...m, budget_id: row._uuid })), { transaction: t });
    }
    await t.commit();
    res.status(200).json({ message: "Successfully created budget", data: row });
  } catch (error) {
    await t.rollback();
    sendError(res, error, "Error creating budget");
  }
};

/** PUT /budget/:id { amount | months, is_monthly, description? } — ປີການເງິນ ແລະ ໝວດ ປ່ຽນບໍ່ໄດ້ (ລຶບແລ້ວຕັ້ງໃໝ່) */
export const updateBudget = async (req: Request<{ id: string }>, res: Response) => {
  const t = await Budget.sequelize!.transaction();
  const fail = async (code: number, message: string) => {
    await t.rollback();
    res.status(code).json({ message });
  };
  try {
    const row: any = await Budget.findByPk(decodeId(req), { transaction: t, lock: t.LOCK.UPDATE });
    if (!row) return fail(404, "ບໍ່ພົບງົບປະມານ");
    const fiscal = await fiscalById(row.fiscal_id);
    if (!fiscal) return fail(400, "ບໍ່ພົບປີການເງິນຂອງງົບນີ້");
    if (Number(fiscal.status) === CLOSED) return fail(400, closedMessage(fiscal));
    const parsed = parseBudget(req.body || {}, fiscal);
    if ("error" in parsed) return fail(400, parsed.error);

    await row.update(
      { amount: parsed.amount, is_monthly: parsed.isMonthly, description: parsed.description, updatedAt: new Date() },
      { transaction: t }
    );
    await BudgetMonth.destroy({ where: { budget_id: row._uuid }, transaction: t });
    if (parsed.months.length) {
      await BudgetMonth.bulkCreate(parsed.months.map((m) => ({ ...m, budget_id: row._uuid })), { transaction: t });
    }
    await t.commit();
    res.status(200).json({ message: "Successfully updated budget", data: row });
  } catch (error) {
    await t.rollback();
    sendError(res, error, "Error updating budget");
  }
};

/** DELETE /budget/:id — ລາຍຈ່າຍບໍ່ກ່ຽວ (ງົບບໍ່ມີໃຜອ້າງອີງ); ປີທີ່ປິດບັນຊີແລ້ວລຶບບໍ່ໄດ້ */
export const deleteBudget = async (req: Request<{ id: string }>, res: Response) => {
  const t = await Budget.sequelize!.transaction();
  try {
    const row: any = await Budget.findByPk(decodeId(req), { transaction: t });
    const fiscal = row && (await fiscalById(row.fiscal_id));
    if (!row || (fiscal && Number(fiscal.status) === CLOSED)) {
      await t.rollback();
      res.status(row ? 400 : 404).json({ message: row ? closedMessage(fiscal!) : "ບໍ່ພົບງົບປະມານ" });
      return;
    }
    await BudgetMonth.destroy({ where: { budget_id: row._uuid }, transaction: t });
    await row.destroy({ transaction: t });
    await t.commit();
    res.status(200).json({ message: "Successfully deleted budget" });
  } catch (error) {
    await t.rollback();
    sendError(res, error, "Error deleting budget");
  }
};

/** POST /budget/expenses { fiscal_id, category_id } — ລາຍຈ່າຍຂອງໝວດໃນປີ (ໃໝ່ສຸດກ່ອນ) ພ້ອມຍອດ LAK */
export const getBudgetExpenses = async (req: Request, res: Response) => {
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
      const r: any = row.get({ plain: true });
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
  } catch (error) {
    sendError(res, error, "Error getting budget expenses");
  }
};

/**
 * POST /budget/check { category_id, expense_date?, acount_id_fk?, amount?, exclude_id? } — ສຳລັບຟອມລາຍຈ່າຍ:
 * ງົບຂອງໝວດໃນປີການເງິນທີ່ມີວັນທີຈ່າຍ, ຍອດໃຊ້ແລ້ວ ແລະ ຍອດເຫຼືອຫຼັງບັນທຶກລາຍຈ່າຍນີ້ (amount ເປັນສະກຸນຂອງ
 * ບັນຊີທີ່ຈ່າຍ → ແປງເປັນ LAK). exclude_id = ລາຍຈ່າຍທີ່ກຳລັງແກ້ໄຂ (ບໍ່ນັບຊ້ຳ). ບໍ່ມີງົບ = has_budget false
 */
export const checkBudget = async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const categoryId = Number(body.category_id);
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      res.status(400).json({ message: "ກະລຸນາເລືອກປະເພດລາຍຈ່າຍ" });
      return;
    }
    const date = toDateOnly(body.expense_date) ?? todayLao();
    const fiscal = (await FiscalYear.findOne({
      where: { start_date: { [Op.lte]: date }, end_date: { [Op.gte]: date } },
      raw: true,
    })) as Fiscal | null;
    const budget: any = fiscal && await Budget.findOne({
      where: { fiscal_id: fiscal._uuid, category_id: categoryId },
      include: [{ model: BudgetMonth, as: "months" }],
    });
    if (!fiscal || !budget) {
      res.status(200).json({ data: { has_budget: false, fiscal_code: fiscal?.fiscal_code ?? null } });
      return;
    }

    const excludeId = Number(body.exclude_id);
    const [rows, convert] = await Promise.all([
      expensesIn(fiscal, { type_expense_fk: categoryId, ...(excludeId > 0 ? { _uuid: { [Op.ne]: excludeId } } : {}) }),
      lakConverter(fiscal.end_date),
    ]);
    const { byCategory, missingRate } = spendOf(rows, convert);
    const spend = byCategory.get(categoryId) ?? NO_SPEND;

    const amount = Number(body.amount) || 0;
    let amountLak: number | null = 0;
    if (amount > 0) {
      const accountId = Number(body.acount_id_fk);
      const account: any = accountId > 0
        ? await TreasuryAccount.findByPk(accountId, { include: [{ model: TypeTreasury, as: "treasury", attributes: ["currencyId"] }] })
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
        after: round2(total - spend.total - adding),
        month: Number(plain.is_monthly) === 1
          ? { budget: monthBudget, used: monthUsed, after: round2(monthBudget - monthUsed - adding) }
          : null,
        missing_rate: missingRate,
      },
    });
  } catch (error) {
    sendError(res, error, "Error checking budget");
  }
};
