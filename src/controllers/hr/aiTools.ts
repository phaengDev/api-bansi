import { Request, Response } from "express";
import moment from "moment";
import { Op } from "sequelize";
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import WorkPlan from "../../models/workPlanModel";
import { getMyAdvances } from "./advanceController";
import { getMyApprovals } from "./approvalController";
import { getMyHolidays, getMyAttendance } from "./attendanceController";
import { getMyBirthdays } from "./birthdayController";
import { getCompany } from "./companyController";
import { getMyCorrections } from "./correctionController";
import { getMyEmployee } from "./employeeController";
import { getMyWorkHistory } from "./historyController";
import { getMyLeaves } from "./leaveController";
import { getMyMoneyAccounts, getMyMoneySummary } from "./myMoneyController";
import { planOf } from "./myWorkPlanController";
import { getMyNotes } from "./noteController";
import { getMyOrg } from "./orgController";
import { getMyOvertime } from "./overtimeController";
import { getMyPayrollPreview, getMyPayslips } from "./payrollController";
import { getMyAssignedTasks, getMyTasks } from "./taskController";
import { getMyColleagues } from "./teamController";

/**
 * ເຄື່ອງມືຂອງຜູ້ຊ່ວຍ AI — ອ່ານຂໍ້ມູນຂອງພະນັກງານທີ່ຖາມ ຜ່ານ endpoint "ຂອງຂ້ອຍ" ອັນດຽວກັບແອັບ (GET …/me):
 * ສົ່ງ req ຂອງຄົນທີ່ຖາມ (token ດຽວກັນ) + query ທີ່ AI ເລືອກ — AI ຈຶ່ງເຫັນສະເພາະສິ່ງທີ່ແອັບສະແດງໃຫ້ຄົນນັ້ນ,
 * ບໍ່ມີທາງອ່ານຂໍ້ມູນສ່ວນຕົວຂອງຄົນອື່ນ (ບໍ່ມີ parameter ລະຫັດພະນັກງານ). ທຸກເຄື່ອງມືອ່ານຢ່າງດຽວ ຍົກເວັ້ນ propose_plans
 * (ສົ່ງແຜນໃຫ້ແອັບສະແດງ — ພະນັກງານກົດບັນທຶກເອງ)
 */

type Handler = (req: Request, res: Response) => unknown;

/** ຄຳຕອບຂອງ endpoint ຜິດພາດ (4xx / 5xx) — ສົ່ງກັບໃຫ້ AI ເປັນຂໍ້ຄວາມ */
class SelfCallError extends Error {}

/** ເອີ້ນ handler ຂອງ Express ກັບ req ຂອງຄົນທີ່ຖາມ (query ໃໝ່) ແລ້ວເອົາ JSON ທີ່ມັນຕອບ */
const selfCall = (handler: Handler, req: Request, query: Record<string, string> = {}) =>
  new Promise<any>((resolve, reject) => {
    let status = 200;
    const res: any = {
      status(code: number) {
        status = code;
        return res;
      },
      json(body: any) {
        if (status >= 400) reject(new SelfCallError(String(body?.message ?? `HTTP ${status}`)));
        else resolve(body);
        return res;
      },
      send(body: unknown) {
        resolve(body);
        return res;
      },
      type: () => res,
      set: () => res,
      setHeader: () => res,
    };
    // ສືບທອດທຸກຢ່າງຈາກ req ຈິງ (user ຈາກ token, headers) — ປ່ຽນແຕ່ query / params
    const fake = Object.create(req);
    Object.defineProperty(fake, "query", { value: query, enumerable: true });
    Object.defineProperty(fake, "params", { value: {}, enumerable: true });
    Promise.resolve(handler(fake, res as Response)).then(() => resolve(null), reject);
  });

/** ຊ່ອງທີ່ບໍ່ມີປະໂຫຍດຕໍ່ການຕອບ (ລິ້ງ, ຮູບ, ໄຟລ໌, token) — ຕັດອອກໃຫ້ສັ້ນ ປະຢັດຄ່າ token */
const NOISE = /(^|_)(url|urls|photo|photos|file|files|token|logo|avatar|image|images|path|mime|signature)$|password|secret/i;
const MAX_ARRAY = 150;
const MAX_RESULT = 16000;

const prune = (value: any, depth = 0): any => {
  if (value === null || value === undefined || value === "") return undefined;
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY).map((v) => prune(v, depth + 1)).filter((v) => v !== undefined);
    if (value.length > MAX_ARRAY) items.push(`… ອີກ ${value.length - MAX_ARRAY} ລາຍການ`);
    return items;
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if (depth > 8) return undefined;
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      if (NOISE.test(key)) continue;
      const p = prune(v, depth + 1);
      if (p !== undefined) out[key] = p;
    }
    return out;
  }
  return value;
};

/** JSON ສັ້ນ — ເກີນ = ຕັດ ແລະ ບອກ AI */
const compact = (value: unknown) => {
  const text = JSON.stringify(prune(value) ?? null);
  return text.length > MAX_RESULT ? `${text.slice(0, MAX_RESULT)} …(ຕັດ — ຂໍ້ມູນຍາວເກີນ, ຖາມໃຫ້ແຄບລົງ)` : text;
};

/** ເອີ້ນ endpoint — ຜິດພາດ = { error } ໃຫ້ AI ອ່ານ (ບໍ່ໂຍນ error ອອກຈາກ loop) */
const fetchSelf = async (handler: Handler, req: Request, query: Record<string, string> = {}) => {
  try {
    return await selfCall(handler, req, query);
  } catch (error) {
    if (!(error instanceof SelfCallError)) console.error("❌ ai tool:", error);
    return { error: error instanceof SelfCallError ? error.message : "ອ່ານຂໍ້ມູນບໍ່ໄດ້" };
  }
};

/** ເອີ້ນ endpoint ແລ້ວສົ່ງເປັນ JSON ສັ້ນ */
const lookup = async (handler: Handler, req: Request, query: Record<string, string> = {}) => compact(await fetchSelf(handler, req, query));

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const YEAR = /^20\d{2}$/;
const monthArg = (value: unknown): Record<string, string> => (MONTH.test(String(value ?? "")) ? { month: String(value) } : {});
const yearArg = (value: unknown): Record<string, string> => (YEAR.test(String(value ?? "")) ? { year: String(value) } : {});

const monthSchema = {
  type: "object",
  properties: { month: { type: "string", description: "YYYY-MM. Leave out for the current month." } },
  additionalProperties: false,
} as const;
const yearSchema = {
  type: "object",
  properties: { year: { type: "string", description: "YYYY. Leave out for the current year." } },
  additionalProperties: false,
} as const;
const noArgs = { type: "object", properties: {}, additionalProperties: false } as const;

/** ແຜນທີ່ AI ສະເໜີ (ຍັງບໍ່ບັນທຶກ) — aiController ກວດ ແລະ ສົ່ງໃຫ້ແອັບ */
export type ProposedPlan = { title: string; note: string; start_date: string; end_date: string };

const clip = (text: unknown, max: number) => {
  const value = String(text ?? "").replace(/\s+/g, " ").trim();
  return value.length > max ? `${value.slice(0, max)}…` : value;
};

/** ແຜນວຽກຂອງຕົນເອງ: 45 ມື້ຜ່ານມາ ຮອດ 60 ມື້ຂ້າງໜ້າ + ແຜນເກົ່າທີ່ຍັງບໍ່ສຳເລັດ (ລວມອັບເດດຫຼ້າສຸດ) */
const workPlansText = async (employeeId: number, today: string) => {
  const from = moment(today).subtract(45, "days").format("YYYY-MM-DD");
  const to = moment(today).add(60, "days").format("YYYY-MM-DD");
  const rows = await WorkPlan.findAll({
    where: {
      employee_id: employeeId,
      status: 1,
      start_date: { [Op.lte]: to },
      [Op.or]: [{ done: 0 }, { end_date: { [Op.gte]: from } }],
    },
    order: [["start_date", "ASC"], ["createdAt", "ASC"]],
    limit: 120,
  });
  if (!rows.length) return "ຍັງບໍ່ມີແຜນວຽກ";
  return rows
    .map((r) => planOf(r, true) as any)
    .map((p) => {
      const state = p.done ? "ສຳເລັດແລ້ວ" : p.end_date < today ? "ກາຍກຳນົດ" : p.start_date > today ? "ຍັງບໍ່ເລີ່ມ" : "ກຳລັງເຮັດ";
      const updates = (p.updates ?? [])
        .filter((u: any) => u.note)
        .slice(-3)
        .map((u: any) => `${String(u.at).slice(0, 10)} ${u.progress}%: ${clip(u.note, 160)}`);
      return [
        `- ${clip(p.title, 120)} | ${p.start_date} → ${p.end_date} | ${state} ${p.progress}%`,
        p.note ? `  ລາຍລະອຽດ: ${clip(p.note, 240)}` : null,
        updates.length ? `  ອັບເດດ: ${updates.join(" / ")}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
};

/**
 * ເຄື່ອງມືທັງໝົດ — ຊື່ / ຄຳອະທິບາຍ / schema ຄືເກົ່າທຸກເທື່ອ (ລຽງຕາມຊື່) ໃຫ້ cache ໃຊ້ໄດ້ຂ້າມຄຳຖາມ ແລະ ຂ້າມຄົນ;
 * ສະເພາະ run() ທີ່ຜູກກັບ req ຂອງຄົນທີ່ຖາມ. [onPlans] ຮັບແຜນທີ່ AI ສະເໜີ
 */
export const aiTools = (req: Request, employeeId: number, today: string, onPlans: (plans: unknown[]) => number) =>
  [
    betaTool({
      name: "get_birthdays",
      description: "Colleagues whose birthday is today (names, and whether this employee already sent a wish).",
      inputSchema: noArgs,
      run: () => lookup(getMyBirthdays, req),
    }),
    betaTool({
      name: "get_colleagues",
      description:
        "The colleague directory the app shows to every employee: name, employee code, department, position, phone, and whether they are on leave or have a birthday today. No salaries or private records.",
      inputSchema: noArgs,
      run: () => lookup(getMyColleagues, req),
    }),
    betaTool({
      name: "get_company",
      description:
        "Company profile: name, phones, address, working hours (work_start/work_end), lunch break (break_start/break_end), weekly days off (0 = Sunday … 6 = Saturday), daily uniform per weekday (uniform_days: 1 company polo, 2 shirt, 3 casual, 0 not set), scan radius.",
      inputSchema: noArgs,
      run: () => lookup(getCompany, req),
    }),
    betaTool({
      name: "get_holidays",
      description: "Public holidays (kind 1, official) and company-announced days off (kind 2) for a year, with whether each falls on a workday.",
      inputSchema: yearSchema,
      run: (args) => lookup(getMyHolidays, req, yearArg(args.year)),
    }),
    betaTool({
      name: "get_my_advances",
      description: "The employee's salary advances (ເບີກເງິນລ່ວງໜ້າ): each request with amount, status, repaid amount, outstanding balance, and the advance rules.",
      inputSchema: noArgs,
      run: () => lookup(getMyAdvances, req),
    }),
    betaTool({
      name: "get_my_approvals",
      description: "Requests waiting for this employee's approval (only for employees HR made approvers): leave, forgot-scan corrections, advances.",
      inputSchema: noArgs,
      run: () => lookup(getMyApprovals, req),
    }),
    betaTool({
      name: "get_my_attendance",
      description:
        "The employee's attendance for one month: every day with its state (present, late, absent, leave, day off, holiday, pending) and check-in/out times, plus the month summary (workdays, present, late days and minutes, absent days, leave days). Use for questions like how many days absent or late this month.",
      inputSchema: monthSchema,
      run: (args) => lookup(getMyAttendance, req, monthArg(args.month)),
    }),
    betaTool({
      name: "get_my_corrections",
      description: "The employee's forgot-to-scan correction requests (ແຈ້ງລືມສະແກນ) for a year, with status.",
      inputSchema: yearSchema,
      run: (args) => lookup(getMyCorrections, req, yearArg(args.year)),
    }),
    betaTool({
      name: "get_my_leaves",
      description:
        "Leave for a year: every leave type the company has, with this employee's entitled, used and remaining days per type, plus all their leave requests (type, dates, days, reason, status).",
      inputSchema: yearSchema,
      run: (args) => lookup(getMyLeaves, req, yearArg(args.year)),
    }),
    betaTool({
      name: "get_my_money",
      description:
        "The employee's personal money ledger (ບັນຊີ, their own cash/bank/wallet accounts, not company payroll): accounts with balances, and income/expense totals by category for the current month.",
      inputSchema: noArgs,
      run: async () => {
        const [accounts, summary] = await Promise.all([fetchSelf(getMyMoneyAccounts, req), fetchSelf(getMyMoneySummary, req)]);
        return compact({ accounts, summary });
      },
    }),
    betaTool({
      name: "get_my_overtime",
      description: "The employee's overtime (OT) records and totals for one month.",
      inputSchema: monthSchema,
      // endpoint ໃຊ້ຊື່ period
      run: (args) => lookup(getMyOvertime, req, MONTH.test(String(args.month ?? "")) ? { period: String(args.month) } : {}),
    }),
    betaTool({
      name: "get_my_payroll_preview",
      description:
        "Estimate of the employee's salary for a month that HR has not paid yet: base salary, allowances, OT, deductions (late, absence, social security, tax, advance repayment) and expected net pay.",
      inputSchema: monthSchema,
      run: (args) => lookup(getMyPayrollPreview, req, monthArg(args.month)),
    }),
    betaTool({
      name: "get_my_payslips",
      description: "The employee's paid payslips for a year (months HR already paid): gross, each allowance and deduction, net pay.",
      inputSchema: yearSchema,
      run: (args) => lookup(getMyPayslips, req, yearArg(args.year)),
    }),
    betaTool({
      name: "get_my_profile",
      description:
        "The employee's own profile: name, code, department, position, start date, base salary, gender, birthday, phone, email, address, bank account.",
      inputSchema: noArgs,
      run: () => lookup(getMyEmployee, req),
    }),
    betaTool({
      name: "get_my_tasks",
      description:
        "Work tasks: tasks assigned to this employee (by whom, status, due date, progress, comments count) and tasks this employee assigned to their team.",
      inputSchema: noArgs,
      run: async () => {
        const [mine, byMe] = await Promise.all([fetchSelf(getMyTasks, req), fetchSelf(getMyAssignedTasks, req)]);
        return compact({ assigned_to_me: mine, assigned_by_me: byMe });
      },
    }),
    betaTool({
      name: "get_my_work_history",
      description: "The employee's work history for a year: attendance days, lates, leave, OT and milestones (years of service).",
      inputSchema: yearSchema,
      run: (args) => lookup(getMyWorkHistory, req, yearArg(args.year)),
    }),
    betaTool({
      name: "get_my_work_plans",
      description:
        "The employee's own work plans from 45 days ago to 60 days ahead, plus older unfinished ones: title, dates, state (done, in progress, overdue, not started), progress % and the latest progress notes.",
      inputSchema: noArgs,
      run: () => workPlansText(employeeId, today),
    }),
    betaTool({
      name: "get_org_chart",
      description: "The organization chart: departments, positions with levels, and who reports to whom (names only).",
      inputSchema: noArgs,
      run: () => lookup(getMyOrg, req),
    }),
    betaTool({
      name: "propose_plans",
      description:
        "Show proposed work plan items to the employee. The app lists them with a save button; nothing is saved until the employee taps it. Use only when the employee asks for help planning or wants to add work. Dates are YYYY-MM-DD, no earlier than today, on workdays.",
      inputSchema: {
        type: "object",
        properties: {
          plans: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string", description: "Short title, under 80 characters" },
                note: { type: "string", description: "One-line note" },
                start_date: { type: "string", description: "YYYY-MM-DD" },
                end_date: { type: "string", description: "YYYY-MM-DD" },
              },
              required: ["title", "note", "start_date", "end_date"],
              additionalProperties: false,
            },
          },
        },
        required: ["plans"],
        additionalProperties: false,
      } as const,
      run: (args) => {
        const shown = onPlans(args.plans);
        return shown
          ? `Shown ${shown} plan item(s) to the employee with a save button (not saved yet).`
          : "No valid plan items: dates must be YYYY-MM-DD, from today on, end on or after start.";
      },
    }),
    betaTool({
      name: "search_my_notes",
      description: "Search the employee's own private notes (ໂນດ) by a word or phrase; returns matching notes with their text.",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string", description: "Word or phrase to look for" } },
        required: ["query"],
        additionalProperties: false,
      } as const,
      run: (args) => lookup(getMyNotes, req, { q: String(args.query ?? "").slice(0, 100) }),
    }),
  ];
