"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoanNotice = exports.LoanCollection = exports.LoanWriteoff = exports.LoanRestructure = exports.LoanClassification = exports.LoanClassRule = exports.LoanPenalty = exports.LoanDocument = exports.LoanCollateral = exports.LoanGuarantor = exports.LoanApproval = exports.LoanApplication = exports.LoanProduct = exports.LoanCustomer = void 0;
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const autoSync_1 = require("../utils/autoSync");
const district_1 = __importDefault(require("./district"));
/**
 * ລະບົບສິນເຊື່ອ — ຕາຕະລາງຕາມ sql/credit_system.sql (ຊື່ ແລະ ຖັນດຽວກັນ; autoSync ສ້າງໃຫ້ ບໍ່ຕ້ອງລັນ SQL ເອງ).
 * ສັນຍາ = tbl_loan (direction 2) ທີ່ສ້າງຕອນປ່ອຍກູ້ຈາກຄຳຮ້ອງ — ຕາຕະລາງຜ່ອນ, ການຊຳລະ, ດອກເບ້ຍຄ້າງ ໃຊ້ຂອງ tbl_loan_*.
 * ເພີ່ມຈາກ SQL: frequency_days (ຈ່າຍທຸກອາທິດ / 2 ອາທິດ / ທຸກມື້), tbl_loan_product.max_debt_ratio (ເພດານໜີ້ຕໍ່ລາຍຮັບ)
 */
const money = () => ({ type: sequelize_1.DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0 });
const rate = () => ({ type: sequelize_1.DataTypes.DECIMAL(9, 4), allowNull: false, defaultValue: 0 });
const stamps = {
    createdAt: { type: sequelize_1.DataTypes.DATE, allowNull: false, defaultValue: sequelize_1.DataTypes.NOW },
    updatedAt: { type: sequelize_1.DataTypes.DATE, allowNull: false, defaultValue: sequelize_1.DataTypes.NOW },
};
/** 1. ລູກຄ້າສິນເຊື່ອ (KYC) — ບຸກຄົນ ຫຼື ນິຕິບຸກຄົນ */
class LoanCustomer extends sequelize_1.Model {
}
exports.LoanCustomer = LoanCustomer;
LoanCustomer.init({
    _uuid: { type: sequelize_1.DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    customer_code: { type: sequelize_1.DataTypes.STRING(30), allowNull: false },
    customer_type: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1, comment: "1 ບຸກຄົນ, 2 ນິຕິບຸກຄົນ" },
    partner_id: sequelize_1.DataTypes.INTEGER,
    full_name: { type: sequelize_1.DataTypes.STRING(200), allowNull: false },
    name_en: sequelize_1.DataTypes.STRING(200),
    gender: sequelize_1.DataTypes.TINYINT,
    birth_date: sequelize_1.DataTypes.DATEONLY,
    nationality: sequelize_1.DataTypes.STRING(50),
    id_type: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1, comment: "1 ບັດປະຈຳຕົວ, 2 ສຳມະໂນຄົວ, 3 ໜັງສືຜ່ານແດນ, 4 ທະບຽນວິສາຫະກິດ" },
    id_no: sequelize_1.DataTypes.STRING(50),
    id_issue_date: sequelize_1.DataTypes.DATEONLY,
    id_expiry_date: sequelize_1.DataTypes.DATEONLY,
    tax_number: sequelize_1.DataTypes.STRING(50),
    phone: sequelize_1.DataTypes.STRING(50),
    phone2: sequelize_1.DataTypes.STRING(50),
    email: sequelize_1.DataTypes.STRING(150),
    village: sequelize_1.DataTypes.STRING(150),
    district_id: sequelize_1.DataTypes.INTEGER,
    province_id: sequelize_1.DataTypes.INTEGER,
    address: sequelize_1.DataTypes.STRING(255),
    marital_status: { type: sequelize_1.DataTypes.TINYINT, comment: "1 ໂສດ, 2 ແຕ່ງງານ, 3 ຢ່າຮ້າງ, 4 ໝ້າຍ" },
    spouse_name: sequelize_1.DataTypes.STRING(200),
    spouse_id_no: sequelize_1.DataTypes.STRING(50),
    occupation: sequelize_1.DataTypes.STRING(150),
    workplace: sequelize_1.DataTypes.STRING(200),
    monthly_income: money(),
    monthly_expense: money(),
    credit_limit: { ...money(), comment: "ວົງເງິນສູງສຸດ (0 = ບໍ່ຈຳກັດ)" },
    risk_level: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1, comment: "1 ຕ່ຳ, 2 ກາງ, 3 ສູງ" },
    officer_id: sequelize_1.DataTypes.INTEGER,
    blacklisted: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
    blacklist_reason: sequelize_1.DataTypes.STRING(255),
    photo: sequelize_1.DataTypes.STRING(255),
    note: sequelize_1.DataTypes.STRING(255),
    status: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    created_by: sequelize_1.DataTypes.INTEGER,
    ...stamps,
}, { sequelize: database_1.default, modelName: "LoanCustomer", tableName: "tbl_loan_customer", timestamps: true });
/** 2. ຜະລິດຕະພັນສິນເຊື່ອ — ເງື່ອນໄຂຕັ້ງຕົ້ນທີ່ດຶງມາໃສ່ຄຳຮ້ອງ / ສັນຍາ */
class LoanProduct extends sequelize_1.Model {
}
exports.LoanProduct = LoanProduct;
LoanProduct.init({
    _uuid: { type: sequelize_1.DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    product_code: { type: sequelize_1.DataTypes.STRING(30), allowNull: false },
    name_la: { type: sequelize_1.DataTypes.STRING(150), allowNull: false },
    name_en: sequelize_1.DataTypes.STRING(150),
    product_kind: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1, comment: "1 ເງິນກູ້ເງິນສົດ, 2 ຂາຍຜ່ອນ/ເຊົ່າຊື້, 3 ຈຳນຳ/ຄ້ຳດ້ວຍຄຳ" },
    borrower_type: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 3, comment: "1 ບຸກຄົນ, 2 ນິຕິບຸກຄົນ, 3 ທັງສອງ" },
    currency_id: sequelize_1.DataTypes.INTEGER,
    min_amount: money(),
    max_amount: money(),
    min_term: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    max_term: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, defaultValue: 12 },
    annual_rate: rate(),
    method: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    day_basis: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    frequency_months: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    /** ເພີ່ມຈາກ SQL: ຈ່າຍທຸກຈັກມື້ (7, 14, 1) — null = ເປັນເດືອນ */
    frequency_days: sequelize_1.DataTypes.INTEGER,
    upfront_fee_rate: rate(),
    upfront_fee_fixed: money(),
    penalty_rate: rate(),
    penalty_base: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    grace_days: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    prepayment_fee_rate: rate(),
    require_guarantor: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
    require_collateral: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
    max_ltv: { type: sequelize_1.DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    /** ເພີ່ມຈາກ SQL: ຍອດຜ່ອນຕໍ່ເດືອນ ÷ ລາຍຮັບຕໍ່ເດືອນ ສູງສຸດ (%) — 0 = ບໍ່ກວດ */
    max_debt_ratio: { type: sequelize_1.DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    approval_levels: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    loan_account_id: sequelize_1.DataTypes.INTEGER,
    interest_account_id: sequelize_1.DataTypes.INTEGER,
    fee_account_id: sequelize_1.DataTypes.INTEGER,
    penalty_account_id: sequelize_1.DataTypes.INTEGER,
    note: sequelize_1.DataTypes.STRING(255),
    status: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    created_by: sequelize_1.DataTypes.INTEGER,
    ...stamps,
}, { sequelize: database_1.default, modelName: "LoanProduct", tableName: "tbl_loan_product", timestamps: true });
/** 3. ຄຳຮ້ອງຂໍກູ້ — status 1 ຮ່າງ, 2 ລໍຖ້າພິຈາລະນາ, 3 ອະນຸມັດ, 4 ປະຕິເສດ, 5 ປ່ອຍກູ້ແລ້ວ (loan_id), 6 ຍົກເລີກ */
class LoanApplication extends sequelize_1.Model {
}
exports.LoanApplication = LoanApplication;
LoanApplication.init({
    _uuid: { type: sequelize_1.DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    application_no: { type: sequelize_1.DataTypes.STRING(40), allowNull: false },
    apply_date: { type: sequelize_1.DataTypes.DATEONLY, allowNull: false },
    customer_id: { type: sequelize_1.DataTypes.INTEGER, allowNull: false },
    product_id: { type: sequelize_1.DataTypes.INTEGER, allowNull: false },
    officer_id: sequelize_1.DataTypes.INTEGER,
    currency_id: sequelize_1.DataTypes.INTEGER,
    requested_amount: money(),
    requested_term: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, defaultValue: 12 },
    annual_rate: rate(),
    method: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    frequency_months: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    frequency_days: sequelize_1.DataTypes.INTEGER,
    purpose: sequelize_1.DataTypes.STRING(255),
    repayment_source: sequelize_1.DataTypes.STRING(255),
    item_description: sequelize_1.DataTypes.STRING(255),
    item_price: money(),
    down_payment: money(),
    debt_ratio: sequelize_1.DataTypes.DECIMAL(9, 4),
    approved_amount: sequelize_1.DataTypes.DECIMAL(18, 2),
    approved_term: sequelize_1.DataTypes.INTEGER,
    approved_rate: sequelize_1.DataTypes.DECIMAL(9, 4),
    approval_level: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
    status: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    reject_reason: sequelize_1.DataTypes.STRING(255),
    loan_id: sequelize_1.DataTypes.INTEGER,
    note: sequelize_1.DataTypes.STRING(255),
    created_by: sequelize_1.DataTypes.INTEGER,
    ...stamps,
}, { sequelize: database_1.default, modelName: "LoanApplication", tableName: "tbl_loan_application", timestamps: true });
/** 4. ປະຫວັດການອະນຸມັດ — decision 1 ອະນຸມັດ, 2 ປະຕິເສດ, 3 ສົ່ງກັບໃຫ້ແກ້ໄຂ */
class LoanApproval extends sequelize_1.Model {
}
exports.LoanApproval = LoanApproval;
LoanApproval.init({
    _uuid: { type: sequelize_1.DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    application_id: { type: sequelize_1.DataTypes.INTEGER, allowNull: false },
    level: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    approver_id: { type: sequelize_1.DataTypes.INTEGER, allowNull: false },
    decision: { type: sequelize_1.DataTypes.TINYINT, allowNull: false },
    approved_amount: sequelize_1.DataTypes.DECIMAL(18, 2),
    approved_term: sequelize_1.DataTypes.INTEGER,
    approved_rate: sequelize_1.DataTypes.DECIMAL(9, 4),
    comment: sequelize_1.DataTypes.STRING(500),
    decided_at: { type: sequelize_1.DataTypes.DATE, allowNull: false, defaultValue: sequelize_1.DataTypes.NOW },
}, { sequelize: database_1.default, modelName: "LoanApproval", tableName: "tbl_loan_approval", timestamps: false });
/** 5. ຜູ້ຄ້ຳປະກັນ — ຜູກກັບຄຳຮ້ອງ ແລະ / ຫຼື ສັນຍາ */
class LoanGuarantor extends sequelize_1.Model {
}
exports.LoanGuarantor = LoanGuarantor;
LoanGuarantor.init({
    _uuid: { type: sequelize_1.DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    application_id: sequelize_1.DataTypes.INTEGER,
    loan_id: sequelize_1.DataTypes.INTEGER,
    customer_id: sequelize_1.DataTypes.INTEGER,
    full_name: { type: sequelize_1.DataTypes.STRING(200), allowNull: false },
    relationship: sequelize_1.DataTypes.STRING(100),
    id_type: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    id_no: sequelize_1.DataTypes.STRING(50),
    phone: sequelize_1.DataTypes.STRING(50),
    address: sequelize_1.DataTypes.STRING(255),
    occupation: sequelize_1.DataTypes.STRING(150),
    monthly_income: money(),
    guarantee_amount: money(),
    note: sequelize_1.DataTypes.STRING(255),
    status: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    ...stamps,
}, { sequelize: database_1.default, modelName: "LoanGuarantor", tableName: "tbl_loan_guarantor", timestamps: true });
/** 6. ຫຼັກຊັບຄ້ຳປະກັນ — collateral_type 1 ດິນ, 2 ເຮືອນ, 3 ລົດ, 4 ຄຳ, 5 ເງິນຝາກ, 6 ເຄື່ອງຈັກ, 9 ອື່ນໆ; status 1 ຖືຢູ່, 2 ສົ່ງຄືນ, 3 ຍຶດ */
class LoanCollateral extends sequelize_1.Model {
}
exports.LoanCollateral = LoanCollateral;
LoanCollateral.init({
    _uuid: { type: sequelize_1.DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    collateral_code: sequelize_1.DataTypes.STRING(30),
    application_id: sequelize_1.DataTypes.INTEGER,
    loan_id: sequelize_1.DataTypes.INTEGER,
    customer_id: sequelize_1.DataTypes.INTEGER,
    collateral_type: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    description: { type: sequelize_1.DataTypes.STRING(255), allowNull: false },
    document_no: sequelize_1.DataTypes.STRING(100),
    owner_name: sequelize_1.DataTypes.STRING(200),
    location: sequelize_1.DataTypes.STRING(255),
    market_value: money(),
    appraised_value: money(),
    appraisal_date: sequelize_1.DataTypes.DATEONLY,
    appraiser: sequelize_1.DataTypes.STRING(150),
    insurance_expiry: sequelize_1.DataTypes.DATEONLY,
    storage: sequelize_1.DataTypes.STRING(150),
    received_date: sequelize_1.DataTypes.DATEONLY,
    returned_date: sequelize_1.DataTypes.DATEONLY,
    status: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    note: sequelize_1.DataTypes.STRING(255),
    ...stamps,
}, { sequelize: database_1.default, modelName: "LoanCollateral", tableName: "tbl_loan_collateral", timestamps: true });
/** 7. ເອກະສານແນບ — owner_type: customer, application, loan, collateral, guarantor */
class LoanDocument extends sequelize_1.Model {
}
exports.LoanDocument = LoanDocument;
LoanDocument.init({
    _uuid: { type: sequelize_1.DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    owner_type: { type: sequelize_1.DataTypes.STRING(20), allowNull: false },
    owner_id: { type: sequelize_1.DataTypes.INTEGER, allowNull: false },
    doc_type: sequelize_1.DataTypes.STRING(50),
    title: sequelize_1.DataTypes.STRING(200),
    file_path: { type: sequelize_1.DataTypes.STRING(255), allowNull: false },
    file_name: sequelize_1.DataTypes.STRING(200),
    mime: sequelize_1.DataTypes.STRING(100),
    size: sequelize_1.DataTypes.INTEGER,
    expiry_date: sequelize_1.DataTypes.DATEONLY,
    uploaded_by: sequelize_1.DataTypes.INTEGER,
    createdAt: { type: sequelize_1.DataTypes.DATE, allowNull: false, defaultValue: sequelize_1.DataTypes.NOW },
}, { sequelize: database_1.default, modelName: "LoanDocument", tableName: "tbl_loan_document", timestamps: false });
/** 8. ຄ່າປັບຊ້າ — ຕໍ່ງວດທີ່ເລີຍກຳນົດ; status 1 ຄ້າງ, 2 ຈ່າຍແລ້ວ, 3 ຍົກເວັ້ນ */
class LoanPenalty extends sequelize_1.Model {
}
exports.LoanPenalty = LoanPenalty;
LoanPenalty.init({
    _uuid: { type: sequelize_1.DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    loan_id: { type: sequelize_1.DataTypes.INTEGER, allowNull: false },
    installment_no: { type: sequelize_1.DataTypes.INTEGER, allowNull: false },
    calc_date: { type: sequelize_1.DataTypes.DATEONLY, allowNull: false },
    days_late: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    base_amount: money(),
    rate: rate(),
    amount: money(),
    waived_amount: money(),
    waived_by: sequelize_1.DataTypes.INTEGER,
    waive_reason: sequelize_1.DataTypes.STRING(255),
    payment_id: sequelize_1.DataTypes.INTEGER,
    status: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    ...stamps,
}, { sequelize: database_1.default, modelName: "LoanPenalty", tableName: "tbl_loan_penalty", timestamps: true });
/** 9. ເກນຈັດຊັ້ນໜີ້ ແລະ ອັດຕາເງິນແຮ (ຕັ້ງຄ່າໄດ້) */
class LoanClassRule extends sequelize_1.Model {
}
exports.LoanClassRule = LoanClassRule;
LoanClassRule.init({
    _uuid: { type: sequelize_1.DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    loan_class: { type: sequelize_1.DataTypes.TINYINT, allowNull: false },
    class_code: { type: sequelize_1.DataTypes.CHAR(1), allowNull: false },
    name_la: { type: sequelize_1.DataTypes.STRING(100), allowNull: false },
    name_en: sequelize_1.DataTypes.STRING(100),
    min_days: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    max_days: sequelize_1.DataTypes.INTEGER,
    provision_rate: { type: sequelize_1.DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    is_npl: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
    ...stamps,
}, { sequelize: database_1.default, modelName: "LoanClassRule", tableName: "tbl_loan_class_rule", timestamps: true });
/** 10. ຜົນຈັດຊັ້ນໜີ້ ແລະ ເງິນແຮ ທ້າຍເດືອນ — ແຖວລະສັນຍາຕໍ່ເດືອນ */
class LoanClassification extends sequelize_1.Model {
}
exports.LoanClassification = LoanClassification;
LoanClassification.init({
    _uuid: { type: sequelize_1.DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    period: { type: sequelize_1.DataTypes.CHAR(7), allowNull: false },
    loan_id: { type: sequelize_1.DataTypes.INTEGER, allowNull: false },
    days_overdue: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    outstanding: money(),
    overdue_principal: money(),
    overdue_interest: money(),
    loan_class: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    provision_rate: { type: sequelize_1.DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    provision_amount: money(),
    entry_id: sequelize_1.DataTypes.INTEGER,
    createdAt: { type: sequelize_1.DataTypes.DATE, allowNull: false, defaultValue: sequelize_1.DataTypes.NOW },
}, { sequelize: database_1.default, modelName: "LoanClassification", tableName: "tbl_loan_classification", timestamps: false });
/** 11. ການປັບໂຄງສ້າງໜີ້ — ເກັບເງື່ອນໄຂເກົ່າ ແລະ ໃໝ່; status 1 ໃຊ້ງານ, 2 ຍົກເລີກ */
class LoanRestructure extends sequelize_1.Model {
}
exports.LoanRestructure = LoanRestructure;
LoanRestructure.init({
    _uuid: { type: sequelize_1.DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    loan_id: { type: sequelize_1.DataTypes.INTEGER, allowNull: false },
    new_loan_id: sequelize_1.DataTypes.INTEGER,
    restructure_date: { type: sequelize_1.DataTypes.DATEONLY, allowNull: false },
    reason: { type: sequelize_1.DataTypes.STRING(255), allowNull: false },
    old_outstanding: money(),
    old_rate: rate(),
    old_term: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    capitalized_interest: money(),
    new_rate: rate(),
    new_term: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    new_first_due_date: sequelize_1.DataTypes.DATEONLY,
    approved_by: sequelize_1.DataTypes.INTEGER,
    note: sequelize_1.DataTypes.STRING(255),
    status: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    created_by: sequelize_1.DataTypes.INTEGER,
    ...stamps,
}, { sequelize: database_1.default, modelName: "LoanRestructure", tableName: "tbl_loan_restructure", timestamps: true });
/** 12. ຕັດໜີ້ສູນ — ເກັບຄືນໄດ້ພາຍຫຼັງ = recovered_amount; status 1 ຕັດແລ້ວ, 2 ຍົກເລີກ */
class LoanWriteoff extends sequelize_1.Model {
}
exports.LoanWriteoff = LoanWriteoff;
LoanWriteoff.init({
    _uuid: { type: sequelize_1.DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    loan_id: { type: sequelize_1.DataTypes.INTEGER, allowNull: false },
    writeoff_date: { type: sequelize_1.DataTypes.DATEONLY, allowNull: false },
    principal: money(),
    interest: money(),
    penalty: money(),
    reason: { type: sequelize_1.DataTypes.STRING(255), allowNull: false },
    approved_by: sequelize_1.DataTypes.INTEGER,
    entry_id: sequelize_1.DataTypes.INTEGER,
    recovered_amount: money(),
    status: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    created_by: sequelize_1.DataTypes.INTEGER,
    ...stamps,
}, { sequelize: database_1.default, modelName: "LoanWriteoff", tableName: "tbl_loan_writeoff", timestamps: true });
/** 13. ການຕິດຕາມທວງໜີ້ — method 1 ໂທ, 2 SMS, 3 ລົງຢ້ຽມ, 4 ໜັງສືທວງໜີ້, 5 ດຳເນີນຄະດີ; result 1 ນັດຈ່າຍ, 2 ຕິດຕໍ່ບໍ່ໄດ້, 3 ປະຕິເສດ, 4 ຈ່າຍແລ້ວ */
class LoanCollection extends sequelize_1.Model {
}
exports.LoanCollection = LoanCollection;
LoanCollection.init({
    _uuid: { type: sequelize_1.DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    loan_id: { type: sequelize_1.DataTypes.INTEGER, allowNull: false },
    contact_date: { type: sequelize_1.DataTypes.DATE, allowNull: false },
    method: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    officer_id: sequelize_1.DataTypes.INTEGER,
    result: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    promise_date: sequelize_1.DataTypes.DATEONLY,
    promise_amount: money(),
    note: sequelize_1.DataTypes.STRING(500),
    created_by: sequelize_1.DataTypes.INTEGER,
    ...stamps,
}, { sequelize: database_1.default, modelName: "LoanCollection", tableName: "tbl_loan_collection", timestamps: true });
/** 14. ປະຫວັດການແຈ້ງເຕືອນ (SMS / push) — notice_type 1 ກ່ອນຄົບກຳນົດ, 2 ເລີຍກຳນົດ, 3 ໃບແຈ້ງໜີ້; channel 1 SMS, 2 push, 3 ພິມ */
class LoanNotice extends sequelize_1.Model {
}
exports.LoanNotice = LoanNotice;
LoanNotice.init({
    _uuid: { type: sequelize_1.DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    loan_id: { type: sequelize_1.DataTypes.INTEGER, allowNull: false },
    installment_no: sequelize_1.DataTypes.INTEGER,
    notice_type: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    channel: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    phone: sequelize_1.DataTypes.STRING(50),
    message: sequelize_1.DataTypes.TEXT,
    sent_at: sequelize_1.DataTypes.DATE,
    status: { type: sequelize_1.DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    error: sequelize_1.DataTypes.STRING(255),
    createdAt: { type: sequelize_1.DataTypes.DATE, allowNull: false, defaultValue: sequelize_1.DataTypes.NOW },
}, { sequelize: database_1.default, modelName: "LoanNotice", tableName: "tbl_loan_notice", timestamps: false });
LoanCustomer.belongsTo(district_1.default, { foreignKey: "district_id", as: "district" });
[
    LoanCustomer, LoanProduct, LoanApplication, LoanApproval, LoanGuarantor, LoanCollateral, LoanDocument, LoanPenalty,
    LoanClassRule, LoanClassification, LoanRestructure, LoanWriteoff, LoanCollection, LoanNotice,
].forEach((model) => (0, autoSync_1.autoSync)(model));
