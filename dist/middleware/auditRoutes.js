"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AUDIT = void 0;
const audit_1 = require("./audit");
const incomeModel_1 = __importDefault(require("../models/incomeModel"));
const expenseModel_1 = __importDefault(require("../models/expenseModel"));
const partnerDoc_1 = __importDefault(require("../models/partnerDoc"));
const partnerPayment_1 = __importDefault(require("../models/partnerPayment"));
const journalEntry_1 = __importDefault(require("../models/journalEntry"));
const chartAccount_1 = __importDefault(require("../models/chartAccount"));
const tax_1 = __importDefault(require("../models/tax"));
const accountSetting_1 = __importDefault(require("../models/accountSetting"));
const company_1 = __importDefault(require("../models/company"));
const fiscalYear_1 = __importDefault(require("../models/fiscalYear"));
const employee_1 = __importDefault(require("../models/employee"));
const payroll_1 = __importDefault(require("../models/payroll"));
const payrollLine_1 = __importDefault(require("../models/payrollLine"));
const salaryAdvance_1 = __importDefault(require("../models/salaryAdvance"));
const userModel_1 = __importDefault(require("../models/userModel"));
const mainMenuModel_1 = __importDefault(require("../models/mainMenuModel"));
/**
 * ລາຍການ route ທີ່ເກັບປະຫວັດ — ສະເພາະເລື່ອງສຳຄັນ: ແກ້ໄຂ / ຍົກເລີກ / ລຶບ ເອກະສານເງິນ, ເງິນເດືອນ, ສິດຜູ້ໃຊ້, ຕັ້ງຄ່າ.
 * ຊ່ອງໃນ `fields` ເທົ່ານັ້ນທີ່ເກັບ (ເກົ່າ → ໃໝ່) — ບໍ່ເກັບລະຫັດຜ່ານ ແລະ ໄຟລ໌
 */
const byPk = (model) => async (id) => (id ? (await model.findByPk(id, { raw: true })) : null);
const firstRow = (model) => async () => (await model.findOne({ order: [["_uuid", "ASC"]], raw: true }));
const text = (...parts) => parts.filter((part) => part !== null && part !== undefined && part !== "").join(" ");
const INCOME_FIELDS = ["income_date", "incom_title", "acount_id_fk", "receive_type", "partner_id", "balances", "tax", "balance_income", "description", "status"];
const EXPENSE_FIELDS = ["expense_date", "expense_title", "acount_id_fk", "pay_type", "partner_id", "payee_name", "bill_no", "subtotal", "tax", "balance_expense", "description", "status"];
const DOC_FIELDS = ["doc_date", "due_date", "partner_id", "exchange_rate", "subtotal", "tax", "total", "status"];
const EMPLOYEE_FIELDS = ["basic_salary", "bank_id", "bank_account_no", "department_id", "position_id", "work_status", "start_date", "end_date"];
const PAYROLL_LINE_FIELDS = ["allowance", "bonus", "overtime", "other_deduction", "advance_deduction", "tax", "sso_employee", "net", "note"];
const USER_FIELDS = ["user_name", "status", "type_user", "employee_id", "creates", "updates", "deletes", "menu_access", "approve_leave", "approve_correction", "approve_advance"];
const SETTING_FIELDS = ["accounting_mode", "number_format", "tax_id", "chief_accountant", "director", "use_vat", "use_fixed_assets", "use_withholding",
    "use_fx_revaluation", "use_bank_reconciliation", "profit_tax_rate", "invoice_license", "invoice_account_id", "invoice_copies"];
const income = { entity: "income", load: byPk(incomeModel_1.default), label: (r) => text(r.number, r.incom_title) };
const expense = { entity: "expense", load: byPk(expenseModel_1.default), label: (r) => text(r.number, r.expense_title) };
const doc = { entity: "invoice", load: byPk(partnerDoc_1.default), label: (r) => r.doc_number };
const employee = { entity: "employee", load: byPk(employee_1.default), label: (r) => text(r.emp_code, r.first_name, r.last_name) };
const payroll = { entity: "payroll", load: byPk(payroll_1.default), label: (r) => r.period };
const advance = { entity: "advance", load: byPk(salaryAdvance_1.default), label: (r) => r.number };
const user = { entity: "user", load: byPk(userModel_1.default), label: (r) => r.user_name };
const fiscal = { entity: "fiscal_year", load: byPk(fiscalYear_1.default), label: (r) => r.fiscal_code };
const menuId = (req) => Number(req.body?.menu_id) || null;
exports.AUDIT = {
    incomeUpdate: (0, audit_1.audit)({ ...income, action: "update", fields: INCOME_FIELDS }),
    incomeCancel: (0, audit_1.audit)({ ...income, action: "cancel", fields: ["status", "balance_income"] }),
    expenseUpdate: (0, audit_1.audit)({ ...expense, action: "update", fields: EXPENSE_FIELDS }),
    expenseCancel: (0, audit_1.audit)({ ...expense, action: "cancel", fields: ["status", "balance_expense"] }),
    docUpdate: (0, audit_1.audit)({ ...doc, action: "update", fields: DOC_FIELDS }),
    docCancel: (0, audit_1.audit)({ ...doc, action: "cancel", fields: ["status", "total"] }),
    paymentCancel: (0, audit_1.audit)({ entity: "payment", action: "cancel", load: byPk(partnerPayment_1.default), label: (r) => r.pay_number, fields: ["status", "amount"] }),
    journalReverse: (0, audit_1.audit)({ entity: "journal", action: "reverse", load: byPk(journalEntry_1.default), label: (r) => text(r.entry_number, r.total_debit) }),
    accountUpdate: (0, audit_1.audit)({ entity: "chart_account", action: "update", load: byPk(chartAccount_1.default), label: (r) => text(r.account_code, r.name_la),
        fields: ["account_code", "name_la", "parent_id", "account_type", "is_postable", "status"] }),
    accountDelete: (0, audit_1.audit)({ entity: "chart_account", action: "delete", load: byPk(chartAccount_1.default), label: (r) => text(r.account_code, r.name_la),
        fields: ["account_code", "name_la"] }),
    taxUpdate: (0, audit_1.audit)({ entity: "tax", action: "update", load: byPk(tax_1.default), label: (r) => text(r.tax_code, r.name), fields: ["name", "rate", "calc_method", "is_default", "status"] }),
    settingUpdate: (0, audit_1.audit)({ entity: "account_setting", action: "update", id: () => null, load: firstRow(accountSetting_1.default), fields: SETTING_FIELDS }),
    periodClose: (0, audit_1.audit)({ entity: "period", action: "close", id: () => null, load: firstRow(accountSetting_1.default), fields: ["lock_date"] }),
    periodReopen: (0, audit_1.audit)({ entity: "period", action: "reopen", id: () => null, load: firstRow(accountSetting_1.default), fields: ["lock_date"] }),
    companyUpdate: (0, audit_1.audit)({ entity: "company", action: "update", id: () => null,
        load: async () => {
            const [company, setting] = await Promise.all([firstRow(company_1.default)(), firstRow(accountSetting_1.default)()]);
            return company && { ...company, tax_id: setting?.tax_id ?? null };
        },
        label: (r) => r.name_la, fields: ["name_la", "name_en", "tax_id"] }),
    fiscalUpdate: (0, audit_1.audit)({ ...fiscal, action: "update", fields: ["start_date", "end_date"] }),
    fiscalClose: (0, audit_1.audit)({ ...fiscal, action: "close", fields: ["status"] }),
    fiscalReopen: (0, audit_1.audit)({ ...fiscal, action: "reopen", fields: ["status"] }),
    fiscalDelete: (0, audit_1.audit)({ ...fiscal, action: "delete", fields: ["start_date", "end_date"] }),
    employeeUpdate: (0, audit_1.audit)({ ...employee, action: "update", fields: EMPLOYEE_FIELDS }),
    employeeDelete: (0, audit_1.audit)({ ...employee, action: "delete", fields: ["basic_salary", "department_id", "start_date"] }),
    employeeAppPassword: (0, audit_1.audit)({ ...employee, action: "password" }),
    payrollPay: (0, audit_1.audit)({ ...payroll, action: "pay", fields: ["status"] }),
    payrollUnpay: (0, audit_1.audit)({ ...payroll, action: "unpay", fields: ["status"] }),
    payrollDelete: (0, audit_1.audit)({ ...payroll, action: "delete", fields: ["status", "employees"] }),
    payrollLineUpdate: (0, audit_1.audit)({ entity: "payroll_line", action: "update", load: byPk(payrollLine_1.default), label: (r) => r.employee_name, fields: PAYROLL_LINE_FIELDS }),
    payrollLineDelete: (0, audit_1.audit)({ entity: "payroll_line", action: "delete", load: byPk(payrollLine_1.default), label: (r) => r.employee_name, fields: ["net"] }),
    advancePay: (0, audit_1.audit)({ ...advance, action: "pay", fields: ["status", "amount"] }),
    advanceUnpay: (0, audit_1.audit)({ ...advance, action: "unpay", fields: ["status", "amount"] }),
    advanceCancel: (0, audit_1.audit)({ ...advance, action: "cancel", fields: ["status", "amount"] }),
    userUpdate: (0, audit_1.audit)({ ...user, action: "update", fields: USER_FIELDS }),
    userDelete: (0, audit_1.audit)({ ...user, action: "delete", fields: ["user_name", "status"] }),
    userPassword: (0, audit_1.audit)({ ...user, action: "password" }),
    menuLock: (0, audit_1.audit)({ entity: "menu", action: "lock", id: menuId, load: byPk(mainMenuModel_1.default), label: (r) => r.name_la }),
    menuUnlock: (0, audit_1.audit)({ entity: "menu", action: "unlock", id: menuId, load: byPk(mainMenuModel_1.default), label: (r) => r.name_la }),
};
