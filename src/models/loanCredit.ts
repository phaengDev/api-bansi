import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";
import District from "./district";

/**
 * ລະບົບສິນເຊື່ອ — ຕາຕະລາງຕາມ sql/credit_system.sql (ຊື່ ແລະ ຖັນດຽວກັນ; autoSync ສ້າງໃຫ້ ບໍ່ຕ້ອງລັນ SQL ເອງ).
 * ສັນຍາ = tbl_loan (direction 2) ທີ່ສ້າງຕອນປ່ອຍກູ້ຈາກຄຳຮ້ອງ — ຕາຕະລາງຜ່ອນ, ການຊຳລະ, ດອກເບ້ຍຄ້າງ ໃຊ້ຂອງ tbl_loan_*.
 * ເພີ່ມຈາກ SQL: frequency_days (ຈ່າຍທຸກອາທິດ / 2 ອາທິດ / ທຸກມື້), tbl_loan_product.max_debt_ratio (ເພດານໜີ້ຕໍ່ລາຍຮັບ)
 */

const money = () => ({ type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0 });
const rate = () => ({ type: DataTypes.DECIMAL(9, 4), allowNull: false, defaultValue: 0 });
const stamps = {
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
};

/** 1. ລູກຄ້າສິນເຊື່ອ (KYC) — ບຸກຄົນ ຫຼື ນິຕິບຸກຄົນ */
export class LoanCustomer extends Model {
  declare _uuid: number;
  declare customer_code: string;
  declare customer_type: number;
  declare partner_id: number | null;
  declare full_name: string;
  declare name_en: string | null;
  declare gender: number | null;
  declare birth_date: string | null;
  declare nationality: string | null;
  declare id_type: number;
  declare id_no: string | null;
  declare id_issue_date: string | null;
  declare id_expiry_date: string | null;
  declare tax_number: string | null;
  declare phone: string | null;
  declare phone2: string | null;
  declare email: string | null;
  declare village: string | null;
  declare district_id: number | null;
  declare province_id: number | null;
  declare address: string | null;
  declare marital_status: number | null;
  declare spouse_name: string | null;
  declare spouse_id_no: string | null;
  declare occupation: string | null;
  declare workplace: string | null;
  declare monthly_income: string;
  declare monthly_expense: string;
  declare credit_limit: string;
  declare risk_level: number;
  declare officer_id: number | null;
  declare blacklisted: number;
  declare blacklist_reason: string | null;
  declare photo: string | null;
  declare note: string | null;
  declare status: number;
  declare created_by: number | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

LoanCustomer.init(
  {
    _uuid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    customer_code: { type: DataTypes.STRING(30), allowNull: false },
    customer_type: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1, comment: "1 ບຸກຄົນ, 2 ນິຕິບຸກຄົນ" },
    partner_id: DataTypes.INTEGER,
    full_name: { type: DataTypes.STRING(200), allowNull: false },
    name_en: DataTypes.STRING(200),
    gender: DataTypes.TINYINT,
    birth_date: DataTypes.DATEONLY,
    nationality: DataTypes.STRING(50),
    id_type: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1, comment: "1 ບັດປະຈຳຕົວ, 2 ສຳມະໂນຄົວ, 3 ໜັງສືຜ່ານແດນ, 4 ທະບຽນວິສາຫະກິດ" },
    id_no: DataTypes.STRING(50),
    id_issue_date: DataTypes.DATEONLY,
    id_expiry_date: DataTypes.DATEONLY,
    tax_number: DataTypes.STRING(50),
    phone: DataTypes.STRING(50),
    phone2: DataTypes.STRING(50),
    email: DataTypes.STRING(150),
    village: DataTypes.STRING(150),
    district_id: DataTypes.INTEGER,
    province_id: DataTypes.INTEGER,
    address: DataTypes.STRING(255),
    marital_status: { type: DataTypes.TINYINT, comment: "1 ໂສດ, 2 ແຕ່ງງານ, 3 ຢ່າຮ້າງ, 4 ໝ້າຍ" },
    spouse_name: DataTypes.STRING(200),
    spouse_id_no: DataTypes.STRING(50),
    occupation: DataTypes.STRING(150),
    workplace: DataTypes.STRING(200),
    monthly_income: money(),
    monthly_expense: money(),
    credit_limit: { ...money(), comment: "ວົງເງິນສູງສຸດ (0 = ບໍ່ຈຳກັດ)" },
    risk_level: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1, comment: "1 ຕ່ຳ, 2 ກາງ, 3 ສູງ" },
    officer_id: DataTypes.INTEGER,
    blacklisted: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
    blacklist_reason: DataTypes.STRING(255),
    photo: DataTypes.STRING(255),
    note: DataTypes.STRING(255),
    status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    created_by: DataTypes.INTEGER,
    ...stamps,
  },
  { sequelize, modelName: "LoanCustomer", tableName: "tbl_loan_customer", timestamps: true }
);

/** 2. ຜະລິດຕະພັນສິນເຊື່ອ — ເງື່ອນໄຂຕັ້ງຕົ້ນທີ່ດຶງມາໃສ່ຄຳຮ້ອງ / ສັນຍາ */
export class LoanProduct extends Model {
  declare _uuid: number;
  declare product_code: string;
  declare name_la: string;
  declare name_en: string | null;
  declare product_kind: number;
  declare borrower_type: number;
  declare currency_id: number | null;
  declare min_amount: string;
  declare max_amount: string;
  declare min_term: number;
  declare max_term: number;
  declare annual_rate: string;
  declare method: number;
  declare day_basis: number;
  declare frequency_months: number;
  declare frequency_days: number | null;
  declare upfront_fee_rate: string;
  declare upfront_fee_fixed: string;
  declare penalty_rate: string;
  declare penalty_base: number;
  declare grace_days: number;
  declare prepayment_fee_rate: string;
  declare require_guarantor: number;
  declare require_collateral: number;
  declare max_ltv: string;
  declare max_debt_ratio: string;
  declare approval_levels: number;
  declare loan_account_id: number | null;
  declare interest_account_id: number | null;
  declare fee_account_id: number | null;
  declare penalty_account_id: number | null;
  declare note: string | null;
  declare status: number;
  declare created_by: number | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

LoanProduct.init(
  {
    _uuid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    product_code: { type: DataTypes.STRING(30), allowNull: false },
    name_la: { type: DataTypes.STRING(150), allowNull: false },
    name_en: DataTypes.STRING(150),
    product_kind: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1, comment: "1 ເງິນກູ້ເງິນສົດ, 2 ຂາຍຜ່ອນ/ເຊົ່າຊື້, 3 ຈຳນຳ/ຄ້ຳດ້ວຍຄຳ" },
    borrower_type: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 3, comment: "1 ບຸກຄົນ, 2 ນິຕິບຸກຄົນ, 3 ທັງສອງ" },
    currency_id: DataTypes.INTEGER,
    min_amount: money(),
    max_amount: money(),
    min_term: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    max_term: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 12 },
    annual_rate: rate(),
    method: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    day_basis: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    frequency_months: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    /** ເພີ່ມຈາກ SQL: ຈ່າຍທຸກຈັກມື້ (7, 14, 1) — null = ເປັນເດືອນ */
    frequency_days: DataTypes.INTEGER,
    upfront_fee_rate: rate(),
    upfront_fee_fixed: money(),
    penalty_rate: rate(),
    penalty_base: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    grace_days: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    prepayment_fee_rate: rate(),
    require_guarantor: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
    require_collateral: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
    max_ltv: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    /** ເພີ່ມຈາກ SQL: ຍອດຜ່ອນຕໍ່ເດືອນ ÷ ລາຍຮັບຕໍ່ເດືອນ ສູງສຸດ (%) — 0 = ບໍ່ກວດ */
    max_debt_ratio: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    approval_levels: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    loan_account_id: DataTypes.INTEGER,
    interest_account_id: DataTypes.INTEGER,
    fee_account_id: DataTypes.INTEGER,
    penalty_account_id: DataTypes.INTEGER,
    note: DataTypes.STRING(255),
    status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    created_by: DataTypes.INTEGER,
    ...stamps,
  },
  { sequelize, modelName: "LoanProduct", tableName: "tbl_loan_product", timestamps: true }
);

/** 3. ຄຳຮ້ອງຂໍກູ້ — status 1 ຮ່າງ, 2 ລໍຖ້າພິຈາລະນາ, 3 ອະນຸມັດ, 4 ປະຕິເສດ, 5 ປ່ອຍກູ້ແລ້ວ (loan_id), 6 ຍົກເລີກ */
export class LoanApplication extends Model {
  declare _uuid: number;
  declare application_no: string;
  declare apply_date: string;
  declare customer_id: number;
  declare product_id: number;
  declare officer_id: number | null;
  declare currency_id: number | null;
  declare requested_amount: string;
  declare requested_term: number;
  declare annual_rate: string;
  declare method: number;
  declare frequency_months: number;
  declare frequency_days: number | null;
  declare purpose: string | null;
  declare repayment_source: string | null;
  declare item_description: string | null;
  declare item_price: string;
  declare down_payment: string;
  declare debt_ratio: string | null;
  declare approved_amount: string | null;
  declare approved_term: number | null;
  declare approved_rate: string | null;
  declare approval_level: number;
  declare status: number;
  declare reject_reason: string | null;
  declare loan_id: number | null;
  declare note: string | null;
  declare created_by: number | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

LoanApplication.init(
  {
    _uuid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    application_no: { type: DataTypes.STRING(40), allowNull: false },
    apply_date: { type: DataTypes.DATEONLY, allowNull: false },
    customer_id: { type: DataTypes.INTEGER, allowNull: false },
    product_id: { type: DataTypes.INTEGER, allowNull: false },
    officer_id: DataTypes.INTEGER,
    currency_id: DataTypes.INTEGER,
    requested_amount: money(),
    requested_term: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 12 },
    annual_rate: rate(),
    method: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    frequency_months: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    frequency_days: DataTypes.INTEGER,
    purpose: DataTypes.STRING(255),
    repayment_source: DataTypes.STRING(255),
    item_description: DataTypes.STRING(255),
    item_price: money(),
    down_payment: money(),
    debt_ratio: DataTypes.DECIMAL(9, 4),
    approved_amount: DataTypes.DECIMAL(18, 2),
    approved_term: DataTypes.INTEGER,
    approved_rate: DataTypes.DECIMAL(9, 4),
    approval_level: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
    status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    reject_reason: DataTypes.STRING(255),
    loan_id: DataTypes.INTEGER,
    note: DataTypes.STRING(255),
    created_by: DataTypes.INTEGER,
    ...stamps,
  },
  { sequelize, modelName: "LoanApplication", tableName: "tbl_loan_application", timestamps: true }
);

/** 4. ປະຫວັດການອະນຸມັດ — decision 1 ອະນຸມັດ, 2 ປະຕິເສດ, 3 ສົ່ງກັບໃຫ້ແກ້ໄຂ */
export class LoanApproval extends Model {
  declare _uuid: number;
  declare application_id: number;
  declare level: number;
  declare approver_id: number;
  declare decision: number;
  declare approved_amount: string | null;
  declare approved_term: number | null;
  declare approved_rate: string | null;
  declare comment: string | null;
  declare decided_at: Date;
}

LoanApproval.init(
  {
    _uuid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    application_id: { type: DataTypes.INTEGER, allowNull: false },
    level: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    approver_id: { type: DataTypes.INTEGER, allowNull: false },
    decision: { type: DataTypes.TINYINT, allowNull: false },
    approved_amount: DataTypes.DECIMAL(18, 2),
    approved_term: DataTypes.INTEGER,
    approved_rate: DataTypes.DECIMAL(9, 4),
    comment: DataTypes.STRING(500),
    decided_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { sequelize, modelName: "LoanApproval", tableName: "tbl_loan_approval", timestamps: false }
);

/** 5. ຜູ້ຄ້ຳປະກັນ — ຜູກກັບຄຳຮ້ອງ ແລະ / ຫຼື ສັນຍາ */
export class LoanGuarantor extends Model {
  declare _uuid: number;
  declare application_id: number | null;
  declare loan_id: number | null;
  declare customer_id: number | null;
  declare full_name: string;
  declare relationship: string | null;
  declare id_type: number;
  declare id_no: string | null;
  declare phone: string | null;
  declare address: string | null;
  declare occupation: string | null;
  declare monthly_income: string;
  declare guarantee_amount: string;
  declare note: string | null;
  declare status: number;
}

LoanGuarantor.init(
  {
    _uuid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    application_id: DataTypes.INTEGER,
    loan_id: DataTypes.INTEGER,
    customer_id: DataTypes.INTEGER,
    full_name: { type: DataTypes.STRING(200), allowNull: false },
    relationship: DataTypes.STRING(100),
    id_type: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    id_no: DataTypes.STRING(50),
    phone: DataTypes.STRING(50),
    address: DataTypes.STRING(255),
    occupation: DataTypes.STRING(150),
    monthly_income: money(),
    guarantee_amount: money(),
    note: DataTypes.STRING(255),
    status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    ...stamps,
  },
  { sequelize, modelName: "LoanGuarantor", tableName: "tbl_loan_guarantor", timestamps: true }
);

/** 6. ຫຼັກຊັບຄ້ຳປະກັນ — collateral_type 1 ດິນ, 2 ເຮືອນ, 3 ລົດ, 4 ຄຳ, 5 ເງິນຝາກ, 6 ເຄື່ອງຈັກ, 9 ອື່ນໆ; status 1 ຖືຢູ່, 2 ສົ່ງຄືນ, 3 ຍຶດ */
export class LoanCollateral extends Model {
  declare _uuid: number;
  declare collateral_code: string | null;
  declare application_id: number | null;
  declare loan_id: number | null;
  declare customer_id: number | null;
  declare collateral_type: number;
  declare description: string;
  declare document_no: string | null;
  declare owner_name: string | null;
  declare location: string | null;
  declare market_value: string;
  declare appraised_value: string;
  declare appraisal_date: string | null;
  declare appraiser: string | null;
  declare insurance_expiry: string | null;
  declare storage: string | null;
  declare received_date: string | null;
  declare returned_date: string | null;
  declare status: number;
  declare note: string | null;
}

LoanCollateral.init(
  {
    _uuid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    collateral_code: DataTypes.STRING(30),
    application_id: DataTypes.INTEGER,
    loan_id: DataTypes.INTEGER,
    customer_id: DataTypes.INTEGER,
    collateral_type: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    description: { type: DataTypes.STRING(255), allowNull: false },
    document_no: DataTypes.STRING(100),
    owner_name: DataTypes.STRING(200),
    location: DataTypes.STRING(255),
    market_value: money(),
    appraised_value: money(),
    appraisal_date: DataTypes.DATEONLY,
    appraiser: DataTypes.STRING(150),
    insurance_expiry: DataTypes.DATEONLY,
    storage: DataTypes.STRING(150),
    received_date: DataTypes.DATEONLY,
    returned_date: DataTypes.DATEONLY,
    status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    note: DataTypes.STRING(255),
    ...stamps,
  },
  { sequelize, modelName: "LoanCollateral", tableName: "tbl_loan_collateral", timestamps: true }
);

/** 7. ເອກະສານແນບ — owner_type: customer, application, loan, collateral, guarantor */
export class LoanDocument extends Model {
  declare _uuid: number;
  declare owner_type: string;
  declare owner_id: number;
  declare doc_type: string | null;
  declare title: string | null;
  declare file_path: string;
  declare file_name: string | null;
  declare mime: string | null;
  declare size: number | null;
  declare expiry_date: string | null;
  declare uploaded_by: number | null;
  declare createdAt: Date;
}

LoanDocument.init(
  {
    _uuid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    owner_type: { type: DataTypes.STRING(20), allowNull: false },
    owner_id: { type: DataTypes.INTEGER, allowNull: false },
    doc_type: DataTypes.STRING(50),
    title: DataTypes.STRING(200),
    file_path: { type: DataTypes.STRING(255), allowNull: false },
    file_name: DataTypes.STRING(200),
    mime: DataTypes.STRING(100),
    size: DataTypes.INTEGER,
    expiry_date: DataTypes.DATEONLY,
    uploaded_by: DataTypes.INTEGER,
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { sequelize, modelName: "LoanDocument", tableName: "tbl_loan_document", timestamps: false }
);

/** 8. ຄ່າປັບຊ້າ — ຕໍ່ງວດທີ່ເລີຍກຳນົດ; status 1 ຄ້າງ, 2 ຈ່າຍແລ້ວ, 3 ຍົກເວັ້ນ */
export class LoanPenalty extends Model {
  declare _uuid: number;
  declare loan_id: number;
  declare installment_no: number;
  declare calc_date: string;
  declare days_late: number;
  declare base_amount: string;
  declare rate: string;
  declare amount: string;
  declare waived_amount: string;
  declare waived_by: number | null;
  declare waive_reason: string | null;
  declare payment_id: number | null;
  declare status: number;
}

LoanPenalty.init(
  {
    _uuid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    loan_id: { type: DataTypes.INTEGER, allowNull: false },
    installment_no: { type: DataTypes.INTEGER, allowNull: false },
    calc_date: { type: DataTypes.DATEONLY, allowNull: false },
    days_late: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    base_amount: money(),
    rate: rate(),
    amount: money(),
    waived_amount: money(),
    waived_by: DataTypes.INTEGER,
    waive_reason: DataTypes.STRING(255),
    payment_id: DataTypes.INTEGER,
    status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    ...stamps,
  },
  { sequelize, modelName: "LoanPenalty", tableName: "tbl_loan_penalty", timestamps: true }
);

/** 9. ເກນຈັດຊັ້ນໜີ້ ແລະ ອັດຕາເງິນແຮ (ຕັ້ງຄ່າໄດ້) */
export class LoanClassRule extends Model {
  declare _uuid: number;
  declare loan_class: number;
  declare class_code: string;
  declare name_la: string;
  declare name_en: string | null;
  declare min_days: number;
  declare max_days: number | null;
  declare provision_rate: string;
  declare is_npl: number;
}

LoanClassRule.init(
  {
    _uuid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    loan_class: { type: DataTypes.TINYINT, allowNull: false },
    class_code: { type: DataTypes.CHAR(1), allowNull: false },
    name_la: { type: DataTypes.STRING(100), allowNull: false },
    name_en: DataTypes.STRING(100),
    min_days: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    max_days: DataTypes.INTEGER,
    provision_rate: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    is_npl: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
    ...stamps,
  },
  { sequelize, modelName: "LoanClassRule", tableName: "tbl_loan_class_rule", timestamps: true }
);

/** 10. ຜົນຈັດຊັ້ນໜີ້ ແລະ ເງິນແຮ ທ້າຍເດືອນ — ແຖວລະສັນຍາຕໍ່ເດືອນ */
export class LoanClassification extends Model {
  declare _uuid: number;
  declare period: string;
  declare loan_id: number;
  declare days_overdue: number;
  declare outstanding: string;
  declare overdue_principal: string;
  declare overdue_interest: string;
  declare loan_class: number;
  declare provision_rate: string;
  declare provision_amount: string;
  declare entry_id: number | null;
  declare createdAt: Date;
}

LoanClassification.init(
  {
    _uuid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    period: { type: DataTypes.CHAR(7), allowNull: false },
    loan_id: { type: DataTypes.INTEGER, allowNull: false },
    days_overdue: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    outstanding: money(),
    overdue_principal: money(),
    overdue_interest: money(),
    loan_class: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    provision_rate: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    provision_amount: money(),
    entry_id: DataTypes.INTEGER,
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { sequelize, modelName: "LoanClassification", tableName: "tbl_loan_classification", timestamps: false }
);

/** 11. ການປັບໂຄງສ້າງໜີ້ — ເກັບເງື່ອນໄຂເກົ່າ ແລະ ໃໝ່; status 1 ໃຊ້ງານ, 2 ຍົກເລີກ */
export class LoanRestructure extends Model {
  declare _uuid: number;
  declare loan_id: number;
  declare new_loan_id: number | null;
  declare restructure_date: string;
  declare reason: string;
  declare old_outstanding: string;
  declare old_rate: string;
  declare old_term: number;
  declare capitalized_interest: string;
  declare new_rate: string;
  declare new_term: number;
  declare new_first_due_date: string | null;
  declare approved_by: number | null;
  declare note: string | null;
  declare status: number;
  declare created_by: number | null;
}

LoanRestructure.init(
  {
    _uuid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    loan_id: { type: DataTypes.INTEGER, allowNull: false },
    new_loan_id: DataTypes.INTEGER,
    restructure_date: { type: DataTypes.DATEONLY, allowNull: false },
    reason: { type: DataTypes.STRING(255), allowNull: false },
    old_outstanding: money(),
    old_rate: rate(),
    old_term: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    capitalized_interest: money(),
    new_rate: rate(),
    new_term: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    new_first_due_date: DataTypes.DATEONLY,
    approved_by: DataTypes.INTEGER,
    note: DataTypes.STRING(255),
    status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    created_by: DataTypes.INTEGER,
    ...stamps,
  },
  { sequelize, modelName: "LoanRestructure", tableName: "tbl_loan_restructure", timestamps: true }
);

/** 12. ຕັດໜີ້ສູນ — ເກັບຄືນໄດ້ພາຍຫຼັງ = recovered_amount; status 1 ຕັດແລ້ວ, 2 ຍົກເລີກ */
export class LoanWriteoff extends Model {
  declare _uuid: number;
  declare loan_id: number;
  declare writeoff_date: string;
  declare principal: string;
  declare interest: string;
  declare penalty: string;
  declare reason: string;
  declare approved_by: number | null;
  declare entry_id: number | null;
  declare recovered_amount: string;
  declare status: number;
  declare created_by: number | null;
}

LoanWriteoff.init(
  {
    _uuid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    loan_id: { type: DataTypes.INTEGER, allowNull: false },
    writeoff_date: { type: DataTypes.DATEONLY, allowNull: false },
    principal: money(),
    interest: money(),
    penalty: money(),
    reason: { type: DataTypes.STRING(255), allowNull: false },
    approved_by: DataTypes.INTEGER,
    entry_id: DataTypes.INTEGER,
    recovered_amount: money(),
    status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    created_by: DataTypes.INTEGER,
    ...stamps,
  },
  { sequelize, modelName: "LoanWriteoff", tableName: "tbl_loan_writeoff", timestamps: true }
);

/** 13. ການຕິດຕາມທວງໜີ້ — method 1 ໂທ, 2 SMS, 3 ລົງຢ້ຽມ, 4 ໜັງສືທວງໜີ້, 5 ດຳເນີນຄະດີ; result 1 ນັດຈ່າຍ, 2 ຕິດຕໍ່ບໍ່ໄດ້, 3 ປະຕິເສດ, 4 ຈ່າຍແລ້ວ */
export class LoanCollection extends Model {
  declare _uuid: number;
  declare loan_id: number;
  declare contact_date: Date;
  declare method: number;
  declare officer_id: number | null;
  declare result: number;
  declare promise_date: string | null;
  declare promise_amount: string;
  declare note: string | null;
  declare created_by: number | null;
}

LoanCollection.init(
  {
    _uuid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    loan_id: { type: DataTypes.INTEGER, allowNull: false },
    contact_date: { type: DataTypes.DATE, allowNull: false },
    method: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    officer_id: DataTypes.INTEGER,
    result: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    promise_date: DataTypes.DATEONLY,
    promise_amount: money(),
    note: DataTypes.STRING(500),
    created_by: DataTypes.INTEGER,
    ...stamps,
  },
  { sequelize, modelName: "LoanCollection", tableName: "tbl_loan_collection", timestamps: true }
);

/** 14. ປະຫວັດການແຈ້ງເຕືອນ (SMS / push) — notice_type 1 ກ່ອນຄົບກຳນົດ, 2 ເລີຍກຳນົດ, 3 ໃບແຈ້ງໜີ້; channel 1 SMS, 2 push, 3 ພິມ */
export class LoanNotice extends Model {
  declare _uuid: number;
  declare loan_id: number;
  declare installment_no: number | null;
  declare notice_type: number;
  declare channel: number;
  declare phone: string | null;
  declare message: string | null;
  declare sent_at: Date | null;
  declare status: number;
  declare error: string | null;
}

LoanNotice.init(
  {
    _uuid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    loan_id: { type: DataTypes.INTEGER, allowNull: false },
    installment_no: DataTypes.INTEGER,
    notice_type: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    channel: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    phone: DataTypes.STRING(50),
    message: DataTypes.TEXT,
    sent_at: DataTypes.DATE,
    status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    error: DataTypes.STRING(255),
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { sequelize, modelName: "LoanNotice", tableName: "tbl_loan_notice", timestamps: false }
);

LoanCustomer.belongsTo(District, { foreignKey: "district_id", as: "district" });

[
  LoanCustomer, LoanProduct, LoanApplication, LoanApproval, LoanGuarantor, LoanCollateral, LoanDocument, LoanPenalty,
  LoanClassRule, LoanClassification, LoanRestructure, LoanWriteoff, LoanCollection, LoanNotice,
].forEach((model) => autoSync(model));
