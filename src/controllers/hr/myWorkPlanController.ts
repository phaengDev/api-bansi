import { Request, Response } from "express";
import moment from "moment";
import { Op } from "sequelize";
import WorkPlan from "../../models/workPlanModel";
import Employee from "../../models/employee";
import Notification from "../../models/notification";
import { maxid } from "../../utils";
import { decodeId, sendError, toDateOnly } from "../bansi/bansiHelpers";
import { selfEmployee } from "./attendanceController";
import { notify } from "./notificationController";
import { WORKING, employedOn, nowLao, todayLao } from "./workCalendar";

/**
 * ແຜນວຽກສ່ວນຕົວຂອງພະນັກງານ (app ມືຖື — token ຂອງພະນັກງານ). ໃຊ້ຕາຕະລາງດຽວກັບປະຕິທິນແຜນວຽກຂອງເວັບ (tbl_work_plan):
 * ແຜນຂອງພະນັກງານ = employee_id ເປັນຂອງຕົນເອງ ແລະ userid = 0 (ບໍ່ປົນກັບແຜນຂອງຜູ້ໃຊ້ລະບົບ — workPlanController ເອົາສະເພາະ employee_id null).
 * - GET /employee/me/workplan?scope=active|upcoming|history&offset= — active ຮອດມື້ເລີ່ມແລ້ວ ຍັງບໍ່ປິດ (ສະແດງທຸກມື້ຈົນກວ່າຈະປິດ),
 *   upcoming ຍັງບໍ່ຮອດມື້ເລີ່ມ, history ປິດແລ້ວ (ເທື່ອລະ 30, ໃໝ່ສຸດກ່ອນ) + counts ຂອງແຕ່ລະແຖບ
 * - GET /employee/me/workplan?scope=range&from=&to= — ທຸກແຜນ (ສຳເລັດ ແລະ ຍັງບໍ່ສຳເລັດ) ທີ່ຊ້ອນທັບຊ່ວງວັນທີ (ບໍ່ເກີນ 1 ປີ)
 * - GET /employee/me/workplan/:id — ແຜນ 1 ລາຍການ ພ້ອມປະຫວັດການອັບເດດທັງໝົດ
 * - POST /employee/me/workplan { title, note?, start_date, end_date? }
 * - PUT /employee/me/workplan/:id { title?, note?, start_date?, end_date?, done? }
 * - POST /employee/me/workplan/:id/progress { progress 0–100, note? } — ອັບເດດຄວາມຄືບໜ້າ; 100 = ປິດແຜນ (ສຳເລັດ)
 * - DELETE /employee/me/workplan/:id — ລຶບແບບ soft delete (status 0)
 * ປະຫວັດການອັບເດດເກັບເປັນ JSON ໃນຖັນ progress_log (ບໍ່ສ້າງຕາຕະລາງແຍກ). ແຜນທີ່ຍັງບໍ່ສຳເລັດ "ຕິດຕາມ" ຕໍ່ຫຼັງວັນສິ້ນສຸດ
 * ຈົນກວ່າຈະປິດ: ຢູ່ໃນ active ແລະ ແຈ້ງເຕືອນທຸກເຊົ້າ 07:30 (scheduleWorkPlanReminders).
 * ທຸກເສັ້ນທາງເຂົ້າເຖິງໄດ້ສະເພາະແຜນຂອງຕົນເອງ
 */

const MAX_TITLE = 255;
const MAX_NOTE = 2000;
/** ແຜນໜຶ່ງຍາວໄດ້ບໍ່ເກີນ 1 ປີ, ຖາມລາຍການໄດ້ເທື່ອລະບໍ່ເກີນ ~3 ເດືອນ */
const MAX_PLAN_DAYS = 366;
const MAX_ROWS = 500;
/** ປະຫວັດ (ແຜນທີ່ປິດແລ້ວ) ໂຫຼດເທື່ອລະ */
const HISTORY_PAGE = 30;
/** ເບິ່ງຕາມຊ່ວງວັນທີໄດ້ບໍ່ເກີນ 1 ປີຕໍ່ເທື່ອ */
const MAX_RANGE_DAYS = 366;
/** ປະຫວັດການອັບເດດເກັບໄວ້ບໍ່ເກີນ 200 ຄັ້ງຫຼ້າສຸດຕໍ່ແຜນ, ບັນທຶກແຕ່ລະຄັ້ງບໍ່ເກີນ 1000 ຕົວອັກສອນ */
const MAX_LOG = 200;
const MAX_UPDATE_NOTE = 1000;

/** ການອັບເດດ 1 ຄັ້ງ — kind: update ອັບເດດຄວາມຄືບໜ້າ, done ປິດແຜນ, reopen ເປີດຄືນ */
type LogEntry = { at: string; progress: number; note: string | null; kind: "update" | "done" | "reopen" };

const logOf = (raw: string | null | undefined): LogEntry[] => {
  try {
    const value = JSON.parse(raw || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

const withEntry = (raw: string | null | undefined, entry: Omit<LogEntry, "at">) =>
  JSON.stringify([...logOf(raw), { ...entry, at: new Date().toISOString() }].slice(-MAX_LOG));

/** ລາຍການ (ໜ້າປະຕິທິນ) ສົ່ງສະເພາະການອັບເດດຫຼ້າສຸດ; ລາຍລະອຽດ (withLog) ສົ່ງປະຫວັດທັງໝົດ */
export const planOf = (row: any, withLog = false) => {
  const p = row?.get ? row.get({ plain: true }) : row;
  const log = logOf(p.progress_log);
  const done = Number(p.done) === 1;
  return {
    _uuid: p._uuid,
    title: p.title,
    note: p.note || null,
    start_date: p.start_date,
    end_date: p.end_date,
    done,
    progress: done ? 100 : Math.max(0, Math.min(99, Number(p.progress) || 0)),
    done_at: p.done_at ?? null,
    update_count: log.length,
    last_update: log[log.length - 1] ?? null,
    ...(withLog ? { updates: log } : {}),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
};

/** ປິດ / ເປີດຄືນແຜນ — ປິດ = 100% + ເວລາປິດ; ເປີດຄືນ = ກັບໄປ % ຂອງການອັບເດດຫຼ້າສຸດທີ່ຍັງບໍ່ຮອດ 100 */
const doneChange = (plan: WorkPlan, done: boolean, note: string | null) => {
  if (done) return { done: 1, progress: 100, done_at: new Date(), progress_log: withEntry(plan.progress_log, { kind: "done", progress: 100, note }) };
  const last = [...logOf(plan.progress_log)].reverse().find((e) => e.kind === "update" && e.progress < 100);
  const progress = last?.progress ?? 0;
  return { done: 0, progress, done_at: null, progress_log: withEntry(plan.progress_log, { kind: "reopen", progress, note }) };
};

const daysBetween = (from: string, to: string) => moment(to, "YYYY-MM-DD").diff(moment(from, "YYYY-MM-DD"), "days");

/** ເງື່ອນໄຂຂອງແຕ່ລະແຖບ (ແຜນຂອງຂ້ອຍທີ່ຍັງບໍ່ຖືກລຶບ) */
const scopesOf = (employeeId: number, today: string) => {
  const mine = { employee_id: employeeId, status: 1 };
  return {
    active: { ...mine, done: 0, start_date: { [Op.lte]: today } },
    upcoming: { ...mine, done: 0, start_date: { [Op.gt]: today } },
    history: { ...mine, done: 1 },
  };
};
type Scope = keyof ReturnType<typeof scopesOf>;

/** active: ກາຍກຳນົດ / ໃກ້ກຳນົດກ່ອນ; upcoming: ເລີ່ມກ່ອນ; history: ປິດຫຼ້າສຸດກ່ອນ */
const ORDER: Record<Scope, [string, string][]> = {
  active: [["end_date", "ASC"], ["createdAt", "ASC"]],
  upcoming: [["start_date", "ASC"], ["createdAt", "ASC"]],
  history: [["done_at", "DESC"], ["updatedAt", "DESC"]],
};

/** ແຜນຂອງຂ້ອຍທີ່ຍັງບໍ່ຖືກລຶບ — ບໍ່ແມ່ນຂອງຂ້ອຍ / ບໍ່ມີ = null (ຕອບ 404 ຄືກັນ ບໍ່ບອກວ່າມີຢູ່) */
const myPlan = (req: Request<{ id: string }>, employeeId: number) => {
  const id = Number(decodeId(req));
  return Number.isInteger(id) && id > 0
    ? WorkPlan.findOne({ where: { _uuid: id, employee_id: employeeId, status: 1 } })
    : Promise.resolve(null);
};

/** GET /employee/me/workplan?scope=active|upcoming|history&offset= ຫຼື scope=range&from=&to= (ບໍ່ສົ່ງ scope = active) */
export const getMyWorkPlans = async (req: Request, res: Response) => {
  try {
    const self = await selfEmployee(req);
    if ("code" in self) {
      res.status(self.code).json({ message: self.message });
      return;
    }
    const today = todayLao();
    if (req.query.scope === "range") {
      const from = toDateOnly(req.query.from);
      const to = toDateOnly(req.query.to);
      if (!from || !to || to < from || daysBetween(from, to) >= MAX_RANGE_DAYS) {
        res.status(400).json({ message: "ຊ່ວງວັນທີບໍ່ຖືກຕ້ອງ (ບໍ່ເກີນ 1 ປີ)" });
        return;
      }
      const rows = await WorkPlan.findAll({
        where: { employee_id: self.employee._uuid, status: 1, start_date: { [Op.lte]: to }, end_date: { [Op.gte]: from } },
        order: [["start_date", "ASC"], ["createdAt", "ASC"]],
        limit: MAX_ROWS + 1,
      });
      res.status(200).json({ today, scope: "range", from, to, data: rows.slice(0, MAX_ROWS).map((r) => planOf(r)), has_more: rows.length > MAX_ROWS });
      return;
    }
    const scopes = scopesOf(self.employee._uuid, today);
    const scope = String(req.query.scope ?? "active") as Scope;
    if (!(scope in scopes)) {
      res.status(400).json({ message: "scope ບໍ່ຖືກຕ້ອງ" });
      return;
    }
    const history = scope === "history";
    const limit = history ? HISTORY_PAGE : MAX_ROWS;
    const offset = history ? Math.max(0, Math.floor(Number(req.query.offset) || 0)) : 0;
    const [rows, active, upcoming, done, overdue] = await Promise.all([
      WorkPlan.findAll({ where: scopes[scope], order: ORDER[scope], limit: limit + 1, offset }),
      WorkPlan.count({ where: scopes.active }),
      WorkPlan.count({ where: scopes.upcoming }),
      WorkPlan.count({ where: scopes.history }),
      WorkPlan.count({ where: { ...scopes.active, end_date: { [Op.lt]: today } } }),
    ]);
    res.status(200).json({
      today,
      scope,
      data: rows.slice(0, limit).map((r) => planOf(r)),
      has_more: rows.length > limit,
      counts: { active, upcoming, history: done, overdue },
    });
  } catch (error) {
    sendError(res, error, "Error getting work plans");
  }
};

/** GET /employee/me/workplan/:id — ລາຍລະອຽດ + ປະຫວັດການອັບເດດທັງໝົດ */
export const getMyWorkPlan = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const self = await selfEmployee(req);
    if ("code" in self) {
      res.status(self.code).json({ message: self.message });
      return;
    }
    const plan = await myPlan(req, self.employee._uuid);
    if (!plan) {
      res.status(404).json({ message: "ບໍ່ພົບແຜນວຽກນີ້" });
      return;
    }
    res.status(200).json({ today: todayLao(), data: planOf(plan, true) });
  } catch (error) {
    sendError(res, error, "Error getting work plan");
  }
};

/** ກວດ ແລະ ແປງຂໍ້ມູນຈາກ body — has(key) = ສົ່ງມາບໍ່ (ແກ້ໄຂສົ່ງສະເພາະຟີວທີ່ປ່ຽນ) */
const readInput = (body: Record<string, any>, existing?: WorkPlan) => {
  const has = (key: string) => body[key] !== undefined;
  const input: Record<string, any> = {};
  if (has("title") || !existing) {
    const title = String(body.title ?? "").trim();
    if (!title) return { error: "ກະລຸນາປ້ອນສິ່ງທີ່ຈະເຮັດ" };
    if (title.length > MAX_TITLE) return { error: `ຫົວຂໍ້ຍາວໄດ້ບໍ່ເກີນ ${MAX_TITLE} ຕົວອັກສອນ` };
    input.title = title;
  }
  if (has("note")) {
    const note = String(body.note ?? "").trim();
    if (note.length > MAX_NOTE) return { error: `ລາຍລະອຽດຍາວໄດ້ບໍ່ເກີນ ${MAX_NOTE} ຕົວອັກສອນ` };
    input.note = note;
  }
  if (has("start_date") || !existing) {
    const start = toDateOnly(body.start_date);
    if (!start) return { error: "ວັນທີເລີ່ມບໍ່ຖືກຕ້ອງ" };
    input.start_date = start;
  }
  if (has("end_date") && body.end_date) {
    const end = toDateOnly(body.end_date);
    if (!end) return { error: "ວັນທີສິ້ນສຸດບໍ່ຖືກຕ້ອງ" };
    input.end_date = end;
  }
  if (has("done")) input.done = body.done === true || Number(body.done) === 1 ? 1 : 0;

  const start = input.start_date ?? existing?.start_date;
  // ສ້າງໃໝ່ບໍ່ໃສ່ວັນສິ້ນສຸດ = ມື້ດຽວ; ແກ້ວັນເລີ່ມໃຫ້ກາຍວັນສິ້ນສຸດເກົ່າ = ເລື່ອນວັນສິ້ນສຸດຕາມ
  let end = input.end_date ?? existing?.end_date ?? start;
  if (!input.end_date && end < start) end = start;
  if (end < start) return { error: "ວັນທີສິ້ນສຸດຕ້ອງບໍ່ກ່ອນວັນທີເລີ່ມ" };
  if (daysBetween(start, end) >= MAX_PLAN_DAYS) return { error: "ແຜນໜຶ່ງຍາວໄດ້ບໍ່ເກີນ 1 ປີ" };
  if (!existing || end !== existing.end_date) input.end_date = end;
  return { input };
};

/** POST /employee/me/workplan */
export const createMyWorkPlan = async (req: Request, res: Response) => {
  try {
    const self = await selfEmployee(req);
    if ("code" in self) {
      res.status(self.code).json({ message: self.message });
      return;
    }
    const result = readInput(req.body ?? {});
    if ("error" in result) {
      res.status(400).json({ message: result.error });
      return;
    }
    const now = new Date();
    const row = await WorkPlan.create({
      ...(result.input as any),
      _uuid: await maxid(WorkPlan, "_uuid"),
      userid: 0,
      employee_id: self.employee._uuid,
      note: result.input.note ?? "",
      done: result.input.done ?? 0,
      status: 1,
      createdAt: now,
      updatedAt: now,
    });
    res.status(200).json({ message: "ບັນທຶກແຜນວຽກແລ້ວ", data: planOf(row) });
  } catch (error) {
    sendError(res, error, "Error creating work plan");
  }
};

/** PUT /employee/me/workplan/:id */
export const updateMyWorkPlan = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const self = await selfEmployee(req);
    if ("code" in self) {
      res.status(self.code).json({ message: self.message });
      return;
    }
    const plan = await myPlan(req, self.employee._uuid);
    if (!plan) {
      res.status(404).json({ message: "ບໍ່ພົບແຜນວຽກນີ້" });
      return;
    }
    const result = readInput(req.body ?? {}, plan);
    if ("error" in result) {
      res.status(400).json({ message: result.error });
      return;
    }
    const { done, ...fields } = result.input;
    // ປ່ຽນສະຖານະ (ກົດວົງມົນໃນລາຍການ) = ປິດ / ເປີດຄືນ ພ້ອມບັນທຶກໃນປະຫວັດ
    const changed = done !== undefined && done !== Number(plan.done);
    await plan.update({ ...fields, ...(changed ? doneChange(plan, done === 1, null) : {}), updatedAt: new Date() });
    const message = !changed ? "ແກ້ໄຂແຜນວຽກແລ້ວ" : done ? "ປິດແຜນວຽກແລ້ວ — ສຳເລັດ 🎉" : "ເປີດແຜນວຽກຄືນແລ້ວ";
    res.status(200).json({ message, data: planOf(plan, true) });
  } catch (error) {
    sendError(res, error, "Error updating work plan");
  }
};

/**
 * POST /employee/me/workplan/:id/progress { progress, note? } — ອັບເດດຄວາມຄືບໜ້າ (ອັບເດດໄດ້ເລື້ອຍໆ ຈົນກວ່າຈະສຳເລັດ).
 * progress 100 = ປິດແຜນ; ແຜນທີ່ປິດແລ້ວ ອັບເດດຕ່ຳກວ່າ 100 = ເປີດຄືນ. ບໍ່ປ່ຽນ % ຕ້ອງມີບັນທຶກ
 */
export const addMyWorkPlanProgress = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const self = await selfEmployee(req);
    if ("code" in self) {
      res.status(self.code).json({ message: self.message });
      return;
    }
    const plan = await myPlan(req, self.employee._uuid);
    if (!plan) {
      res.status(404).json({ message: "ບໍ່ພົບແຜນວຽກນີ້" });
      return;
    }
    const progress = Number(req.body?.progress);
    const note = String(req.body?.note ?? "").trim() || null;
    if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
      res.status(400).json({ message: "ຄວາມຄືບໜ້າຕ້ອງເປັນ 0–100%" });
      return;
    }
    if (note && note.length > MAX_UPDATE_NOTE) {
      res.status(400).json({ message: `ບັນທຶກຍາວໄດ້ບໍ່ເກີນ ${MAX_UPDATE_NOTE} ຕົວອັກສອນ` });
      return;
    }
    const wasDone = Number(plan.done) === 1;
    const current = wasDone ? 100 : Number(plan.progress) || 0;
    if (progress === current && !note) {
      res.status(400).json({ message: "ກະລຸນາປ່ຽນຄວາມຄືບໜ້າ ຫຼື ຂຽນບັນທຶກ" });
      return;
    }
    let message = "ອັບເດດຄວາມຄືບໜ້າແລ້ວ";
    if (progress === 100 && !wasDone) {
      await plan.update({ ...doneChange(plan, true, note), updatedAt: new Date() });
      message = "ປິດແຜນວຽກແລ້ວ — ສຳເລັດ 🎉";
    } else {
      // ແຜນທີ່ປິດແລ້ວ ອັບເດດຕ່ຳກວ່າ 100 = ເປີດຄືນ
      await plan.update({
        progress,
        progress_log: withEntry(plan.progress_log, { kind: "update", progress, note }),
        ...(wasDone && progress < 100 ? { done: 0, done_at: null } : {}),
        updatedAt: new Date(),
      });
    }
    res.status(200).json({ message, data: planOf(plan, true) });
  } catch (error) {
    sendError(res, error, "Error updating work plan progress");
  }
};

/** DELETE /employee/me/workplan/:id */
export const deleteMyWorkPlan = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const self = await selfEmployee(req);
    if ("code" in self) {
      res.status(self.code).json({ message: self.message });
      return;
    }
    const plan = await myPlan(req, self.employee._uuid);
    if (!plan) {
      res.status(404).json({ message: "ບໍ່ພົບແຜນວຽກນີ້" });
      return;
    }
    await plan.update({ status: 0, updatedAt: new Date() });
    res.status(200).json({ message: "ລຶບແຜນວຽກແລ້ວ" });
  } catch (error) {
    sendError(res, error, "Error deleting work plan");
  }
};

/** ເວລາເຕືອນແຜນວຽກປະຈຳວັນ (ເວລາລາວ) — ກ່ອນເລີ່ມວຽກ */
const REMINDER_HOUR = 7;
const REMINDER_MINUTE = 30;
/** ຊື່ແຜນທີ່ສະແດງໃນແຈ້ງເຕືອນ (ທີ່ເຫຼືອ = "ແລະ ອີກ N ລາຍການ") */
const REMINDER_LIST = 4;

/** ແຈ້ງພະນັກງານທີ່ມີແຜນວຽກຍັງບໍ່ສຳເລັດ (ມື້ນີ້ + ກາຍກຳນົດ) — ref "workplan:<date>" ກັນສົ່ງຊ້ຳ (server ເປີດຄືນກໍ່ບໍ່ຊ້ຳ) */
const remindTodaysPlans = async () => {
  const today = todayLao();
  // ລວມແຜນທີ່ກາຍກຳນົດແລ້ວ ແຕ່ຍັງບໍ່ປິດ — ເຕືອນທຸກເຊົ້າຈົນກວ່າຈະສຳເລັດ
  const plans = await WorkPlan.findAll({
    where: { employee_id: { [Op.ne]: null }, status: 1, done: 0, start_date: { [Op.lte]: today } },
    attributes: ["employee_id", "title", "end_date", "progress"],
    order: [["end_date", "ASC"], ["createdAt", "ASC"]],
  });
  const titlesOf = new Map<number, string[]>();
  for (const p of plans) {
    const list = titlesOf.get(Number(p.employee_id)) ?? [];
    const tags = [Number(p.progress) > 0 ? `${p.progress}%` : null, p.end_date < today ? "ກາຍກຳນົດ" : null].filter(Boolean);
    list.push(tags.length ? `${p.title} (${tags.join(", ")})` : p.title);
    titlesOf.set(Number(p.employee_id), list);
  }
  if (!titlesOf.size) return;
  const ref = `workplan:${today}`;
  const [people, sent] = await Promise.all([
    Employee.findAll({ attributes: ["_uuid", "start_date", "end_date", "work_status"], where: { _uuid: { [Op.in]: [...titlesOf.keys()] }, work_status: WORKING } }),
    Notification.findAll({ where: { ref, employee_id: { [Op.in]: [...titlesOf.keys()] } }, attributes: ["employee_id"], raw: true }),
  ]);
  const already = new Set((sent as any[]).map((n) => Number(n.employee_id)));
  await notify(
    people
      .filter((e) => employedOn(e, today) && !already.has(e._uuid))
      .map((e) => {
        const titles = titlesOf.get(e._uuid) ?? [];
        const lines = titles.slice(0, REMINDER_LIST).map((t) => `• ${t}`);
        if (titles.length > REMINDER_LIST) lines.push(`ແລະ ອີກ ${titles.length - REMINDER_LIST} ລາຍການ`);
        return { employee_id: e._uuid, type: "workplan", ref, title: `ແຜນວຽກທີ່ຕ້ອງເຮັດ ${titles.length} ລາຍການ 📝`, body: lines.join("\n"), push: true };
      }),
  );
};

/**
 * ຕັ້ງເວລາເຕືອນແຜນວຽກທຸກມື້ 07:30 (ເວລາລາວ) — ເອີ້ນເທື່ອດຽວຕອນເປີດ server (App.ts). ເປີດ server ຫຼັງ 07:30 = ເຕືອນຂອງມື້ນີ້ທັນທີ
 */
export const scheduleWorkPlanReminders = () => {
  const run = () => remindTodaysPlans().catch((error) => console.error("❌ work plan reminders:", error));
  const atOf = (day: moment.Moment) => day.clone().startOf("day").hour(REMINDER_HOUR).minute(REMINDER_MINUTE);
  const next = () => {
    const now = nowLao();
    const at = atOf(now);
    if (!at.isAfter(now)) at.add(1, "day");
    setTimeout(() => {
      run();
      next();
    }, at.diff(now));
  };
  if (!atOf(nowLao()).isAfter(nowLao())) run();
  next();
};
