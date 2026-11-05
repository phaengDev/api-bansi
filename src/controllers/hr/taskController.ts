import { Request, Response } from "express";
import { createHmac } from "crypto";
import path from "path";
import fs from "fs";
import jwt from "jsonwebtoken";
import moment from "moment";
import { Op, Transaction } from "sequelize";
import Task from "../../models/task";
import { TaskAssignee, TaskComment, TaskFile, TaskItem, TaskLog, TaskProject, TaskStar } from "../../models/taskParts";
import Employee from "../../models/employee";
import Users from "../../models/userModel";
import { actorOf, decodeId, sendError, toDateOnly } from "../bansi/bansiHelpers";
import { adminJwtConfig } from "../../config/jwtConfig";
import { currentUser, hasPermission } from "../../middleware/permission";
import { selfEmployee } from "./attendanceController";
import { TASK_FILE_DIR, originalNameOf, profileUrl, removeQuietly } from "./hrHelpers";
import { notify } from "./notificationController";
import { WORKING, todayLao } from "./workCalendar";

/**
 * ມອບໝາຍວຽກ:
 * - HR / ຫົວໜ້າ (ເວັບ): POST /task/fetch, GET /task/:id, POST /task/create, PUT /task/:id, PUT /task/status/:id,
 *   POST /task/bulk { ids, action: status | archive | unarchive | delete }, PUT /task/star/:id, PUT /task/item/:id,
 *   ໂປຣເຈັກ /task/project/*, ເອກະສານຄັດຕິດ POST / DELETE /task/file/:id, GET /task/file/download/:id, ຄອມເມັນ POST / DELETE /task/comment/:id
 * - ພະນັກງານ (app): GET /task/me, PUT /task/me/item/:id, GET /task/me/file/:id,
 *   GET / POST / DELETE /task/me/comment/:id — ສະເພາະວຽກທີ່ຕົນເອງຮັບຜິດຊອບ. ພະນັກງານລາຍງານຄວາມຄືບໜ້າທາງຄອມເມັນ;
 *   ສະຖານະ (ລວມ "ສຳເລັດ") ຜູ້ມອບໝາຍເປັນຜູ້ອັບເດດໃນເວັບເທົ່ານັ້ນ
 * ມອບໝາຍ (ສ້າງ / ເພີ່ມຄົນ) = ແຈ້ງເຕືອນເດັ້ງຂຶ້ນຈໍມືຖືຂອງຜູ້ຮັບຜິດຊອບທັນທີ. ທຸກການປ່ຽນແປງລົງໄທມ໌ໄລນ໌ (tbl_task_log) — ເວັບເບິ່ງໃນ GET /task/:id
 */

export const TASK_PENDING = 1;
export const TASK_DOING = 2;
export const TASK_DONE = 3;
const STATUSES = [TASK_PENDING, TASK_DOING, TASK_DONE];
const PRIORITIES = [1, 2, 3];
const MAX_ASSIGNEES = 50;
const MAX_ITEMS = 50;
const MAX_FILES = 20;
const FILE_LINK_TTL = "10m";
const MAX_COMMENT = 2000;
const COLOR = /^#[0-9a-f]{6}$/i;

const STATUS_TEXT: Record<number, string> = { 1: "ລໍຖ້າດຳເນີນການ", 2: "ກຳລັງດຳເນີນການ", 3: "ສຳເລັດແລ້ວ" };
const PRIORITY_TEXT: Record<number, string> = { 1: "", 2: "ສຳຄັນ", 3: "ດ່ວນ" };

const employeeInclude = {
  model: Employee,
  as: "employee",
  attributes: ["_uuid", "emp_code", "first_name", "last_name", "profile", "work_status"],
};
const projectInclude = { model: TaskProject, as: "project", attributes: ["_uuid", "name", "color", "status"] };
const assigneeInclude = { model: TaskAssignee, as: "assignees", attributes: ["employee_id", "is_lead"], include: [employeeInclude] };
// separate = ຄິວລີແຍກ: ໄຟລ໌ / ຄອມເມັນ join ພ້ອມຜູ້ຮັບຜິດຊອບ + ລາຍການຍ່ອຍ ແຖວຈະຄູນກັນຫຼາຍເກີນ
const fileInclude: any = { model: TaskFile, as: "files", separate: true, attributes: ["_uuid", "task_id", "original_name", "mime_type", "file_size", "createdAt"], order: [["_uuid", "ASC"]] };
const fileCountInclude: any = { model: TaskFile, as: "files", separate: true, attributes: ["_uuid", "task_id"] };
const commentCountInclude: any = { model: TaskComment, as: "comments", separate: true, attributes: ["_uuid", "task_id"] };
const itemOrder: any = [[{ model: TaskItem, as: "items" }, "sort", "ASC"], [{ model: TaskItem, as: "items" }, "_uuid", "ASC"]];

const text = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max) || null;
const dayText = (date: string) => moment(date).format("DD/MM/YYYY");
const isOverdue = (r: { status: unknown; due_date: unknown }, today: string) =>
  !!r.due_date && Number(r.status) !== TASK_DONE && String(r.due_date) < today;

/** ວຽກ → JSON: ຜູ້ຮັບຜິດຊອບ (ຫົວໜ້າວຽກກ່ອນ), ຈຳນວນລາຍການຍ່ອຍ + ເອກະສານ, ດາວ, ເກີນກຳນົດ; withItems = ສົ່ງລາຍການຍ່ອຍ + ເອກະສານທັງໝົດນຳ */
const present = (row: Task, today: string, starred = false, withItems = false) => {
  const { assignees = [], items = [], files = [], comments = [], ...r }: any = row.get({ plain: true });
  return {
    ...r,
    assignees: assignees
      .map((a: any) => ({
        employee_id: a.employee_id,
        is_lead: Number(a.is_lead) === 1,
        emp_code: a.employee?.emp_code ?? "",
        first_name: a.employee?.first_name ?? "",
        last_name: a.employee?.last_name ?? null,
        work_status: a.employee?.work_status ?? null,
        profile_url: profileUrl(a.employee?.profile),
      }))
      .sort((a: any, b: any) => Number(b.is_lead) - Number(a.is_lead)),
    items_total: items.length,
    items_done: items.filter((i: any) => Number(i.done) === 1).length,
    ...(withItems ? { items: items.map((i: any) => ({ _uuid: i._uuid, title: i.title, done: Number(i.done) === 1, done_at: i.done_at, done_by: i.done_by })), files } : {}),
    files_total: files.length,
    comments_total: comments.length,
    starred,
    overdue: isOverdue(r, today),
  };
};

const findFull = (id: number, t?: Transaction) =>
  Task.findByPk(id, { include: [projectInclude, assigneeInclude, { model: TaskItem, as: "items" }, fileInclude, commentCountInclude], order: itemOrder, transaction: t });

const starredBy = async (userId: number, taskIds?: number[]) => {
  if (!userId) return new Set<number>();
  const rows = await TaskStar.findAll({
    where: { user_id: userId, ...(taskIds ? { task_id: { [Op.in]: taskIds } } : {}) },
    attributes: ["task_id"],
    raw: true,
  });
  return new Set(rows.map((r: any) => Number(r.task_id)));
};

/** ຜູ້ຂຽນຄອມເມັນ / ຜູ້ເຮັດລາຍການໄທມ໌ໄລນ໌ — ຜູ້ໃຊ້ເວັບທີ່ຜູກພະນັກງານ ໃຊ້ຮູບຂອງພະນັກງານນັ້ນ */
const authorInclude: any = [
  { model: Employee, as: "employee", attributes: ["first_name", "last_name", "profile"] },
  { model: Users, as: "user", attributes: ["user_name", "employee_id"], include: [{ model: Employee, as: "employee", attributes: ["profile"] }] },
];
const authorOf = (c: any) => ({
  author_name: c.employee ? [c.employee.first_name, c.employee.last_name].filter(Boolean).join(" ") : c.user?.user_name ?? "—",
  author_photo: profileUrl(c.employee?.profile ?? c.user?.employee?.profile),
  from_app: !!c.employee_id,
});

type LogBy = { user_id?: number | null; employee_id?: number | null };
const byUser = (req: Request): LogBy => ({ user_id: Number(actorOf(req)) || null });

/** ລົງໄທມ໌ໄລນ໌ — ລົງບໍ່ໄດ້ ບໍ່ໃຫ້ວຽກຫຼັກລົ້ມ */
const logTask = async (taskId: number, action: string, by: LogBy, extra: { fields?: string[]; status?: number; note?: string } = {}, t?: Transaction) => {
  try {
    await TaskLog.create({
      task_id: taskId,
      action,
      fields: extra.fields?.join(",") || null,
      status: extra.status ?? null,
      note: extra.note?.slice(0, 255) ?? null,
      ...by,
    }, { transaction: t });
  } catch (error) {
    console.error("logTask", error);
  }
};

/** ໄທມ໌ໄລນ໌ ໃໝ່ → ເກົ່າ; author_employee_id ໃຊ້ສະແດງມົງກຸດຂອງຫົວໜ້າວຽກ. ວຽກທີ່ສ້າງກ່ອນມີໄທມ໌ໄລນ໌ = ເຕີມລາຍການ "ສ້າງ" ຈາກຂໍ້ມູນວຽກ */
const timelineOf = async (task: Task) => {
  const rows = await TaskLog.findAll({ where: { task_id: task._uuid }, include: authorInclude, order: [["_uuid", "DESC"]] });
  const data = rows.map((row) => {
    const l: any = row.get({ plain: true });
    return {
      _uuid: l._uuid,
      action: l.action,
      fields: l.fields ? String(l.fields).split(",") : [],
      status: l.status,
      note: l.note,
      createdAt: l.createdAt,
      author_employee_id: l.employee_id ?? l.user?.employee_id ?? null,
      ...authorOf(l),
    };
  });
  if (!data.some((d) => d.action === "create")) {
    const creator: any = task.createdbyid ? await Users.findByPk(task.createdbyid, { attributes: ["user_name", "employee_id"], include: [{ model: Employee, as: "employee", attributes: ["profile"] }] }) : null;
    data.push({
      _uuid: 0,
      action: "create",
      fields: [],
      status: null,
      note: null,
      createdAt: task.createdAt,
      author_employee_id: creator?.employee_id ?? null,
      ...authorOf({ user: creator ? creator.get({ plain: true }) : null }),
    });
  }
  return data;
};

const reply = async (req: Request, res: Response, id: number, message: string) => {
  const row = await findFull(id);
  const stars = await starredBy(Number(actorOf(req)), [id]);
  res.status(200).json({ message, data: row && { ...present(row, todayLao(), stars.has(id), true), timeline: await timelineOf(row) } });
};

/** ແຈ້ງຜູ້ຮັບຜິດຊອບວ່າໄດ້ຮັບມອບໝາຍວຽກ — ເດັ້ງຂຶ້ນຈໍມືຖື */
const notifyAssigned = async (task: Task, employeeIds: number[], actor: number | null) => {
  if (!employeeIds.length) return;
  const priority = PRIORITY_TEXT[Number(task.priority)];
  await notify(employeeIds.map((employee_id) => ({
    employee_id,
    type: "task",
    title: `${priority ? `[${priority}] ` : ""}ທ່ານໄດ້ຮັບມອບໝາຍວຽກ 📋`,
    body: [task.title, task.due_date ? `ກຳນົດສົ່ງ ${dayText(task.due_date)}` : null].filter(Boolean).join("\n"),
    ref: `task:${task._uuid}`,
    createdbyid: actor,
    push: true,
  })));
};

// ================= ໂປຣເຈັກ

/** GET /task/project/fetch — ທຸກໂປຣເຈັກ (ລວມທີ່ປິດ) + ຈຳນວນວຽກທີ່ໃຊ້ */
export const getTaskProjects = async (_req: Request, res: Response) => {
  try {
    const [rows, used] = await Promise.all([
      TaskProject.findAll({ order: [["status", "DESC"], ["sort", "ASC"], ["name", "ASC"]] }),
      Task.count({ where: { project_id: { [Op.ne]: null } }, group: ["project_id"] }) as unknown as Promise<{ project_id: number; count: number }[]>,
    ]);
    const counts = new Map(used.map((u) => [Number(u.project_id), Number(u.count)]));
    res.status(200).json({ data: rows.map((r) => ({ ...r.get({ plain: true }), tasks: counts.get(r._uuid) ?? 0 })) });
  } catch (error) {
    sendError(res, error, "Error getting task projects");
  }
};

const projectInput = (body: any) => {
  const name = text(body.name, 150);
  if (!name) return { error: "ກະລຸນາປ້ອນຊື່ໂປຣເຈັກ" };
  const color = String(body.color ?? "#1580be");
  if (!COLOR.test(color)) return { error: "ສີບໍ່ຖືກຕ້ອງ" };
  return { name, color, sort: Number(body.sort) || 0, status: Number(body.status ?? 1) === 0 ? 0 : 1 };
};

/** POST /task/project/create { name, color } */
export const createTaskProject = async (req: Request, res: Response) => {
  try {
    const input = projectInput(req.body || {});
    if ("error" in input) {
      res.status(400).json({ message: input.error });
      return;
    }
    if (await TaskProject.count({ where: { name: input.name } })) {
      res.status(400).json({ message: `ໂປຣເຈັກ "${input.name}" ມີແລ້ວ` });
      return;
    }
    res.status(200).json({ message: "Successfully created task project", data: await TaskProject.create(input) });
  } catch (error) {
    sendError(res, error, "Error creating task project");
  }
};

/** PUT /task/project/:id { name, color, status } */
export const updateTaskProject = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const row = await TaskProject.findByPk(Number(decodeId(req)));
    if (!row) {
      res.status(404).json({ message: "ບໍ່ພົບໂປຣເຈັກ" });
      return;
    }
    const input = projectInput({ ...row.get({ plain: true }), ...(req.body || {}) });
    if ("error" in input) {
      res.status(400).json({ message: input.error });
      return;
    }
    if (await TaskProject.count({ where: { name: input.name, _uuid: { [Op.ne]: row._uuid } } })) {
      res.status(400).json({ message: `ໂປຣເຈັກ "${input.name}" ມີແລ້ວ` });
      return;
    }
    await row.update({ ...input, updatedAt: new Date() });
    res.status(200).json({ message: "Successfully updated task project", data: row });
  } catch (error) {
    sendError(res, error, "Error updating task project");
  }
};

/** DELETE /task/project/:id — ມີວຽກໃຊ້ຢູ່ = ປິດແທນການລຶບ (ວຽກເກົ່າຍັງສະແດງຊື່ໂປຣເຈັກ) */
export const deleteTaskProject = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const row = await TaskProject.findByPk(Number(decodeId(req)));
    if (!row) {
      res.status(404).json({ message: "ບໍ່ພົບໂປຣເຈັກ" });
      return;
    }
    if (await Task.count({ where: { project_id: row._uuid } })) {
      await row.update({ status: 0, updatedAt: new Date() });
      res.status(200).json({ message: "ມີວຽກໃຊ້ໂປຣເຈັກນີ້ຢູ່ — ປິດໃຊ້ງານແທນການລຶບ", data: row });
      return;
    }
    await row.destroy();
    res.status(200).json({ message: "Successfully deleted task project" });
  } catch (error) {
    sendError(res, error, "Error deleting task project");
  }
};

// ================= ວຽກ (HR)

/**
 * POST /task/fetch { archived?: 0 | 1 } — ທຸກວຽກ (ຄົ້ນຫາ / ຈັດລຽງ / ແບ່ງໜ້າ ເຮັດຢູ່ໜ້າເວັບ) + summary ຂອງວຽກທີ່ບໍ່ໄດ້ເກັບເຂົ້າຄັງ:
 * total, pending, doing, done, overdue, archived
 */
export const getTasks = async (req: Request, res: Response) => {
  try {
    const archived = Number(req.body?.archived) === 1 ? 1 : 0;
    const today = todayLao();
    const [rows, open, archivedCount] = await Promise.all([
      Task.findAll({
        where: { archived },
        include: [projectInclude, assigneeInclude, { model: TaskItem, as: "items", attributes: ["_uuid", "done"] }, fileCountInclude, commentCountInclude],
        order: [["createdAt", "DESC"], ["_uuid", "DESC"]],
      }),
      Task.findAll({ where: { archived: 0 }, attributes: ["status", "due_date"], raw: true }),
      Task.count({ where: { archived: 1 } }),
    ]);
    const stars = await starredBy(Number(actorOf(req)));
    const countOf = (status: number) => open.filter((r: any) => Number(r.status) === status).length;
    res.status(200).json({
      data: rows.map((r) => present(r, today, stars.has(r._uuid))),
      summary: {
        total: open.length,
        pending: countOf(TASK_PENDING),
        doing: countOf(TASK_DOING),
        done: countOf(TASK_DONE),
        overdue: open.filter((r: any) => isOverdue(r, today)).length,
        archived: archivedCount,
      },
      today,
    });
  } catch (error) {
    sendError(res, error, "Error getting tasks");
  }
};

/** GET /task/:id — ລາຍລະອຽດ + ລາຍການຍ່ອຍ + ເອກະສານ + ຄອມເມັນ + ໄທມ໌ໄລນ໌ + ຊື່ຜູ້ສ້າງ */
export const getTask = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const id = Number(decodeId(req));
    const row = await findFull(id);
    if (!row) {
      res.status(404).json({ message: "ບໍ່ພົບວຽກ" });
      return;
    }
    const [stars, creator, comments, timeline] = await Promise.all([
      starredBy(Number(actorOf(req)), [id]),
      row.createdbyid ? Users.findByPk(row.createdbyid, { attributes: ["user_name"] }) : null,
      commentsOf(id, { userId: Number(actorOf(req)) }),
      timelineOf(row),
    ]);
    res.status(200).json({ data: { ...present(row, todayLao(), stars.has(id), true), createdby_name: creator?.user_name ?? null, comments, timeline } });
  } catch (error) {
    sendError(res, error, "Error getting task");
  }
};

type ItemInput = { _uuid: number | null; title: string; done: boolean };
type TaskInput = {
  values: { title: string; detail: string | null; project_id: number | null; priority: number; start_date: string | null; due_date: string | null };
  assigneeIds: number[];
  leadId: number;
  items: ItemInput[];
};

/** body ຂອງຟອມ → ຄ່າທີ່ກວດແລ້ວ; currentIds = ຜູ້ຮັບຜິດຊອບເດີມ (ຄົນທີ່ລາອອກແລ້ວ ຍັງຢູ່ໃນວຽກເກົ່າໄດ້) */
const parseTask = async (body: any, currentIds: number[] = []): Promise<TaskInput | { error: string }> => {
  const title = text(body.title, 255);
  if (!title) return { error: "ກະລຸນາປ້ອນຊື່ວຽກ" };
  const detail = String(body.detail ?? "").trim().slice(0, 5000) || null;
  const priority = Number(body.priority ?? 1);
  if (!PRIORITIES.includes(priority)) return { error: "ຄວາມສຳຄັນບໍ່ຖືກຕ້ອງ" };

  const projectId = Number(body.project_id) || null;
  if (projectId && !(await TaskProject.count({ where: { _uuid: projectId } }))) return { error: "ບໍ່ພົບໂປຣເຈັກ" };

  const startDate = body.start_date ? toDateOnly(body.start_date) : null;
  const dueDate = body.due_date ? toDateOnly(body.due_date) : null;
  if ((body.start_date && !startDate) || (body.due_date && !dueDate)) return { error: "ວັນທີບໍ່ຖືກຕ້ອງ" };
  if (startDate && dueDate && dueDate < startDate) return { error: "ກຳນົດສົ່ງຕ້ອງບໍ່ກ່ອນວັນທີເລີ່ມ" };

  const assigneeIds = [...new Set((Array.isArray(body.assignee_ids) ? body.assignee_ids : []).map(Number).filter((n: number) => n > 0))] as number[];
  if (!assigneeIds.length) return { error: "ກະລຸນາເລືອກຜູ້ຮັບຜິດຊອບຢ່າງໜ້ອຍ 1 ຄົນ" };
  if (assigneeIds.length > MAX_ASSIGNEES) return { error: `ຜູ້ຮັບຜິດຊອບໄດ້ບໍ່ເກີນ ${MAX_ASSIGNEES} ຄົນ` };
  const employees = await Employee.findAll({ where: { _uuid: { [Op.in]: assigneeIds } }, attributes: ["_uuid", "emp_code", "first_name", "work_status"] });
  if (employees.length !== assigneeIds.length) return { error: "ບໍ່ພົບພະນັກງານບາງຄົນ" };
  const resigned = employees.find((e) => Number(e.work_status) !== WORKING && !currentIds.includes(e._uuid));
  if (resigned) return { error: `${resigned.emp_code} ${resigned.first_name} ລາອອກແລ້ວ — ມອບໝາຍວຽກໃໝ່ບໍ່ໄດ້` };
  const lead = Number(body.lead_id);
  const leadId = assigneeIds.includes(lead) ? lead : assigneeIds[0];

  const rawItems: any[] = Array.isArray(body.items) ? body.items : [];
  if (rawItems.length > MAX_ITEMS) return { error: `ລາຍການຍ່ອຍໄດ້ບໍ່ເກີນ ${MAX_ITEMS} ລາຍການ` };
  const items: ItemInput[] = [];
  for (const item of rawItems) {
    const itemTitle = text(item?.title, 255);
    if (!itemTitle) continue;
    items.push({ _uuid: Number(item?._uuid) || null, title: itemTitle, done: item?.done === true || Number(item?.done) === 1 });
  }

  return {
    values: { title, detail, project_id: projectId, priority, start_date: startDate, due_date: dueDate },
    assigneeIds,
    leadId,
    items,
  };
};

/** ບັນທຶກຜູ້ຮັບຜິດຊອບໃໝ່ທັງໝົດ — ຄືນຄົນທີ່ເພີ່ມເຂົ້າມາໃໝ່ (ໄວ້ແຈ້ງເຕືອນ) */
const syncAssignees = async (taskId: number, ids: number[], leadId: number, t: Transaction) => {
  const existing = await TaskAssignee.findAll({ where: { task_id: taskId }, transaction: t });
  const have = new Set(existing.map((a) => Number(a.employee_id)));
  await TaskAssignee.destroy({ where: { task_id: taskId, employee_id: { [Op.notIn]: ids } }, transaction: t });
  for (const a of existing) {
    if (ids.includes(Number(a.employee_id))) await a.update({ is_lead: Number(a.employee_id) === leadId ? 1 : 0 }, { transaction: t });
  }
  const added = ids.filter((id) => !have.has(id));
  if (added.length) {
    await TaskAssignee.bulkCreate(added.map((employee_id) => ({ task_id: taskId, employee_id, is_lead: employee_id === leadId ? 1 : 0 })), { transaction: t });
  }
  return added;
};

/** ບັນທຶກລາຍການຍ່ອຍ — ມີ _uuid = ແກ້, ບໍ່ມີ = ເພີ່ມ, ບໍ່ສົ່ງມາ = ລຶບ; ລຳດັບຕາມທີ່ສົ່ງ. ຄືນວ່າຊື່ / ຈຳນວນ / ສະຖານະຫຍັງປ່ຽນບໍ່ (ໄວ້ລົງໄທມ໌ໄລນ໌) */
const syncItems = async (taskId: number, items: ItemInput[], t: Transaction) => {
  const existing = await TaskItem.findAll({ where: { task_id: taskId }, transaction: t });
  const byId = new Map(existing.map((i) => [i._uuid, i]));
  const keep = new Set<number>();
  let touched = false;
  for (const [sort, item] of items.entries()) {
    const current = item._uuid ? byId.get(item._uuid) : undefined;
    if (current) {
      keep.add(current._uuid);
      const changed = Number(current.done) === 1 !== item.done;
      if (changed || current.title !== item.title) touched = true;
      await current.update({
        title: item.title,
        sort,
        ...(changed ? { done: item.done ? 1 : 0, done_at: item.done ? new Date() : null, done_by: null } : {}),
        updatedAt: new Date(),
      }, { transaction: t });
    } else {
      touched = true;
      await TaskItem.create({ task_id: taskId, title: item.title, sort, done: item.done ? 1 : 0, done_at: item.done ? new Date() : null }, { transaction: t });
    }
  }
  const removed = existing.filter((i) => !keep.has(i._uuid)).map((i) => i._uuid);
  if (removed.length) await TaskItem.destroy({ where: { _uuid: { [Op.in]: removed } }, transaction: t });
  return touched || removed.length > 0;
};

/** ຊ່ອງທີ່ຕ່າງຈາກເດີມ — ຊື່ກົງກັບທີ່ໜ້າເວັບໃຊ້ສະແດງໃນໄທມ໌ໄລນ໌ */
const changedFields = (before: any, values: TaskInput["values"]) => {
  const same = (a: unknown, b: unknown) => String(a ?? "") === String(b ?? "");
  return [
    !same(before.title, values.title) && "title",
    !same(before.detail, values.detail) && "detail",
    !same(before.project_id, values.project_id) && "project",
    !same(before.priority, values.priority) && "priority",
    !same(before.start_date, values.start_date) && "start_date",
    !same(before.due_date, values.due_date) && "due_date",
  ].filter(Boolean) as string[];
};

/** POST /task/create { title, detail, project_id, priority, start_date, due_date, assignee_ids, lead_id, items: [{ title }] } */
export const createTask = async (req: Request, res: Response) => {
  const t = await Task.sequelize!.transaction();
  try {
    const input = await parseTask(req.body || {});
    if ("error" in input) {
      await t.rollback();
      res.status(400).json({ message: input.error });
      return;
    }
    const actor = Number(actorOf(req)) || null;
    const row = await Task.create({ ...input.values, status: TASK_PENDING, createdbyid: actor, updatedbyid: actor }, { transaction: t });
    const added = await syncAssignees(row._uuid, input.assigneeIds, input.leadId, t);
    await syncItems(row._uuid, input.items, t);
    await logTask(row._uuid, "create", byUser(req), {}, t);
    await t.commit();
    await notifyAssigned(row, added, actor);
    await reply(req, res, row._uuid, `ມອບໝາຍວຽກແລ້ວ — ແຈ້ງເຕືອນ ${added.length} ຄົນ`);
  } catch (error) {
    await t.rollback();
    sendError(res, error, "Error creating task");
  }
};

/** PUT /task/:id — ຄືກັບ create (+ status ໄດ້); ຄົນທີ່ເພີ່ມເຂົ້າມາໃໝ່ໄດ້ຮັບແຈ້ງເຕືອນ */
export const updateTask = async (req: Request<{ id: string }>, res: Response) => {
  const t = await Task.sequelize!.transaction();
  const fail = async (code: number, message: string) => {
    await t.rollback();
    res.status(code).json({ message });
  };
  try {
    const row = await Task.findByPk(Number(decodeId(req)), { transaction: t, lock: t.LOCK.UPDATE });
    if (!row) return fail(404, "ບໍ່ພົບວຽກ");
    const current = await TaskAssignee.findAll({ where: { task_id: row._uuid }, attributes: ["employee_id", "is_lead"], raw: true, transaction: t });
    const input = await parseTask(req.body || {}, current.map((a: any) => Number(a.employee_id)));
    if ("error" in input) return fail(400, input.error);
    const status = req.body?.status === undefined ? Number(row.status) : Number(req.body.status);
    if (!STATUSES.includes(status)) return fail(400, "ສະຖານະບໍ່ຖືກຕ້ອງ");
    const actor = Number(actorOf(req)) || null;
    const fields = changedFields(row.get({ plain: true }), input.values);
    const statusChanged = status !== Number(row.status);
    const leadBefore = current.find((a: any) => Number(a.is_lead) === 1) as any;
    const sameAssignees = current.length === input.assigneeIds.length
      && current.every((a: any) => input.assigneeIds.includes(Number(a.employee_id)))
      && Number(leadBefore?.employee_id) === input.leadId;
    await row.update({ ...input.values, ...statusFields(row, status), updatedbyid: actor, updatedAt: new Date() }, { transaction: t });
    const added = await syncAssignees(row._uuid, input.assigneeIds, input.leadId, t);
    const itemsChanged = await syncItems(row._uuid, input.items, t);
    if (statusChanged) fields.push("status");
    if (!sameAssignees) fields.push("assignees");
    if (itemsChanged) fields.push("items");
    if (fields.length) await logTask(row._uuid, "update", byUser(req), { fields, status: statusChanged ? status : undefined }, t);
    await t.commit();
    await notifyAssigned(row, added, actor);
    await reply(req, res, row._uuid, added.length ? `ບັນທຶກແລ້ວ — ແຈ້ງເຕືອນຄົນທີ່ເພີ່ມໃໝ່ ${added.length} ຄົນ` : "Successfully updated task");
  } catch (error) {
    await t.rollback();
    sendError(res, error, "Error updating task");
  }
};

/** ສະຖານະ + ເວລາສຳເລັດ (ສຳເລັດ = ບັນທຶກເວລາ, ກັບໄປເຮັດຕໍ່ = ລ້າງ) */
const statusFields = (row: Task, status: number) => ({
  status,
  done_at: status === TASK_DONE ? row.done_at ?? new Date() : null,
});

/** PUT /task/status/:id { status } — ປ່ຽນສະຖານະຈາກລາຍການ */
export const updateTaskStatus = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const row = await Task.findByPk(Number(decodeId(req)));
    const status = Number(req.body?.status);
    if (!row) {
      res.status(404).json({ message: "ບໍ່ພົບວຽກ" });
      return;
    }
    if (!STATUSES.includes(status)) {
      res.status(400).json({ message: "ສະຖານະບໍ່ຖືກຕ້ອງ" });
      return;
    }
    const changed = status !== Number(row.status);
    await row.update({ ...statusFields(row, status), updatedbyid: Number(actorOf(req)) || null, updatedAt: new Date() });
    if (changed) await logTask(row._uuid, "update", byUser(req), { fields: ["status"], status });
    await reply(req, res, row._uuid, "Successfully updated task status");
  } catch (error) {
    sendError(res, error, "Error updating task status");
  }
};

/** PUT /task/star/:id — ດາວ ເປີດ / ປິດ (ຂອງຜູ້ໃຊ້ທີ່ login) */
export const toggleTaskStar = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const taskId = Number(decodeId(req));
    const userId = Number(actorOf(req));
    if (!userId || !(await Task.count({ where: { _uuid: taskId } }))) {
      res.status(404).json({ message: "ບໍ່ພົບວຽກ" });
      return;
    }
    const removed = await TaskStar.destroy({ where: { user_id: userId, task_id: taskId } });
    if (!removed) await TaskStar.create({ user_id: userId, task_id: taskId });
    res.status(200).json({ message: "Successfully updated star", starred: !removed });
  } catch (error) {
    sendError(res, error, "Error updating task star");
  }
};

/** POST /task/bulk { ids, action: "status" | "archive" | "unarchive" | "delete", status? } — ຫຼາຍວຽກພ້ອມກັນ */
export const bulkTasks = async (req: Request, res: Response) => {
  const t = await Task.sequelize!.transaction();
  const fail = async (message: string) => {
    await t.rollback();
    res.status(400).json({ message });
  };
  let removedFiles: TaskFile[] = [];
  try {
    const body = req.body || {};
    const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(Number).filter((n: number) => n > 0))] as number[];
    if (!ids.length) return fail("ກະລຸນາເລືອກວຽກຢ່າງໜ້ອຍ 1 ລາຍການ");
    const actor = Number(actorOf(req)) || null;
    const where = { _uuid: { [Op.in]: ids } };
    const action = String(body.action ?? "");
    if (action === "status") {
      const status = Number(body.status);
      if (!STATUSES.includes(status)) return fail("ສະຖານະບໍ່ຖືກຕ້ອງ");
      const rows = await Task.findAll({ where, transaction: t });
      for (const row of rows) {
        if (status !== Number(row.status)) await logTask(row._uuid, "update", byUser(req), { fields: ["status"], status }, t);
        await row.update({ ...statusFields(row, status), updatedbyid: actor, updatedAt: new Date() }, { transaction: t });
      }
    } else if (action === "archive" || action === "unarchive") {
      const archived = action === "archive" ? 1 : 0;
      const rows = await Task.findAll({ where, attributes: ["_uuid", "archived"], transaction: t });
      for (const row of rows) if (Number(row.archived) !== archived) await logTask(row._uuid, action, byUser(req), {}, t);
      await Task.update({ archived, updatedbyid: actor, updatedAt: new Date() } as any, { where, transaction: t });
    } else if (action === "delete") {
      if (!hasPermission(await currentUser(req), "deletes")) {
        await t.rollback();
        res.status(403).json({ message: "ທ່ານບໍ່ມີສິດລຶບຂໍ້ມູນ" });
        return;
      }
      removedFiles = await TaskFile.findAll({ where: { task_id: { [Op.in]: ids } }, attributes: ["file_name"], transaction: t });
      for (const model of [TaskAssignee, TaskItem, TaskStar, TaskFile, TaskComment, TaskLog] as const) await (model as any).destroy({ where: { task_id: { [Op.in]: ids } }, transaction: t });
      await Task.destroy({ where, transaction: t });
    } else {
      return fail("ການກະທຳບໍ່ຖືກຕ້ອງ");
    }
    await t.commit();
    removedFiles.forEach((f) => removeQuietly(path.join(TASK_FILE_DIR, path.basename(f.file_name))));
    res.status(200).json({ message: `Successfully updated ${ids.length} tasks`, count: ids.length });
  } catch (error) {
    await t.rollback();
    sendError(res, error, "Error updating tasks");
  }
};

/**
 * ໝາຍລາຍການຍ່ອຍ ສຳເລັດ / ບໍ່ສຳເລັດ — ໝາຍອັນທຳອິດຕອນວຽກຍັງລໍຖ້າ = ຍ້າຍເປັນ "ກຳລັງດຳເນີນການ" ໃຫ້ເອງ
 * (ສຳເລັດທັງວຽກ ຍັງຕ້ອງກົດເອງ). doneBy = ພະນັກງານທີ່ໝາຍ (null = HR); by = ຄົນທີ່ລົງໄທມ໌ໄລນ໌
 */
const setItemDone = async (item: TaskItem, done: boolean, doneBy: number | null, by: LogBy) => {
  const changed = Number(item.done) === 1 !== done;
  await item.update({ done: done ? 1 : 0, done_at: done ? new Date() : null, done_by: done ? doneBy : null, updatedAt: new Date() });
  if (changed) await logTask(item.task_id, done ? "item_done" : "item_undone", by, { note: item.title });
  // ພະນັກງານໝາຍລາຍການຍ່ອຍ ບໍ່ປ່ຽນສະຖານະ — ຜູ້ມອບໝາຍເປັນຜູ້ອັບເດດ
  if (!done || by.employee_id) return;
  const [moved] = await Task.update({ status: TASK_DOING, updatedAt: new Date() } as any, { where: { _uuid: item.task_id, status: TASK_PENDING } });
  if (moved) await logTask(item.task_id, "update", by, { fields: ["status"], status: TASK_DOING });
};

/** PUT /task/item/:id { done } — HR ໝາຍລາຍການຍ່ອຍ */
export const updateTaskItem = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const item = await TaskItem.findByPk(Number(decodeId(req)));
    if (!item) {
      res.status(404).json({ message: "ບໍ່ພົບລາຍການຍ່ອຍ" });
      return;
    }
    await setItemDone(item, req.body?.done === true || Number(req.body?.done) === 1, null, byUser(req));
    await reply(req, res, item.task_id, "Successfully updated task item");
  } catch (error) {
    sendError(res, error, "Error updating task item");
  }
};

// ================= ເອກະສານຄັດຕິດ

/** POST /task/file/:id — :id = ວຽກ; field "files" (ຮູບ, PDF, Word, Excel, PowerPoint ≤ 5MB) ລວມບໍ່ເກີນ MAX_FILES ໄຟລ໌ຕໍ່ວຽກ */
export const uploadTaskFiles = async (req: Request<{ id: string }>, res: Response) => {
  const files = ((req as any).files ?? []) as Express.Multer.File[];
  const discard = () => files.forEach((f) => removeQuietly(f.path));
  try {
    const taskId = Number(decodeId(req));
    if (!(await Task.count({ where: { _uuid: taskId } }))) {
      discard();
      res.status(404).json({ message: "ບໍ່ພົບວຽກ" });
      return;
    }
    if (!files.length) {
      res.status(400).json({ message: "ກະລຸນາເລືອກໄຟລ໌" });
      return;
    }
    if ((await TaskFile.count({ where: { task_id: taskId } })) + files.length > MAX_FILES) {
      discard();
      res.status(400).json({ message: `ແນບເອກະສານໄດ້ບໍ່ເກີນ ${MAX_FILES} ໄຟລ໌ຕໍ່ວຽກ` });
      return;
    }
    const actor = Number(actorOf(req)) || null;
    await TaskFile.bulkCreate(files.map((f) => ({
      task_id: taskId,
      file_name: f.filename,
      original_name: originalNameOf(f).slice(0, 255),
      mime_type: f.mimetype?.slice(0, 100) ?? null,
      file_size: f.size,
      createdbyid: actor,
    })));
    await logTask(taskId, "file_add", byUser(req), { note: files.map(originalNameOf).join(", ") });
    await reply(req, res, taskId, "Successfully uploaded task files");
  } catch (error) {
    discard();
    sendError(res, error, "Error uploading task files");
  }
};

const sendTaskFile = (res: Response, file: TaskFile | null) => {
  const filePath = file && path.join(TASK_FILE_DIR, path.basename(file.file_name));
  if (!file || !filePath || !fs.existsSync(filePath)) {
    res.status(404).json({ message: "ບໍ່ພົບໄຟລ໌" });
    return;
  }
  res.download(filePath, file.original_name);
};

/** GET /task/file/download/:id — :id = ເອກະສານ; ເວັບດາວໂຫຼດຜ່ານ token */
export const downloadTaskFile = async (req: Request<{ id: string }>, res: Response) => {
  try {
    sendTaskFile(res, await TaskFile.findByPk(Number(decodeId(req))));
  } catch (error) {
    sendError(res, error, "Error downloading task file");
  }
};

/** DELETE /task/file/:id — :id = ເອກະສານ */
export const deleteTaskFile = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const file = await TaskFile.findByPk(Number(decodeId(req)));
    if (!file) {
      res.status(404).json({ message: "ບໍ່ພົບເອກະສານ" });
      return;
    }
    await file.destroy();
    removeQuietly(path.join(TASK_FILE_DIR, path.basename(file.file_name)));
    await logTask(file.task_id, "file_del", byUser(req), { note: file.original_name });
    await reply(req, res, file.task_id, "Successfully deleted task file");
  } catch (error) {
    sendError(res, error, "Error deleting task file");
  }
};

/**
 * ລິ້ງເປີດໄຟລ໌ຊົ່ວຄາວຂອງ app — browser ຂອງມືຖືສົ່ງ token ບໍ່ໄດ້ ຈຶ່ງເຊັນລິ້ງສະເພາະໄຟລ໌ນີ້. ກະແຈແຍກຈາກ login
 * (HMAC ຂອງ secret) ເພື່ອບໍ່ໃຫ້ verifyToken ຮັບລິ້ງນີ້ເປັນ token ເຂົ້າລະບົບ
 */
const fileLinkSecret = () => createHmac("sha256", adminJwtConfig.secret).update("task-file-link").digest("hex");

/** GET /task/file/open/:token — public (ຢູ່ເທິງ verifyToken), ໃຊ້ໄດ້ພາຍໃນ FILE_LINK_TTL */
export const openTaskFile = async (req: Request<{ token: string }>, res: Response) => {
  try {
    let fileId: number;
    try {
      fileId = Number((jwt.verify(req.params.token, fileLinkSecret(), { algorithms: ["HS256"] }) as jwt.JwtPayload).file);
    } catch {
      res.status(401).json({ message: "ລິ້ງໝົດອາຍຸແລ້ວ — ກົດເປີດເອກະສານໃນແອັບອີກຄັ້ງ" });
      return;
    }
    sendTaskFile(res, await TaskFile.findByPk(fileId));
  } catch (error) {
    sendError(res, error, "Error opening task file");
  }
};

// ================= ຄອມເມັນ

/** viewer = ຄົນທີ່ກຳລັງເບິ່ງ — ໃຊ້ບອກ mine (ລຶບຄອມເມັນຂອງຕົນເອງໄດ້) */
type CommentViewer = { userId?: number; employeeId?: number };

/** ຄອມເມັນຂອງວຽກ ເກົ່າ → ໃໝ່ */
const commentsOf = async (taskId: number, viewer: CommentViewer) => {
  const rows = await TaskComment.findAll({
    where: { task_id: taskId },
    include: authorInclude,
    order: [["_uuid", "ASC"]],
  });
  return rows.map((row) => {
    const c: any = row.get({ plain: true });
    return {
      _uuid: c._uuid,
      body: c.body,
      createdAt: c.createdAt,
      ...authorOf(c),
      mine: c.employee_id ? c.employee_id === viewer.employeeId : !!c.user_id && c.user_id === viewer.userId,
    };
  });
};

/** ແຈ້ງຜູ້ຮັບຜິດຊອບ (ຍົກເວັ້ນຄົນຂຽນ) ວ່າມີຄອມເມັນໃໝ່ — ສົ່ງບໍ່ໄດ້ ບໍ່ໃຫ້ຄອມເມັນລົ້ມ */
const notifyComment = async (task: Task, body: string, authorName: string, authorEmployeeId: number | null, actor: number | null) => {
  try {
    const assignees = await TaskAssignee.findAll({ where: { task_id: task._uuid }, attributes: ["employee_id"], raw: true });
    const ids = assignees.map((a: any) => Number(a.employee_id)).filter((id) => id !== authorEmployeeId);
    if (!ids.length) return;
    await notify(ids.map((employee_id) => ({
      employee_id,
      type: "task",
      title: `💬 ${authorName} ຄອມເມັນວຽກ`,
      body: `${task.title}\n${body.slice(0, 200)}`,
      ref: `task:${task._uuid}`,
      createdbyid: actor,
      push: true,
    })));
  } catch (error) {
    console.error("notifyComment", error);
  }
};

const commentBody = (value: unknown) => String(value ?? "").trim().slice(0, MAX_COMMENT);

/** POST /task/comment/:id { body } — :id = ວຽກ; ຜູ້ໃຊ້ເວັບຂຽນຄອມເມັນ; ຄືນຄອມເມັນທັງໝົດ */
export const createTaskComment = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const user = await Users.findByPk(Number(actorOf(req)), { attributes: ["user_uuid", "user_name", "employee_id", "status"] });
    if (!user || Number(user.status) !== 1) {
      res.status(401).json({ message: "ບັນຊີຜູ້ໃຊ້ຖືກປິດໃຊ້ງານ" });
      return;
    }
    const task = await Task.findByPk(Number(decodeId(req)));
    if (!task) {
      res.status(404).json({ message: "ບໍ່ພົບວຽກ" });
      return;
    }
    if (Number(task.archived) === 1) {
      res.status(400).json({ message: "ວຽກນີ້ເກັບເຂົ້າຄັງແລ້ວ — ເອົາອອກຈາກຄັງກ່ອນຈຶ່ງຄອມເມັນໄດ້" });
      return;
    }
    const body = commentBody(req.body?.body);
    if (!body) {
      res.status(400).json({ message: "ກະລຸນາພິມຄອມເມັນ" });
      return;
    }
    await TaskComment.create({ task_id: task._uuid, body, user_id: user.user_uuid });
    await notifyComment(task, body, user.user_name, user.employee_id ?? null, user.user_uuid);
    res.status(200).json({ message: "Successfully added comment", data: await commentsOf(task._uuid, { userId: user.user_uuid }) });
  } catch (error) {
    sendError(res, error, "Error adding task comment");
  }
};

/** DELETE /task/comment/:id — :id = ຄອມເມັນ; ຂອງຕົນເອງ ຫຼື ຜູ້ມີສິດລຶບ */
export const deleteTaskComment = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const comment = await TaskComment.findByPk(Number(decodeId(req)));
    if (!comment) {
      res.status(404).json({ message: "ບໍ່ພົບຄອມເມັນ" });
      return;
    }
    const userId = Number(actorOf(req));
    if (comment.user_id !== userId && !hasPermission(await currentUser(req), "deletes")) {
      res.status(403).json({ message: "ລຶບໄດ້ສະເພາະຄອມເມັນຂອງຕົນເອງ" });
      return;
    }
    await comment.destroy();
    res.status(200).json({ message: "Successfully deleted comment", data: await commentsOf(comment.task_id, { userId }) });
  } catch (error) {
    sendError(res, error, "Error deleting task comment");
  }
};

// ================= ພະນັກງານ (app ມືຖື)

/** ວຽກທີ່ຄົນນີ້ຮັບຜິດຊອບ (ບໍ່ລວມທີ່ເກັບເຂົ້າຄັງ) — null = ບໍ່ແມ່ນວຽກຂອງຄົນນີ້ */
const myTask = async (employeeId: number, taskId: number) => {
  const assigned = await TaskAssignee.count({ where: { task_id: taskId, employee_id: employeeId } });
  if (!assigned) return null;
  return Task.findOne({ where: { _uuid: taskId, archived: 0 } });
};

/** GET /task/me — ວຽກທີ່ໄດ້ຮັບມອບໝາຍ (ຍັງບໍ່ສຳເລັດກ່ອນ: ເກີນກຳນົດ → ກຳນົດສົ່ງໃກ້ສຸດ) + ລາຍການຍ່ອຍ + ຈຳນວນທີ່ຍັງຄ້າງ */
export const getMyTasks = async (req: Request, res: Response) => {
  try {
    const self = await selfEmployee(req);
    if ("code" in self) {
      res.status(self.code).json({ message: self.message });
      return;
    }
    const mine = await TaskAssignee.findAll({ where: { employee_id: self.employee._uuid }, attributes: ["task_id"], raw: true });
    const ids = mine.map((a: any) => Number(a.task_id));
    const rows = ids.length
      ? await Task.findAll({
        where: { _uuid: { [Op.in]: ids }, archived: 0 },
        include: [projectInclude, assigneeInclude, { model: TaskItem, as: "items" }, fileInclude, commentCountInclude],
        order: itemOrder,
      })
      : [];
    const today = todayLao();
    const data = rows.map((r) => present(r, today, false, true));
    const rank = (d: any) => (Number(d.status) === TASK_DONE ? 2 : d.overdue ? 0 : 1);
    data.sort((a, b) => rank(a) - rank(b) || String(a.due_date ?? "9999").localeCompare(String(b.due_date ?? "9999")) || b._uuid - a._uuid);
    res.status(200).json({ data, open: data.filter((d) => Number(d.status) !== TASK_DONE).length, today });
  } catch (error) {
    sendError(res, error, "Error getting my tasks");
  }
};

/** PUT /task/me/item/:id { done } — ພະນັກງານໝາຍລາຍການຍ່ອຍຂອງວຽກຕົນເອງ */
export const updateMyTaskItem = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const self = await selfEmployee(req);
    if ("code" in self) {
      res.status(self.code).json({ message: self.message });
      return;
    }
    const item = await TaskItem.findByPk(Number(decodeId(req)));
    const row = item ? await myTask(self.employee._uuid, item.task_id) : null;
    if (!item || !row) {
      res.status(404).json({ message: "ບໍ່ພົບລາຍການຍ່ອຍ" });
      return;
    }
    await setItemDone(item, req.body?.done === true || Number(req.body?.done) === 1, self.employee._uuid, { employee_id: self.employee._uuid });
    const saved = await findFull(row._uuid);
    res.status(200).json({ message: "Successfully updated task item", data: saved && present(saved, todayLao(), false, true) });
  } catch (error) {
    sendError(res, error, "Error updating my task item");
  }
};

/** GET /task/me/file/:id — ລິ້ງເປີດເອກະສານຂອງວຽກຕົນເອງ (path ຕໍ່ຈາກ /api) */
export const getMyTaskFileLink = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const self = await selfEmployee(req);
    if ("code" in self) {
      res.status(self.code).json({ message: self.message });
      return;
    }
    const file = await TaskFile.findByPk(Number(decodeId(req)), { attributes: ["_uuid", "task_id"] });
    if (!file || !(await myTask(self.employee._uuid, file.task_id))) {
      res.status(404).json({ message: "ບໍ່ພົບເອກະສານ" });
      return;
    }
    const token = jwt.sign({ file: file._uuid }, fileLinkSecret(), { algorithm: "HS256", expiresIn: FILE_LINK_TTL });
    res.status(200).json({ url: `/task/file/open/${token}` });
  } catch (error) {
    sendError(res, error, "Error creating task file link");
  }
};

/** GET /task/me/comment/:id — :id = ວຽກຂອງຕົນເອງ */
export const getMyTaskComments = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const self = await selfEmployee(req);
    if ("code" in self) {
      res.status(self.code).json({ message: self.message });
      return;
    }
    const task = await myTask(self.employee._uuid, Number(decodeId(req)));
    if (!task) {
      res.status(404).json({ message: "ບໍ່ພົບວຽກ" });
      return;
    }
    res.status(200).json({ data: await commentsOf(task._uuid, { employeeId: self.employee._uuid }) });
  } catch (error) {
    sendError(res, error, "Error getting my task comments");
  }
};

/** POST /task/me/comment/:id { body } — :id = ວຽກຂອງຕົນເອງ; ແຈ້ງຜູ້ຮັບຜິດຊອບຄົນອື່ນ; ຄືນຄອມເມັນທັງໝົດ */
export const createMyTaskComment = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const self = await selfEmployee(req);
    if ("code" in self) {
      res.status(self.code).json({ message: self.message });
      return;
    }
    const task = await myTask(self.employee._uuid, Number(decodeId(req)));
    if (!task) {
      res.status(404).json({ message: "ບໍ່ພົບວຽກ" });
      return;
    }
    const body = commentBody(req.body?.body);
    if (!body) {
      res.status(400).json({ message: "ກະລຸນາພິມຄອມເມັນ" });
      return;
    }
    await TaskComment.create({ task_id: task._uuid, body, employee_id: self.employee._uuid });
    const name = [self.employee.first_name, self.employee.last_name].filter(Boolean).join(" ");
    await notifyComment(task, body, name, self.employee._uuid, null);
    res.status(200).json({ message: "Successfully added comment", data: await commentsOf(task._uuid, { employeeId: self.employee._uuid }) });
  } catch (error) {
    sendError(res, error, "Error adding my task comment");
  }
};

/** DELETE /task/me/comment/:id — :id = ຄອມເມັນ; ສະເພາະຂອງຕົນເອງ */
export const deleteMyTaskComment = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const self = await selfEmployee(req);
    if ("code" in self) {
      res.status(self.code).json({ message: self.message });
      return;
    }
    const comment = await TaskComment.findByPk(Number(decodeId(req)));
    if (!comment || comment.employee_id !== self.employee._uuid) {
      res.status(404).json({ message: "ບໍ່ພົບຄອມເມັນ" });
      return;
    }
    await comment.destroy();
    res.status(200).json({ message: "Successfully deleted comment", data: await commentsOf(comment.task_id, { employeeId: self.employee._uuid }) });
  } catch (error) {
    sendError(res, error, "Error deleting my task comment");
  }
};
