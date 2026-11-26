import { Request, Response } from "express";
import { Op, Transaction } from "sequelize";
import moment from "moment";
import sequelize from "../../config/database";
import Loan, { LoanAccrual, LoanInstallment, LoanPayment } from "../../models/loan";
import {
  LoanApplication, LoanApproval, LoanClassRule, LoanCollateral, LoanCustomer, LoanGuarantor, LoanProduct,
} from "../../models/loanCredit";
import Users from "../../models/userModel";
import Employee from "../../models/employee";
import { GlError, glReady, roleAccountId, round2 } from "../bansi/glCore";
import { actorOf, toDateOnly } from "../bansi/bansiHelpers";
import { todayLao } from "../bansi/journalHelpers";
import { districtInclude } from "../hr/hrHelpers";
import {
  LENT, applyStart, assertAccount, baseCurrencyId, currencyDecimals, currencyMap, fail, installmentsOf, nextCode, paymentsOf,
  presentLoan, summarize, termsOf, treasuryCurrencyId, undoStart, writeInstallments,
} from "../bansi/loanController";
import { buildSchedule, roundTo, termsError } from "../../utils/loanSchedule";

/**
 * ລະບົບສິນເຊື່ອ (sql/credit_system.sql): ຜະລິດຕະພັນ, ລູກຄ້າ (KYC), ຫຼັກຊັບ, ຄຳຮ້ອງ → ອະນຸມັດ (ຫຼາຍຂັ້ນ, maker-checker) → ປ່ອຍກູ້.
 * ປ່ອຍກູ້ = ສ້າງສັນຍາ tbl_loan (direction 2, CR-000001) ຈາກເງື່ອນໄຂທີ່ອະນຸມັດ → ຕາຕະລາງຜ່ອນ / ການຊຳລະ / ດອກເບ້ຍຄ້າງ / ລົງບັນຊີ
 * ໃຊ້ຂອງ loanController. ລົງບັນຊີປ່ອຍກູ້: ໜີ້ 1180 (ຍອດເຕັມ) / ມີ ເງິນສົດ-ທະນາຄານ (ຍອດຈ່າຍຈິງ) + ມີ 4230 ຄ່າທຳນຽມ
 */

const ACTIVE = 1;
// tbl_loan_application.status
export const APP = { DRAFT: 1, PENDING: 2, APPROVED: 3, REJECTED: 4, DISBURSED: 5, CANCELLED: 6 } as const;
// tbl_loan_approval.decision
const DECISION = { APPROVE: 1, REJECT: 2, RETURN: 3 } as const;
const HELD = 1;
const RETURNED = 2;

const num = (value: unknown) => round2(Number(value) || 0);
const text = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max) || null;
const intOrNull = (value: unknown) => (value === null || value === undefined || value === "" ? null : Math.round(Number(value)) || 0);

/** ໄລຍະຈ່າຍທີ່ໃຊ້ໄດ້: ເປັນເດືອນ (1, 3, 6, 12) ຫຼື ເປັນມື້ (1 ທຸກມື້, 7 ອາທິດ, 14 ສອງອາທິດ) */
const FREQ_MONTHS = [1, 3, 6, 12];
const FREQ_DAYS = [1, 7, 14];

/** ຍອດຜ່ອນຕໍ່ເດືອນຂອງຍອດຕໍ່ງວດ — ໃຊ້ຄິດອັດຕາສ່ວນໜີ້ຕໍ່ລາຍຮັບ */
const monthlyOf = (payment: number, months: number, days: number | null) => (days ? (payment * 30) / days : payment / Math.max(1, months));

/** ລຳດັບເລກທີ ເຊັ່ນ APP-000001 / CUS-000001 / COL-000001 */
const nextNumber = async (model: any, field: string, prefix: string, t?: Transaction) => {
  const rows: any[] = await model.findAll({ attributes: [field], where: { [field]: { [Op.like]: `${prefix}%` } }, raw: true, transaction: t });
  const max = rows.reduce((n, r) => Math.max(n, Number(String(r[field]).slice(prefix.length)) || 0), 0);
  return `${prefix}${String(max + 1).padStart(6, "0")}`;
};

// ================= ຜະລິດຕະພັນ

const presentProduct = (p: LoanProduct) => ({
  ...p.get({ plain: true }),
  min_amount: num(p.min_amount), max_amount: num(p.max_amount), annual_rate: Number(p.annual_rate),
  upfront_fee_rate: Number(p.upfront_fee_rate), upfront_fee_fixed: num(p.upfront_fee_fixed), penalty_rate: Number(p.penalty_rate),
  prepayment_fee_rate: Number(p.prepayment_fee_rate), max_ltv: Number(p.max_ltv), max_debt_ratio: Number(p.max_debt_ratio),
});

const parseProduct = async (body: any, current?: LoanProduct) => {
  const pick = (key: string) => (body[key] !== undefined ? body[key] : (current as any)?.[key]);
  const code = String(pick("product_code") ?? "").trim().toUpperCase().slice(0, 30);
  const name = String(pick("name_la") ?? "").trim().slice(0, 150);
  if (!code || !name) throw new GlError("ກະລຸນາປ້ອນລະຫັດ ແລະ ຊື່ຜະລິດຕະພັນ");
  const minAmount = num(pick("min_amount"));
  const maxAmount = num(pick("max_amount"));
  if (!(maxAmount > 0) || minAmount < 0 || minAmount > maxAmount) throw new GlError("ວົງເງິນຕ່ຳສຸດ–ສູງສຸດ ບໍ່ຖືກຕ້ອງ");
  const minTerm = Math.round(Number(pick("min_term")));
  const maxTerm = Math.round(Number(pick("max_term")));
  if (!(minTerm >= 1 && maxTerm >= minTerm && maxTerm <= 600)) throw new GlError("ຈຳນວນງວດຕ່ຳສຸດ–ສູງສຸດ ບໍ່ຖືກຕ້ອງ (1–600)");
  const annual = Number(pick("annual_rate"));
  if (!(annual >= 0 && annual <= 240)) throw new GlError("ອັດຕາດອກເບ້ຍຕໍ່ປີ ຕ້ອງ 0–240%");
  const method = Number(pick("method"));
  if (![1, 2, 3, 4].includes(method)) throw new GlError("ກະລຸນາເລືອກວິທີຄິດດອກເບ້ຍ");
  const days = Number(pick("frequency_days")) || null;
  const months = Number(pick("frequency_months")) || 1;
  if (days ? !FREQ_DAYS.includes(days) : !FREQ_MONTHS.includes(months)) throw new GlError("ກະລຸນາເລືອກໄລຍະຈ່າຍ");
  const pct = (key: string, max: number, label: string) => {
    const v = Number(pick(key) ?? 0);
    if (!(v >= 0 && v <= max)) throw new GlError(`${label} ຕ້ອງ 0–${max}%`);
    return v;
  };
  const accounts: Record<string, number | null> = {};
  for (const [key, groups, label] of [
    ["loan_account_id", [1], "ບັນຊີເງິນໃຫ້ກູ້"], ["interest_account_id", [4], "ບັນຊີດອກເບ້ຍຮັບ"],
    ["fee_account_id", [4], "ບັນຊີຄ່າທຳນຽມ"], ["penalty_account_id", [4], "ບັນຊີຄ່າປັບ"],
  ] as const) {
    accounts[key] = Number(pick(key)) || null;
    await assertAccount(accounts[key], [...groups], label);
  }
  return {
    product_code: code, name_la: name, name_en: text(pick("name_en"), 150),
    product_kind: [1, 2, 3].includes(Number(pick("product_kind"))) ? Number(pick("product_kind")) : 1,
    borrower_type: [1, 2, 3].includes(Number(pick("borrower_type"))) ? Number(pick("borrower_type")) : 3,
    currency_id: Number(pick("currency_id")) || (await baseCurrencyId()),
    min_amount: minAmount, max_amount: maxAmount, min_term: minTerm, max_term: maxTerm,
    annual_rate: annual, method, day_basis: Number(pick("day_basis")) === 2 ? 2 : 1,
    frequency_months: days ? 1 : months, frequency_days: days,
    upfront_fee_rate: pct("upfront_fee_rate", 50, "ຄ່າທຳນຽມ"), upfront_fee_fixed: num(pick("upfront_fee_fixed")),
    penalty_rate: pct("penalty_rate", 10, "ຄ່າປັບຕໍ່ວັນ"), penalty_base: Number(pick("penalty_base")) === 2 ? 2 : 1,
    grace_days: Math.max(0, Math.round(Number(pick("grace_days") ?? 0))),
    prepayment_fee_rate: pct("prepayment_fee_rate", 50, "ຄ່າທຳນຽມປິດກ່ອນກຳນົດ"),
    require_guarantor: pick("require_guarantor") ? 1 : 0, require_collateral: pick("require_collateral") ? 1 : 0,
    max_ltv: pct("max_ltv", 100, "LTV"), max_debt_ratio: pct("max_debt_ratio", 100, "ອັດຕາສ່ວນໜີ້ຕໍ່ລາຍຮັບ"),
    approval_levels: Math.min(5, Math.max(1, Math.round(Number(pick("approval_levels") ?? 1)))),
    ...accounts,
    note: text(pick("note"), 255),
    status: Number(pick("status") ?? 1) === 0 ? 0 : 1,
  };
};

/** GET /credit/product — ຜະລິດຕະພັນ + ເກນຈັດຊັ້ນໜີ້ */
export const getProducts = async (_req: Request, res: Response) => {
  try {
    const [rows, rules] = await Promise.all([
      LoanProduct.findAll({ order: [["status", "DESC"], ["product_code", "ASC"]] }),
      LoanClassRule.findAll({ order: [["loan_class", "ASC"]] }),
    ]);
    res.status(200).json({ data: rows.map(presentProduct), class_rules: rules.map((r) => ({ ...r.get({ plain: true }), provision_rate: Number(r.provision_rate) })) });
  } catch (error) {
    fail(res, error, "Error getting loan products");
  }
};

/** POST /credit/product */
export const createProduct = async (req: Request, res: Response) => {
  try {
    const input = await parseProduct(req.body ?? {});
    if (await LoanProduct.count({ where: { product_code: input.product_code } })) throw new GlError(`ລະຫັດ ${input.product_code} ມີແລ້ວ`);
    const row = await LoanProduct.create({ ...input, created_by: Number(actorOf(req)) || null } as any);
    res.status(200).json({ message: "Successfully created product", data: presentProduct(row) });
  } catch (error) {
    fail(res, error, "Error creating loan product");
  }
};

/** PUT /credit/product/:id — ຄຳຮ້ອງ / ສັນຍາທີ່ສ້າງແລ້ວ ໃຊ້ເງື່ອນໄຂທີ່ຄັດລອກໄປແລ້ວ ບໍ່ປ່ຽນຕາມ */
export const updateProduct = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const row = await LoanProduct.findByPk(Number(req.params.id));
    if (!row) throw new GlError("ບໍ່ພົບຜະລິດຕະພັນ");
    const input = await parseProduct(req.body ?? {}, row);
    if (input.product_code !== row.product_code && (await LoanProduct.count({ where: { product_code: input.product_code } }))) {
      throw new GlError(`ລະຫັດ ${input.product_code} ມີແລ້ວ`);
    }
    await row.update({ ...input, updatedAt: new Date() } as any);
    res.status(200).json({ message: "Successfully updated product", data: presentProduct(row) });
  } catch (error) {
    fail(res, error, "Error updating loan product");
  }
};

/** PUT /credit/class-rule — [{ loan_class, min_days, max_days, provision_rate, is_npl, name_la }] ຈັດຊັ້ນໜີ້ A–E */
export const saveClassRules = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const rows = Array.isArray(req.body?.rules) ? req.body.rules : [];
    if (rows.length !== 5) throw new GlError("ຕ້ອງມີ 5 ຊັ້ນ (A–E)");
    let next = 0;
    for (const [i, r] of rows.entries()) {
      const min = Math.round(Number(r.min_days));
      const max = r.max_days === null || r.max_days === "" || r.max_days === undefined ? null : Math.round(Number(r.max_days));
      if (min !== next) throw new GlError(`ຊັ້ນ ${"ABCDE"[i]}: ຕ້ອງເລີ່ມຈາກ ${next} ວັນ (ຕໍ່ຈາກຊັ້ນກ່ອນ)`);
      if (i < 4 && (max === null || max < min)) throw new GlError(`ຊັ້ນ ${"ABCDE"[i]}: ກະລຸນາປ້ອນວັນສູງສຸດ`);
      const rate = Number(r.provision_rate);
      if (!(rate >= 0 && rate <= 100)) throw new GlError("ອັດຕາເງິນແຮ ຕ້ອງ 0–100%");
      await LoanClassRule.update({
        min_days: min, max_days: i === 4 ? null : max, provision_rate: rate, is_npl: r.is_npl ? 1 : 0,
        name_la: String(r.name_la ?? "").trim().slice(0, 100) || undefined, updatedAt: new Date(),
      } as any, { where: { loan_class: i + 1 }, transaction: t });
      next = (max ?? 0) + 1;
    }
    await t.commit();
    res.status(200).json({ message: "Successfully saved class rules" });
  } catch (error) {
    await t.rollback();
    fail(res, error, "Error saving class rules");
  }
};

// ================= ລູກຄ້າ (KYC)

const parseCustomer = (body: any, current?: LoanCustomer) => {
  const pick = (key: string) => (body[key] !== undefined ? body[key] : (current as any)?.[key]);
  const name = String(pick("full_name") ?? "").trim().slice(0, 200);
  if (!name) throw new GlError("ກະລຸນາປ້ອນຊື່ລູກຄ້າ");
  const phone = text(pick("phone"), 50);
  if (!phone) throw new GlError("ກະລຸນາປ້ອນເບີໂທ");
  const blacklisted = pick("blacklisted") ? 1 : 0;
  if (blacklisted && !text(pick("blacklist_reason"), 255)) throw new GlError("ກະລຸນາບອກເຫດຜົນທີ່ໃສ່ບັນຊີດຳ");
  return {
    customer_type: Number(pick("customer_type")) === 2 ? 2 : 1,
    full_name: name, name_en: text(pick("name_en"), 200),
    gender: intOrNull(pick("gender")), birth_date: toDateOnly(pick("birth_date")), nationality: text(pick("nationality"), 50),
    id_type: [1, 2, 3, 4].includes(Number(pick("id_type"))) ? Number(pick("id_type")) : 1,
    id_no: text(pick("id_no"), 50), id_issue_date: toDateOnly(pick("id_issue_date")), id_expiry_date: toDateOnly(pick("id_expiry_date")),
    tax_number: text(pick("tax_number"), 50),
    phone, phone2: text(pick("phone2"), 50), email: text(pick("email"), 150),
    village: text(pick("village"), 150), district_id: Number(pick("district_id")) || null, province_id: Number(pick("province_id")) || null,
    address: text(pick("address"), 255),
    marital_status: intOrNull(pick("marital_status")), spouse_name: text(pick("spouse_name"), 200), spouse_id_no: text(pick("spouse_id_no"), 50),
    occupation: text(pick("occupation"), 150), workplace: text(pick("workplace"), 200),
    monthly_income: num(pick("monthly_income")), monthly_expense: num(pick("monthly_expense")),
    credit_limit: num(pick("credit_limit")), risk_level: [1, 2, 3].includes(Number(pick("risk_level"))) ? Number(pick("risk_level")) : 1,
    officer_id: Number(pick("officer_id")) || null,
    blacklisted, blacklist_reason: blacklisted ? text(pick("blacklist_reason"), 255) : null,
    note: text(pick("note"), 255),
    status: Number(pick("status") ?? 1) === 0 ? 0 : 1,
  };
};

/** ລູກຄ້າຊ້ຳຈາກເລກບັດ (ທຸກປະເພດບັດ) */
const assertUniqueId = async (idNo: string | null, exceptId?: number) => {
  if (!idNo) return;
  const other = await LoanCustomer.findOne({ where: { id_no: idNo, ...(exceptId ? { _uuid: { [Op.ne]: exceptId } } : {}) }, attributes: ["customer_code", "full_name"] });
  if (other) throw new GlError(`ເລກບັດ ${idNo} ມີແລ້ວ: ${other.customer_code} ${other.full_name}`);
};

/** ສັນຍາສິນເຊື່ອ (tbl_loan) ພ້ອມສະຫຼຸບ */
const contractsWithSummary = async (where: Record<string, unknown>) => {
  const [loans, currencies] = await Promise.all([
    Loan.findAll({ where: { direction: LENT, customer_id: { [Op.ne]: null }, ...where }, order: [["_uuid", "DESC"]] }),
    currencyMap(),
  ]);
  if (!loans.length) return [];
  const ids = loans.map((l) => l._uuid);
  const [installments, payments, products, customers] = await Promise.all([
    LoanInstallment.findAll({ where: { loan_id: ids }, order: [["loan_id", "ASC"], ["no", "ASC"]] }),
    LoanPayment.findAll({ where: { loan_id: ids, status: ACTIVE } }),
    LoanProduct.findAll({ attributes: ["_uuid", "product_code", "name_la"], raw: true }),
    LoanCustomer.findAll({ where: { _uuid: [...new Set(loans.map((l) => l.customer_id))] as number[] }, attributes: ["_uuid", "customer_code", "full_name", "phone"], raw: true }),
  ]);
  return loans.map((loan) => {
    const stored = installments.filter((r) => r.loan_id === loan._uuid).map((r) => ({
      no: r.no, due_date: String(r.due_date), principal: num(r.principal), interest: num(r.interest), settled: Number(r.settled) === 1,
    }));
    const { summary } = summarize(loan, stored, paymentsOf(payments.filter((p) => p.loan_id === loan._uuid)));
    const product: any = products.find((p: any) => p._uuid === loan.product_id);
    const customer: any = customers.find((c: any) => c._uuid === loan.customer_id);
    return {
      ...presentLoan(loan, currencies), ...summary, upfront_fee: num(loan.upfront_fee),
      product: product ? { _uuid: product._uuid, code: product.product_code, name: product.name_la } : null,
      customer: customer ? { _uuid: customer._uuid, code: customer.customer_code, name: customer.full_name, phone: customer.phone } : null,
    };
  });
};

/** GET /credit/customer — ລູກຄ້າ + ສັນຍາທີ່ຍັງຜ່ອນ, ຍອດຄົງເຫຼືອ, ກາຍກຳນົດ, ຄຳຮ້ອງທີ່ຄ້າງ */
export const getCustomers = async (_req: Request, res: Response) => {
  try {
    const [customers, loans, pending] = await Promise.all([
      LoanCustomer.findAll({ include: [districtInclude], order: [["_uuid", "DESC"]] }),
      contractsWithSummary({}),
      LoanApplication.findAll({ where: { status: [APP.DRAFT, APP.PENDING, APP.APPROVED] }, attributes: ["customer_id"], raw: true }),
    ]);
    res.status(200).json({
      data: customers.map((c) => {
        const open = loans.filter((l: any) => l.customer_id === c._uuid && !l.closed);
        return {
          ...c.get({ plain: true }), monthly_income: num(c.monthly_income), monthly_expense: num(c.monthly_expense), credit_limit: num(c.credit_limit),
          loans: loans.filter((l: any) => l.customer_id === c._uuid).length,
          active_loans: open.length,
          outstanding: round2(open.reduce((n: number, l: any) => n + l.outstanding, 0)),
          overdue: open.filter((l: any) => l.overdue_count > 0).length,
          pending: pending.filter((a: any) => a.customer_id === c._uuid).length,
        };
      }),
      next_code: await nextNumber(LoanCustomer, "customer_code", "CUS-"),
    });
  } catch (error) {
    fail(res, error, "Error getting loan customers");
  }
};

/** GET /credit/customer/:id — KYC + ຄຳຮ້ອງ + ສັນຍາ + ຫຼັກຊັບ + ເປັນຜູ້ຄ້ຳໃຫ້ໃຜ */
export const getCustomer = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const c = await LoanCustomer.findByPk(Number(req.params.id), { include: [districtInclude] });
    if (!c) throw new GlError("ບໍ່ພົບລູກຄ້າ");
    const [loans, applications, collaterals, guaranteeing] = await Promise.all([
      contractsWithSummary({ customer_id: c._uuid }),
      LoanApplication.findAll({ where: { customer_id: c._uuid }, order: [["_uuid", "DESC"]] }),
      LoanCollateral.findAll({ where: { customer_id: c._uuid }, order: [["status", "ASC"], ["_uuid", "DESC"]] }),
      LoanGuarantor.findAll({ where: { customer_id: c._uuid }, attributes: ["application_id", "loan_id"], raw: true }),
    ]);
    res.status(200).json({
      data: {
        ...c.get({ plain: true }), monthly_income: num(c.monthly_income), monthly_expense: num(c.monthly_expense), credit_limit: num(c.credit_limit),
        loans,
        applications: applications.map((a) => ({ ...a.get({ plain: true }), requested_amount: num(a.requested_amount) })),
        collaterals: collaterals.map((x) => ({ ...x.get({ plain: true }), market_value: num(x.market_value), appraised_value: num(x.appraised_value) })),
        guaranteeing: guaranteeing.length,
      },
    });
  } catch (error) {
    fail(res, error, "Error getting loan customer");
  }
};

/** POST /credit/customer */
export const createCustomer = async (req: Request, res: Response) => {
  try {
    const input = parseCustomer(req.body ?? {});
    await assertUniqueId(input.id_no);
    const code = String(req.body?.customer_code ?? "").trim().slice(0, 30) || (await nextNumber(LoanCustomer, "customer_code", "CUS-"));
    if (await LoanCustomer.count({ where: { customer_code: code } })) throw new GlError(`ລະຫັດ ${code} ມີແລ້ວ`);
    const row = await LoanCustomer.create({ ...input, customer_code: code, created_by: Number(actorOf(req)) || null } as any);
    res.status(200).json({ message: "Successfully created customer", data: row });
  } catch (error) {
    fail(res, error, "Error creating loan customer");
  }
};

/** PUT /credit/customer/:id */
export const updateCustomer = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const row = await LoanCustomer.findByPk(Number(req.params.id));
    if (!row) throw new GlError("ບໍ່ພົບລູກຄ້າ");
    const input = parseCustomer(req.body ?? {}, row);
    await assertUniqueId(input.id_no, row._uuid);
    await row.update({ ...input, updatedAt: new Date() } as any);
    res.status(200).json({ message: "Successfully updated customer", data: row });
  } catch (error) {
    fail(res, error, "Error updating loan customer");
  }
};

/** DELETE /credit/customer/:id — ສະເພາະລູກຄ້າທີ່ບໍ່ເຄີຍມີຄຳຮ້ອງ / ສັນຍາ */
export const deleteCustomer = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const row = await LoanCustomer.findByPk(Number(req.params.id));
    if (!row) throw new GlError("ບໍ່ພົບລູກຄ້າ");
    if ((await LoanApplication.count({ where: { customer_id: row._uuid } })) + (await Loan.count({ where: { customer_id: row._uuid } }))) {
      throw new GlError("ລູກຄ້າມີຄຳຮ້ອງ / ສັນຍາແລ້ວ ລຶບບໍ່ໄດ້ — ປິດໃຊ້ງານແທນ");
    }
    await LoanCollateral.destroy({ where: { customer_id: row._uuid } });
    await row.destroy();
    res.status(200).json({ message: "Successfully deleted customer" });
  } catch (error) {
    fail(res, error, "Error deleting loan customer");
  }
};

// ================= ຫຼັກຊັບຄ້ຳປະກັນ

const parseCollateral = (body: any, current?: LoanCollateral) => {
  const pick = (key: string) => (body[key] !== undefined ? body[key] : (current as any)?.[key]);
  const description = String(pick("description") ?? "").trim().slice(0, 255);
  if (!description) throw new GlError("ກະລຸນາປ້ອນລາຍລະອຽດຫຼັກຊັບ");
  const appraised = num(pick("appraised_value"));
  if (!(appraised > 0)) throw new GlError("ມູນຄ່າປະເມີນຕ້ອງຫຼາຍກວ່າ 0");
  return {
    collateral_type: [1, 2, 3, 4, 5, 6, 9].includes(Number(pick("collateral_type"))) ? Number(pick("collateral_type")) : 9,
    description, document_no: text(pick("document_no"), 100), owner_name: text(pick("owner_name"), 200), location: text(pick("location"), 255),
    market_value: num(pick("market_value")), appraised_value: appraised,
    appraisal_date: toDateOnly(pick("appraisal_date")), appraiser: text(pick("appraiser"), 150),
    insurance_expiry: toDateOnly(pick("insurance_expiry")), storage: text(pick("storage"), 150),
    received_date: toDateOnly(pick("received_date")), note: text(pick("note"), 255),
  };
};

/** ຫຼັກຊັບທີ່ຜູກກັບສັນຍາທີ່ຍັງບໍ່ປິດ ຫຼື ຄຳຮ້ອງທີ່ຍັງດຳເນີນ = ສົ່ງຄືນ / ລຶບ ບໍ່ໄດ້ */
const collateralInUse = async (c: LoanCollateral) => {
  if (c.loan_id) {
    const loan = await Loan.findByPk(c.loan_id);
    if (loan) {
      const { summary } = summarize(loan, await installmentsOf(loan._uuid), paymentsOf(await LoanPayment.findAll({ where: { loan_id: loan._uuid, status: ACTIVE } })));
      if (!summary.closed && !loan.closed_date) return `ສັນຍາ ${loan.loan_code} ຍັງຈ່າຍບໍ່ຄົບ`;
    }
  }
  if (c.application_id && (await LoanApplication.count({ where: { _uuid: c.application_id, status: [APP.DRAFT, APP.PENDING, APP.APPROVED] } }))) {
    return "ຜູກກັບຄຳຮ້ອງທີ່ຍັງດຳເນີນຢູ່";
  }
  return null;
};

/** POST /credit/collateral { customer_id, … } */
export const createCollateral = async (req: Request, res: Response) => {
  try {
    const customer = await LoanCustomer.findByPk(Number(req.body?.customer_id));
    if (!customer) throw new GlError("ບໍ່ພົບລູກຄ້າ");
    const row = await LoanCollateral.create({
      ...parseCollateral(req.body ?? {}), customer_id: customer._uuid, status: HELD,
      collateral_code: await nextNumber(LoanCollateral, "collateral_code", "COL-"),
    } as any);
    res.status(200).json({ message: "Successfully created collateral", data: row });
  } catch (error) {
    fail(res, error, "Error creating collateral");
  }
};

/** PUT /credit/collateral/:id — ແກ້ລາຍລະອຽດ; { status: 2 } = ສົ່ງຄືນ (ສັນຍາປິດແລ້ວ), { status: 3 } = ຍຶດ */
export const updateCollateral = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const row = await LoanCollateral.findByPk(Number(req.params.id));
    if (!row) throw new GlError("ບໍ່ພົບຫຼັກຊັບ");
    if (req.body?.status !== undefined) {
      const status = [1, 2, 3].includes(Number(req.body.status)) ? Number(req.body.status) : HELD;
      if (status === RETURNED) {
        const busy = await collateralInUse(row);
        if (busy) throw new GlError(`ສົ່ງຄືນບໍ່ໄດ້: ${busy}`);
      }
      await row.update({ status, returned_date: status === RETURNED ? toDateOnly(req.body.date) ?? todayLao() : null, updatedAt: new Date() } as any);
    } else {
      await row.update({ ...parseCollateral(req.body ?? {}, row), updatedAt: new Date() } as any);
    }
    res.status(200).json({ message: "Successfully updated collateral", data: row });
  } catch (error) {
    fail(res, error, "Error updating collateral");
  }
};

/** DELETE /credit/collateral/:id — ສະເພາະທີ່ບໍ່ໄດ້ໃຊ້ຄ້ຳສັນຍາ / ຄຳຮ້ອງ ທີ່ຍັງເປີດ */
export const deleteCollateral = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const row = await LoanCollateral.findByPk(Number(req.params.id));
    if (!row) throw new GlError("ບໍ່ພົບຫຼັກຊັບ");
    const busy = await collateralInUse(row);
    if (busy || row.loan_id) throw new GlError(`ລຶບບໍ່ໄດ້: ${busy ?? "ເຄີຍໃຊ້ຄ້ຳສັນຍາແລ້ວ"}`);
    await row.destroy();
    res.status(200).json({ message: "Successfully deleted collateral" });
  } catch (error) {
    fail(res, error, "Error deleting collateral");
  }
};

// ================= ຄຳຮ້ອງຂໍກູ້

type GuarantorInput = {
  customer_id: number | null; full_name: string; relationship: string | null; id_type: number; id_no: string | null; phone: string | null;
  address: string | null; occupation: string | null; monthly_income: number; guarantee_amount: number; note: string | null;
};

const parseGuarantors = (list: unknown): GuarantorInput[] =>
  (Array.isArray(list) ? list : []).map((g: any) => ({
    customer_id: Number(g?.customer_id) || null,
    full_name: String(g?.full_name ?? "").trim().slice(0, 200),
    relationship: text(g?.relationship, 100), id_type: [1, 2, 3, 4].includes(Number(g?.id_type)) ? Number(g.id_type) : 1,
    id_no: text(g?.id_no, 50), phone: text(g?.phone, 50), address: text(g?.address, 255), occupation: text(g?.occupation, 150),
    monthly_income: num(g?.monthly_income), guarantee_amount: num(g?.guarantee_amount), note: text(g?.note, 255),
  })).filter((g) => g.full_name);

/** ຕົວຢ່າງຕາຕະລາງ + ຍອດຜ່ອນຕໍ່ເດືອນ ຂອງເງື່ອນໄຂ */
const scheduleOf = (amount: number, term: number, product: LoanProduct, rate: number, decimals: number, start: string, firstDue?: string | null) => {
  const days = Number(product.frequency_days) || null;
  const months = Number(product.frequency_months) || 1;
  const first = firstDue ?? (days ? moment(start).add(days, "days") : moment(start).add(months, "months")).format("YYYY-MM-DD");
  const terms = {
    principal: amount, annual_rate: rate, method: Number(product.method), day_basis: Number(product.day_basis),
    frequency_months: months, frequency_days: days, term, start_date: start, first_due_date: first,
  };
  const error = termsError(terms);
  if (error) throw new GlError(error);
  const rows = buildSchedule(terms, decimals);
  const peak = Math.max(...rows.map((r) => r.payment));
  return { rows, terms, monthly: roundTo(monthlyOf(peak, months, days), decimals) };
};

/**
 * ກວດຄຳຮ້ອງຕາມຜະລິດຕະພັນ ແລະ ລູກຄ້າ: ປະເພດຜູ້ກູ້, ວົງເງິນ / ງວດ, ບັນຊີດຳ, ວົງເງິນຂອງລູກຄ້າ, ຫຼັກຊັບ + LTV,
 * ຜູ້ຄ້ຳ, ອັດຕາສ່ວນໜີ້ຕໍ່ລາຍຮັບ. strict = ຕອນສົ່ງພິຈາລະນາ / ອະນຸມັດ (ຮ່າງເກັບໄດ້ເຖິງຍັງບໍ່ຄົບ)
 */
const checkApplication = async (app: { customer_id: number; product_id: number; amount: number; term: number; rate: number; collateralIds: number[]; guarantors: number; applicationId?: number }, strict: boolean, t?: Transaction) => {
  const customer = await LoanCustomer.findByPk(app.customer_id, { transaction: t });
  if (!customer || Number(customer.status) !== 1) throw new GlError("ກະລຸນາເລືອກລູກຄ້າ (ໃຊ້ງານຢູ່)");
  if (Number(customer.blacklisted) === 1) throw new GlError(`${customer.full_name} ຢູ່ໃນບັນຊີດຳ — ${customer.blacklist_reason ?? ""}`.trim());
  const product = await LoanProduct.findByPk(app.product_id, { transaction: t });
  if (!product) throw new GlError("ກະລຸນາເລືອກຜະລິດຕະພັນ");
  if (Number(product.borrower_type) !== 3 && Number(product.borrower_type) !== Number(customer.customer_type)) {
    throw new GlError(`${product.name_la} ສຳລັບ${Number(product.borrower_type) === 1 ? "ບຸກຄົນ" : "ນິຕິບຸກຄົນ"}ເທົ່ານັ້ນ`);
  }
  const decimals = await currencyDecimals(product.currency_id, t);
  const issues: string[] = [];
  if (!(app.amount >= num(product.min_amount) && app.amount <= num(product.max_amount))) {
    issues.push(`ວົງເງິນຂອງ ${product.name_la}: ${num(product.min_amount).toLocaleString("en-US")} – ${num(product.max_amount).toLocaleString("en-US")}`);
  }
  if (!(app.term >= product.min_term && app.term <= product.max_term)) issues.push(`ຈຳນວນງວດຂອງ ${product.name_la}: ${product.min_term} – ${product.max_term}`);
  // ວົງເງິນຂອງລູກຄ້າ = ຍອດຄ້າງຂອງສັນຍາທີ່ຍັງເປີດ + ຍອດນີ້
  if (num(customer.credit_limit) > 0) {
    const open = (await contractsWithSummary({ customer_id: customer._uuid })).filter((l: any) => !l.closed);
    const exposure = round2(open.reduce((n: number, l: any) => n + l.outstanding, 0) + app.amount);
    if (exposure > num(customer.credit_limit) + 0.004) {
      issues.push(`ເກີນວົງເງິນຂອງລູກຄ້າ (${num(customer.credit_limit).toLocaleString("en-US")}) — ລວມຍອດຄ້າງ ${exposure.toLocaleString("en-US")}`);
    }
  }
  const collaterals = app.collateralIds.length
    ? await LoanCollateral.findAll({ where: { _uuid: app.collateralIds, customer_id: customer._uuid, status: HELD }, transaction: t })
    : [];
  if (collaterals.length !== app.collateralIds.length) throw new GlError("ຫຼັກຊັບທີ່ເລືອກບໍ່ແມ່ນຂອງລູກຄ້າຄົນນີ້ ຫຼື ສົ່ງຄືນແລ້ວ");
  for (const c of collaterals) {
    if (c.application_id && c.application_id !== app.applicationId
      && (await LoanApplication.count({ where: { _uuid: c.application_id, status: [APP.DRAFT, APP.PENDING, APP.APPROVED] }, transaction: t }))) {
      throw new GlError(`ຫຼັກຊັບ "${c.description}" ໃຊ້ຄ້ຳຄຳຮ້ອງອື່ນຢູ່`);
    }
    if (c.loan_id && (await collateralInUse(c))) throw new GlError(`ຫຼັກຊັບ "${c.description}" ຍັງຄ້ຳສັນຍາອື່ນຢູ່`);
  }
  const collateralValue = round2(collaterals.reduce((n, c) => n + num(c.appraised_value), 0));
  if (Number(product.require_collateral) === 1 && !collaterals.length) issues.push(`${product.name_la} ຕ້ອງມີຫຼັກຊັບຄ້ຳປະກັນ`);
  const ltv = collateralValue > 0 ? round2((app.amount / collateralValue) * 100) : null;
  if (Number(product.max_ltv) > 0 && collaterals.length && ltv! > Number(product.max_ltv) + 0.004) {
    issues.push(`LTV ${ltv}% ເກີນ ${Number(product.max_ltv)}% (ກູ້ໄດ້ສູງສຸດ ${round2((collateralValue * Number(product.max_ltv)) / 100).toLocaleString("en-US")})`);
  }
  if (Number(product.require_guarantor) === 1 && !app.guarantors) issues.push(`${product.name_la} ຕ້ອງມີຜູ້ຄ້ຳປະກັນ`);
  const { monthly } = scheduleOf(app.amount, app.term, product, app.rate, decimals, todayLao());
  const income = num(customer.monthly_income);
  const debtRatio = income > 0 ? round2((monthly / income) * 100) : null;
  if (Number(product.max_debt_ratio) > 0 && (debtRatio === null || debtRatio > Number(product.max_debt_ratio) + 0.004)) {
    issues.push(debtRatio === null
      ? "ຍັງບໍ່ມີລາຍຮັບຂອງລູກຄ້າ — ຄິດອັດຕາສ່ວນໜີ້ຕໍ່ລາຍຮັບບໍ່ໄດ້"
      : `ອັດຕາສ່ວນໜີ້ຕໍ່ລາຍຮັບ ${debtRatio}% ເກີນເພດານ ${Number(product.max_debt_ratio)}%`);
  }
  if (strict && issues.length) throw new GlError(issues.join(" · "));
  return { customer, product, collaterals, collateralValue, ltv, debtRatio, monthly, decimals, issues };
};

const presentApplication = (a: LoanApplication, extra: Record<string, unknown> = {}) => ({
  ...a.get({ plain: true }),
  requested_amount: num(a.requested_amount), annual_rate: Number(a.annual_rate), item_price: num(a.item_price), down_payment: num(a.down_payment),
  debt_ratio: a.debt_ratio === null ? null : Number(a.debt_ratio),
  approved_amount: a.approved_amount === null ? null : num(a.approved_amount), approved_rate: a.approved_rate === null ? null : Number(a.approved_rate),
  ...extra,
});

/** GET /credit/application — ທຸກຄຳຮ້ອງ (ລູກຄ້າ, ຜະລິດຕະພັນ, ຂັ້ນອະນຸມັດ) */
export const getApplications = async (_req: Request, res: Response) => {
  try {
    const [apps, customers, products, loans] = await Promise.all([
      LoanApplication.findAll({ order: [["_uuid", "DESC"]] }),
      LoanCustomer.findAll({ attributes: ["_uuid", "customer_code", "full_name", "phone"], raw: true }),
      LoanProduct.findAll({ attributes: ["_uuid", "product_code", "name_la", "approval_levels"], raw: true }),
      Loan.findAll({ where: { application_id: { [Op.ne]: null } }, attributes: ["_uuid", "loan_code", "application_id"], raw: true }),
    ]);
    res.status(200).json({
      data: apps.map((a) => {
        const c: any = customers.find((x: any) => x._uuid === a.customer_id);
        const p: any = products.find((x: any) => x._uuid === a.product_id);
        return presentApplication(a, {
          customer: c ? { _uuid: c._uuid, code: c.customer_code, name: c.full_name, phone: c.phone } : null,
          product: p ? { _uuid: p._uuid, code: p.product_code, name: p.name_la, approval_levels: p.approval_levels } : null,
          loan_code: (loans as any[]).find((l) => l.application_id === a._uuid)?.loan_code ?? null,
        });
      }),
      next_no: await nextNumber(LoanApplication, "application_no", "APP-"),
    });
  } catch (error) {
    fail(res, error, "Error getting applications");
  }
};

/** GET /credit/application/:id — ຄຳຮ້ອງ + ລູກຄ້າ + ຜະລິດຕະພັນ + ຕາຕະລາງຕົວຢ່າງ + ຫຼັກຊັບ + ຜູ້ຄ້ຳ + ປະຫວັດອະນຸມັດ + ຜົນກວດ */
export const getApplication = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const a = await LoanApplication.findByPk(Number(req.params.id));
    if (!a) throw new GlError("ບໍ່ພົບຄຳຮ້ອງ");
    const [customer, product, collaterals, guarantors, approvals, currencies] = await Promise.all([
      LoanCustomer.findByPk(a.customer_id, { include: [districtInclude] }),
      LoanProduct.findByPk(a.product_id),
      LoanCollateral.findAll({ where: { application_id: a._uuid } }),
      LoanGuarantor.findAll({ where: { application_id: a._uuid } }),
      LoanApproval.findAll({ where: { application_id: a._uuid }, order: [["_uuid", "ASC"]] }),
      currencyMap(),
    ]);
    const users = new Map(((await Users.findAll({ where: { user_uuid: approvals.map((x) => x.approver_id).concat(a.created_by ?? 0) }, attributes: ["user_uuid", "user_name"], raw: true })) as any[]).map((u) => [Number(u.user_uuid), u.user_name]));
    const amount = a.approved_amount !== null ? num(a.approved_amount) : num(a.requested_amount);
    const term = a.approved_term ?? a.requested_term;
    const rate = a.approved_rate !== null ? Number(a.approved_rate) : Number(a.annual_rate);
    let check: any = null;
    try {
      check = await checkApplication({
        customer_id: a.customer_id, product_id: a.product_id, amount, term, rate,
        collateralIds: collaterals.filter((c) => Number(c.status) === HELD).map((c) => c._uuid), guarantors: guarantors.length, applicationId: a._uuid,
      }, false);
    } catch (e) {
      check = { issues: [(e as Error).message] };
    }
    const schedule = product ? scheduleOf(amount, term, product, rate, await currencyDecimals(product.currency_id), todayLao()) : null;
    const currency = product?.currency_id ? currencies.get(Number(product.currency_id)) : null;
    const loan = a.loan_id ? await Loan.findByPk(a.loan_id, { attributes: ["_uuid", "loan_code"] }) : null;
    res.status(200).json({
      data: presentApplication(a, {
        customer: customer && { ...customer.get({ plain: true }), monthly_income: num(customer.monthly_income), monthly_expense: num(customer.monthly_expense), credit_limit: num(customer.credit_limit) },
        product: product && presentProduct(product),
        currency: currency ? { _id: currency._id, name: currency.name, genus: currency.genus } : null,
        collaterals: collaterals.map((c) => ({ ...c.get({ plain: true }), market_value: num(c.market_value), appraised_value: num(c.appraised_value) })),
        guarantors: guarantors.map((g) => ({ ...g.get({ plain: true }), monthly_income: num(g.monthly_income), guarantee_amount: num(g.guarantee_amount) })),
        approvals: approvals.map((x) => ({
          ...x.get({ plain: true }), approved_amount: x.approved_amount === null ? null : num(x.approved_amount),
          approved_rate: x.approved_rate === null ? null : Number(x.approved_rate), approver_name: users.get(Number(x.approver_id)) ?? null,
        })),
        created_by_name: users.get(Number(a.created_by)) ?? null,
        check: { issues: check?.issues ?? [], ltv: check?.ltv ?? null, debt_ratio: check?.debtRatio ?? null, monthly: check?.monthly ?? null, collateral_value: check?.collateralValue ?? 0 },
        schedule: schedule?.rows ?? [],
        fee: product ? feeOf(product, amount, await currencyDecimals(product.currency_id)) : 0,
        loan: loan && { _uuid: loan._uuid, loan_code: loan.loan_code },
      }),
    });
  } catch (error) {
    fail(res, error, "Error getting application");
  }
};

/** ຄ່າທຳນຽມເປີດສິນເຊື່ອ = % ຂອງຍອດ + ຈຳນວນຄົງທີ່ */
const feeOf = (p: LoanProduct, amount: number, decimals: number) => roundTo((amount * Number(p.upfront_fee_rate)) / 100 + num(p.upfront_fee_fixed), decimals);

/** ຄ່າຈາກຟອມຄຳຮ້ອງ */
const applicationValues = (body: any, current?: LoanApplication) => {
  const pick = (key: string) => (body[key] !== undefined ? body[key] : (current as any)?.[key]);
  return {
    customer_id: Number(pick("customer_id")),
    product_id: Number(pick("product_id")),
    officer_id: Number(pick("officer_id")) || null,
    apply_date: toDateOnly(pick("apply_date")) ?? todayLao(),
    requested_amount: num(pick("requested_amount")),
    requested_term: Math.round(Number(pick("requested_term")) || 0),
    annual_rate: body.annual_rate !== undefined && body.annual_rate !== "" ? Number(body.annual_rate) : null,
    purpose: text(pick("purpose"), 255), repayment_source: text(pick("repayment_source"), 255),
    item_description: text(pick("item_description"), 255), item_price: num(pick("item_price")), down_payment: num(pick("down_payment")),
    note: text(pick("note"), 255),
  };
};

/** ຜູກຫຼັກຊັບ + ບັນທຶກຜູ້ຄ້ຳ ຂອງຄຳຮ້ອງ (ແທນຂອງເກົ່າ) */
const saveApplicationLinks = async (applicationId: number, collateralIds: number[], guarantors: GuarantorInput[] | null, t: Transaction) => {
  await LoanCollateral.update({ application_id: null }, { where: { application_id: applicationId, _uuid: { [Op.notIn]: collateralIds.concat(0) } }, transaction: t });
  if (collateralIds.length) await LoanCollateral.update({ application_id: applicationId }, { where: { _uuid: collateralIds }, transaction: t });
  if (guarantors) {
    await LoanGuarantor.destroy({ where: { application_id: applicationId, loan_id: null }, transaction: t });
    if (guarantors.length) await LoanGuarantor.bulkCreate(guarantors.map((g) => ({ ...g, application_id: applicationId, status: 1 })) as any, { transaction: t });
  }
};

/** POST /credit/application — ສ້າງຄຳຮ້ອງ (ຮ່າງ); submit = true → ສົ່ງພິຈາລະນາທັນທີ */
export const createApplication = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const body = req.body ?? {};
    const values = applicationValues(body);
    const product = await LoanProduct.findByPk(values.product_id, { transaction: t });
    if (!product || Number(product.status) !== 1) throw new GlError("ກະລຸນາເລືອກຜະລິດຕະພັນ (ທີ່ເປີດໃຊ້)");
    const rate = values.annual_rate ?? Number(product.annual_rate);
    const collateralIds = Array.isArray(body.collateral_ids) ? [...new Set(body.collateral_ids.map(Number).filter(Boolean))] as number[] : [];
    const guarantors = parseGuarantors(body.guarantors);
    const submit = !!body.submit;
    const check = await checkApplication({ ...values, amount: values.requested_amount, term: values.requested_term, rate, collateralIds, guarantors: guarantors.length }, submit, t);
    const row = await LoanApplication.create({
      ...values, annual_rate: rate, application_no: await nextNumber(LoanApplication, "application_no", "APP-", t),
      currency_id: product.currency_id, method: product.method, frequency_months: product.frequency_months, frequency_days: product.frequency_days,
      debt_ratio: check.debtRatio, status: submit ? APP.PENDING : APP.DRAFT, created_by: Number(actorOf(req)) || null,
    } as any, { transaction: t });
    await saveApplicationLinks(row._uuid, collateralIds, guarantors, t);
    await t.commit();
    res.status(200).json({ message: "Successfully created application", data: row, issues: check.issues });
  } catch (error) {
    await t.rollback();
    fail(res, error, "Error creating application");
  }
};

/** PUT /credit/application/:id — ແກ້ໄດ້ສະເພາະຮ່າງ; submit = true → ສົ່ງພິຈາລະນາ */
export const updateApplication = async (req: Request<{ id: string }>, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const row = await LoanApplication.findByPk(Number(req.params.id), { transaction: t, lock: t.LOCK.UPDATE });
    if (!row) throw new GlError("ບໍ່ພົບຄຳຮ້ອງ");
    if (Number(row.status) !== APP.DRAFT) throw new GlError("ແກ້ໄດ້ສະເພາະຄຳຮ້ອງທີ່ເປັນຮ່າງ (ສົ່ງກັບໃຫ້ແກ້ໄຂກ່ອນ)");
    const body = req.body ?? {};
    const values = applicationValues(body, row);
    const product = await LoanProduct.findByPk(values.product_id, { transaction: t });
    if (!product) throw new GlError("ກະລຸນາເລືອກຜະລິດຕະພັນ");
    const rate = values.annual_rate ?? (values.product_id !== row.product_id ? Number(product.annual_rate) : Number(row.annual_rate));
    const collateralIds = body.collateral_ids !== undefined
      ? [...new Set((body.collateral_ids as unknown[]).map(Number).filter(Boolean))] as number[]
      : (await LoanCollateral.findAll({ where: { application_id: row._uuid }, transaction: t })).map((c) => c._uuid);
    const guarantors = body.guarantors !== undefined ? parseGuarantors(body.guarantors) : null;
    const guarantorCount = guarantors ? guarantors.length : await LoanGuarantor.count({ where: { application_id: row._uuid }, transaction: t });
    const submit = !!body.submit;
    const check = await checkApplication({
      ...values, amount: values.requested_amount, term: values.requested_term, rate, collateralIds, guarantors: guarantorCount, applicationId: row._uuid,
    }, submit, t);
    await row.update({
      ...values, annual_rate: rate, currency_id: product.currency_id, method: product.method,
      frequency_months: product.frequency_months, frequency_days: product.frequency_days, debt_ratio: check.debtRatio,
      status: submit ? APP.PENDING : APP.DRAFT, updatedAt: new Date(),
    } as any, { transaction: t });
    await saveApplicationLinks(row._uuid, collateralIds, guarantors, t);
    await t.commit();
    res.status(200).json({ message: "Successfully updated application", data: row, issues: check.issues });
  } catch (error) {
    await t.rollback();
    fail(res, error, "Error updating application");
  }
};

/**
 * POST /credit/application/:id/decide { decision: 1 ອະນຸມັດ | 2 ປະຕິເສດ | 3 ສົ່ງກັບແກ້ໄຂ, approved_amount?, approved_term?, approved_rate?, comment? }
 * maker-checker: ຄົນສ້າງຄຳຮ້ອງ ອະນຸມັດຂອງຕົນເອງບໍ່ໄດ້ ແລະ ຄົນດຽວອະນຸມັດສອງຂັ້ນບໍ່ໄດ້.
 * ອະນຸມັດຄົບຈຳນວນຂັ້ນຂອງຜະລິດຕະພັນ → ອະນຸມັດແລ້ວ (ເງື່ອນໄຂຂອງຂັ້ນສຸດທ້າຍ)
 */
export const decideApplication = async (req: Request<{ id: string }>, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const row = await LoanApplication.findByPk(Number(req.params.id), { transaction: t, lock: t.LOCK.UPDATE });
    if (!row) throw new GlError("ບໍ່ພົບຄຳຮ້ອງ");
    if (Number(row.status) !== APP.PENDING) throw new GlError("ພິຈາລະນາໄດ້ສະເພາະຄຳຮ້ອງທີ່ລໍຖ້າພິຈາລະນາ");
    const actorId = Number(actorOf(req)) || 0;
    if (actorId && actorId === Number(row.created_by)) throw new GlError("ຄົນສ້າງຄຳຮ້ອງ ພິຈາລະນາຄຳຮ້ອງຂອງຕົນເອງບໍ່ໄດ້ (maker-checker)");
    const decision = Number(req.body?.decision);
    if (![DECISION.APPROVE, DECISION.REJECT, DECISION.RETURN].includes(decision as 1 | 2 | 3)) throw new GlError("ກະລຸນາເລືອກຜົນການພິຈາລະນາ");
    const comment = text(req.body?.comment, 500);
    if (decision !== DECISION.APPROVE && !comment) throw new GlError("ກະລຸນາບອກເຫດຜົນ");
    const level = Number(row.approval_level) + 1;
    const product = await LoanProduct.findByPk(row.product_id, { transaction: t });
    if (!product) throw new GlError("ບໍ່ພົບຜະລິດຕະພັນ");

    if (decision === DECISION.APPROVE) {
      if (await LoanApproval.count({ where: { application_id: row._uuid, approver_id: actorId, decision: DECISION.APPROVE, level: { [Op.lte]: row.approval_level } }, transaction: t })) {
        throw new GlError("ທ່ານອະນຸມັດຂັ້ນກ່ອນແລ້ວ — ຂັ້ນຕໍ່ໄປຕ້ອງເປັນຄົນອື່ນ");
      }
      const prev = row.approved_amount !== null ? num(row.approved_amount) : num(row.requested_amount);
      const amount = req.body?.approved_amount !== undefined && req.body.approved_amount !== "" ? num(req.body.approved_amount) : prev;
      const term = req.body?.approved_term !== undefined && req.body.approved_term !== "" ? Math.round(Number(req.body.approved_term)) : row.approved_term ?? row.requested_term;
      const rate = req.body?.approved_rate !== undefined && req.body.approved_rate !== "" ? Number(req.body.approved_rate)
        : row.approved_rate !== null ? Number(row.approved_rate) : Number(row.annual_rate);
      if (amount > num(row.requested_amount) + 0.004) throw new GlError("ຍອດອະນຸມັດຕ້ອງບໍ່ເກີນຍອດທີ່ຂໍ");
      const collateralIds = (await LoanCollateral.findAll({ where: { application_id: row._uuid, status: HELD }, transaction: t })).map((c) => c._uuid);
      const guarantors = await LoanGuarantor.count({ where: { application_id: row._uuid }, transaction: t });
      await checkApplication({ customer_id: row.customer_id, product_id: row.product_id, amount, term, rate, collateralIds, guarantors, applicationId: row._uuid }, true, t);
      await LoanApproval.create({ application_id: row._uuid, level, approver_id: actorId, decision, approved_amount: amount, approved_term: term, approved_rate: rate, comment } as any, { transaction: t });
      const done = level >= Number(product.approval_levels);
      await row.update({
        approval_level: level, approved_amount: amount, approved_term: term, approved_rate: rate,
        status: done ? APP.APPROVED : APP.PENDING, updatedAt: new Date(),
      } as any, { transaction: t });
    } else {
      await LoanApproval.create({ application_id: row._uuid, level, approver_id: actorId, decision, comment } as any, { transaction: t });
      await row.update(decision === DECISION.REJECT
        ? { status: APP.REJECTED, reject_reason: comment, updatedAt: new Date() }
        : { status: APP.DRAFT, approval_level: 0, approved_amount: null, approved_term: null, approved_rate: null, updatedAt: new Date() } as any, { transaction: t });
      if (decision === DECISION.REJECT) await LoanCollateral.update({ application_id: null }, { where: { application_id: row._uuid }, transaction: t });
    }
    await t.commit();
    res.status(200).json({ message: "Successfully recorded decision", data: { status: row.status, approval_level: row.approval_level } });
  } catch (error) {
    await t.rollback();
    fail(res, error, "Error recording decision");
  }
};

/** POST /credit/application/:id/cancel { comment } — ຍົກເລີກ (ກ່ອນປ່ອຍກູ້) */
export const cancelApplication = async (req: Request<{ id: string }>, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const row = await LoanApplication.findByPk(Number(req.params.id), { transaction: t, lock: t.LOCK.UPDATE });
    if (!row) throw new GlError("ບໍ່ພົບຄຳຮ້ອງ");
    if (![APP.DRAFT, APP.PENDING, APP.APPROVED].includes(Number(row.status) as 1 | 2 | 3)) throw new GlError("ຍົກເລີກໄດ້ສະເພາະກ່ອນປ່ອຍກູ້");
    await row.update({ status: APP.CANCELLED, note: text(req.body?.comment, 255) ?? row.note, updatedAt: new Date() }, { transaction: t });
    await LoanCollateral.update({ application_id: null }, { where: { application_id: row._uuid }, transaction: t });
    await t.commit();
    res.status(200).json({ message: "Successfully cancelled application" });
  } catch (error) {
    await t.rollback();
    fail(res, error, "Error cancelling application");
  }
};

/** DELETE /credit/application/:id — ສະເພາະຮ່າງ / ປະຕິເສດ / ຍົກເລີກ ທີ່ບໍ່ມີປະຫວັດອະນຸມັດ */
export const deleteApplication = async (req: Request<{ id: string }>, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const row = await LoanApplication.findByPk(Number(req.params.id), { transaction: t });
    if (!row) throw new GlError("ບໍ່ພົບຄຳຮ້ອງ");
    if (![APP.DRAFT, APP.REJECTED, APP.CANCELLED].includes(Number(row.status) as 1 | 4 | 6)) throw new GlError("ລຶບໄດ້ສະເພາະຮ່າງ / ປະຕິເສດ / ຍົກເລີກ");
    if (await LoanApproval.count({ where: { application_id: row._uuid }, transaction: t })) throw new GlError("ມີປະຫວັດການພິຈາລະນາແລ້ວ ລຶບບໍ່ໄດ້ — ຍົກເລີກແທນ");
    await LoanCollateral.update({ application_id: null }, { where: { application_id: row._uuid }, transaction: t });
    await LoanGuarantor.destroy({ where: { application_id: row._uuid, loan_id: null }, transaction: t });
    await row.destroy({ transaction: t });
    await t.commit();
    res.status(200).json({ message: "Successfully deleted application" });
  } catch (error) {
    await t.rollback();
    fail(res, error, "Error deleting application");
  }
};

/** POST /credit/preview { product_id, amount, term, annual_rate?, customer_id? } — ຕາຕະລາງ, ຄ່າທຳນຽມ, ເງິນທີ່ໄດ້ຮັບ, ອັດຕາສ່ວນໜີ້ */
export const previewApplication = async (req: Request, res: Response) => {
  try {
    const product = await LoanProduct.findByPk(Number(req.body?.product_id));
    if (!product) throw new GlError("ກະລຸນາເລືອກຜະລິດຕະພັນ");
    const decimals = await currencyDecimals(product.currency_id);
    const amount = roundTo(Number(req.body?.amount) || 0, decimals);
    const rate = req.body?.annual_rate !== undefined && req.body.annual_rate !== "" ? Number(req.body.annual_rate) : Number(product.annual_rate);
    const { rows, monthly } = scheduleOf(amount, Math.round(Number(req.body?.term) || 0), product, rate, decimals, toDateOnly(req.body?.start_date) ?? todayLao());
    const customer = req.body?.customer_id ? await LoanCustomer.findByPk(Number(req.body.customer_id), { attributes: ["_uuid", "monthly_income"] }) : null;
    const income = num(customer?.monthly_income);
    const fee = feeOf(product, amount, decimals);
    res.status(200).json({
      data: rows, fee, net: roundTo(amount - fee, decimals), monthly,
      debt_ratio: income > 0 ? round2((monthly / income) * 100) : null,
      total_interest: roundTo(rows.reduce((n, r) => n + r.interest, 0), decimals),
      total_payment: roundTo(rows.reduce((n, r) => n + r.payment, 0), decimals),
    });
  } catch (error) {
    fail(res, error, "Error previewing application");
  }
};

// ================= ປ່ອຍກູ້ → ສັນຍາ

/**
 * POST /credit/application/:id/disburse { date, treasury_account_id, first_due_date?, contract_no? } — ສ້າງສັນຍາ (tbl_loan) ຈາກເງື່ອນໄຂທີ່ອະນຸມັດ,
 * ຕາຕະລາງຜ່ອນ, ລົງບັນຊີ ແລະ ເງິນອອກ (ຍອດກູ້ − ຄ່າທຳນຽມ); ຫຼັກຊັບ / ຜູ້ຄ້ຳ ຜູກກັບສັນຍາ
 */
export const disburseApplication = async (req: Request<{ id: string }>, res: Response) => {
  const t = await sequelize.transaction();
  try {
    if (!(await glReady(t))) throw new GlError("ຍັງບໍ່ໄດ້ເປີດໃຊ້ລະບົບບັນຊີຄູ່");
    const app = await LoanApplication.findByPk(Number(req.params.id), { transaction: t, lock: t.LOCK.UPDATE });
    if (!app) throw new GlError("ບໍ່ພົບຄຳຮ້ອງ");
    if (Number(app.status) !== APP.APPROVED) throw new GlError("ປ່ອຍກູ້ໄດ້ສະເພາະຄຳຮ້ອງທີ່ອະນຸມັດແລ້ວ");
    const [product, customer] = await Promise.all([
      LoanProduct.findByPk(app.product_id, { transaction: t }), LoanCustomer.findByPk(app.customer_id, { transaction: t }),
    ]);
    if (!product || !customer) throw new GlError("ບໍ່ພົບຜະລິດຕະພັນ / ລູກຄ້າ");
    if (Number(customer.blacklisted) === 1) throw new GlError(`${customer.full_name} ຢູ່ໃນບັນຊີດຳ — ປ່ອຍກູ້ບໍ່ໄດ້`);
    const date = toDateOnly(req.body?.date) ?? todayLao();
    if (date > todayLao()) throw new GlError("ວັນທີປ່ອຍກູ້ ຕ້ອງບໍ່ເກີນມື້ນີ້");
    const treasuryId = Number(req.body?.treasury_account_id);
    if (!treasuryId) throw new GlError("ກະລຸນາເລືອກບັນຊີທີ່ຈ່າຍເງິນ");
    const currencyId = Number(app.currency_id) || (await baseCurrencyId(t));
    if ((await treasuryCurrencyId(treasuryId, t)) !== Number(currencyId)) throw new GlError("ບັນຊີເງິນຄັງຕ້ອງເປັນສະກຸນດຽວກັບສັນຍາ");
    const decimals = await currencyDecimals(currencyId, t);
    const amount = num(app.approved_amount);
    const term = Number(app.approved_term);
    const rate = Number(app.approved_rate);
    const { terms } = scheduleOf(amount, term, product, rate, decimals, date, toDateOnly(req.body?.first_due_date));
    const loanAccount = product.loan_account_id ?? (await roleAccountId("LOAN_RECEIVABLE", t));
    await assertAccount(loanAccount, [1], "ບັນຊີເງິນໃຫ້ກູ້", t);
    const actorId = Number(actorOf(req)) || null;
    const loan = await Loan.create({
      loan_code: await nextCode(t, "CR-", 6), direction: LENT, counterparty: customer.full_name,
      customer_id: customer._uuid, product_id: product._uuid, application_id: app._uuid, officer_id: app.officer_id ?? customer.officer_id,
      contract_no: text(req.body?.contract_no, 100), currency_id: currencyId,
      principal: amount, annual_rate: rate, method: terms.method, day_basis: terms.day_basis,
      frequency_months: terms.frequency_months, frequency_days: terms.frequency_days, term,
      start_date: date, first_due_date: terms.first_due_date, start_mode: 1, treasury_account_id: treasuryId,
      loan_account_id: loanAccount, interest_account_id: product.interest_account_id, purpose: app.purpose, note: app.note,
      status: ACTIVE, created_by: actorId,
      upfront_fee: feeOf(product, amount, decimals), penalty_rate: Number(product.penalty_rate), penalty_base: product.penalty_base,
      grace_days: product.grace_days,
    } as any, { transaction: t });
    await writeInstallments(loan, t);
    await applyStart(loan, t, actorId);
    await LoanCollateral.update({ loan_id: loan._uuid }, { where: { application_id: app._uuid, status: HELD }, transaction: t });
    await LoanGuarantor.update({ loan_id: loan._uuid }, { where: { application_id: app._uuid }, transaction: t });
    await app.update({ status: APP.DISBURSED, loan_id: loan._uuid, updatedAt: new Date() }, { transaction: t });
    await t.commit();
    res.status(200).json({ message: "Successfully disbursed", data: { loan_id: loan._uuid, loan_code: loan.loan_code, net: round2(amount - num(loan.upfront_fee)) } });
  } catch (error) {
    await t.rollback();
    fail(res, error, "Error disbursing");
  }
};

/** POST /credit/contract/:id/undo-disburse — ຍົກເລີກການປ່ອຍກູ້ (ຍັງບໍ່ມີການຊຳລະ / ດອກເບ້ຍຄ້າງ) → ຄຳຮ້ອງກັບເປັນອະນຸມັດແລ້ວ */
export const undoDisbursement = async (req: Request<{ id: string }>, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const loan = await Loan.findByPk(Number(req.params.id), { transaction: t, lock: t.LOCK.UPDATE });
    if (!loan || !loan.application_id) throw new GlError("ບໍ່ພົບສັນຍາສິນເຊື່ອ");
    if (await LoanPayment.count({ where: { loan_id: loan._uuid, status: ACTIVE }, transaction: t })) throw new GlError("ມີການຊຳລະແລ້ວ — ຍົກເລີກການຊຳລະກ່ອນ");
    if (await LoanAccrual.count({ where: { loan_id: loan._uuid }, transaction: t })) throw new GlError("ຄິດດອກເບ້ຍຄ້າງຂອງສັນຍານີ້ແລ້ວ — ຍົກເລີກເດືອນນັ້ນກ່ອນ");
    await undoStart(loan, t, Number(actorOf(req)) || null);
    await LoanInstallment.destroy({ where: { loan_id: loan._uuid }, transaction: t });
    await LoanCollateral.update({ loan_id: null }, { where: { loan_id: loan._uuid }, transaction: t });
    await LoanGuarantor.update({ loan_id: null }, { where: { loan_id: loan._uuid }, transaction: t });
    await LoanApplication.update({ status: APP.APPROVED, loan_id: null, updatedAt: new Date() }, { where: { _uuid: loan.application_id }, transaction: t });
    await LoanPayment.destroy({ where: { loan_id: loan._uuid }, transaction: t });
    await loan.destroy({ transaction: t });
    await t.commit();
    res.status(200).json({ message: "Successfully undid disbursement" });
  } catch (error) {
    await t.rollback();
    fail(res, error, "Error undoing disbursement");
  }
};

/** GET /credit/contract — ສັນຍາສິນເຊື່ອທັງໝົດ ພ້ອມສະຫຼຸບ */
export const getContracts = async (_req: Request, res: Response) => {
  try {
    if (!(await glReady())) throw new GlError("ຍັງບໍ່ໄດ້ເປີດໃຊ້ລະບົບບັນຊີຄູ່");
    res.status(200).json({ data: await contractsWithSummary({}) });
  } catch (error) {
    fail(res, error, "Error getting contracts");
  }
};

/** GET /credit/contract/:id — ສັນຍາ + ລູກຄ້າ + ຜະລິດຕະພັນ + ຕາຕະລາງ + ການຊຳລະ + ຫຼັກຊັບ + ຜູ້ຄ້ຳ */
export const getContract = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const loan = await Loan.findByPk(Number(req.params.id));
    if (!loan || !loan.customer_id) throw new GlError("ບໍ່ພົບສັນຍາສິນເຊື່ອ");
    const [currencies, customer, product, collaterals, guarantors, payments, officer] = await Promise.all([
      currencyMap(),
      LoanCustomer.findByPk(loan.customer_id, { include: [districtInclude] }),
      loan.product_id ? LoanProduct.findByPk(loan.product_id) : null,
      LoanCollateral.findAll({ where: { loan_id: loan._uuid } }),
      LoanGuarantor.findAll({ where: { loan_id: loan._uuid } }),
      LoanPayment.findAll({ where: { loan_id: loan._uuid }, order: [["pay_date", "DESC"], ["_uuid", "DESC"]] }),
      loan.officer_id ? Employee.findByPk(loan.officer_id, { attributes: ["_uuid", "first_name", "last_name"] }) : null,
    ]);
    const { rows, summary } = summarize(loan, await installmentsOf(loan._uuid), paymentsOf(payments.filter((p) => Number(p.status) === ACTIVE)));
    const app = loan.application_id ? await LoanApplication.findByPk(loan.application_id, { attributes: ["_uuid", "application_no"] }) : null;
    res.status(200).json({
      data: {
        ...presentLoan(loan, currencies), ...summary,
        upfront_fee: num(loan.upfront_fee), penalty_rate: Number(loan.penalty_rate),
        customer: customer && { ...customer.get({ plain: true }), monthly_income: num(customer.monthly_income) },
        product: product && presentProduct(product),
        officer: officer ? [(officer as any).first_name, (officer as any).last_name].filter(Boolean).join(" ") : null,
        application: app && { _uuid: app._uuid, application_no: app.application_no },
        collaterals: collaterals.map((c) => ({ ...c.get({ plain: true }), market_value: num(c.market_value), appraised_value: num(c.appraised_value) })),
        guarantors: guarantors.map((g) => ({ ...g.get({ plain: true }), monthly_income: num(g.monthly_income) })),
        schedule: rows,
        payments: payments.map((p) => ({
          ...p.get({ plain: true }), principal: num(p.principal), interest: num(p.interest), fee: num(p.fee), penalty: num(p.penalty),
          total: round2(num(p.principal) + num(p.interest) + num(p.fee) + num(p.penalty)),
        })),
        locked: payments.some((p) => Number(p.status) === ACTIVE) || (await LoanAccrual.count({ where: { loan_id: loan._uuid } })) > 0,
      },
    });
  } catch (error) {
    fail(res, error, "Error getting contract");
  }
};
