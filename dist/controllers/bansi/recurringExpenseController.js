"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteRecurringExpense = exports.updateRecurringExpense = exports.createRecurringFromExpense = exports.getRecurringExpenses = exports.recurringWithStatus = void 0;
const sequelize_1 = require("sequelize");
const moment_1 = __importDefault(require("moment"));
const workCalendar_1 = require("../hr/workCalendar");
const expenseModel_1 = __importDefault(require("../../models/expenseModel"));
const expenseItemModel_1 = __importDefault(require("../../models/expenseItemModel"));
const expenseRecurring_1 = __importDefault(require("../../models/expenseRecurring"));
const financeSubCategory_1 = __importDefault(require("../../models/financeSubCategory"));
const treasuryAcount_1 = __importDefault(require("../../models/treasuryAcount"));
const journalHelpers_1 = require("./journalHelpers");
const bansiHelpers_1 = require("./bansiHelpers");
/**
 * ລາຍຈ່າຍປະຈຳເດືອນ — ສ້າງຈາກລາຍຈ່າຍທີ່ເຄີຍບັນທຶກ, ບອກວ່າເດືອນນີ້ບັນທຶກແລ້ວບໍ່ (ລາຍຈ່າຍທີ່ມີ recurring_id ໃນເດືອນ)
 * ແລະ ຄົບກຳນົດແລ້ວບໍ່ (ມື້ນີ້ ≥ day_of_month). ການບັນທຶກແທ້ໄປທາງ POST /expense/create (ຟອມລາຍຈ່າຍເຕີມໃຫ້)
 */
const MAX_DAY = 28;
const dayOf = (value) => Math.min(MAX_DAY, Math.max(1, Math.round(Number(value) || 1)));
/** ແມ່ແບບ + ສະຖານະເດືອນນີ້ (ໃຊ້ຮ່ວມກັບ desktop "ຕ້ອງຕິດຕາມ") */
const recurringWithStatus = async () => {
    const now = (0, workCalendar_1.nowLao)();
    const start = now.clone().startOf("month").format("YYYY-MM-DD");
    const end = now.clone().endOf("month").format("YYYY-MM-DD");
    const today = now.date();
    const rows = (await expenseRecurring_1.default.findAll({ order: [["day_of_month", "ASC"], ["_uuid", "ASC"]], raw: true }));
    if (!rows.length)
        return [];
    const [subs, accounts, done] = await Promise.all([
        financeSubCategory_1.default.findAll({ where: { _uuid: rows.map((r) => r.sub_category_id) }, attributes: ["_uuid", "name", "category_id"], raw: true }),
        treasuryAcount_1.default.findAll({ where: { _uuid: rows.map((r) => r.acount_id_fk) }, attributes: ["_uuid", "acountName", "acount_number"], raw: true }),
        expenseModel_1.default.findAll({
            where: { recurring_id: rows.map((r) => r._uuid), status: journalHelpers_1.ACTIVE, expense_date: { [sequelize_1.Op.between]: [start, end] } },
            attributes: ["_uuid", "number", "expense_date", "balance_expense", "recurring_id"], order: [["expense_date", "DESC"]], raw: true,
        }),
    ]);
    return rows.map((row) => {
        const paid = done.find((e) => Number(e.recurring_id) === Number(row._uuid)) ?? null;
        let items = [];
        try {
            items = JSON.parse(row.items ?? "[]");
        }
        catch {
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
exports.recurringWithStatus = recurringWithStatus;
/** GET /expense-recurring */
const getRecurringExpenses = async (_req, res) => {
    try {
        res.status(200).json({ data: await (0, exports.recurringWithStatus)() });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting recurring expenses");
    }
};
exports.getRecurringExpenses = getRecurringExpenses;
/** POST /expense-recurring/from-expense/:id { title?, day_of_month } — ຄັດລອກປະເພດ, ບັນຊີ, ຜູ້ຮັບ, ລາຍການ ຈາກລາຍຈ່າຍ */
const createRecurringFromExpense = async (req, res) => {
    try {
        const expense = await expenseModel_1.default.findByPk(Number((0, bansiHelpers_1.decodeId)(req)), { include: [{ model: expenseItemModel_1.default, as: "items" }] });
        if (!expense) {
            res.status(404).json({ message: "ບໍ່ພົບລາຍຈ່າຍ" });
            return;
        }
        if (expense.payroll_id) {
            res.status(400).json({ message: "ລາຍຈ່າຍເງິນເດືອນ ສ້າງຈາກໜ້າເງິນເດືອນ — ຕັ້ງເປັນລາຍຈ່າຍປະຈຳບໍ່ໄດ້" });
            return;
        }
        const items = (expense.items ?? [])
            .sort((a, b) => Number(a.line_no) - Number(b.line_no))
            .map((i) => ({ name: i.item_name, qty: Number(i.quantity) || 1, unit: i.unit ?? "", price: Number(i.unit_price) || 0 }));
        const row = await expenseRecurring_1.default.create({
            title: String(req.body?.title ?? "").trim().slice(0, 150) || expense.expense_title,
            day_of_month: dayOf(req.body?.day_of_month ?? (0, moment_1.default)(expense.expense_date).date()),
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
            createdbyid: Number((0, bansiHelpers_1.actorOf)(req)) || null,
        });
        // ລາຍຈ່າຍຕົ້ນແບບນັບເປັນຂອງເດືອນມັນ (ເດືອນນີ້ = ບັນທຶກແລ້ວ)
        await expense.update({ recurring_id: row._uuid });
        res.status(200).json({ message: "Successfully created recurring expense", data: row });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error creating recurring expense");
    }
};
exports.createRecurringFromExpense = createRecurringFromExpense;
/** PUT /expense-recurring/:id { title, day_of_month, status (1 ໃຊ້ / 0 ຢຸດ) } */
const updateRecurringExpense = async (req, res) => {
    try {
        const row = await expenseRecurring_1.default.findByPk(Number((0, bansiHelpers_1.decodeId)(req)));
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
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error updating recurring expense");
    }
};
exports.updateRecurringExpense = updateRecurringExpense;
/** DELETE /expense-recurring/:id — ລຶບແມ່ແບບ (ລາຍຈ່າຍທີ່ບັນທຶກແລ້ວຍັງຢູ່ຄືເກົ່າ) */
const deleteRecurringExpense = async (req, res) => {
    try {
        const row = await expenseRecurring_1.default.findByPk(Number((0, bansiHelpers_1.decodeId)(req)));
        if (!row) {
            res.status(404).json({ message: "ບໍ່ພົບລາຍຈ່າຍປະຈຳ" });
            return;
        }
        await row.destroy();
        res.status(200).json({ message: "Successfully deleted recurring expense" });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error deleting recurring expense");
    }
};
exports.deleteRecurringExpense = deleteRecurringExpense;
