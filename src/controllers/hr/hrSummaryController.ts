import { Request, Response } from "express";
import Employee from "../../models/employee";
import LeaveRequest from "../../models/leaveRequest";
import AttendanceRequest from "../../models/attendanceRequest";
import PayrollLine from "../../models/payrollLine";
import Payroll from "../../models/payroll";
import AuditLog from "../../models/auditLog";
import Users from "../../models/userModel";
import { decodeId, sendError } from "../bansi/bansiHelpers";
import { advanceBalanceOf, advancePendingCounts } from "./advanceController";
import { Op } from "sequelize";
import { LEAD_WAITING, balancesOf } from "./leaveController";
import { nowLao } from "./workCalendar";
import { companyDocsDue } from "./companyDocumentController";

/** ພາບລວມທີ່ດຶງຂໍ້ມູນຂ້າມໂມດູນ HR — ຄຳຮ້ອງທີ່ລໍຖ້າ HR ແລະ ສະຫຼຸບຂອງພະນັກງານ 1 ຄົນ */

const PENDING = 1;
const PAYROLL_PAID = 2;

/**
 * ເອກະສານ / ສັນຍາ ໃກ້ໝົດອາຍຸ ຂອງພະນັກງານທີ່ເຮັດວຽກຢູ່ — ບ່ອນດຽວທີ່ຄິດ (desktop "ຕ້ອງຕິດຕາມ" ແລະ ໜ້າພະນັກງານໃຊ້ຮ່ວມກັນ):
 * ສັນຍາມີກຳນົດ / ບັດປະຈຳຕົວ / passport: ໝົດແລ້ວ ຫຼື ໝົດພາຍໃນ 30 ມື້; ທົດລອງວຽກ: ຄົບພາຍໃນ 14 ມື້ (ຜ່ານແລ້ວບໍ່ນັບ — ບໍ່ຕ້ອງເຮັດຫຍັງ).
 * days = ມື້ທີ່ເຫຼືອ (ລົບ = ໝົດແລ້ວ), ລຽງໃກ້ສຸດກ່ອນ
 */
const EXPIRY_AHEAD_DAYS = 30;
const PROBATION_AHEAD_DAYS = 14;
const WORKING = 1;
export type ExpiryKind = "contract" | "probation" | "id_card" | "passport";

export const expiringItems = async () => {
  const today = nowLao().startOf("day");
  const todayKey = today.format("YYYY-MM-DD");
  const soon = today.clone().add(EXPIRY_AHEAD_DAYS, "days").format("YYYY-MM-DD");
  const probationSoon = today.clone().add(PROBATION_AHEAD_DAYS, "days").format("YYYY-MM-DD");
  const rows = (await Employee.findAll({
    where: {
      work_status: WORKING,
      [Op.or]: [
        { contract_fixed_term: 1, contract_end: { [Op.lte]: soon } },
        { probation_end: { [Op.between]: [todayKey, probationSoon] } },
        { id_card_expiry: { [Op.lte]: soon } },
        { passport_expiry: { [Op.lte]: soon } },
      ],
    },
    attributes: ["_uuid", "emp_code", "first_name", "last_name", "contract_fixed_term", "contract_end", "probation_end", "id_card_expiry", "passport_expiry"],
    raw: true,
  })) as any[];
  const items: { employee_id: number; emp_code: string; name: string; kind: ExpiryKind; date: string; days: number }[] = [];
  const add = (row: any, kind: ExpiryKind, date: string | null, until: string, from?: string) => {
    if (!date || date > until || (from && date < from)) return;
    items.push({
      employee_id: Number(row._uuid), emp_code: row.emp_code, name: [row.first_name, row.last_name].filter(Boolean).join(" "),
      kind, date, days: Math.round((new Date(`${date}T00:00:00`).getTime() - new Date(`${todayKey}T00:00:00`).getTime()) / 86_400_000),
    });
  };
  for (const row of rows) {
    if (Number(row.contract_fixed_term) === 1) add(row, "contract", row.contract_end, soon);
    add(row, "probation", row.probation_end, probationSoon, todayKey);
    add(row, "id_card", row.id_card_expiry, soon);
    add(row, "passport", row.passport_expiry, soon);
  }
  return items.sort((a, b) => a.days - b.days || a.emp_code.localeCompare(b.emp_code));
};

/** GET /employee/expiring — ລາຍການໃກ້ໝົດອາຍຸ (ໜ້າພະນັກງານ: ແຖບ "ໃກ້ໝົດອາຍຸ" + ປ້າຍໃນແຖວ) */
export const getExpiring = async (_req: Request, res: Response) => {
  try {
    res.status(200).json({ data: await expiringItems() });
  } catch (error) {
    sendError(res, error, "Error getting expiring documents");
  }
};

/** GET /hr/pending — ຈຳນວນຄຳຮ້ອງທີ່ລໍຖ້າ HR (ໜ້າ desktop): ລາພັກ, ແຈ້ງລືມສະແກນ, ເບີກເງິນ (ລໍຖ້າອະນຸມັດ / ລໍຖ້າຈ່າຍ) */
export const getHrPending = async (_req: Request, res: Response) => {
  try {
    const [leave, correction, advance, expiring, companyDocs] = await Promise.all([
      // ລໍຫົວໜ້າທີມຢູ່ = HR ຍັງເຮັດຫຍັງບໍ່ໄດ້ — ບໍ່ນັບ
      LeaveRequest.count({ where: { status: PENDING, [Op.or]: [{ lead_status: null }, { lead_status: { [Op.ne]: LEAD_WAITING } }] } }),
      AttendanceRequest.count({ where: { status: PENDING } }),
      advancePendingCounts(),
      expiringItems(),
      companyDocsDue(),
    ]);
    res.status(200).json({
      data: {
        leave, correction, advance: advance.pending, advance_to_pay: advance.approved,
        // ຈຳນວນຄົນທີ່ມີເອກະສານ / ສັນຍາ ໃກ້ໝົດອາຍຸ
        expiring: new Set(expiring.map((item) => item.employee_id)).size,
        // ເອກະສານບໍລິສັດ ໝົດແລ້ວ / ໝົດພາຍໃນ 60 ມື້
        company_docs: companyDocs,
      },
    });
  } catch (error) {
    sendError(res, error, "Error getting pending HR requests");
  }
};

/**
 * GET /employee/summary/:id — ສະຫຼຸບຂ້າມໂມດູນຂອງພະນັກງານ (ໜ້າລາຍລະອຽດ): ຍອດເບີກຄ້າງ, ມື້ລາທີ່ເຫຼືອຂອງປີ,
 * ຄຳຮ້ອງທີ່ລໍຖ້າ, ເງິນເດືອນທີ່ຈ່າຍລ່າສຸດ
 */
export const getEmployeeSummary = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const id = Number(decodeId(req));
    if (!(await Employee.count({ where: { _uuid: id } }))) {
      res.status(404).json({ message: "ບໍ່ພົບພະນັກງານ" });
      return;
    }
    const year = nowLao().format("YYYY");
    const [advance_balance, leave, pendingLeave, pendingCorrection, lastLine] = await Promise.all([
      advanceBalanceOf(id),
      balancesOf(id, year),
      LeaveRequest.count({ where: { employee_id: id, status: PENDING } }),
      AttendanceRequest.count({ where: { employee_id: id, status: PENDING } }),
      PayrollLine.findOne({
        where: { employee_id: id },
        attributes: ["net"],
        include: [{ model: Payroll, as: "payroll", required: true, where: { status: PAYROLL_PAID }, attributes: ["period", "pay_date"] }],
        order: [[{ model: Payroll, as: "payroll" }, "period", "DESC"]],
      }),
    ]);
    const last: any = lastLine?.get({ plain: true });
    res.status(200).json({
      data: {
        year,
        advance_balance,
        leave,
        pending: pendingLeave + pendingCorrection,
        last_payroll: last ? { period: last.payroll.period, pay_date: last.payroll.pay_date, net: Number(last.net) || 0 } : null,
      },
    });
  } catch (error) {
    sendError(res, error, "Error getting employee summary");
  }
};

/**
 * GET /employee/salary-history/:id — ປະຫວັດເງິນເດືອນພື້ນຖານ ໂດຍບໍ່ມີຕາຕະລາງໃໝ່:
 * - periods: ຈາກໃບເງິນເດືອນທີ່ຈ່າຍແລ້ວ (ແຕ່ລະເດືອນເກັບເງິນເດືອນພື້ນຖານຂອງເດືອນນັ້ນໄວ້) → ລວມເດືອນຕິດກັນທີ່ເທົ່າກັນເປັນຊ່ວງ
 * - changes: ຈາກປະຫວັດການແກ້ໄຂ (tbl_audit_log) — ໃຜປ່ຽນ ເມື່ອໃດ ຈາກເທົ່າໃດ ເປັນເທົ່າໃດ
 * ໃໝ່ສຸດກ່ອນທັງສອງລາຍການ. ສະເພາະຜູ້ມີສິດເມນູເງິນເດືອນ (route)
 */
export const getSalaryHistory = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const id = Number(decodeId(req));
    const employee = await Employee.findByPk(id, { attributes: ["_uuid", "basic_salary"] });
    if (!employee) {
      res.status(404).json({ message: "ບໍ່ພົບພະນັກງານ" });
      return;
    }
    const [lines, audits] = await Promise.all([
      PayrollLine.findAll({
        where: { employee_id: id },
        attributes: ["basic_salary", "net"],
        include: [{ model: Payroll, as: "payroll", required: true, where: { status: PAYROLL_PAID }, attributes: ["period"] }],
        order: [[{ model: Payroll, as: "payroll" }, "period", "ASC"]],
      }),
      AuditLog.findAll({ where: { entity: "employee", entity_id: id, action: "update" }, order: [["at", "DESC"]], limit: 100, raw: true }),
    ]);

    const periods: { from: string; to: string; basic_salary: number; months: number }[] = [];
    for (const line of lines.map((l: any) => l.get({ plain: true }))) {
      const salary = Number(line.basic_salary) || 0;
      const last = periods[periods.length - 1];
      if (last && last.basic_salary === salary) {
        last.to = line.payroll.period;
        last.months += 1;
      } else {
        periods.push({ from: line.payroll.period, to: line.payroll.period, basic_salary: salary, months: 1 });
      }
    }

    const changes = (audits as any[]).flatMap((row) => {
      try {
        const diff = JSON.parse(row.changes ?? "{}");
        if (!diff.basic_salary) return [];
        return [{ at: row.at, user_id: row.user_id, from: Number(diff.basic_salary[0]) || 0, to: Number(diff.basic_salary[1]) || 0 }];
      } catch {
        return [];
      }
    });
    const userIds = [...new Set(changes.map((c) => Number(c.user_id)).filter(Boolean))];
    const users = new Map((userIds.length ? await Users.findAll({ where: { user_uuid: userIds }, attributes: ["user_uuid", "user_name"], raw: true }) as any[] : [])
      .map((u) => [Number(u.user_uuid), u.user_name]));

    res.status(200).json({
      data: {
        current: Number(employee.basic_salary) || 0,
        periods: periods.reverse(),
        changes: changes.map((c) => ({ ...c, user_name: users.get(Number(c.user_id)) ?? null })),
      },
    });
  } catch (error) {
    sendError(res, error, "Error getting salary history");
  }
};
