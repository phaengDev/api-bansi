import { Request, Response } from "express";
import moment from "moment";
import { Op, Transaction } from "sequelize";
import Overtime from "../../models/overtime";
import Employee from "../../models/employee";
import Department from "../../models/department";
import Payroll from "../../models/payroll";
import { actorOf, decodeId, sendError, toDateOnly } from "../bansi/bansiHelpers";
import { profileUrl } from "./hrHelpers";
import {
  OT_KINDS, OT_PAY_RATE, OT_PAY_TYPES, loadPayrollSettings, otFixedOf, otRateOf, otTotals,
} from "./payrollRules";
import { syncDraftOvertime } from "./payrollController";
import {
  HHMM, PERIOD, currentPeriod, employedOn, findCompany, holidaysBetween, isWorkday, monthOf, workRulesOf,
} from "./workCalendar";

/**
 * ການເຮັດວຽກລ່ວງເວລາ (OT) — HR ບັນທຶກມື້ທີ່ພະນັກງານເຮັດ OT (ຫຼາຍຄົນພ້ອມກັນໄດ້): ເວລາເລີ່ມ–ເລີກ (ຂ້າມທ່ຽງຄືນໄດ້) ຫຼື
 * ຈຳນວນຊົ່ວໂມງ + ປະເພດ + ວິທີຈ່າຍ: ຕາມອັດຕາ (% ຢູ່ ຕັ້ງຄ່າເງິນເດືອນ), ກຳນົດເງິນຕໍ່ຊົ່ວໂມງ ຫຼື ເໝົາຈ່າຍ. ໃບເງິນເດືອນຂອງເດືອນລວມ OT ໃຫ້ (ສ້າງ / ຄິດໄລ່ໃໝ່);
 * ເດືອນທີ່ຈ່າຍເງິນເດືອນແລ້ວ ບັນທຶກ/ແກ້/ລຶບ OT ບໍ່ໄດ້
 */

const PAYROLL_PAID = 2;
const KINDS = Object.keys(OT_KINDS).map(Number);
const MAX_HOURS = 24;

const employeeInclude = {
  model: Employee,
  as: "employee",
  attributes: ["_uuid", "emp_code", "first_name", "last_name", "profile", "basic_salary"],
  include: [{ model: Department, as: "department", attributes: ["_uuid", "depart_name"] }],
};

/** ບໍ່ສົ່ງເງິນເດືອນພື້ນຖານອອກໄປ (ໃຊ້ຄິດປະມານຄ່າ OT ຢູ່ backend ເທົ່ານັ້ນ) */
const present = (row: Overtime) => {
  const { employee, ...r }: any = row.get({ plain: true });
  const { basic_salary: _salary, ...person } = employee ?? {};
  return {
    ...r,
    hours: Number(r.hours) || 0,
    amount: Number(r.amount) || 0,
    /** ເງິນຂອງລາຍການທີ່ກຳນົດເງິນເອງ (ຕໍ່ຊົ່ວໂມງ × ຊົ່ວໂມງ / ເໝົາຈ່າຍ); ຕາມອັດຕາ = 0 (ຄິດຕອນເຮັດເງິນເດືອນ) */
    fixed_amount: otFixedOf(r),
    employee: employee ? { ...person, profile_url: profileUrl(person.profile) } : null,
  };
};

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** ຊ່ວງເວລາເປັນນາທີ — ເລີກ ≤ ເລີ່ມ = ຂ້າມທ່ຽງຄືນ */
const spanOf = (start: string, end: string) => {
  const from = minutesOf(start);
  let to = minutesOf(end);
  if (to <= from) to += 24 * 60;
  return { from, to };
};

const payrollPaidFor = async (date: string, t?: Transaction) =>
  !!(await Payroll.count({ where: { period: date.slice(0, 7), status: PAYROLL_PAID }, transaction: t }));

const paidMessage = (date: string) =>
  `ເດືອນ ${moment(date).format("MM/YYYY")} ຈ່າຍເງິນເດືອນແລ້ວ — ບັນທຶກ ຫຼື ແກ້ OT ຂອງເດືອນນີ້ບໍ່ໄດ້ (ຍົກເລີກການຈ່າຍກ່ອນ)`;

type OvertimeInput = {
  work_date: string; start_time: string | null; end_time: string | null; hours: number; kind: number; pay_type: number; amount: number;
  note: string | null;
};

/** ກວດຂໍ້ມູນຈາກຟອມ — ມີເວລາເລີ່ມ–ເລີກ = ຄິດຊົ່ວໂມງໃຫ້, ບໍ່ມີ = ໃຊ້ hours ທີ່ສົ່ງມາ */
const parseInput = (body: any): OvertimeInput | { error: string } => {
  const workDate = toDateOnly(body.work_date);
  if (!workDate) return { error: "ກະລຸນາເລືອກວັນທີ" };
  if (workDate.slice(0, 7) > currentPeriod()) return { error: "ບັນທຶກ OT ຂອງເດືອນທີ່ຍັງບໍ່ຮອດບໍ່ໄດ້" };
  const kind = Number(body.kind);
  if (!KINDS.includes(kind)) return { error: "ກະລຸນາເລືອກປະເພດ OT" };
  const start = String(body.start_time ?? "");
  const end = String(body.end_time ?? "");
  let hours: number;
  if (start || end) {
    if (!HHMM.test(start) || !HHMM.test(end)) return { error: "ເວລາເລີ່ມ / ເລີກບໍ່ຖືກຕ້ອງ" };
    if (start === end) return { error: "ເວລາເລີ່ມ ແລະ ເວລາເລີກຕ້ອງບໍ່ຄືກັນ" };
    const span = spanOf(start, end);
    hours = Math.round(((span.to - span.from) / 60) * 100) / 100;
  } else {
    hours = Math.round((Number(body.hours) || 0) * 100) / 100;
  }
  if (!(hours > 0) || hours > MAX_HOURS) return { error: `ຊົ່ວໂມງ OT ຕ້ອງຫຼາຍກວ່າ 0 ແລະ ບໍ່ເກີນ ${MAX_HOURS}` };
  const payType = Number(body.pay_type ?? OT_PAY_RATE);
  if (!OT_PAY_TYPES.includes(payType)) return { error: "ວິທີຈ່າຍ OT ບໍ່ຖືກຕ້ອງ" };
  const amount = payType === OT_PAY_RATE ? 0 : Math.round(Number(body.amount) || 0);
  if (payType !== OT_PAY_RATE && !(amount > 0)) return { error: "ກະລຸນາປ້ອນຍອດເງິນ OT" };
  const note = String(body.note ?? "").trim().slice(0, 255) || null;
  return { work_date: workDate, start_time: start || null, end_time: end || null, hours, kind, pay_type: payType, amount, note };
};

/** ເວລາຊ້ອນກັບ OT ອື່ນຂອງຄົນດຽວກັນໃນມື້ດຽວກັນ (ສະເພາະລາຍການທີ່ມີເວລາ) */
const clashOf = async (employeeId: number, input: OvertimeInput, exceptId: number | null, t?: Transaction) => {
  if (!input.start_time || !input.end_time) return null;
  const mine = spanOf(input.start_time, input.end_time);
  const others = await Overtime.findAll({
    where: { employee_id: employeeId, work_date: input.work_date, ...(exceptId ? { _uuid: { [Op.ne]: exceptId } } : {}) },
    transaction: t,
  });
  return others.find((o) => {
    if (!o.start_time || !o.end_time) return false;
    const other = spanOf(o.start_time, o.end_time);
    return mine.from < other.to && other.from < mine.to;
  }) ?? null;
};

/**
 * POST /overtime/fetch { period: "YYYY-MM", employee_id? } — OT ຂອງເດືອນ (ວັນທີ, ເວລາ, ເງິນ pay ໂດຍປະມານ) + ສະຫຼຸບລາຍຄົນ (ຊົ່ວໂມງຕາມປະເພດ,
 * ຊົ່ວໂມງຄູນອັດຕາ, ຄ່າ OT ໂດຍປະມານຕາມຕັ້ງຄ່າປັດຈຸບັນ) + ມື້ຂອງເດືອນ (ມື້ເຮັດວຽກ / ວັນພັກ — ຟອມແນະນຳປະເພດ)
 */
export const getOvertimes = async (req: Request, res: Response) => {
  try {
    const raw = String(req.body?.period ?? "");
    const period = PERIOD.test(raw) ? raw : currentPeriod();
    const employeeId = Number(req.body?.employee_id) || null;
    const { start, end, dates } = monthOf(period);
    const [rows, settings, company, holidays, paid] = await Promise.all([
      Overtime.findAll({
        where: { work_date: { [Op.between]: [start, end] }, ...(employeeId ? { employee_id: employeeId } : {}) },
        include: [employeeInclude],
        order: [["work_date", "DESC"], ["start_time", "ASC"], ["_uuid", "ASC"]],
      }),
      loadPayrollSettings(),
      findCompany(),
      holidaysBetween(start, end),
      payrollPaidFor(start),
    ]);
    const rules = workRulesOf(company);
    const days = dates.map((date) => ({ date, workday: isWorkday(date, rules, holidays), holiday: holidays.get(date) ?? null }));
    const workdays = days.filter((d) => d.workday).length;

    const people = new Map<number, { employee: any; basic: number; rows: Overtime[] }>();
    for (const row of rows) {
      const id = Number(row.employee_id);
      const entry = people.get(id) ?? { employee: present(row).employee, basic: Number((row as any).employee?.basic_salary) || 0, rows: [] };
      entry.rows.push(row);
      people.set(id, entry);
    }
    const summary = [...people.entries()].map(([employeeId, p]) => {
      const totals = otTotals(p.rows, settings);
      const byKind = Object.fromEntries(KINDS.map((k) => [k, p.rows.filter((r) => Number(r.kind) === k).reduce((n, r) => n + (Number(r.hours) || 0), 0)]));
      const hourly = workdays > 0 ? p.basic / workdays / Math.max(1, settings.ot_hours_per_day) : 0;
      return {
        employee_id: employeeId,
        employee: p.employee,
        records: p.rows.length,
        hours: totals.hours,
        weighted_hours: totals.weighted,
        by_kind: byKind,
        /** ເງິນທີ່ກຳນົດເອງ (ຕໍ່ຊົ່ວໂມງ + ເໝົາຈ່າຍ) */
        fixed_amount: totals.fixed,
        estimate: Math.round(hourly * totals.weighted) + totals.fixed,
      };
    }).sort((a, b) => b.hours - a.hours);

    // ເງິນຂອງແຕ່ລະລາຍການ — ຕາມອັດຕາ: ເງິນເດືອນ ÷ ມື້ເຮັດວຽກ ÷ ຊົ່ວໂມງຕໍ່ມື້ × ຊົ່ວໂມງ × % (ໂດຍປະມານ — ຕົວເລກແທ້ຢູ່ໃບເງິນເດືອນ)
    const payOf = (row: Overtime) => {
      if (Number(row.pay_type) !== OT_PAY_RATE) return otFixedOf(row);
      const basic = Number((row as any).employee?.basic_salary) || 0;
      const hourly = workdays > 0 ? basic / workdays / Math.max(1, settings.ot_hours_per_day) : 0;
      return Math.round((hourly * (Number(row.hours) || 0) * otRateOf(Number(row.kind), settings)) / 100);
    };
    res.status(200).json({
      period,
      paid,
      data: rows.map((row) => ({ ...present(row), pay: payOf(row) })),
      summary,
      days,
      rates: Object.fromEntries(KINDS.map((k) => [k, otRateOf(k, settings)])),
      hours_per_day: settings.ot_hours_per_day,
    });
  } catch (error) {
    sendError(res, error, "Error getting overtime");
  }
};

/**
 * POST /overtime/create { work_date, employee_ids: number[], start_time?, end_time?, hours?, kind, pay_type, amount?, note? } —
 * ບັນທຶກ OT ໃຫ້ຫຼາຍຄົນພ້ອມກັນ (ເວລາດຽວກັນ); ຜິດຄົນດຽວ ບໍ່ບັນທຶກຈັກຄົນ
 */
export const createOvertime = async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const fail = (message: string) => res.status(400).json({ message });
    const input = parseInput(body);
    if ("error" in input) return fail(input.error);
    const ids = [...new Set((Array.isArray(body.employee_ids) ? body.employee_ids : []).map(Number).filter((n: number) => n > 0))] as number[];
    if (!ids.length) return fail("ກະລຸນາເລືອກພະນັກງານຢ່າງໜ້ອຍ 1 ຄົນ");
    if (ids.length > 500) return fail("ເລືອກພະນັກງານໄດ້ບໍ່ເກີນ 500 ຄົນຕໍ່ຄັ້ງ");
    if (await payrollPaidFor(input.work_date)) return fail(paidMessage(input.work_date));

    const employees = await Employee.findAll({ where: { _uuid: { [Op.in]: ids } }, attributes: ["_uuid", "emp_code", "first_name", "start_date", "end_date", "work_status"] });
    if (employees.length !== ids.length) return fail("ບໍ່ພົບພະນັກງານບາງຄົນ");
    const notEmployed = employees.find((e: any) => !employedOn(e, input.work_date));
    if (notEmployed) return fail(`${notEmployed.emp_code} ${notEmployed.first_name} ບໍ່ໄດ້ເປັນພະນັກງານໃນວັນທີ ${moment(input.work_date).format("DD/MM/YYYY")}`);
    for (const e of employees) {
      const clash = await clashOf(e._uuid, input, null);
      if (clash) return fail(`${e.emp_code} ${e.first_name} ມີ OT ${clash.start_time}–${clash.end_time} ໃນມື້ນີ້ແລ້ວ (ເວລາຊ້ອນກັນ)`);
    }

    const actor = Number(actorOf(req)) || null;
    const data = await Overtime.bulkCreate(ids.map((employee_id) => ({ ...input, employee_id, createdbyid: actor, updatedbyid: actor })));
    await syncDraftOvertime(input.work_date.slice(0, 7), ids);
    res.status(200).json({ message: `ບັນທຶກ OT ແລ້ວ ${data.length} ຄົນ · ${input.hours} ຊົ່ວໂມງ`, data });
  } catch (error) {
    sendError(res, error, "Error creating overtime");
  }
};

/** PUT /overtime/:id { work_date, start_time?, end_time?, hours?, kind, pay_type, amount?, note? } — ແກ້ OT 1 ລາຍການ (ພະນັກງານຄົນເດີມ) */
export const updateOvertime = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const row = await Overtime.findByPk(decodeId(req));
    if (!row) {
      res.status(404).json({ message: "ບໍ່ພົບລາຍການ OT" });
      return;
    }
    const fail = (message: string) => res.status(400).json({ message });
    const input = parseInput(req.body || {});
    if ("error" in input) return fail(input.error);
    for (const date of new Set([String(row.work_date), input.work_date])) {
      if (await payrollPaidFor(date)) return fail(paidMessage(date));
    }
    const employee: any = await Employee.findByPk(row.employee_id, { attributes: ["_uuid", "start_date", "end_date", "work_status"] });
    if (employee && !employedOn(employee, input.work_date)) return fail(`ບໍ່ໄດ້ເປັນພະນັກງານໃນວັນທີ ${moment(input.work_date).format("DD/MM/YYYY")}`);
    const clash = await clashOf(Number(row.employee_id), input, row._uuid);
    if (clash) return fail(`ມີ OT ${clash.start_time}–${clash.end_time} ໃນມື້ນີ້ແລ້ວ (ເວລາຊ້ອນກັນ)`);

    const before = String(row.work_date).slice(0, 7);
    await row.update({ ...input, updatedbyid: Number(actorOf(req)) || null, updatedAt: new Date() });
    for (const period of new Set([before, input.work_date.slice(0, 7)])) await syncDraftOvertime(period, [Number(row.employee_id)]);
    res.status(200).json({ message: "Successfully updated overtime", data: row });
  } catch (error) {
    sendError(res, error, "Error updating overtime");
  }
};

/** DELETE /overtime/:id */
export const deleteOvertime = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const row = await Overtime.findByPk(decodeId(req));
    if (!row) {
      res.status(404).json({ message: "ບໍ່ພົບລາຍການ OT" });
      return;
    }
    if (await payrollPaidFor(String(row.work_date))) {
      res.status(400).json({ message: paidMessage(String(row.work_date)) });
      return;
    }
    await row.destroy();
    await syncDraftOvertime(String(row.work_date).slice(0, 7), [Number(row.employee_id)]);
    res.status(200).json({ message: "Successfully deleted overtime" });
  } catch (error) {
    sendError(res, error, "Error deleting overtime");
  }
};
