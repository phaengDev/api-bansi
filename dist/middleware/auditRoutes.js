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
const companyDocument_1 = __importDefault(require("../models/companyDocument"));
const expenseRecurring_1 = __importDefault(require("../models/expenseRecurring"));
const loan_1 = __importStar(require("../models/loan"));
const loanCredit_1 = require("../models/loanCredit");
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
    "use_fx_revaluation", "use_bank_reconciliation", "use_credit", "profit_tax_rate", "invoice_license", "invoice_account_id", "invoice_copies"];
const income = { entity: "income", load: byPk(incomeModel_1.default), label: (r) => text(r.number, r.incom_title) };
const expense = { entity: "expense", load: byPk(expenseModel_1.default), label: (r) => text(r.number, r.expense_title) };
const doc = { entity: "invoice", load: byPk(partnerDoc_1.default), label: (r) => r.doc_number };
const employee = { entity: "employee", load: byPk(employee_1.default), label: (r) => text(r.emp_code, r.first_name, r.last_name) };
const payroll = { entity: "payroll", load: byPk(payroll_1.default), label: (r) => r.period };
const advance = { entity: "advance", load: byPk(salaryAdvance_1.default), label: (r) => r.number };
const user = { entity: "user", load: byPk(userModel_1.default), label: (r) => r.user_name };
const fiscal = { entity: "fiscal_year", load: byPk(fiscalYear_1.default), label: (r) => r.fiscal_code };
const menuId = (req) => Number(req.body?.menu_id) || null;
/** route ຂອງລະບົບສິນເຊື່ອ ໃຊ້ id ເປັນຕົວເລກທຳມະດາ (ບໍ່ແມ່ນ base64) */
const plainId = (req) => Number(req.params?.id) || null;
const contract = { entity: "credit_contract", id: plainId, load: byPk(loan_1.default), label: (r) => text(r.loan_code, r.counterparty) };
const application = { entity: "credit_application", id: plainId, load: byPk(loanCredit_1.LoanApplication), label: (r) => r.application_no };
/** ເດືອນຂອງການຈັດຊັ້ນໜີ້ (POST body.period / DELETE :period) */
/** ແຖວທີ່ຜູກກັບສັນຍາ (ຄ່າປັບ / ໜີ້ສູນ / ປັບໂຄງສ້າງ) + ລະຫັດ ແລະ ຊື່ສັນຍາ — ປ້າຍໃນປະຫວັດບອກວ່າແມ່ນສັນຍາໃດ */
const withContract = (model) => async (id) => {
    const row = await byPk(model)(id);
    if (!row)
        return null;
    const loan = await loan_1.default.findByPk(Number(row.loan_id), { attributes: ["loan_code", "counterparty"], raw: true });
    return { ...row, loan_code: loan?.loan_code ?? null, counterparty: loan?.counterparty ?? null };
};
const periodOf = async (_id, req) => ({ period: String(req.body?.period ?? req.params?.period ?? "") });
const APP_FIELDS = ["status", "approval_level", "approved_amount", "approved_term", "approved_rate", "reject_reason"];
exports.AUDIT = {
    // ---- ລະບົບສິນເຊື່ອ ----
    creditProductUpdate: (0, audit_1.audit)({ entity: "credit_product", action: "update", id: plainId, load: byPk(loanCredit_1.LoanProduct), label: (r) => text(r.product_code, r.name_la),
        fields: ["min_amount", "max_amount", "min_term", "max_term", "annual_rate", "method", "upfront_fee_rate", "upfront_fee_fixed", "penalty_rate", "grace_days", "max_ltv", "max_debt_ratio", "approval_levels", "status"] }),
    creditCustomerUpdate: (0, audit_1.audit)({ entity: "credit_customer", action: "update", id: plainId, load: byPk(loanCredit_1.LoanCustomer), label: (r) => text(r.customer_code, r.full_name),
        fields: ["full_name", "id_no", "phone", "monthly_income", "credit_limit", "risk_level", "blacklisted", "blacklist_reason", "status"] }),
    creditCustomerDelete: (0, audit_1.audit)({ entity: "credit_customer", action: "delete", id: plainId, load: byPk(loanCredit_1.LoanCustomer), label: (r) => text(r.customer_code, r.full_name),
        fields: ["full_name", "id_no", "phone"] }),
    creditAppDecide: (0, audit_1.audit)({ ...application, action: "decide", fields: APP_FIELDS }),
    creditAppCancel: (0, audit_1.audit)({ ...application, action: "cancel", fields: ["status", "note"] }),
    creditAppRoute: (0, audit_1.audit)({ ...application, action: "forward", fields: ["assigned_to", "assigned_by"] }),
    creditAppDelete: (0, audit_1.audit)({ ...application, action: "delete", fields: ["requested_amount", "requested_term", "status"] }),
    creditDisburse: (0, audit_1.audit)({ ...application, action: "disburse", fields: ["status", "loan_id"] }),
    creditUndoDisburse: (0, audit_1.audit)({ ...contract, action: "reverse", fields: ["principal", "start_date"] }),
    creditCollect: (0, audit_1.audit)({ ...contract, action: "collect" }),
    creditWaive: (0, audit_1.audit)({ ...contract, action: "waive" }),
    creditUndoWaiver: (0, audit_1.audit)({ entity: "credit_penalty", action: "reverse", id: plainId, load: withContract(loanCredit_1.LoanPenalty), label: (r) => text(r.loan_code, r.counterparty, `· #${r.installment_no}`),
        fields: ["waived_amount", "waive_reason"] }),
    creditWriteOff: (0, audit_1.audit)({ ...contract, action: "writeoff", fields: ["closed_date", "close_reason"] }),
    creditUndoWriteOff: (0, audit_1.audit)({ entity: "credit_writeoff", action: "reverse", id: plainId, load: withContract(loanCredit_1.LoanWriteoff), label: (r) => text(r.loan_code, r.counterparty), fields: ["status", "principal", "reason"] }),
    creditRecover: (0, audit_1.audit)({ ...contract, action: "collect" }),
    creditRestructure: (0, audit_1.audit)({ ...contract, action: "restructure", fields: ["closed_date", "close_reason"] }),
    creditUndoRestructure: (0, audit_1.audit)({ entity: "credit_restructure", action: "reverse", id: plainId, load: withContract(loanCredit_1.LoanRestructure), label: (r) => text(r.loan_code, r.counterparty), fields: ["status", "old_outstanding", "reason"] }),
    creditClassify: (0, audit_1.audit)({ entity: "credit_classification", action: "classify", id: () => null, load: periodOf, label: (r) => r.period }),
    creditUnclassify: (0, audit_1.audit)({ entity: "credit_classification", action: "reverse", id: () => null, load: periodOf, label: (r) => r.period }),
    loanUpdate: (0, audit_1.audit)({ entity: "loan", id: plainId, action: "update", load: byPk(loan_1.default), label: (r) => text(r.loan_code, r.counterparty),
        fields: ["counterparty", "contract_no", "principal", "annual_rate", "method", "term", "start_date", "first_due_date", "loan_account_id", "interest_account_id"] }),
    loanDelete: (0, audit_1.audit)({ entity: "loan", id: plainId, action: "delete", load: byPk(loan_1.default), label: (r) => text(r.loan_code, r.counterparty),
        fields: ["counterparty", "principal", "annual_rate", "term", "start_date"] }),
    loanPaymentCancel: (0, audit_1.audit)({ entity: "loan_payment", id: plainId, action: "cancel", load: byPk(loan_1.LoanPayment), label: (r) => r.number,
        fields: ["status", "principal", "interest", "fee", "penalty"] }),
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
    companyDocUpdate: (0, audit_1.audit)({ entity: "company_doc", action: "update", load: byPk(companyDocument_1.default), label: (r) => text(r.title, r.doc_no),
        fields: ["title", "doc_no", "issue_date", "expiry_date", "original_name"] }),
    companyDocDelete: (0, audit_1.audit)({ entity: "company_doc", action: "delete", load: byPk(companyDocument_1.default), label: (r) => text(r.title, r.doc_no),
        fields: ["doc_no", "expiry_date"] }),
    recurringDelete: (0, audit_1.audit)({ entity: "recurring", action: "delete", load: byPk(expenseRecurring_1.default), label: (r) => r.title, fields: ["amount", "day_of_month"] }),
    menuLock: (0, audit_1.audit)({ entity: "menu", action: "lock", id: menuId, load: byPk(mainMenuModel_1.default), label: (r) => r.name_la }),
    menuUnlock: (0, audit_1.audit)({ entity: "menu", action: "unlock", id: menuId, load: byPk(mainMenuModel_1.default), label: (r) => r.name_la }),
};
