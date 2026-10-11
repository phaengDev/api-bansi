import { Op, Transaction } from "sequelize";
import PayrollSetting from "../../models/payrollSetting";
import Overtime from "../../models/overtime";

/**
 * ຕັ້ງຄ່າ ແລະ ສູດຄິດເງິນເດືອນ — ຄ່າເລີ່ມຕົ້ນຕາມກົດໝາຍລາວ (ກວດຄືນເມື່ອກົດໝາຍປ່ຽນ, ແກ້ໄດ້ຢູ່ໜ້າຕັ້ງຄ່າເງິນເດືອນ):
 * - ປະກັນສັງຄົມ: ພະນັກງານ 5.5%, ບໍລິສັດ 6% ຂອງເງິນເດືອນ ສູງສຸດ 4,500,000 ກີບ
 * - ອາກອນລາຍໄດ້ (ກົດໝາຍອາກອນລາຍໄດ້ 2025, ໃຊ້ແຕ່ 1/7/2026) ຕໍ່ເດືອນ: ≤ 2.5 ລ້ານ 0%, ≤ 5 ລ້ານ 5%, ≤ 15 ລ້ານ 10%,
 *   ≤ 25 ລ້ານ 15%, ≤ 65 ລ້ານ 20%, ເກີນ 25% — ຄິດຈາກເງິນເດືອນລວມ − ປກສ ສ່ວນພະນັກງານ
 * - ຄ່າລ່ວງເວລາບໍ່ເສຍອາກອນ ຖ້າເງິນເດືອນພື້ນຖານບໍ່ເກີນ 3,000,000 ກີບ
 * - ຄ່າລ່ວງເວລາ (ກົດໝາຍແຮງງານ) % ຂອງຄ່າແຮງຕໍ່ຊົ່ວໂມງ: ມື້ເຮັດວຽກ 150%, ກາງຄືນ (22:00–05:00) 200%,
 *   ວັນພັກ 250%, ວັນພັກກາງຄືນ 300%; ຄ່າແຮງຕໍ່ຊົ່ວໂມງ = ເງິນເດືອນພື້ນຖານ ÷ ມື້ເຮັດວຽກຂອງເດືອນ ÷ ຊົ່ວໂມງຕໍ່ມື້ (8)
 */

export type TaxBracket = { upto: number | null; rate: number };

export const DEFAULT_TAX_BRACKETS: TaxBracket[] = [
  { upto: 2500000, rate: 0 },
  { upto: 5000000, rate: 5 },
  { upto: 15000000, rate: 10 },
  { upto: 25000000, rate: 15 },
  { upto: 65000000, rate: 20 },
  { upto: null, rate: 25 },
];

export type PayrollSettings = {
  /** ນະໂຍບາຍບໍລິສັດ — false = ບໍ່ຫັກປະກັນສັງຄົມ (ທັງສ່ວນພະນັກງານ ແລະ ບໍລິສັດ) */
  sso_enabled: boolean;
  sso_employee_rate: number;
  sso_employer_rate: number;
  /** ເພດານເງິນເດືອນທີ່ຄິດ ປກສ (0 = ບໍ່ມີເພດານ) */
  sso_salary_cap: number;
  /** false = ບໍ່ຫັກອາກອນລາຍໄດ້ */
  tax_enabled: boolean;
  tax_brackets: TaxBracket[];
  /** ເງິນເດືອນພື້ນຖານບໍ່ເກີນນີ້ = ຄ່າລ່ວງເວລາບໍ່ເສຍອາກອນ (0 = ເສຍທຸກຄົນ) */
  ot_tax_free_salary: number;
  /** ມາຊ້າ/ອອກກ່ອນ ບໍ່ເກີນນີ້ (ນາທີ) ບໍ່ນັບ */
  late_grace_minutes: number;
  deduct_absent: boolean;
  deduct_late: boolean;
  /** ຊົ່ວໂມງເຮັດວຽກຕໍ່ມື້ — ໃຊ້ຄິດຄ່າແຮງຕໍ່ຊົ່ວໂມງຂອງ OT */
  ot_hours_per_day: number;
  /** % ຂອງຄ່າແຮງຕໍ່ຊົ່ວໂມງ ຕາມປະເພດ OT (OT_KINDS) */
  ot_rate_normal: number;
  ot_rate_night: number;
  ot_rate_dayoff: number;
  ot_rate_dayoff_night: number;
  updatedAt: Date | null;
};

export const DEFAULT_SETTINGS: PayrollSettings = {
  sso_enabled: true,
  sso_employee_rate: 5.5,
  sso_employer_rate: 6,
  sso_salary_cap: 4500000,
  tax_enabled: true,
  tax_brackets: DEFAULT_TAX_BRACKETS,
  ot_tax_free_salary: 3000000,
  late_grace_minutes: 0,
  deduct_absent: true,
  deduct_late: true,
  ot_hours_per_day: 8,
  ot_rate_normal: 150,
  ot_rate_night: 200,
  ot_rate_dayoff: 250,
  ot_rate_dayoff_night: 300,
  updatedAt: null,
};

/** ປະເພດ OT (tbl_overtime.kind) → ຖັນອັດຕາໃນຕັ້ງຄ່າ */
export const OT_KINDS: Record<number, "ot_rate_normal" | "ot_rate_night" | "ot_rate_dayoff" | "ot_rate_dayoff_night"> = {
  1: "ot_rate_normal",
  2: "ot_rate_night",
  3: "ot_rate_dayoff",
  4: "ot_rate_dayoff_night",
};

/** % ຂອງປະເພດ OT */
export const otRateOf = (kind: number, settings: PayrollSettings) => settings[OT_KINDS[kind] ?? "ot_rate_normal"];

/** ວິທີຈ່າຍ OT (tbl_overtime.pay_type) — ຕາມອັດຕາ (ເງິນເດືອນ × %), ກຳນົດເງິນຕໍ່ຊົ່ວໂມງ, ເໝົາຈ່າຍ */
export const OT_PAY_RATE = 1;
export const OT_PAY_HOURLY = 2;
export const OT_PAY_LUMP = 3;
export const OT_PAY_TYPES = [OT_PAY_RATE, OT_PAY_HOURLY, OT_PAY_LUMP];

/** ເງິນຂອງ OT 1 ລາຍການທີ່ກຳນົດເງິນເອງ (ຕາມອັດຕາ = 0 — ຄິດຕອນເຮັດເງິນເດືອນ) */
export const otFixedOf = (r: { hours: unknown; pay_type: unknown; amount: unknown }) => {
  const amount = Number(r.amount) || 0;
  const type = Number(r.pay_type);
  if (type === OT_PAY_HOURLY) return Math.round(amount * (Number(r.hours) || 0));
  if (type === OT_PAY_LUMP) return Math.round(amount);
  return 0;
};

/**
 * OT ລວມຂອງລາຍການ: hours ຊົ່ວໂມງທັງໝົດ, weighted ຊົ່ວໂມງຄູນອັດຕາ (Σ ຊົ່ວໂມງ × % ÷ 100 ສະເພາະ "ຕາມອັດຕາ"),
 * fixed ເງິນທີ່ກຳນົດເອງ (ຕໍ່ຊົ່ວໂມງ + ເໝົາຈ່າຍ)
 */
export const otTotals = (rows: { hours: unknown; kind: unknown; pay_type: unknown; amount: unknown }[], settings: PayrollSettings) => {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return rows.reduce(
    (sum, r) => {
      const hours = Number(r.hours) || 0;
      const byRate = Number(r.pay_type || OT_PAY_RATE) === OT_PAY_RATE;
      return {
        hours: round2(sum.hours + hours),
        weighted: byRate ? round2(sum.weighted + (hours * otRateOf(Number(r.kind), settings)) / 100) : sum.weighted,
        fixed: sum.fixed + otFixedOf(r),
      };
    },
    { hours: 0, weighted: 0, fixed: 0 },
  );
};

/** ຂັ້ນອາກອນຈາກ JSON / array — ຂັ້ນສູງຂຶ້ນເລື້ອຍໆ, ອັດຕາ 0–100, ຂັ້ນສຸດທ້າຍ upto = null; ຜິດ = null */
export const parseBrackets = (raw: unknown): TaxBracket[] | null => {
  let list: any = raw;
  if (typeof raw === "string") {
    try {
      list = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(list) || !list.length || list.length > 20) return null;
  const brackets: TaxBracket[] = [];
  let previous = 0;
  for (const [index, item] of list.entries()) {
    const last = index === list.length - 1;
    const rate = Number(item?.rate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) return null;
    if (last) {
      brackets.push({ upto: null, rate: Math.round(rate * 100) / 100 });
      break;
    }
    const upto = Number(item?.upto);
    if (!Number.isFinite(upto) || upto <= previous) return null;
    brackets.push({ upto: Math.round(upto), rate: Math.round(rate * 100) / 100 });
    previous = upto;
  }
  return brackets;
};

export const presentSettings = (row: PayrollSetting | null): PayrollSettings => {
  if (!row) return DEFAULT_SETTINGS;
  return {
    sso_enabled: Number(row.sso_enabled) === 1,
    sso_employee_rate: Number(row.sso_employee_rate) || 0,
    sso_employer_rate: Number(row.sso_employer_rate) || 0,
    sso_salary_cap: Number(row.sso_salary_cap) || 0,
    tax_enabled: Number(row.tax_enabled) === 1,
    tax_brackets: parseBrackets(row.tax_brackets) ?? DEFAULT_TAX_BRACKETS,
    ot_tax_free_salary: Number(row.ot_tax_free_salary) || 0,
    late_grace_minutes: Number(row.late_grace_minutes) || 0,
    deduct_absent: Number(row.deduct_absent) === 1,
    deduct_late: Number(row.deduct_late) === 1,
    ot_hours_per_day: Number(row.ot_hours_per_day) || DEFAULT_SETTINGS.ot_hours_per_day,
    ot_rate_normal: Number(row.ot_rate_normal) || 0,
    ot_rate_night: Number(row.ot_rate_night) || 0,
    ot_rate_dayoff: Number(row.ot_rate_dayoff) || 0,
    ot_rate_dayoff_night: Number(row.ot_rate_dayoff_night) || 0,
    updatedAt: row.updatedAt ?? null,
  };
};

export const findPayrollSetting = (t?: Transaction) => PayrollSetting.findOne({ order: [["_uuid", "ASC"]], transaction: t });
export const loadPayrollSettings = async (t?: Transaction) => presentSettings(await findPayrollSetting(t));

/** ອາກອນແບບຂັ້ນໄດ — ແຕ່ລະອັດຕາຄິດສະເພາະສ່ວນທີ່ຢູ່ໃນຂັ້ນຂອງມັນ */
export const progressiveTax = (taxable: number, brackets: TaxBracket[]) => {
  let tax = 0;
  let lower = 0;
  for (const bracket of brackets) {
    const upper = bracket.upto ?? Infinity;
    if (taxable > lower) tax += ((Math.min(taxable, upper) - lower) * bracket.rate) / 100;
    if (taxable <= upper) break;
    lower = upper;
  }
  return Math.round(tax);
};

/**
 * ວິທີຄິດແຕ່ລະກຸ່ມການຫັກຂອງ 1 ຄົນ (deduction_mode, sso_mode, tax_mode) — ນະໂຍບາຍສະເພາະຄົນ:
 * MANUAL ຈຳນວນທີ່ປ້ອນເອງ, POLICY ຕາມນະໂຍບາຍບໍລິສັດ (ຄ່າເລີ່ມຕົ້ນ), NONE ບໍ່ຫັກ, ALWAYS ຫັກສະເໝີ (ເຖິງບໍລິສັດປິດໄວ້)
 */
export const MODE_MANUAL = 0;
export const MODE_POLICY = 1;
export const MODE_NONE = 2;
export const MODE_ALWAYS = 3;
export const LINE_MODES = [MODE_MANUAL, MODE_POLICY, MODE_NONE, MODE_ALWAYS];

const kip = (value: unknown) => Math.max(0, Math.round(Number(value) || 0));

/** ຈຳນວນຕາມວິທີຄິດ — policyOn = ນະໂຍບາຍບໍລິສັດຂອງກຸ່ມນັ້ນເປີດຢູ່ບໍ່ */
const byMode = (mode: unknown, policyOn: boolean, computed: () => number, manual: unknown) => {
  const m = Number(mode);
  if (m === MODE_MANUAL) return kip(manual);
  if (m === MODE_NONE) return 0;
  return m === MODE_ALWAYS || policyOn ? computed() : 0;
};

/** ຄ່າທີ່ສູດຕ້ອງການຂອງ 1 ແຖວ — ສະຖິຕິການເຂົ້າວຽກ + ຈຳນວນທີ່ປ້ອນເອງ + ວິທີຄິດ *_mode */
export type LineInput = {
  basic_salary: number;
  workdays: number;
  employed_days: number;
  absent_days: number;
  unpaid_days: number;
  late_minutes: number;
  allowance: number;
  overtime: number;
  /** MODE_MANUAL = ລ່ວງເວລາປ້ອນເອງ (overtime), ອື່ນ = ຄິດຈາກ ot_weighted_hours */
  overtime_mode: number;
  ot_weighted_hours: number;
  ot_fixed_amount: number;
  bonus: number;
  other_deduction: number;
  deduction_mode: number;
  absence_deduction: number;
  late_deduction: number;
  sso_mode: number;
  sso_employee: number;
  sso_employer: number;
  tax_mode: number;
  tax: number;
};

/**
 * ຄິດເງິນເດືອນ 1 ຄົນ (ກີບ ບໍ່ມີທົດສະນິຍົມ):
 * - ເງິນເດືອນຕາມວັນ = ພື້ນຖານ × ມື້ທີ່ເປັນພະນັກງານ ÷ ມື້ເຮັດວຽກຂອງເດືອນ (ເຂົ້າ/ອອກກາງເດືອນ)
 * - ຫັກຂາດວຽກ = ຄ່າແຮງຕໍ່ມື້ × (ຂາດ + ລາບໍ່ໄດ້ເງິນ); ຫັກມາຊ້າ = ຄ່າແຮງຕໍ່ນາທີ × ນາທີ (ຫັກບໍ່ເກີນເງິນເດືອນຕາມວັນ)
 * - ລ່ວງເວລາ = ຄ່າແຮງຕໍ່ມື້ ÷ ຊົ່ວໂມງຕໍ່ມື້ × ຊົ່ວໂມງຄູນອັດຕາ + OT ທີ່ກຳນົດເງິນເອງ (ຫຼື ຈຳນວນທີ່ປ້ອນເອງທັງໝົດ)
 * - gross = ເງິນເດືອນຕາມວັນ − ຫັກ + ເງິນອຸດໜູນ + ລ່ວງເວລາ + ໂບນັດ
 * - ປກສ ຄິດຈາກ gross (ບໍ່ເກີນເພດານ); ອາກອນຄິດຈາກ gross − ປກສ ພະນັກງານ (− ລ່ວງເວລາທີ່ຍົກເວັ້ນ)
 * - ແຕ່ລະກຸ່ມ (ຂາດ/ຊ້າ, ປກສ, ອາກອນ) ຕາມ *_mode ຂອງຄົນນັ້ນ: ຕາມນະໂຍບາຍບໍລິສັດ (ປິດ = 0), ຫັກສະເໝີ, ບໍ່ຫັກ ຫຼື ປ້ອນເອງ
 * - net = gross − ປກສ ພະນັກງານ − ອາກອນ − ຫັກອື່ນ
 */
export const computeLine = (line: LineInput, settings: PayrollSettings, minutesPerDay: number) => {
  const basic = kip(line.basic_salary);
  const workdays = Number(line.workdays) || 0;
  const daily = workdays > 0 ? basic / workdays : 0;
  const base_pay = workdays > 0 ? Math.round((basic * Math.min(Number(line.employed_days) || 0, workdays)) / workdays) : basic;

  const absenceWanted = byMode(line.deduction_mode, settings.deduct_absent,
    () => Math.round(daily * ((Number(line.absent_days) || 0) + (Number(line.unpaid_days) || 0))), line.absence_deduction);
  const lateWanted = byMode(line.deduction_mode, settings.deduct_late,
    () => Math.round((daily / Math.max(1, minutesPerDay)) * (Number(line.late_minutes) || 0)), line.late_deduction);
  const absence_deduction = Math.min(absenceWanted, base_pay);
  const late_deduction = Math.min(lateWanted, base_pay - absence_deduction);

  const allowance = kip(line.allowance);
  const overtime = Number(line.overtime_mode) === MODE_MANUAL
    ? kip(line.overtime)
    : Math.round((daily / Math.max(1, settings.ot_hours_per_day)) * (Number(line.ot_weighted_hours) || 0)) + kip(line.ot_fixed_amount);
  const bonus = kip(line.bonus);
  const gross = base_pay - absence_deduction - late_deduction + allowance + overtime + bonus;

  const sso_base = settings.sso_salary_cap > 0 ? Math.min(gross, settings.sso_salary_cap) : gross;
  const ssoOf = (rate: number) => () => Math.round((sso_base * rate) / 100);
  const sso_employee = byMode(line.sso_mode, settings.sso_enabled, ssoOf(settings.sso_employee_rate), line.sso_employee);
  const sso_employer = byMode(line.sso_mode, settings.sso_enabled, ssoOf(settings.sso_employer_rate), line.sso_employer);

  const otFree = settings.ot_tax_free_salary > 0 && basic <= settings.ot_tax_free_salary ? overtime : 0;
  const taxable = Math.max(0, gross - sso_employee - otFree);
  const tax = byMode(line.tax_mode, settings.tax_enabled, () => progressiveTax(taxable, settings.tax_brackets), line.tax);
  const other_deduction = kip(line.other_deduction);
  const net = gross - sso_employee - tax - other_deduction;

  return {
    basic_salary: basic, base_pay, absence_deduction, late_deduction, allowance, overtime, bonus, gross,
    sso_base, sso_employee, sso_employer, taxable, tax, other_deduction, net,
  };
};

/** OT ລວມຂອງ 1 ຄົນ — ຊົ່ວໂມງ, ຊົ່ວໂມງຄູນອັດຕາ (ຕາມອັດຕາ), ເງິນທີ່ກຳນົດເອງ */
export type OvertimeTotals = { hours: number; weighted: number; fixed: number };
export const NO_OVERTIME: OvertimeTotals = { hours: 0, weighted: 0, fixed: 0 };

/** OT ລວມຂອງແຕ່ລະຄົນໃນຊ່ວງ → Map(employee_id, { ຊົ່ວໂມງ, ຊົ່ວໂມງຄູນອັດຕາ }) — ໃຊ້ຄິດເງິນເດືອນ */
export const overtimeByEmployee = async (
  employeeIds: number[], start: string, end: string, settings: PayrollSettings, t?: Transaction,
) => {
  const result = new Map<number, OvertimeTotals>();
  if (!employeeIds.length) return result;
  const rows = await Overtime.findAll({
    where: { employee_id: { [Op.in]: employeeIds }, work_date: { [Op.between]: [start, end] } },
    attributes: ["employee_id", "hours", "kind", "pay_type", "amount"],
    raw: true,
    transaction: t,
  });
  const byEmployee = new Map<number, { hours: unknown; kind: unknown; pay_type: unknown; amount: unknown }[]>();
  for (const row of rows) {
    const id = Number(row.employee_id);
    byEmployee.set(id, [...(byEmployee.get(id) ?? []), row]);
  }
  for (const [id, list] of byEmployee) result.set(id, otTotals(list, settings));
  return result;
};
