import { fullName, notifyApprovers } from "./approvers";
import { Request, Response } from "express";
import moment from "moment";
import { Op, Transaction, col, fn } from "sequelize";
import SalaryAdvance from "../../models/salaryAdvance";
import SalaryAdvanceRepayment from "../../models/salaryAdvanceRepayment";
import Employee from "../../models/employee";
import Department from "../../models/department";
import Position from "../../models/position";
import Payroll from "../../models/payroll";
import TreasuryAccount from "../../models/treasuryAcount";
import TypeTreasury from "../../models/typeTreasury";
import Currency from "../../models/currencyModel";
import { actorOf, decodeId, sendError } from "../bansi/bansiHelpers";
import { accountInclude, entryDateOf } from "../bansi/journalHelpers";
import { MOVE_IN, MOVE_OUT, moveBalance } from "../bansi/accountMovement";
import { isBaseCurrency, replyGlError, reverseSource } from "../bansi/glCore";
import { postAdvance, postAdvanceRepayment } from "../bansi/glPosting";
import { selfEmployee } from "./attendanceController";
import { profileUrl } from "./hrHelpers";
import { notify } from "./notificationController";
import { syncDraftPayrolls } from "./payrollController";
import { ADVANCE_ACTIVE, loadPayrollSettings } from "./payrollRules";
import { PERIOD, WORKING, currentPeriod } from "./workCalendar";

/**
 * ເງິນເບີກລ່ວງໜ້າ:
 * - ພະນັກງານ (app ມືຖື): GET/POST /advance/me, PUT /advance/me/cancel/:id — ສະເພາະຂອງຕົນເອງ, ຕາມເງື່ອນໄຂຢູ່ຕັ້ງຄ່າເງິນເດືອນ
 * - HR: POST /advance/fetch, GET /advance/:id, POST /advance/create, PUT /advance/approve|reject|cancel/:id,
 *   PUT /advance/pay|unpay/:id, PUT /advance/schedule/:id, POST /advance/repay/:id, DELETE /advance/repayment/:id
 * ຈ່າຍເງິນ = ເງິນອອກຈາກບັນຊີເງິນຄັງສະກຸນກີບ + ລົງບັນຊີ ໜີ້ ເງິນລ່ວງໜ້າພະນັກງານ. ຫັກຄືນຜ່ານເງິນເດືອນ (payrollRules → ໃບເງິນເດືອນ):
 * ຈ່າຍເງິນເດືອນ = applyPayrollRepayments, ຍົກເລີກການຈ່າຍ = reversePayrollRepayments
 */

const PENDING = 1;
const APPROVED = 2;
const SETTLED = 4;
const REJECTED = 5;
const CANCELLED = 6;
const STATUSES = [PENDING, APPROVED, ADVANCE_ACTIVE, SETTLED, REJECTED, CANCELLED];

const FROM_APP = 1;
const FROM_HR = 2;
const BY_PAYROLL = 1;
const BY_CASH = 2;
/** HR ກຳນົດຜ່ອນໄດ້ບໍ່ເກີນ (ຄຳຂໍຈາກ app ໃຊ້ຂີດຈຳກັດຢູ່ຕັ້ງຄ່າ) */
const MAX_INSTALLMENTS = 36;
/** ຊອກເດືອນທີ່ຍັງບໍ່ໄດ້ຈ່າຍເງິນເດືອນ ໄກສຸດຈັກເດືອນ */
const OPEN_PERIOD_LOOKAHEAD = 24;
const PAYROLL_PAID = 2;

const employeeInclude = {
  model: Employee,
  as: "employee",
  attributes: ["_uuid", "emp_code", "first_name", "last_name", "phone", "profile", "basic_salary", "work_status"],
  include: [
    { model: Department, as: "department", attributes: ["_uuid", "depart_name"] },
    { model: Position, as: "position", attributes: ["_uuid", "position_name"] },
  ],
};

const n = (value: unknown) => Number(value) || 0;
const kipText = (value: unknown) => `₭ ${Math.round(n(value)).toLocaleString("en-US")}`;
const text = (value: unknown) => String(value ?? "").trim().slice(0, 255) || null;
const leftOf = (row: { amount: unknown; repaid: unknown }) => Math.max(0, Math.round(n(row.amount) - n(row.repaid)));
const periodText = (period: string) => moment(`${period}-01`).format("MM/YYYY");
const docNumber = (id: number) => `ADV-${String(id).padStart(5, "0")}`;
/** ຫັກຕໍ່ເດືອນ — ປັດຂຶ້ນ ບໍ່ໃຫ້ເຫຼືອເສດໃນງວດສຸດທ້າຍ */
const monthlyOf = (amount: number, installments: number) => Math.ceil(amount / Math.max(1, installments));

const present = (row: SalaryAdvance) => {
  const { employee, repayments, account, ...r }: any = row.get({ plain: true });
  return {
    ...r,
    requested_amount: n(r.requested_amount),
    amount: n(r.amount),
    monthly_deduction: n(r.monthly_deduction),
    repaid: n(r.repaid),
    balance: leftOf(r),
    ...(employee ? { employee: { ...employee, basic_salary: n(employee.basic_salary), profile_url: profileUrl(employee.profile) } } : {}),
    ...(account !== undefined ? { account } : {}),
    ...(repayments ? { repayments: repayments.map((p: any) => ({ ...p, amount: n(p.amount) })) } : {}),
  };
};

const repaymentInclude = { model: SalaryAdvanceRepayment, as: "repayments" };
const repaymentOrder: any = [[{ model: SalaryAdvanceRepayment, as: "repayments" }, "repay_date", "DESC"], [{ model: SalaryAdvanceRepayment, as: "repayments" }, "_uuid", "DESC"]];

const findFull = (id: number) =>
  SalaryAdvance.findByPk(id, {
    include: [employeeInclude, repaymentInclude, { ...accountInclude, as: "account" }],
    order: repaymentOrder,
  });

const reply = async (res: Response, id: number, message: string) => {
  const saved = await findFull(id);
  res.status(200).json({ message, data: saved && present(saved) });
};

/** ເດືອນທຳອິດ (ເລີ່ມຈາກ from, ບໍ່ກ່ອນເດືອນນີ້) ທີ່ຍັງບໍ່ໄດ້ຈ່າຍເງິນເດືອນ — ເດືອນທີ່ຈ່າຍແລ້ວຫັກຄືນບໍ່ໄດ້ອີກ */
const openPeriodFrom = async (from?: string | null, t?: Transaction) => {
  const current = currentPeriod();
  const start = from && from > current ? from : current;
  const paid = await Payroll.findAll({ where: { status: PAYROLL_PAID, period: { [Op.gte]: start } }, attributes: ["period"], raw: true, transaction: t });
  const closed = new Set(paid.map((p: any) => String(p.period)));
  const month = moment(`${start}-01`);
  for (let i = 0; i < OPEN_PERIOD_LOOKAHEAD && closed.has(month.format("YYYY-MM")); i++) month.add(1, "month");
  return month.format("YYYY-MM");
};

/** ຍອດທີ່ຕິດຢູ່ຂອງຄົນນີ້: ຄ້າງຄືນ + ລໍຖ້າ/ອະນຸມັດ ທີ່ຍັງບໍ່ໄດ້ຈ່າຍ */
const exposureOf = async (employeeId: number, excludeId?: number, t?: Transaction) => {
  const rows = await SalaryAdvance.findAll({
    where: {
      employee_id: employeeId,
      status: { [Op.in]: [PENDING, APPROVED, ADVANCE_ACTIVE] },
      ...(excludeId ? { _uuid: { [Op.ne]: excludeId } } : {}),
    },
    attributes: ["amount", "repaid", "status"],
    raw: true,
    transaction: t,
  });
  return rows.reduce((sum: number, r: any) => sum + leftOf(r), 0);
};

/** ຍອດສູງສຸດທີ່ເບີກໄດ້ຕາມຕັ້ງຄ່າ (null = ບໍ່ຈຳກັດ) */
const limitOf = (basicSalary: unknown, percent: number) => (percent > 0 ? Math.floor((n(basicSalary) * percent) / 100) : null);

const notifyAdvance = (row: SalaryAdvance, title: string, lines: (string | null)[], actor: number | null, push = true) => notify([{
  employee_id: Number(row.employee_id),
  type: "advance",
  title,
  body: lines.filter(Boolean).join("\n") || null,
  ref: `advance:${row._uuid}`,
  createdbyid: actor,
  push,
}]);

/** ບັນຊີເງິນຄັງທີ່ຮັບ/ຈ່າຍເງິນເບີກ (ລັອກແຖວ) — ຕ້ອງເປີດໃຊ້ງານ ແລະ ເປັນສະກຸນກີບ */
const lakAccountOf = async (accountId: number, t: Transaction): Promise<any | { error: string }> => {
  const account: any = await TreasuryAccount.findByPk(accountId, { transaction: t, lock: t.LOCK.UPDATE });
  if (!account || Number(account.status) !== 1) return { error: "ບັນຊີເງິນຄັງບໍ່ມີ ຫຼື ປິດໃຊ້ງານແລ້ວ" };
  const type: any = await TypeTreasury.findByPk(account.type_treasuryid, {
    include: [{ model: Currency, as: "currency", attributes: ["_id", "name"] }],
    transaction: t,
  });
  if (!isBaseCurrency(type?.currency)) return { error: "ເງິນເບີກລ່ວງໜ້າໃຊ້ໄດ້ສະເພາະບັນຊີສະກຸນກີບ (LAK)" };
  return account;
};

/** ເດືອນຮ່າງທີ່ກະທົບຈາກການປ່ຽນເງິນເບີກຂອງຄົນນີ້ — ຄິດເງິນເດືອນຂອງຄົນນັ້ນໃໝ່ */
const syncEmployee = (row: SalaryAdvance) => syncDraftPayrolls([Number(row.employee_id)]);

// ================= ພະນັກງານ (app ມືຖື)

/**
 * GET /advance/me — ເງິນເບີກຂອງຕົນເອງ (ໃໝ່ສຸດກ່ອນ) ພ້ອມການຄືນ + balance ຍອດຄ້າງ + rules ເງື່ອນໄຂສຳລັບຟອມ
 * (enabled, max_amount = ຍັງເບີກໄດ້ເທົ່າໃດ — null ບໍ່ຈຳກັດ, max_installments, start_period, pending)
 */
export const getMyAdvances = async (req: Request, res: Response) => {
  try {
    const self = await selfEmployee(req);
    if ("code" in self) {
      res.status(self.code).json({ message: self.message });
      return;
    }
    const { employee } = self;
    const [rows, settings, startPeriod] = await Promise.all([
      SalaryAdvance.findAll({
        where: { employee_id: employee._uuid },
        include: [repaymentInclude],
        order: [["createdAt", "DESC"], ["_uuid", "DESC"], ...repaymentOrder],
      }),
      loadPayrollSettings(),
      openPeriodFrom(),
    ]);
    const data = rows.map(present);
    const limit = limitOf(employee.basic_salary, settings.advance_max_percent);
    const exposure = await exposureOf(employee._uuid);
    res.status(200).json({
      data,
      balance: data.filter((r) => Number(r.status) === ADVANCE_ACTIVE).reduce((sum, r) => sum + r.balance, 0),
      rules: {
        enabled: settings.advance_enabled,
        max_percent: settings.advance_max_percent,
        max_amount: limit === null ? null : Math.max(0, limit - exposure),
        max_installments: settings.advance_max_installments,
        start_period: startPeriod,
        pending: data.some((r) => Number(r.status) === PENDING),
      },
    });
  } catch (error) {
    sendError(res, error, "Error getting my salary advances");
  }
};

/** POST /advance/me { amount, installments?, reason } — ສົ່ງຄຳຂໍ (ລໍຖ້າ HR ອະນຸມັດ); ມີຄຳຂໍລໍຖ້າຢູ່ ຫຼື ເກີນຂີດຈຳກັດ = ຂໍບໍ່ໄດ້ */
export const createMyAdvance = async (req: Request, res: Response) => {
  try {
    const self = await selfEmployee(req);
    if ("code" in self) {
      res.status(self.code).json({ message: self.message });
      return;
    }
    const { employee } = self;
    const fail = (message: string) => res.status(400).json({ message });
    const settings = await loadPayrollSettings();
    if (!settings.advance_enabled) return fail("ບໍລິສັດປິດການຂໍເບີກເງິນລ່ວງໜ້າຜ່ານແອັບ — ຕິດຕໍ່ HR");
    const body = req.body || {};
    const amount = Math.round(n(body.amount));
    const installments = Number(body.installments ?? 1);
    const reason = text(body.reason);
    if (amount <= 0) return fail("ກະລຸນາປ້ອນຈຳນວນເງິນທີ່ຂໍເບີກ");
    if (!reason) return fail("ກະລຸນາປ້ອນເຫດຜົນ");
    if (!Number.isInteger(installments) || installments < 1 || installments > settings.advance_max_installments) {
      return fail(`ຜ່ອນຄືນໄດ້ 1–${settings.advance_max_installments} ເດືອນ`);
    }
    if (await SalaryAdvance.count({ where: { employee_id: employee._uuid, status: PENDING } })) {
      return fail("ທ່ານມີຄຳຂໍເບີກທີ່ລໍຖ້າອະນຸມັດຢູ່ແລ້ວ");
    }
    const limit = limitOf(employee.basic_salary, settings.advance_max_percent);
    if (limit !== null) {
      const available = Math.max(0, limit - (await exposureOf(employee._uuid)));
      if (amount > available) return fail(`ເບີກໄດ້ອີກບໍ່ເກີນ ${kipText(available)} (${settings.advance_max_percent}% ຂອງເງິນເດືອນ ລົບຍອດທີ່ຄ້າງຢູ່)`);
    }
    const row = await SalaryAdvance.create({
      employee_id: employee._uuid,
      requested_amount: amount,
      amount,
      installments,
      monthly_deduction: monthlyOf(amount, installments),
      start_period: await openPeriodFrom(),
      reason,
      status: PENDING,
      source: FROM_APP,
    });
    await notifyApprovers("advance", employee._uuid, row._uuid, `💵 ${fullName(employee)} ຂໍເບີກເງິນລ່ວງໜ້າ`, `${kipText(amount)} · ຜ່ອນ ${installments} ເດືອນ\n${reason}`);
    res.status(200).json({ message: "ສົ່ງຄຳຂໍເບີກເງິນແລ້ວ — ລໍຖ້າ HR ອະນຸມັດ", data: present(row) });
  } catch (error) {
    sendError(res, error, "Error creating salary advance request");
  }
};

/** PUT /advance/me/cancel/:id — ຍົກເລີກຄຳຂໍຂອງຕົນເອງ (ສະເພາະທີ່ຍັງລໍຖ້າ) */
export const cancelMyAdvance = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const self = await selfEmployee(req);
    if ("code" in self) {
      res.status(self.code).json({ message: self.message });
      return;
    }
    const row = await SalaryAdvance.findByPk(decodeId(req));
    if (!row || Number(row.employee_id) !== self.employee._uuid) {
      res.status(404).json({ message: "ບໍ່ພົບຄຳຂໍເບີກເງິນ" });
      return;
    }
    if (Number(row.status) !== PENDING) {
      res.status(400).json({ message: "ຍົກເລີກໄດ້ສະເພາະຄຳຂໍທີ່ຍັງລໍຖ້າອະນຸມັດ" });
      return;
    }
    await row.update({ status: CANCELLED, updatedAt: new Date() });
    res.status(200).json({ message: "ຍົກເລີກຄຳຂໍເບີກເງິນແລ້ວ", data: present(row) });
  } catch (error) {
    sendError(res, error, "Error cancelling salary advance request");
  }
};

// ================= HR

/** ຍອດຄ້າງຂອງແຖວ (ໃຊ້ໃນ SUM) */
const literalBalance = () => SalaryAdvance.sequelize!.literal("amount - repaid");

/**
 * POST /advance/fetch { status?, year?, employee_id? } — ເງິນເບີກ (ລໍຖ້າກ່ອນ, ໃໝ່ສຸດກ່ອນ) + ຈຳນວນຕາມສະຖານະ + ຍອດຄ້າງລວມ;
 * ກຳລັງຫັກຄືນ ສະແດງທຸກປີ (ບໍ່ກັ່ນຕາມປີ) ເພາະຍັງຄ້າງຢູ່
 */
export const getAdvances = async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const status = Number(body.status);
    const year = /^\d{4}$/.test(String(body.year ?? "")) ? String(body.year) : null;
    const employeeId = Number(body.employee_id) || null;
    const inYear = { createdAt: { [Op.between]: [new Date(`${year}-01-01T00:00:00+07:00`), new Date(`${year}-12-31T23:59:59+07:00`)] } };
    const scope = {
      ...(employeeId ? { employee_id: employeeId } : {}),
      ...(year ? { [Op.or]: [{ status: { [Op.in]: [PENDING, APPROVED, ADVANCE_ACTIVE] } }, inYear] } : {}),
    };
    const [rows, counts] = await Promise.all([
      SalaryAdvance.findAll({
        where: { ...scope, ...(STATUSES.includes(status) ? { status } : {}) },
        include: [employeeInclude, { ...accountInclude, as: "account" }],
        order: [["status", "ASC"], ["createdAt", "DESC"], ["_uuid", "DESC"]],
      }),
      SalaryAdvance.findAll({
        where: scope,
        attributes: ["status", [fn("COUNT", col("_uuid")), "total"], [fn("SUM", literalBalance()), "left"]],
        group: ["status"],
        raw: true,
      }) as Promise<any[]>,
    ]);
    const countOf = (s: number) => Number(counts.find((c) => Number(c.status) === s)?.total) || 0;
    res.status(200).json({
      data: rows.map(present),
      summary: {
        pending: countOf(PENDING),
        approved: countOf(APPROVED),
        active: countOf(ADVANCE_ACTIVE),
        settled: countOf(SETTLED),
        rejected: countOf(REJECTED),
        cancelled: countOf(CANCELLED),
        outstanding: Math.round(n(counts.find((c) => Number(c.status) === ADVANCE_ACTIVE)?.left)),
      },
    });
  } catch (error) {
    sendError(res, error, "Error getting salary advances");
  }
};

/** GET /advance/:id — ລາຍລະອຽດ + ການຄືນທັງໝົດ */
export const getAdvance = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const row = await findFull(Number(decodeId(req)));
    if (!row) {
      res.status(404).json({ message: "ບໍ່ພົບເງິນເບີກ" });
      return;
    }
    res.status(200).json({ data: present(row) });
  } catch (error) {
    sendError(res, error, "Error getting salary advance");
  }
};

/** ຍອດ / ຈຳນວນງວດ / ເດືອນເລີ່ມຫັກ ຈາກຟອມຂອງ HR — ບໍ່ສົ່ງ = ຄ່າເດີມ */
const scheduleOf = async (body: any, fallback: { amount: number; installments: number; start_period?: string }) => {
  const amount = body.amount === undefined || body.amount === "" ? fallback.amount : Math.round(n(body.amount));
  const installments = body.installments === undefined || body.installments === "" ? fallback.installments : Number(body.installments);
  const wanted = String(body.start_period ?? fallback.start_period ?? "");
  if (amount <= 0) return { error: "ຈຳນວນເງິນຕ້ອງຫຼາຍກວ່າ 0" };
  if (!Number.isInteger(installments) || installments < 1 || installments > MAX_INSTALLMENTS) return { error: `ຈຳນວນງວດຕ້ອງຢູ່ລະຫວ່າງ 1–${MAX_INSTALLMENTS} ເດືອນ` };
  if (wanted && !PERIOD.test(wanted)) return { error: "ເດືອນເລີ່ມຫັກບໍ່ຖືກຕ້ອງ" };
  return { amount, installments, start_period: await openPeriodFrom(wanted || null) };
};

/** POST /advance/create { employee_id, amount, installments?, start_period?, reason } — HR ບັນທຶກແທນພະນັກງານ (ຖືວ່າອະນຸມັດແລ້ວ, ລໍຖ້າຈ່າຍເງິນ) */
export const createAdvance = async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const fail = (message: string) => res.status(400).json({ message });
    const employee: any = await Employee.findByPk(Number(body.employee_id) || 0, { attributes: ["_uuid", "work_status"] });
    if (!employee) return fail("ບໍ່ພົບພະນັກງານ");
    if (Number(employee.work_status) !== WORKING) return fail("ພະນັກງານຄົນນີ້ລາອອກແລ້ວ");
    const reason = text(body.reason);
    if (!reason) return fail("ກະລຸນາປ້ອນເຫດຜົນ");
    const schedule = await scheduleOf(body, { amount: 0, installments: 1 });
    if ("error" in schedule) return fail(schedule.error!);
    const actor = Number(actorOf(req)) || null;
    const row = await SalaryAdvance.create({
      employee_id: employee._uuid,
      requested_amount: schedule.amount,
      amount: schedule.amount,
      installments: schedule.installments,
      monthly_deduction: monthlyOf(schedule.amount!, schedule.installments!),
      start_period: schedule.start_period,
      reason,
      status: APPROVED,
      source: FROM_HR,
      reviewedbyid: actor,
      reviewedAt: new Date(),
      createdbyid: actor,
    });
    await reply(res, row._uuid, "Successfully created salary advance");
  } catch (error) {
    sendError(res, error, "Error creating salary advance");
  }
};

/** PUT /advance/approve/:id { amount?, installments?, start_period?, note? } — ອະນຸມັດ (HR ປ່ຽນຍອດ / ງວດ ໄດ້); ລໍຖ້າຈ່າຍເງິນ */
export const approveAdvance = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const row = await SalaryAdvance.findByPk(decodeId(req));
    if (!row) {
      res.status(404).json({ message: "ບໍ່ພົບເງິນເບີກ" });
      return;
    }
    if (Number(row.status) !== PENDING) {
      res.status(400).json({ message: "ຄຳຂໍນີ້ບໍ່ໄດ້ລໍຖ້າອະນຸມັດແລ້ວ" });
      return;
    }
    const body = req.body || {};
    const schedule = await scheduleOf(body, { amount: n(row.amount), installments: Number(row.installments), start_period: row.start_period });
    if ("error" in schedule) {
      res.status(400).json({ message: schedule.error });
      return;
    }
    const actor = Number(actorOf(req)) || null;
    const note = text(body.note);
    await row.update({
      amount: schedule.amount,
      installments: schedule.installments,
      monthly_deduction: monthlyOf(schedule.amount!, schedule.installments!),
      start_period: schedule.start_period,
      status: APPROVED,
      review_note: note,
      reviewedbyid: actor,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    });
    await notifyAdvance(row, "ຄຳຂໍເບີກເງິນໄດ້ຮັບການອະນຸມັດແລ້ວ ✅", [
      `${kipText(schedule.amount)} · ຜ່ອນ ${schedule.installments} ເດືອນ ເລີ່ມຫັກ ${periodText(schedule.start_period!)}`,
      "ລໍຖ້າ HR ຈ່າຍເງິນ",
      note,
    ], actor);
    await reply(res, row._uuid, "ອະນຸມັດແລ້ວ — ລໍຖ້າຈ່າຍເງິນ");
  } catch (error) {
    sendError(res, error, "Error approving salary advance");
  }
};

/** PUT /advance/reject/:id { note? } — ປະຕິເສດ (ສະເພາະທີ່ລໍຖ້າ) */
export const rejectAdvance = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const row = await SalaryAdvance.findByPk(decodeId(req));
    if (!row) {
      res.status(404).json({ message: "ບໍ່ພົບເງິນເບີກ" });
      return;
    }
    if (Number(row.status) !== PENDING) {
      res.status(400).json({ message: "ຄຳຂໍນີ້ບໍ່ໄດ້ລໍຖ້າອະນຸມັດແລ້ວ" });
      return;
    }
    const actor = Number(actorOf(req)) || null;
    const note = text(req.body?.note);
    await row.update({ status: REJECTED, review_note: note, reviewedbyid: actor, reviewedAt: new Date(), updatedAt: new Date() });
    await notifyAdvance(row, "ຄຳຂໍເບີກເງິນບໍ່ໄດ້ຮັບການອະນຸມັດ", [kipText(row.amount), note], actor);
    await reply(res, row._uuid, "ປະຕິເສດຄຳຂໍແລ້ວ");
  } catch (error) {
    sendError(res, error, "Error rejecting salary advance");
  }
};

/** PUT /advance/cancel/:id { note? } — ຍົກເລີກລາຍການທີ່ອະນຸມັດແລ້ວ ແຕ່ຍັງບໍ່ໄດ້ຈ່າຍເງິນ */
export const cancelAdvance = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const row = await SalaryAdvance.findByPk(decodeId(req));
    if (!row) {
      res.status(404).json({ message: "ບໍ່ພົບເງິນເບີກ" });
      return;
    }
    if (Number(row.status) !== APPROVED) {
      res.status(400).json({ message: "ຍົກເລີກໄດ້ສະເພາະລາຍການທີ່ຍັງບໍ່ໄດ້ຈ່າຍເງິນ" });
      return;
    }
    const actor = Number(actorOf(req)) || null;
    const note = text(req.body?.note);
    await row.update({ status: CANCELLED, review_note: note ?? row.review_note, updatedAt: new Date() });
    await notifyAdvance(row, "ເງິນເບີກຖືກຍົກເລີກ", [kipText(row.amount), note], actor);
    await reply(res, row._uuid, "ຍົກເລີກແລ້ວ");
  } catch (error) {
    sendError(res, error, "Error cancelling salary advance");
  }
};

/**
 * PUT /advance/pay/:id { account_id, pay_date? } — ຈ່າຍເງິນເບີກ: ເງິນອອກຈາກບັນຊີເງິນຄັງສະກຸນກີບ (ຍອດໃຊ້ໄດ້ຕ້ອງພໍ)
 * + ລົງບັນຊີ ໜີ້ ເງິນລ່ວງໜ້າພະນັກງານ / ມີ ເງິນສົດ-ທະນາຄານ. ໃບເງິນເດືອນຮ່າງຂອງຄົນນີ້ຂຶ້ນງວດຫັກທັນທີ
 */
export const payAdvance = async (req: Request<{ id: string }>, res: Response) => {
  const t = await SalaryAdvance.sequelize!.transaction();
  const fail = async (code: number, message: string) => {
    await t.rollback();
    res.status(code).json({ message });
  };
  try {
    const row = await SalaryAdvance.findByPk(decodeId(req), { transaction: t, lock: t.LOCK.UPDATE });
    if (!row) return fail(404, "ບໍ່ພົບເງິນເບີກ");
    if (Number(row.status) !== APPROVED) return fail(400, "ຈ່າຍໄດ້ສະເພາະລາຍການທີ່ອະນຸມັດແລ້ວ ແລະ ຍັງບໍ່ໄດ້ຈ່າຍ");
    const body = req.body || {};
    const payDate = entryDateOf(body.pay_date, "ວັນທີຈ່າຍ");
    if ("error" in payDate) return fail(400, payDate.error);
    const accountId = Number(body.account_id);
    if (!Number.isInteger(accountId)) return fail(400, "ກະລຸນາເລືອກບັນຊີທີ່ຈ່າຍເງິນ");
    const account = await lakAccountOf(accountId, t);
    if ("error" in account) return fail(400, account.error);
    const amount = n(row.amount);
    if (n(account.balance_treasury) < amount) return fail(400, "ຍອດເງິນທີ່ໃຊ້ໄດ້ຂອງບັນຊີບໍ່ພໍຈ່າຍເງິນເບີກ");

    const actor = Number(actorOf(req)) || null;
    const number = docNumber(row._uuid);
    const employee: any = await Employee.findByPk(row.employee_id, { attributes: ["emp_code", "first_name", "last_name"], transaction: t });
    const who = employee ? `${employee.emp_code} ${[employee.first_name, employee.last_name].filter(Boolean).join(" ")}` : "";
    await moveBalance(account, {
      direction: MOVE_OUT, amount, source: "ADVANCE", sourceId: row._uuid, docNumber: number, date: payDate.date,
      description: `ຈ່າຍເງິນເບີກລ່ວງໜ້າ ${who}`.trim().slice(0, 255), actorId: actor,
    }, t);
    await row.update({
      status: ADVANCE_ACTIVE, number, account_id: accountId, pay_date: payDate.date,
      start_period: await openPeriodFrom(row.start_period, t), paidbyid: actor, paidAt: new Date(), updatedAt: new Date(),
    }, { transaction: t });
    // ລົງບັນຊີຄູ່ — ບໍ່ສຳເລັດ (ເຊັ່ນ ຍັງບໍ່ຜູກບັນຊີ, ປີປິດແລ້ວ) = ບໍ່ຈ່າຍ
    await postAdvance(row, t, actor);
    await t.commit();
    await syncEmployee(row);
    await notifyAdvance(row, "ຈ່າຍເງິນເບີກລ່ວງໜ້າໃຫ້ແລ້ວ 💵", [
      `${kipText(amount)} · ຫັກຈາກເງິນເດືອນ ${kipText(row.monthly_deduction)}/ເດືອນ ເລີ່ມ ${periodText(row.start_period)}`,
    ], actor);
    await reply(res, row._uuid, "ຈ່າຍເງິນເບີກແລ້ວ");
  } catch (error) {
    await t.rollback();
    if (replyGlError(res, error)) return;
    sendError(res, error, "Error paying salary advance");
  }
};

/** PUT /advance/unpay/:id — ຍົກເລີກການຈ່າຍ (ຍັງບໍ່ທັນມີການຄືນ): ຄືນເງິນເຂົ້າບັນຊີ + ກັບລາຍການບັນຊີຄູ່ ແລ້ວກັບເປັນ "ອະນຸມັດແລ້ວ" */
export const unpayAdvance = async (req: Request<{ id: string }>, res: Response) => {
  const t = await SalaryAdvance.sequelize!.transaction();
  const fail = async (code: number, message: string) => {
    await t.rollback();
    res.status(code).json({ message });
  };
  try {
    const row = await SalaryAdvance.findByPk(decodeId(req), { transaction: t, lock: t.LOCK.UPDATE });
    if (!row) return fail(404, "ບໍ່ພົບເງິນເບີກ");
    if (Number(row.status) !== ADVANCE_ACTIVE) return fail(400, "ຍົກເລີກໄດ້ສະເພາະລາຍການທີ່ຈ່າຍເງິນແລ້ວ");
    if (n(row.repaid) > 0 || await SalaryAdvanceRepayment.count({ where: { advance_id: row._uuid }, transaction: t })) {
      return fail(400, "ມີການຄືນເງິນແລ້ວ — ຍົກເລີກການຄືນເງິນກ່ອນ");
    }
    const actor = Number(actorOf(req)) || null;
    const account: any = row.account_id ? await TreasuryAccount.findByPk(row.account_id, { transaction: t, lock: t.LOCK.UPDATE }) : null;
    if (account) {
      await moveBalance(account, {
        direction: MOVE_IN, amount: n(row.amount), source: "ADVANCE_CANCEL", sourceId: row._uuid, docNumber: row.number,
        description: `ຍົກເລີກຈ່າຍເງິນເບີກ ${row.number ?? ""}`.trim(), actorId: actor,
      }, t);
    }
    await reverseSource("ADVANCE", row._uuid, t, actor);
    await row.update({ status: APPROVED, number: null, account_id: null, pay_date: null, paidbyid: null, paidAt: null, updatedAt: new Date() }, { transaction: t });
    await t.commit();
    await syncEmployee(row);
    await reply(res, row._uuid, "ຍົກເລີກການຈ່າຍເງິນເບີກແລ້ວ");
  } catch (error) {
    await t.rollback();
    if (replyGlError(res, error)) return;
    sendError(res, error, "Error cancelling salary advance payment");
  }
};

/**
 * PUT /advance/schedule/:id { monthly_deduction?, installments?, start_period? } — ປ່ຽນແຜນຫັກຄືນຂອງລາຍການທີ່ກຳລັງຫັກ
 * (ເຊັ່ນ ຂໍຜ່ອນຍາວຂຶ້ນ): ສົ່ງ installments = ແບ່ງຍອດຄ້າງເທົ່າກັນ, ສົ່ງ monthly_deduction = ກຳນົດເອງ
 */
export const updateAdvanceSchedule = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const row = await SalaryAdvance.findByPk(decodeId(req));
    if (!row) {
      res.status(404).json({ message: "ບໍ່ພົບເງິນເບີກ" });
      return;
    }
    const fail = (message: string) => res.status(400).json({ message });
    if (Number(row.status) !== ADVANCE_ACTIVE) return fail("ປ່ຽນແຜນໄດ້ສະເພາະລາຍການທີ່ກຳລັງຫັກຄືນ");
    const body = req.body || {};
    const left = leftOf(row);
    const installments = body.installments === undefined || body.installments === "" ? null : Number(body.installments);
    if (installments !== null && (!Number.isInteger(installments) || installments < 1 || installments > MAX_INSTALLMENTS)) {
      return fail(`ຈຳນວນງວດຕ້ອງຢູ່ລະຫວ່າງ 1–${MAX_INSTALLMENTS} ເດືອນ`);
    }
    const monthly = installments !== null ? monthlyOf(left, installments) : Math.round(n(body.monthly_deduction ?? row.monthly_deduction));
    if (monthly <= 0) return fail("ຫັກຕໍ່ເດືອນຕ້ອງຫຼາຍກວ່າ 0");
    const wanted = String(body.start_period ?? row.start_period);
    if (!PERIOD.test(wanted)) return fail("ເດືອນເລີ່ມຫັກບໍ່ຖືກຕ້ອງ");
    await row.update({
      monthly_deduction: monthly,
      installments: installments ?? Number(row.installments),
      start_period: await openPeriodFrom(wanted),
      updatedAt: new Date(),
    });
    await syncEmployee(row);
    await notifyAdvance(row, "ແຜນຫັກຄືນເງິນເບີກປ່ຽນແລ້ວ", [`ຫັກ ${kipText(monthly)}/ເດືອນ · ເລີ່ມ ${periodText(row.start_period)} · ຄ້າງ ${kipText(left)}`], Number(actorOf(req)) || null, false);
    await reply(res, row._uuid, "ປ່ຽນແຜນຫັກຄືນແລ້ວ");
  } catch (error) {
    sendError(res, error, "Error updating salary advance schedule");
  }
};

/** ບວກ/ລົບຍອດທີ່ຄືນແລ້ວ ແລະ ປັບສະຖານະ (ຄົບ = ຄືນຄົບແລ້ວ, ຍັງບໍ່ຄົບ = ກຳລັງຫັກຄືນ); ຄືນ true ເມື່ອຫາກໍ່ຄືນຄົບ */
const applyRepaid = async (row: SalaryAdvance, delta: number, t: Transaction) => {
  const repaid = Math.max(0, Math.round(n(row.repaid) + delta));
  const done = repaid >= Math.round(n(row.amount));
  const settledNow = done && Number(row.status) !== SETTLED;
  await row.update({ repaid, status: done ? SETTLED : ADVANCE_ACTIVE, settledAt: done ? row.settledAt ?? new Date() : null, updatedAt: new Date() }, { transaction: t });
  return settledNow;
};

const notifySettled = (rows: SalaryAdvance[], actor: number | null) => notify(rows.map((row) => ({
  employee_id: Number(row.employee_id),
  type: "advance",
  title: "ຄືນເງິນເບີກລ່ວງໜ້າຄົບແລ້ວ ✅",
  body: `${row.number ?? ""} · ${kipText(row.amount)}`.trim(),
  ref: `advance:${row._uuid}`,
  createdbyid: actor,
})));

/**
 * POST /advance/repay/:id { amount, account_id, repay_date?, note? } — ຮັບຄືນເງິນເບີກເປັນເງິນສົດ / ໂອນ (ເຊັ່ນ ກ່ອນລາອອກ):
 * ເງິນເຂົ້າບັນຊີເງິນຄັງສະກຸນກີບ + ລົງບັນຊີ ໜີ້ ເງິນສົດ-ທະນາຄານ / ມີ ເງິນລ່ວງໜ້າພະນັກງານ. ບໍ່ເກີນຍອດຄ້າງ
 */
export const repayAdvance = async (req: Request<{ id: string }>, res: Response) => {
  const t = await SalaryAdvance.sequelize!.transaction();
  const fail = async (code: number, message: string) => {
    await t.rollback();
    res.status(code).json({ message });
  };
  try {
    const row = await SalaryAdvance.findByPk(decodeId(req), { transaction: t, lock: t.LOCK.UPDATE });
    if (!row) return fail(404, "ບໍ່ພົບເງິນເບີກ");
    if (Number(row.status) !== ADVANCE_ACTIVE) return fail(400, "ຮັບຄືນໄດ້ສະເພາະລາຍການທີ່ກຳລັງຫັກຄືນ");
    const body = req.body || {};
    const amount = Math.round(n(body.amount));
    const left = leftOf(row);
    if (amount <= 0) return fail(400, "ກະລຸນາປ້ອນຈຳນວນເງິນ");
    if (amount > left) return fail(400, `ຮັບຄືນໄດ້ບໍ່ເກີນຍອດຄ້າງ ${kipText(left)}`);
    const date = entryDateOf(body.repay_date, "ວັນທີຮັບຄືນ");
    if ("error" in date) return fail(400, date.error);
    const accountId = Number(body.account_id);
    if (!Number.isInteger(accountId)) return fail(400, "ກະລຸນາເລືອກບັນຊີທີ່ຮັບເງິນ");
    const account = await lakAccountOf(accountId, t);
    if ("error" in account) return fail(400, account.error);

    const actor = Number(actorOf(req)) || null;
    const note = text(body.note) ?? `ຮັບຄືນເງິນເບີກ ${row.number ?? ""}`.trim();
    const repayment = await SalaryAdvanceRepayment.create({
      advance_id: row._uuid, employee_id: row.employee_id, kind: BY_CASH, amount, repay_date: date.date, account_id: accountId, note, createdbyid: actor,
    }, { transaction: t });
    await moveBalance(account, {
      direction: MOVE_IN, amount, source: "ADVANCE_REPAY", sourceId: repayment._uuid, docNumber: row.number, date: date.date, description: note, actorId: actor,
    }, t);
    const settled = await applyRepaid(row, amount, t);
    await postAdvanceRepayment(repayment, row.number, t, actor);
    await t.commit();
    await syncEmployee(row);
    if (settled) await notifySettled([row], actor);
    await reply(res, row._uuid, settled ? "ຮັບຄືນຄົບແລ້ວ" : "ຮັບຄືນແລ້ວ");
  } catch (error) {
    await t.rollback();
    if (replyGlError(res, error)) return;
    sendError(res, error, "Error repaying salary advance");
  }
};

/** DELETE /advance/repayment/:id — ຍົກເລີກການຮັບຄືນເງິນສົດ; ສ່ວນທີ່ຫັກຈາກເງິນເດືອນ ຍົກເລີກຜ່ານ "ຍົກເລີກການຈ່າຍ" ຂອງໃບເງິນເດືອນ */
export const deleteAdvanceRepayment = async (req: Request<{ id: string }>, res: Response) => {
  const t = await SalaryAdvance.sequelize!.transaction();
  const fail = async (code: number, message: string) => {
    await t.rollback();
    res.status(code).json({ message });
  };
  try {
    const repayment = await SalaryAdvanceRepayment.findByPk(decodeId(req), { transaction: t, lock: t.LOCK.UPDATE });
    if (!repayment) return fail(404, "ບໍ່ພົບລາຍການຄືນເງິນ");
    if (Number(repayment.kind) !== BY_CASH) return fail(400, "ຫັກຈາກເງິນເດືອນ — ຍົກເລີກຜ່ານ \"ຍົກເລີກການຈ່າຍ\" ຂອງໃບເງິນເດືອນ");
    const row = await SalaryAdvance.findByPk(repayment.advance_id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!row) return fail(404, "ບໍ່ພົບເງິນເບີກ");
    const actor = Number(actorOf(req)) || null;
    const account: any = repayment.account_id ? await TreasuryAccount.findByPk(repayment.account_id, { transaction: t, lock: t.LOCK.UPDATE }) : null;
    if (account) {
      await moveBalance(account, {
        direction: MOVE_OUT, amount: n(repayment.amount), source: "ADVANCE_REPAY_CANCEL", sourceId: repayment._uuid, docNumber: row.number,
        description: `ຍົກເລີກຮັບຄືນເງິນເບີກ ${row.number ?? ""}`.trim(), actorId: actor,
      }, t);
    }
    await reverseSource("ADVANCE_REPAY", repayment._uuid, t, actor);
    await applyRepaid(row, -n(repayment.amount), t);
    await repayment.destroy({ transaction: t });
    await t.commit();
    await syncEmployee(row);
    await reply(res, row._uuid, "ຍົກເລີກການຮັບຄືນແລ້ວ");
  } catch (error) {
    await t.rollback();
    if (replyGlError(res, error)) return;
    sendError(res, error, "Error deleting salary advance repayment");
  }
};

// ================= ເຊື່ອມກັບໃບເງິນເດືອນ

/**
 * ຈ່າຍເງິນເດືອນ (ໃນ transaction ດຽວກັນ): ຍອດ advance_deduction ຂອງແຕ່ລະແຖວ ຕັດລາຍການເກົ່າກ່ອນ (ຕາມວັນທີຈ່າຍ).
 * ຍອດຫັກເກີນຍອດຄ້າງ (ເຊັ່ນ ຮັບຄືນເງິນສົດຫຼັງສ້າງໃບ ແລ້ວແຖວປ້ອນເອງ) = error ບໍ່ຈ່າຍ. ຄືນລາຍການທີ່ຄືນຄົບ (ແຈ້ງພະນັກງານຫຼັງ commit)
 */
export const applyPayrollRepayments = async (
  payroll: { _uuid: number; period: string }, lines: any[], date: string, actor: number | null, t: Transaction,
) => {
  const settled: SalaryAdvance[] = [];
  for (const line of lines) {
    let left = Math.round(n(line.advance_deduction));
    if (left <= 0) continue;
    const rows = await SalaryAdvance.findAll({
      where: { employee_id: line.employee_id, status: ADVANCE_ACTIVE },
      order: [["pay_date", "ASC"], ["_uuid", "ASC"]],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    for (const row of rows) {
      if (left <= 0) break;
      const portion = Math.min(left, leftOf(row));
      if (portion <= 0) continue;
      await SalaryAdvanceRepayment.create({
        advance_id: row._uuid, employee_id: row.employee_id, kind: BY_PAYROLL, amount: portion, repay_date: date,
        period: payroll.period, payroll_id: payroll._uuid, createdbyid: actor,
      }, { transaction: t });
      if (await applyRepaid(row, portion, t)) settled.push(row);
      left -= portion;
    }
    if (left > 0) throw new AdvanceMismatch(`${line.emp_code} ${line.employee_name}: ຍອດຫັກເງິນເບີກເກີນຍອດຄ້າງ — ກົດ "ຄິດໄລ່ໃໝ່" ກ່ອນຈ່າຍ`);
  }
  return settled;
};

export const notifyAdvancesSettled = notifySettled;

/** ຍົກເລີກການຈ່າຍເງິນເດືອນ: ຖອນການຫັກຄືນຂອງໃບນີ້ (ລາຍການທີ່ຄືນຄົບ ກັບມາກຳລັງຫັກຄືນ) */
export const reversePayrollRepayments = async (payrollId: number, t: Transaction) => {
  const repayments = await SalaryAdvanceRepayment.findAll({ where: { payroll_id: payrollId, kind: BY_PAYROLL }, transaction: t, lock: t.LOCK.UPDATE });
  for (const repayment of repayments) {
    const row = await SalaryAdvance.findByPk(repayment.advance_id, { transaction: t, lock: t.LOCK.UPDATE });
    if (row) await applyRepaid(row, -n(repayment.amount), t);
    await repayment.destroy({ transaction: t });
  }
};

/** ຍອດຫັກເງິນເບີກບໍ່ກົງກັບຍອດຄ້າງ — ບອກ HR ຕອນຈ່າຍເງິນເດືອນ (400) */
export class AdvanceMismatch extends Error {}

/** ພະນັກງານລາອອກ: ຍົກເລີກຄຳຂໍທີ່ຍັງບໍ່ໄດ້ຈ່າຍເງິນ; ຄືນຍອດຄ້າງ (ຫັກໝົດໃນເງິນເດືອນງວດສຸດທ້າຍ ຫຼື ຮັບຄືນເງິນສົດ) */
export const closeAdvancesOfResigned = async (employeeId: number) => {
  await SalaryAdvance.update(
    { status: CANCELLED, review_note: "ພະນັກງານລາອອກ", updatedAt: new Date() } as any,
    { where: { employee_id: employeeId, status: { [Op.in]: [PENDING, APPROVED] } } },
  );
};

/** ຍອດເບີກຄ້າງຂອງຄົນ (ຈ່າຍເງິນແລ້ວ ຍັງຄືນບໍ່ຄົບ) */
export const advanceBalanceOf = async (employeeId: number) => {
  const rows = await SalaryAdvance.findAll({ where: { employee_id: employeeId, status: ADVANCE_ACTIVE }, attributes: ["amount", "repaid"], raw: true });
  return rows.reduce((sum: number, r: any) => sum + leftOf(r), 0);
};

/** ຄຳຂໍທີ່ລໍຖ້າ / ລາຍການທີ່ອະນຸມັດລໍຖ້າຈ່າຍ — ໜ້າ desktop ຂອງ HR */
export const advancePendingCounts = async () => {
  const [pending, approved] = await Promise.all([
    SalaryAdvance.count({ where: { status: PENDING } }),
    SalaryAdvance.count({ where: { status: APPROVED } }),
  ]);
  return { pending, approved };
};
