import { Request, Response } from "express";
import { Op } from "sequelize";
import moment from "moment";
import { nowLao } from "../hr/workCalendar";
import Expenses from "../../models/expenseModel";
import ExpenseItems from "../../models/expenseItemModel";
import ExpenseRecurring from "../../models/expenseRecurring";
import FinanceSubCategory from "../../models/financeSubCategory";
import TreasuryAccount from "../../models/treasuryAcount";
import { ACTIVE } from "./journalHelpers";
import { actorOf, decodeId, sendError } from "./bansiHelpers";

/**
 * ລາຍຈ່າຍປະຈຳເດືອນ — ສ້າງຈາກລາຍຈ່າຍທີ່ເຄີຍບັນທຶກ, ບອກວ່າເດືອນນີ້ບັນທຶກແລ້ວບໍ່ (ລາຍຈ່າຍທີ່ມີ recurring_id ໃນເດືອນ)
 * ແລະ ຄົບກຳນົດແລ້ວບໍ່ (ມື້ນີ້ ≥ day_of_month). ການບັນທຶກແທ້ໄປທາງ POST /expense/create (ຟອມລາຍຈ່າຍເຕີມໃຫ້)
 */
const MAX_DAY = 28;
const dayOf = (value: unknown) => Math.min(MAX_DAY, Math.max(1, Math.round(Number(value) || 1)));

/** ແມ່ແບບ + ສະຖານະເດືອນນີ້ (ໃຊ້ຮ່ວມກັບ desktop "ຕ້ອງຕິດຕາມ") */
export const recurringWithStatus = async () => {
  const now = nowLao();
  const start = now.clone().startOf("month").format("YYYY-MM-DD");
  const end = now.clone().endOf("month").format("YYYY-MM-DD");
  const today = now.date();
  const rows = (await ExpenseRecurring.findAll({ order: [["day_of_month", "ASC"], ["_uuid", "ASC"]], raw: true })) as any[];
  if (!rows.length) return [];
  const [subs, accounts, done] = await Promise.all([
    FinanceSubCategory.findAll({ where: { _uuid: rows.map((r) => r.sub_category_id) }, attributes: ["_uuid", "name", "category_id"], raw: true }) as Promise<any[]>,
    TreasuryAccount.findAll({ where: { _uuid: rows.map((r) => r.acount_id_fk) }, attributes: ["_uuid", "acountName", "acount_number"], raw: true }) as Promise<any[]>,
    Expenses.findAll({
      where: { recurring_id: rows.map((r) => r._uuid), status: ACTIVE, expense_date: { [Op.between]: [start, end] } },
      attributes: ["_uuid", "number", "expense_date", "balance_expense", "recurring_id"], order: [["expense_date", "DESC"]], raw: true,
    }) as Promise<any[]>,
  ]);
  return rows.map((row) => {
    const paid = done.find((e) => Number(e.recurring_id) === Number(row._uuid)) ?? null;
    let items: unknown[] = [];
    try {
      items = JSON.parse(row.items ?? "[]");
    } catch {
      items = [];
    }
    return {
      ...row,
      items,
      amount: Number(row.amount) || 0,
      sub: subs.find((s) => Number(s._uuid) === Number(row.sub_category_id)) ?? null,
      account: accounts.find((a) => Number(a._uuid) === Number(row.acount_id_fk)) ?? null,
      this_month: paid && { _uuid: paid._uuid, number: paid.number, expense_date: paid.expense_date, total: Number(paid.balance_expense) || 0 },
      due: Number(row.status) === 1 && !paid && today >= Number(row.day_of_month),
    };
  });
};

/** GET /expense-recurring */
export const getRecurringExpenses = async (_req: Request, res: Response) => {
  try {
    res.status(200).json({ data: await recurringWithStatus() });
  } catch (error) {
    sendError(res, error, "Error getting recurring expenses");
  }
};

/** POST /expense-recurring/from-expense/:id { title?, day_of_month } — ຄັດລອກປະເພດ, ບັນຊີ, ຜູ້ຮັບ, ລາຍການ ຈາກລາຍຈ່າຍ */
export const createRecurringFromExpense = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const expense: any = await Expenses.findByPk(Number(decodeId(req)), { include: [{ model: ExpenseItems, as: "items" }] });
    if (!expense) {
      res.status(404).json({ message: "ບໍ່ພົບລາຍຈ່າຍ" });
      return;
    }
    if (expense.payroll_id) {
      res.status(400).json({ message: "ລາຍຈ່າຍເງິນເດືອນ ສ້າງຈາກໜ້າເງິນເດືອນ — ຕັ້ງເປັນລາຍຈ່າຍປະຈຳບໍ່ໄດ້" });
      return;
    }
    const items = (expense.items ?? [])
      .sort((a: any, b: any) => Number(a.line_no) - Number(b.line_no))
      .map((i: any) => ({ name: i.item_name, qty: Number(i.quantity) || 1, unit: i.unit ?? "", price: Number(i.unit_price) || 0 }));
    const row = await ExpenseRecurring.create({
      title: String(req.body?.title ?? "").trim().slice(0, 150) || expense.expense_title,
      day_of_month: dayOf(req.body?.day_of_month ?? moment(expense.expense_date).date()),
      sub_category_id: expense.sub_category_id,
      acount_id_fk: expense.acount_id_fk,
      partner_id: expense.partner_id,
      payee_name: expense.payee_name,
      payee_bank_id: expense.payee_bank_id,
      payee_account_number: expense.payee_account_number,
      items: JSON.stringify(items),
      amount: Number(expense.subtotal) || 0,
      description: expense.description,
      status: 1,
      createdbyid: Number(actorOf(req)) || null,
    });
    // ລາຍຈ່າຍຕົ້ນແບບນັບເປັນຂອງເດືອນມັນ (ເດືອນນີ້ = ບັນທຶກແລ້ວ)
    await expense.update({ recurring_id: row._uuid });
    res.status(200).json({ message: "Successfully created recurring expense", data: row });
  } catch (error) {
    sendError(res, error, "Error creating recurring expense");
  }
};

/** PUT /expense-recurring/:id { title, day_of_month, status (1 ໃຊ້ / 0 ຢຸດ) } */
export const updateRecurringExpense = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const row = await ExpenseRecurring.findByPk(Number(decodeId(req)));
    if (!row) {
      res.status(404).json({ message: "ບໍ່ພົບລາຍຈ່າຍປະຈຳ" });
      return;
    }
    const title = String(req.body?.title ?? row.title).trim().slice(0, 150);
    if (!title) {
      res.status(400).json({ message: "ກະລຸນາປ້ອນຊື່" });
      return;
    }
    await row.update({
      title,
      day_of_month: dayOf(req.body?.day_of_month ?? row.day_of_month),
      status: req.body?.status === undefined ? row.status : Number(req.body.status) === 1 ? 1 : 0,
      updatedAt: new Date(),
    });
    res.status(200).json({ message: "Successfully updated recurring expense", data: row });
  } catch (error) {
    sendError(res, error, "Error updating recurring expense");
  }
};

/** DELETE /expense-recurring/:id — ລຶບແມ່ແບບ (ລາຍຈ່າຍທີ່ບັນທຶກແລ້ວຍັງຢູ່ຄືເກົ່າ) */
export const deleteRecurringExpense = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const row = await ExpenseRecurring.findByPk(Number(decodeId(req)));
    if (!row) {
      res.status(404).json({ message: "ບໍ່ພົບລາຍຈ່າຍປະຈຳ" });
      return;
    }
    await row.destroy();
    res.status(200).json({ message: "Successfully deleted recurring expense" });
  } catch (error) {
    sendError(res, error, "Error deleting recurring expense");
  }
};
