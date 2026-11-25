import { Request } from "express";
import { ModelStatic, Model } from "sequelize";
import { audit } from "./audit";
import Incomes from "../models/incomeModel";
import Expenses from "../models/expenseModel";
import PartnerDoc from "../models/partnerDoc";
import PartnerPayment from "../models/partnerPayment";
import JournalEntry from "../models/journalEntry";
import ChartAccount from "../models/chartAccount";
import Tax from "../models/tax";
import AccountSetting from "../models/accountSetting";
import Company from "../models/company";
import FiscalYear from "../models/fiscalYear";
import Employee from "../models/employee";
import Payroll from "../models/payroll";
import PayrollLine from "../models/payrollLine";
import SalaryAdvance from "../models/salaryAdvance";
import Users from "../models/userModel";
import MainMenu from "../models/mainMenuModel";

/**
 * ລາຍການ route ທີ່ເກັບປະຫວັດ — ສະເພາະເລື່ອງສຳຄັນ: ແກ້ໄຂ / ຍົກເລີກ / ລຶບ ເອກະສານເງິນ, ເງິນເດືອນ, ສິດຜູ້ໃຊ້, ຕັ້ງຄ່າ.
 * ຊ່ອງໃນ `fields` ເທົ່ານັ້ນທີ່ເກັບ (ເກົ່າ → ໃໝ່) — ບໍ່ເກັບລະຫັດຜ່ານ ແລະ ໄຟລ໌
 */
const byPk = (model: ModelStatic<Model>) => async (id: number | null) =>
  (id ? ((await model.findByPk(id, { raw: true })) as unknown as Record<string, unknown> | null) : null);
const firstRow = (model: ModelStatic<Model>) => async () =>
  (await model.findOne({ order: [["_uuid", "ASC"]], raw: true })) as unknown as Record<string, unknown> | null;
const text = (...parts: unknown[]) => parts.filter((part) => part !== null && part !== undefined && part !== "").join(" ");

const INCOME_FIELDS = ["income_date", "incom_title", "acount_id_fk", "receive_type", "partner_id", "balances", "tax", "balance_income", "description", "status"];
const EXPENSE_FIELDS = ["expense_date", "expense_title", "acount_id_fk", "pay_type", "partner_id", "payee_name", "bill_no", "subtotal", "tax", "balance_expense", "description", "status"];
const DOC_FIELDS = ["doc_date", "due_date", "partner_id", "exchange_rate", "subtotal", "tax", "total", "status"];
const EMPLOYEE_FIELDS = ["basic_salary", "bank_id", "bank_account_no", "department_id", "position_id", "work_status", "start_date", "end_date"];
const PAYROLL_LINE_FIELDS = ["allowance", "bonus", "overtime", "other_deduction", "advance_deduction", "tax", "sso_employee", "net", "note"];
const USER_FIELDS = ["user_name", "status", "type_user", "employee_id", "creates", "updates", "deletes", "menu_access", "approve_leave", "approve_correction", "approve_advance"];
const SETTING_FIELDS = ["accounting_mode", "number_format", "tax_id", "chief_accountant", "director", "use_vat", "use_fixed_assets", "use_withholding",
  "use_fx_revaluation", "use_bank_reconciliation", "profit_tax_rate", "invoice_license", "invoice_account_id", "invoice_copies"];

const income = { entity: "income", load: byPk(Incomes), label: (r: any) => text(r.number, r.incom_title) };
const expense = { entity: "expense", load: byPk(Expenses), label: (r: any) => text(r.number, r.expense_title) };
const doc = { entity: "invoice", load: byPk(PartnerDoc), label: (r: any) => r.doc_number };
const employee = { entity: "employee", load: byPk(Employee), label: (r: any) => text(r.emp_code, r.first_name, r.last_name) };
const payroll = { entity: "payroll", load: byPk(Payroll), label: (r: any) => r.period };
const advance = { entity: "advance", load: byPk(SalaryAdvance), label: (r: any) => r.number };
const user = { entity: "user", load: byPk(Users), label: (r: any) => r.user_name };
const fiscal = { entity: "fiscal_year", load: byPk(FiscalYear), label: (r: any) => r.fiscal_code };
const menuId = (req: Request) => Number(req.body?.menu_id) || null;

export const AUDIT = {
  incomeUpdate: audit({ ...income, action: "update", fields: INCOME_FIELDS }),
  incomeCancel: audit({ ...income, action: "cancel", fields: ["status", "balance_income"] }),
  expenseUpdate: audit({ ...expense, action: "update", fields: EXPENSE_FIELDS }),
  expenseCancel: audit({ ...expense, action: "cancel", fields: ["status", "balance_expense"] }),
  docUpdate: audit({ ...doc, action: "update", fields: DOC_FIELDS }),
  docCancel: audit({ ...doc, action: "cancel", fields: ["status", "total"] }),
  paymentCancel: audit({ entity: "payment", action: "cancel", load: byPk(PartnerPayment), label: (r: any) => r.pay_number, fields: ["status", "amount"] }),
  journalReverse: audit({ entity: "journal", action: "reverse", load: byPk(JournalEntry), label: (r: any) => text(r.entry_number, r.total_debit) }),
  accountUpdate: audit({ entity: "chart_account", action: "update", load: byPk(ChartAccount), label: (r: any) => text(r.account_code, r.name_la),
    fields: ["account_code", "name_la", "parent_id", "account_type", "is_postable", "status"] }),
  accountDelete: audit({ entity: "chart_account", action: "delete", load: byPk(ChartAccount), label: (r: any) => text(r.account_code, r.name_la),
    fields: ["account_code", "name_la"] }),
  taxUpdate: audit({ entity: "tax", action: "update", load: byPk(Tax), label: (r: any) => text(r.tax_code, r.name), fields: ["name", "rate", "calc_method", "is_default", "status"] }),
  settingUpdate: audit({ entity: "account_setting", action: "update", id: () => null, load: firstRow(AccountSetting), fields: SETTING_FIELDS }),
  periodClose: audit({ entity: "period", action: "close", id: () => null, load: firstRow(AccountSetting), fields: ["lock_date"] }),
  periodReopen: audit({ entity: "period", action: "reopen", id: () => null, load: firstRow(AccountSetting), fields: ["lock_date"] }),
  companyUpdate: audit({ entity: "company", action: "update", id: () => null,
    load: async () => {
      const [company, setting] = await Promise.all([firstRow(Company)(), firstRow(AccountSetting)()]);
      return company && { ...company, tax_id: setting?.tax_id ?? null };
    },
    label: (r: any) => r.name_la, fields: ["name_la", "name_en", "tax_id"] }),
  fiscalUpdate: audit({ ...fiscal, action: "update", fields: ["start_date", "end_date"] }),
  fiscalClose: audit({ ...fiscal, action: "close", fields: ["status"] }),
  fiscalReopen: audit({ ...fiscal, action: "reopen", fields: ["status"] }),
  fiscalDelete: audit({ ...fiscal, action: "delete", fields: ["start_date", "end_date"] }),
  employeeUpdate: audit({ ...employee, action: "update", fields: EMPLOYEE_FIELDS }),
  employeeDelete: audit({ ...employee, action: "delete", fields: ["basic_salary", "department_id", "start_date"] }),
  employeeAppPassword: audit({ ...employee, action: "password" }),
  payrollPay: audit({ ...payroll, action: "pay", fields: ["status"] }),
  payrollUnpay: audit({ ...payroll, action: "unpay", fields: ["status"] }),
  payrollDelete: audit({ ...payroll, action: "delete", fields: ["status", "employees"] }),
  payrollLineUpdate: audit({ entity: "payroll_line", action: "update", load: byPk(PayrollLine), label: (r: any) => r.employee_name, fields: PAYROLL_LINE_FIELDS }),
  payrollLineDelete: audit({ entity: "payroll_line", action: "delete", load: byPk(PayrollLine), label: (r: any) => r.employee_name, fields: ["net"] }),
  advancePay: audit({ ...advance, action: "pay", fields: ["status", "amount"] }),
  advanceUnpay: audit({ ...advance, action: "unpay", fields: ["status", "amount"] }),
  advanceCancel: audit({ ...advance, action: "cancel", fields: ["status", "amount"] }),
  userUpdate: audit({ ...user, action: "update", fields: USER_FIELDS }),
  userDelete: audit({ ...user, action: "delete", fields: ["user_name", "status"] }),
  userPassword: audit({ ...user, action: "password" }),
  menuLock: audit({ entity: "menu", action: "lock", id: menuId, load: byPk(MainMenu), label: (r: any) => r.name_la }),
  menuUnlock: audit({ entity: "menu", action: "unlock", id: menuId, load: byPk(MainMenu), label: (r: any) => r.name_la }),
};
