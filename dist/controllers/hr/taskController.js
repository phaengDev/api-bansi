"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteMyTaskComment = exports.createMyTaskComment = exports.getMyTaskComments = exports.getMyTaskFileLink = exports.updateMyTaskItem = exports.getMyTasks = exports.deleteTaskComment = exports.createTaskComment = exports.openTaskFile = exports.deleteTaskFile = exports.downloadTaskFile = exports.uploadTaskFiles = exports.updateTaskItem = exports.bulkTasks = exports.toggleTaskStar = exports.updateTaskStatus = exports.updateTask = exports.createTask = exports.getTask = exports.getTasks = exports.deleteTaskProject = exports.updateTaskProject = exports.createTaskProject = exports.getTaskProjects = exports.TASK_DONE = exports.TASK_DOING = exports.TASK_PENDING = void 0;
const crypto_1 = require("crypto");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const moment_1 = __importDefault(require("moment"));
const sequelize_1 = require("sequelize");
const task_1 = __importDefault(require("../../models/task"));
const taskParts_1 = require("../../models/taskParts");
const employee_1 = __importDefault(require("../../models/employee"));
const userModel_1 = __importDefault(require("../../models/userModel"));
const bansiHelpers_1 = require("../bansi/bansiHelpers");
const jwtConfig_1 = require("../../config/jwtConfig");
const permission_1 = require("../../middleware/permission");
const attendanceController_1 = require("./attendanceController");
const hrHelpers_1 = require("./hrHelpers");
const notificationController_1 = require("./notificationController");
const workCalendar_1 = require("./workCalendar");
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
exports.TASK_PENDING = 1;
exports.TASK_DOING = 2;
exports.TASK_DONE = 3;
const STATUSES = [exports.TASK_PENDING, exports.TASK_DOING, exports.TASK_DONE];
const PRIORITIES = [1, 2, 3];
const MAX_ASSIGNEES = 50;
const MAX_ITEMS = 50;
const MAX_FILES = 20;
const FILE_LINK_TTL = "10m";
const MAX_COMMENT = 2000;
const COLOR = /^#[0-9a-f]{6}$/i;
const STATUS_TEXT = { 1: "ລໍຖ້າດຳເນີນການ", 2: "ກຳລັງດຳເນີນການ", 3: "ສຳເລັດແລ້ວ" };
const PRIORITY_TEXT = { 1: "", 2: "ສຳຄັນ", 3: "ດ່ວນ" };
const employeeInclude = {
    model: employee_1.default,
    as: "employee",
    attributes: ["_uuid", "emp_code", "first_name", "last_name", "profile", "work_status"],
};
const projectInclude = { model: taskParts_1.TaskProject, as: "project", attributes: ["_uuid", "name", "color", "status"] };
const assigneeInclude = { model: taskParts_1.TaskAssignee, as: "assignees", attributes: ["employee_id", "is_lead"], include: [employeeInclude] };
// separate = ຄິວລີແຍກ: ໄຟລ໌ / ຄອມເມັນ join ພ້ອມຜູ້ຮັບຜິດຊອບ + ລາຍການຍ່ອຍ ແຖວຈະຄູນກັນຫຼາຍເກີນ
const fileInclude = { model: taskParts_1.TaskFile, as: "files", separate: true, attributes: ["_uuid", "task_id", "original_name", "mime_type", "file_size", "createdAt"], order: [["_uuid", "ASC"]] };
const fileCountInclude = { model: taskParts_1.TaskFile, as: "files", separate: true, attributes: ["_uuid", "task_id"] };
const commentCountInclude = { model: taskParts_1.TaskComment, as: "comments", separate: true, attributes: ["_uuid", "task_id"] };
const itemOrder = [[{ model: taskParts_1.TaskItem, as: "items" }, "sort", "ASC"], [{ model: taskParts_1.TaskItem, as: "items" }, "_uuid", "ASC"]];
const text = (value, max) => String(value ?? "").trim().slice(0, max) || null;
const dayText = (date) => (0, moment_1.default)(date).format("DD/MM/YYYY");
const isOverdue = (r, today) => !!r.due_date && Number(r.status) !== exports.TASK_DONE && String(r.due_date) < today;
/** ວຽກ → JSON: ຜູ້ຮັບຜິດຊອບ (ຫົວໜ້າວຽກກ່ອນ), ຈຳນວນລາຍການຍ່ອຍ + ເອກະສານ, ດາວ, ເກີນກຳນົດ; withItems = ສົ່ງລາຍການຍ່ອຍ + ເອກະສານທັງໝົດນຳ */
const present = (row, today, starred = false, withItems = false) => {
    const { assignees = [], items = [], files = [], comments = [], ...r } = row.get({ plain: true });
    return {
        ...r,
        assignees: assignees
            .map((a) => ({
            employee_id: a.employee_id,
            is_lead: Number(a.is_lead) === 1,
            emp_code: a.employee?.emp_code ?? "",
            first_name: a.employee?.first_name ?? "",
            last_name: a.employee?.last_name ?? null,
            work_status: a.employee?.work_status ?? null,
            profile_url: (0, hrHelpers_1.profileUrl)(a.employee?.profile),
        }))
            .sort((a, b) => Number(b.is_lead) - Number(a.is_lead)),
        items_total: items.length,
        items_done: items.filter((i) => Number(i.done) === 1).length,
        ...(withItems ? { items: items.map((i) => ({ _uuid: i._uuid, title: i.title, done: Number(i.done) === 1, done_at: i.done_at, done_by: i.done_by })), files } : {}),
        files_total: files.length,
        comments_total: comments.length,
        starred,
        overdue: isOverdue(r, today),
    };
};
const findFull = (id, t) => task_1.default.findByPk(id, { include: [projectInclude, assigneeInclude, { model: taskParts_1.TaskItem, as: "items" }, fileInclude, commentCountInclude], order: itemOrder, transaction: t });
const starredBy = async (userId, taskIds) => {
    if (!userId)
        return new Set();
    const rows = await taskParts_1.TaskStar.findAll({
        where: { user_id: userId, ...(taskIds ? { task_id: { [sequelize_1.Op.in]: taskIds } } : {}) },
        attributes: ["task_id"],
        raw: true,
    });
    return new Set(rows.map((r) => Number(r.task_id)));
};
/** ຜູ້ຂຽນຄອມເມັນ / ຜູ້ເຮັດລາຍການໄທມ໌ໄລນ໌ — ຜູ້ໃຊ້ເວັບທີ່ຜູກພະນັກງານ ໃຊ້ຮູບຂອງພະນັກງານນັ້ນ */
const authorInclude = [
    { model: employee_1.default, as: "employee", attributes: ["first_name", "last_name", "profile"] },
    { model: userModel_1.default, as: "user", attributes: ["user_name", "employee_id"], include: [{ model: employee_1.default, as: "employee", attributes: ["profile"] }] },
];
const authorOf = (c) => ({
    author_name: c.employee ? [c.employee.first_name, c.employee.last_name].filter(Boolean).join(" ") : c.user?.user_name ?? "—",
    author_photo: (0, hrHelpers_1.profileUrl)(c.employee?.profile ?? c.user?.employee?.profile),
    from_app: !!c.employee_id,
});
const byUser = (req) => ({ user_id: Number((0, bansiHelpers_1.actorOf)(req)) || null });
/** ລົງໄທມ໌ໄລນ໌ — ລົງບໍ່ໄດ້ ບໍ່ໃຫ້ວຽກຫຼັກລົ້ມ */
const logTask = async (taskId, action, by, extra = {}, t) => {
    try {
        await taskParts_1.TaskLog.create({
            task_id: taskId,
            action,
            fields: extra.fields?.join(",") || null,
            status: extra.status ?? null,
            note: extra.note?.slice(0, 255) ?? null,
            ...by,
        }, { transaction: t });
    }
    catch (error) {
        console.error("logTask", error);
    }
};
/** ໄທມ໌ໄລນ໌ ໃໝ່ → ເກົ່າ; author_employee_id ໃຊ້ສະແດງມົງກຸດຂອງຫົວໜ້າວຽກ. ວຽກທີ່ສ້າງກ່ອນມີໄທມ໌ໄລນ໌ = ເຕີມລາຍການ "ສ້າງ" ຈາກຂໍ້ມູນວຽກ */
const timelineOf = async (task) => {
    const rows = await taskParts_1.TaskLog.findAll({ where: { task_id: task._uuid }, include: authorInclude, order: [["_uuid", "DESC"]] });
    const data = rows.map((row) => {
        const l = row.get({ plain: true });
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
        const creator = task.createdbyid ? await userModel_1.default.findByPk(task.createdbyid, { attributes: ["user_name", "employee_id"], include: [{ model: employee_1.default, as: "employee", attributes: ["profile"] }] }) : null;
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
const reply = async (req, res, id, message) => {
    const row = await findFull(id);
    const stars = await starredBy(Number((0, bansiHelpers_1.actorOf)(req)), [id]);
    res.status(200).json({ message, data: row && { ...present(row, (0, workCalendar_1.todayLao)(), stars.has(id), true), timeline: await timelineOf(row) } });
};
/** ແຈ້ງຜູ້ຮັບຜິດຊອບວ່າໄດ້ຮັບມອບໝາຍວຽກ — ເດັ້ງຂຶ້ນຈໍມືຖື */
const notifyAssigned = async (task, employeeIds, actor) => {
    if (!employeeIds.length)
        return;
    const priority = PRIORITY_TEXT[Number(task.priority)];
    await (0, notificationController_1.notify)(employeeIds.map((employee_id) => ({
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
const getTaskProjects = async (_req, res) => {
    try {
        const [rows, used] = await Promise.all([
            taskParts_1.TaskProject.findAll({ order: [["status", "DESC"], ["sort", "ASC"], ["name", "ASC"]] }),
            task_1.default.count({ where: { project_id: { [sequelize_1.Op.ne]: null } }, group: ["project_id"] }),
        ]);
        const counts = new Map(used.map((u) => [Number(u.project_id), Number(u.count)]));
        res.status(200).json({ data: rows.map((r) => ({ ...r.get({ plain: true }), tasks: counts.get(r._uuid) ?? 0 })) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting task projects");
    }
};
exports.getTaskProjects = getTaskProjects;
const projectInput = (body) => {
    const name = text(body.name, 150);
    if (!name)
        return { error: "ກະລຸນາປ້ອນຊື່ໂປຣເຈັກ" };
    const color = String(body.color ?? "#1580be");
    if (!COLOR.test(color))
        return { error: "ສີບໍ່ຖືກຕ້ອງ" };
    return { name, color, sort: Number(body.sort) || 0, status: Number(body.status ?? 1) === 0 ? 0 : 1 };
};
/** POST /task/project/create { name, color } */
const createTaskProject = async (req, res) => {
    try {
        const input = projectInput(req.body || {});
        if ("error" in input) {
            res.status(400).json({ message: input.error });
            return;
        }
        if (await taskParts_1.TaskProject.count({ where: { name: input.name } })) {
            res.status(400).json({ message: `ໂປຣເຈັກ "${input.name}" ມີແລ້ວ` });
            return;
        }
        res.status(200).json({ message: "Successfully created task project", data: await taskParts_1.TaskProject.create(input) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error creating task project");
    }
};
exports.createTaskProject = createTaskProject;
/** PUT /task/project/:id { name, color, status } */
const updateTaskProject = async (req, res) => {
    try {
        const row = await taskParts_1.TaskProject.findByPk(Number((0, bansiHelpers_1.decodeId)(req)));
        if (!row) {
            res.status(404).json({ message: "ບໍ່ພົບໂປຣເຈັກ" });
            return;
        }
        const input = projectInput({ ...row.get({ plain: true }), ...(req.body || {}) });
        if ("error" in input) {
            res.status(400).json({ message: input.error });
            return;
        }
        if (await taskParts_1.TaskProject.count({ where: { name: input.name, _uuid: { [sequelize_1.Op.ne]: row._uuid } } })) {
            res.status(400).json({ message: `ໂປຣເຈັກ "${input.name}" ມີແລ້ວ` });
            return;
        }
        await row.update({ ...input, updatedAt: new Date() });
        res.status(200).json({ message: "Successfully updated task project", data: row });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error updating task project");
    }
};
exports.updateTaskProject = updateTaskProject;
/** DELETE /task/project/:id — ມີວຽກໃຊ້ຢູ່ = ປິດແທນການລຶບ (ວຽກເກົ່າຍັງສະແດງຊື່ໂປຣເຈັກ) */
const deleteTaskProject = async (req, res) => {
    try {
        const row = await taskParts_1.TaskProject.findByPk(Number((0, bansiHelpers_1.decodeId)(req)));
        if (!row) {
            res.status(404).json({ message: "ບໍ່ພົບໂປຣເຈັກ" });
            return;
        }
        if (await task_1.default.count({ where: { project_id: row._uuid } })) {
            await row.update({ status: 0, updatedAt: new Date() });
            res.status(200).json({ message: "ມີວຽກໃຊ້ໂປຣເຈັກນີ້ຢູ່ — ປິດໃຊ້ງານແທນການລຶບ", data: row });
            return;
        }
        await row.destroy();
        res.status(200).json({ message: "Successfully deleted task project" });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error deleting task project");
    }
};
exports.deleteTaskProject = deleteTaskProject;
// ================= ວຽກ (HR)
/**
 * POST /task/fetch { archived?: 0 | 1 } — ທຸກວຽກ (ຄົ້ນຫາ / ຈັດລຽງ / ແບ່ງໜ້າ ເຮັດຢູ່ໜ້າເວັບ) + summary ຂອງວຽກທີ່ບໍ່ໄດ້ເກັບເຂົ້າຄັງ:
 * total, pending, doing, done, overdue, archived
 */
const getTasks = async (req, res) => {
    try {
        const archived = Number(req.body?.archived) === 1 ? 1 : 0;
        const today = (0, workCalendar_1.todayLao)();
        const [rows, open, archivedCount] = await Promise.all([
            task_1.default.findAll({
                where: { archived },
                include: [projectInclude, assigneeInclude, { model: taskParts_1.TaskItem, as: "items", attributes: ["_uuid", "done"] }, fileCountInclude, commentCountInclude],
                order: [["createdAt", "DESC"], ["_uuid", "DESC"]],
            }),
            task_1.default.findAll({ where: { archived: 0 }, attributes: ["status", "due_date"], raw: true }),
            task_1.default.count({ where: { archived: 1 } }),
        ]);
        const stars = await starredBy(Number((0, bansiHelpers_1.actorOf)(req)));
        const countOf = (status) => open.filter((r) => Number(r.status) === status).length;
        res.status(200).json({
            data: rows.map((r) => present(r, today, stars.has(r._uuid))),
            summary: {
                total: open.length,
                pending: countOf(exports.TASK_PENDING),
                doing: countOf(exports.TASK_DOING),
                done: countOf(exports.TASK_DONE),
                overdue: open.filter((r) => isOverdue(r, today)).length,
                archived: archivedCount,
            },
            today,
        });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting tasks");
    }
};
exports.getTasks = getTasks;
/** GET /task/:id — ລາຍລະອຽດ + ລາຍການຍ່ອຍ + ເອກະສານ + ຄອມເມັນ + ໄທມ໌ໄລນ໌ + ຊື່ຜູ້ສ້າງ */
const getTask = async (req, res) => {
    try {
        const id = Number((0, bansiHelpers_1.decodeId)(req));
        const row = await findFull(id);
        if (!row) {
            res.status(404).json({ message: "ບໍ່ພົບວຽກ" });
            return;
        }
        const [stars, creator, comments, timeline] = await Promise.all([
            starredBy(Number((0, bansiHelpers_1.actorOf)(req)), [id]),
            row.createdbyid ? userModel_1.default.findByPk(row.createdbyid, { attributes: ["user_name"] }) : null,
            commentsOf(id, { userId: Number((0, bansiHelpers_1.actorOf)(req)) }),
            timelineOf(row),
        ]);
        res.status(200).json({ data: { ...present(row, (0, workCalendar_1.todayLao)(), stars.has(id), true), createdby_name: creator?.user_name ?? null, comments, timeline } });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting task");
    }
};
exports.getTask = getTask;
/** body ຂອງຟອມ → ຄ່າທີ່ກວດແລ້ວ; currentIds = ຜູ້ຮັບຜິດຊອບເດີມ (ຄົນທີ່ລາອອກແລ້ວ ຍັງຢູ່ໃນວຽກເກົ່າໄດ້) */
const parseTask = async (body, currentIds = []) => {
    const title = text(body.title, 255);
    if (!title)
        return { error: "ກະລຸນາປ້ອນຊື່ວຽກ" };
    const detail = String(body.detail ?? "").trim().slice(0, 5000) || null;
    const priority = Number(body.priority ?? 1);
    if (!PRIORITIES.includes(priority))
        return { error: "ຄວາມສຳຄັນບໍ່ຖືກຕ້ອງ" };
    const projectId = Number(body.project_id) || null;
    if (projectId && !(await taskParts_1.TaskProject.count({ where: { _uuid: projectId } })))
        return { error: "ບໍ່ພົບໂປຣເຈັກ" };
    const startDate = body.start_date ? (0, bansiHelpers_1.toDateOnly)(body.start_date) : null;
    const dueDate = body.due_date ? (0, bansiHelpers_1.toDateOnly)(body.due_date) : null;
    if ((body.start_date && !startDate) || (body.due_date && !dueDate))
        return { error: "ວັນທີບໍ່ຖືກຕ້ອງ" };
    if (startDate && dueDate && dueDate < startDate)
        return { error: "ກຳນົດສົ່ງຕ້ອງບໍ່ກ່ອນວັນທີເລີ່ມ" };
    const assigneeIds = [...new Set((Array.isArray(body.assignee_ids) ? body.assignee_ids : []).map(Number).filter((n) => n > 0))];
    if (!assigneeIds.length)
        return { error: "ກະລຸນາເລືອກຜູ້ຮັບຜິດຊອບຢ່າງໜ້ອຍ 1 ຄົນ" };
    if (assigneeIds.length > MAX_ASSIGNEES)
        return { error: `ຜູ້ຮັບຜິດຊອບໄດ້ບໍ່ເກີນ ${MAX_ASSIGNEES} ຄົນ` };
    const employees = await employee_1.default.findAll({ where: { _uuid: { [sequelize_1.Op.in]: assigneeIds } }, attributes: ["_uuid", "emp_code", "first_name", "work_status"] });
    if (employees.length !== assigneeIds.length)
        return { error: "ບໍ່ພົບພະນັກງານບາງຄົນ" };
    const resigned = employees.find((e) => Number(e.work_status) !== workCalendar_1.WORKING && !currentIds.includes(e._uuid));
    if (resigned)
        return { error: `${resigned.emp_code} ${resigned.first_name} ລາອອກແລ້ວ — ມອບໝາຍວຽກໃໝ່ບໍ່ໄດ້` };
    const lead = Number(body.lead_id);
    const leadId = assigneeIds.includes(lead) ? lead : assigneeIds[0];
    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (rawItems.length > MAX_ITEMS)
        return { error: `ລາຍການຍ່ອຍໄດ້ບໍ່ເກີນ ${MAX_ITEMS} ລາຍການ` };
    const items = [];
    for (const item of rawItems) {
        const itemTitle = text(item?.title, 255);
        if (!itemTitle)
            continue;
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
const syncAssignees = async (taskId, ids, leadId, t) => {
    const existing = await taskParts_1.TaskAssignee.findAll({ where: { task_id: taskId }, transaction: t });
    const have = new Set(existing.map((a) => Number(a.employee_id)));
    await taskParts_1.TaskAssignee.destroy({ where: { task_id: taskId, employee_id: { [sequelize_1.Op.notIn]: ids } }, transaction: t });
    for (const a of existing) {
        if (ids.includes(Number(a.employee_id)))
            await a.update({ is_lead: Number(a.employee_id) === leadId ? 1 : 0 }, { transaction: t });
    }
    const added = ids.filter((id) => !have.has(id));
    if (added.length) {
        await taskParts_1.TaskAssignee.bulkCreate(added.map((employee_id) => ({ task_id: taskId, employee_id, is_lead: employee_id === leadId ? 1 : 0 })), { transaction: t });
    }
    return added;
};
/** ບັນທຶກລາຍການຍ່ອຍ — ມີ _uuid = ແກ້, ບໍ່ມີ = ເພີ່ມ, ບໍ່ສົ່ງມາ = ລຶບ; ລຳດັບຕາມທີ່ສົ່ງ. ຄືນວ່າຊື່ / ຈຳນວນ / ສະຖານະຫຍັງປ່ຽນບໍ່ (ໄວ້ລົງໄທມ໌ໄລນ໌) */
const syncItems = async (taskId, items, t) => {
    const existing = await taskParts_1.TaskItem.findAll({ where: { task_id: taskId }, transaction: t });
    const byId = new Map(existing.map((i) => [i._uuid, i]));
    const keep = new Set();
    let touched = false;
    for (const [sort, item] of items.entries()) {
        const current = item._uuid ? byId.get(item._uuid) : undefined;
        if (current) {
            keep.add(current._uuid);
            const changed = Number(current.done) === 1 !== item.done;
            if (changed || current.title !== item.title)
                touched = true;
            await current.update({
                title: item.title,
                sort,
                ...(changed ? { done: item.done ? 1 : 0, done_at: item.done ? new Date() : null, done_by: null } : {}),
                updatedAt: new Date(),
            }, { transaction: t });
        }
        else {
            touched = true;
            await taskParts_1.TaskItem.create({ task_id: taskId, title: item.title, sort, done: item.done ? 1 : 0, done_at: item.done ? new Date() : null }, { transaction: t });
        }
    }
    const removed = existing.filter((i) => !keep.has(i._uuid)).map((i) => i._uuid);
    if (removed.length)
        await taskParts_1.TaskItem.destroy({ where: { _uuid: { [sequelize_1.Op.in]: removed } }, transaction: t });
    return touched || removed.length > 0;
};
/** ຊ່ອງທີ່ຕ່າງຈາກເດີມ — ຊື່ກົງກັບທີ່ໜ້າເວັບໃຊ້ສະແດງໃນໄທມ໌ໄລນ໌ */
const changedFields = (before, values) => {
    const same = (a, b) => String(a ?? "") === String(b ?? "");
    return [
        !same(before.title, values.title) && "title",
        !same(before.detail, values.detail) && "detail",
        !same(before.project_id, values.project_id) && "project",
        !same(before.priority, values.priority) && "priority",
        !same(before.start_date, values.start_date) && "start_date",
        !same(before.due_date, values.due_date) && "due_date",
    ].filter(Boolean);
};
/** POST /task/create { title, detail, project_id, priority, start_date, due_date, assignee_ids, lead_id, items: [{ title }] } */
const createTask = async (req, res) => {
    const t = await task_1.default.sequelize.transaction();
    try {
        const input = await parseTask(req.body || {});
        if ("error" in input) {
            await t.rollback();
            res.status(400).json({ message: input.error });
            return;
        }
        const actor = Number((0, bansiHelpers_1.actorOf)(req)) || null;
        const row = await task_1.default.create({ ...input.values, status: exports.TASK_PENDING, createdbyid: actor, updatedbyid: actor }, { transaction: t });
        const added = await syncAssignees(row._uuid, input.assigneeIds, input.leadId, t);
        await syncItems(row._uuid, input.items, t);
        await logTask(row._uuid, "create", byUser(req), {}, t);
        await t.commit();
        await notifyAssigned(row, added, actor);
        await reply(req, res, row._uuid, `ມອບໝາຍວຽກແລ້ວ — ແຈ້ງເຕືອນ ${added.length} ຄົນ`);
    }
    catch (error) {
        await t.rollback();
        (0, bansiHelpers_1.sendError)(res, error, "Error creating task");
    }
};
exports.createTask = createTask;
/** PUT /task/:id — ຄືກັບ create (+ status ໄດ້); ຄົນທີ່ເພີ່ມເຂົ້າມາໃໝ່ໄດ້ຮັບແຈ້ງເຕືອນ */
const updateTask = async (req, res) => {
    const t = await task_1.default.sequelize.transaction();
    const fail = async (code, message) => {
        await t.rollback();
        res.status(code).json({ message });
    };
    try {
        const row = await task_1.default.findByPk(Number((0, bansiHelpers_1.decodeId)(req)), { transaction: t, lock: t.LOCK.UPDATE });
        if (!row)
            return fail(404, "ບໍ່ພົບວຽກ");
        const current = await taskParts_1.TaskAssignee.findAll({ where: { task_id: row._uuid }, attributes: ["employee_id", "is_lead"], raw: true, transaction: t });
        const input = await parseTask(req.body || {}, current.map((a) => Number(a.employee_id)));
        if ("error" in input)
            return fail(400, input.error);
        const status = req.body?.status === undefined ? Number(row.status) : Number(req.body.status);
        if (!STATUSES.includes(status))
            return fail(400, "ສະຖານະບໍ່ຖືກຕ້ອງ");
        const actor = Number((0, bansiHelpers_1.actorOf)(req)) || null;
        const fields = changedFields(row.get({ plain: true }), input.values);
        const statusChanged = status !== Number(row.status);
        const leadBefore = current.find((a) => Number(a.is_lead) === 1);
        const sameAssignees = current.length === input.assigneeIds.length
            && current.every((a) => input.assigneeIds.includes(Number(a.employee_id)))
            && Number(leadBefore?.employee_id) === input.leadId;
        await row.update({ ...input.values, ...statusFields(row, status), updatedbyid: actor, updatedAt: new Date() }, { transaction: t });
        const added = await syncAssignees(row._uuid, input.assigneeIds, input.leadId, t);
        const itemsChanged = await syncItems(row._uuid, input.items, t);
        if (statusChanged)
            fields.push("status");
        if (!sameAssignees)
            fields.push("assignees");
        if (itemsChanged)
            fields.push("items");
        if (fields.length)
            await logTask(row._uuid, "update", byUser(req), { fields, status: statusChanged ? status : undefined }, t);
        await t.commit();
        await notifyAssigned(row, added, actor);
        await reply(req, res, row._uuid, added.length ? `ບັນທຶກແລ້ວ — ແຈ້ງເຕືອນຄົນທີ່ເພີ່ມໃໝ່ ${added.length} ຄົນ` : "Successfully updated task");
    }
    catch (error) {
        await t.rollback();
        (0, bansiHelpers_1.sendError)(res, error, "Error updating task");
    }
};
exports.updateTask = updateTask;
/** ສະຖານະ + ເວລາສຳເລັດ (ສຳເລັດ = ບັນທຶກເວລາ, ກັບໄປເຮັດຕໍ່ = ລ້າງ) */
const statusFields = (row, status) => ({
    status,
    done_at: status === exports.TASK_DONE ? row.done_at ?? new Date() : null,
});
/** PUT /task/status/:id { status } — ປ່ຽນສະຖານະຈາກລາຍການ */
const updateTaskStatus = async (req, res) => {
    try {
        const row = await task_1.default.findByPk(Number((0, bansiHelpers_1.decodeId)(req)));
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
        await row.update({ ...statusFields(row, status), updatedbyid: Number((0, bansiHelpers_1.actorOf)(req)) || null, updatedAt: new Date() });
        if (changed)
            await logTask(row._uuid, "update", byUser(req), { fields: ["status"], status });
        await reply(req, res, row._uuid, "Successfully updated task status");
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error updating task status");
    }
};
exports.updateTaskStatus = updateTaskStatus;
/** PUT /task/star/:id — ດາວ ເປີດ / ປິດ (ຂອງຜູ້ໃຊ້ທີ່ login) */
const toggleTaskStar = async (req, res) => {
    try {
        const taskId = Number((0, bansiHelpers_1.decodeId)(req));
        const userId = Number((0, bansiHelpers_1.actorOf)(req));
        if (!userId || !(await task_1.default.count({ where: { _uuid: taskId } }))) {
            res.status(404).json({ message: "ບໍ່ພົບວຽກ" });
            return;
        }
        const removed = await taskParts_1.TaskStar.destroy({ where: { user_id: userId, task_id: taskId } });
        if (!removed)
            await taskParts_1.TaskStar.create({ user_id: userId, task_id: taskId });
        res.status(200).json({ message: "Successfully updated star", starred: !removed });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error updating task star");
    }
};
exports.toggleTaskStar = toggleTaskStar;
/** POST /task/bulk { ids, action: "status" | "archive" | "unarchive" | "delete", status? } — ຫຼາຍວຽກພ້ອມກັນ */
const bulkTasks = async (req, res) => {
    const t = await task_1.default.sequelize.transaction();
    const fail = async (message) => {
        await t.rollback();
        res.status(400).json({ message });
    };
    let removedFiles = [];
    try {
        const body = req.body || {};
        const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(Number).filter((n) => n > 0))];
        if (!ids.length)
            return fail("ກະລຸນາເລືອກວຽກຢ່າງໜ້ອຍ 1 ລາຍການ");
        const actor = Number((0, bansiHelpers_1.actorOf)(req)) || null;
        const where = { _uuid: { [sequelize_1.Op.in]: ids } };
        const action = String(body.action ?? "");
        if (action === "status") {
            const status = Number(body.status);
            if (!STATUSES.includes(status))
                return fail("ສະຖານະບໍ່ຖືກຕ້ອງ");
            const rows = await task_1.default.findAll({ where, transaction: t });
            for (const row of rows) {
                if (status !== Number(row.status))
                    await logTask(row._uuid, "update", byUser(req), { fields: ["status"], status }, t);
                await row.update({ ...statusFields(row, status), updatedbyid: actor, updatedAt: new Date() }, { transaction: t });
            }
        }
        else if (action === "archive" || action === "unarchive") {
            const archived = action === "archive" ? 1 : 0;
            const rows = await task_1.default.findAll({ where, attributes: ["_uuid", "archived"], transaction: t });
            for (const row of rows)
                if (Number(row.archived) !== archived)
                    await logTask(row._uuid, action, byUser(req), {}, t);
            await task_1.default.update({ archived, updatedbyid: actor, updatedAt: new Date() }, { where, transaction: t });
        }
        else if (action === "delete") {
            if (!(0, permission_1.hasPermission)(await (0, permission_1.currentUser)(req), "deletes")) {
                await t.rollback();
                res.status(403).json({ message: "ທ່ານບໍ່ມີສິດລຶບຂໍ້ມູນ" });
                return;
            }
            removedFiles = await taskParts_1.TaskFile.findAll({ where: { task_id: { [sequelize_1.Op.in]: ids } }, attributes: ["file_name"], transaction: t });
            for (const model of [taskParts_1.TaskAssignee, taskParts_1.TaskItem, taskParts_1.TaskStar, taskParts_1.TaskFile, taskParts_1.TaskComment, taskParts_1.TaskLog])
                await model.destroy({ where: { task_id: { [sequelize_1.Op.in]: ids } }, transaction: t });
            await task_1.default.destroy({ where, transaction: t });
        }
        else {
            return fail("ການກະທຳບໍ່ຖືກຕ້ອງ");
        }
        await t.commit();
        removedFiles.forEach((f) => (0, hrHelpers_1.removeQuietly)(path_1.default.join(hrHelpers_1.TASK_FILE_DIR, path_1.default.basename(f.file_name))));
        res.status(200).json({ message: `Successfully updated ${ids.length} tasks`, count: ids.length });
    }
    catch (error) {
        await t.rollback();
        (0, bansiHelpers_1.sendError)(res, error, "Error updating tasks");
    }
};
exports.bulkTasks = bulkTasks;
/**
 * ໝາຍລາຍການຍ່ອຍ ສຳເລັດ / ບໍ່ສຳເລັດ — ໝາຍອັນທຳອິດຕອນວຽກຍັງລໍຖ້າ = ຍ້າຍເປັນ "ກຳລັງດຳເນີນການ" ໃຫ້ເອງ
 * (ສຳເລັດທັງວຽກ ຍັງຕ້ອງກົດເອງ). doneBy = ພະນັກງານທີ່ໝາຍ (null = HR); by = ຄົນທີ່ລົງໄທມ໌ໄລນ໌
 */
const setItemDone = async (item, done, doneBy, by) => {
    const changed = Number(item.done) === 1 !== done;
    await item.update({ done: done ? 1 : 0, done_at: done ? new Date() : null, done_by: done ? doneBy : null, updatedAt: new Date() });
    if (changed)
        await logTask(item.task_id, done ? "item_done" : "item_undone", by, { note: item.title });
    // ພະນັກງານໝາຍລາຍການຍ່ອຍ ບໍ່ປ່ຽນສະຖານະ — ຜູ້ມອບໝາຍເປັນຜູ້ອັບເດດ
    if (!done || by.employee_id)
        return;
    const [moved] = await task_1.default.update({ status: exports.TASK_DOING, updatedAt: new Date() }, { where: { _uuid: item.task_id, status: exports.TASK_PENDING } });
    if (moved)
        await logTask(item.task_id, "update", by, { fields: ["status"], status: exports.TASK_DOING });
};
/** PUT /task/item/:id { done } — HR ໝາຍລາຍການຍ່ອຍ */
const updateTaskItem = async (req, res) => {
    try {
        const item = await taskParts_1.TaskItem.findByPk(Number((0, bansiHelpers_1.decodeId)(req)));
        if (!item) {
            res.status(404).json({ message: "ບໍ່ພົບລາຍການຍ່ອຍ" });
            return;
        }
        await setItemDone(item, req.body?.done === true || Number(req.body?.done) === 1, null, byUser(req));
        await reply(req, res, item.task_id, "Successfully updated task item");
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error updating task item");
    }
};
exports.updateTaskItem = updateTaskItem;
// ================= ເອກະສານຄັດຕິດ
/** POST /task/file/:id — :id = ວຽກ; field "files" (ຮູບ, PDF, Word, Excel, PowerPoint ≤ 5MB) ລວມບໍ່ເກີນ MAX_FILES ໄຟລ໌ຕໍ່ວຽກ */
const uploadTaskFiles = async (req, res) => {
    const files = (req.files ?? []);
    const discard = () => files.forEach((f) => (0, hrHelpers_1.removeQuietly)(f.path));
    try {
        const taskId = Number((0, bansiHelpers_1.decodeId)(req));
        if (!(await task_1.default.count({ where: { _uuid: taskId } }))) {
            discard();
            res.status(404).json({ message: "ບໍ່ພົບວຽກ" });
            return;
        }
        if (!files.length) {
            res.status(400).json({ message: "ກະລຸນາເລືອກໄຟລ໌" });
            return;
        }
        if ((await taskParts_1.TaskFile.count({ where: { task_id: taskId } })) + files.length > MAX_FILES) {
            discard();
            res.status(400).json({ message: `ແນບເອກະສານໄດ້ບໍ່ເກີນ ${MAX_FILES} ໄຟລ໌ຕໍ່ວຽກ` });
            return;
        }
        const actor = Number((0, bansiHelpers_1.actorOf)(req)) || null;
        await taskParts_1.TaskFile.bulkCreate(files.map((f) => ({
            task_id: taskId,
            file_name: f.filename,
            original_name: (0, hrHelpers_1.originalNameOf)(f).slice(0, 255),
            mime_type: f.mimetype?.slice(0, 100) ?? null,
            file_size: f.size,
            createdbyid: actor,
        })));
        await logTask(taskId, "file_add", byUser(req), { note: files.map(hrHelpers_1.originalNameOf).join(", ") });
        await reply(req, res, taskId, "Successfully uploaded task files");
    }
    catch (error) {
        discard();
        (0, bansiHelpers_1.sendError)(res, error, "Error uploading task files");
    }
};
exports.uploadTaskFiles = uploadTaskFiles;
const sendTaskFile = (res, file) => {
    const filePath = file && path_1.default.join(hrHelpers_1.TASK_FILE_DIR, path_1.default.basename(file.file_name));
    if (!file || !filePath || !fs_1.default.existsSync(filePath)) {
        res.status(404).json({ message: "ບໍ່ພົບໄຟລ໌" });
        return;
    }
    res.download(filePath, file.original_name);
};
/** GET /task/file/download/:id — :id = ເອກະສານ; ເວັບດາວໂຫຼດຜ່ານ token */
const downloadTaskFile = async (req, res) => {
    try {
        sendTaskFile(res, await taskParts_1.TaskFile.findByPk(Number((0, bansiHelpers_1.decodeId)(req))));
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error downloading task file");
    }
};
exports.downloadTaskFile = downloadTaskFile;
/** DELETE /task/file/:id — :id = ເອກະສານ */
const deleteTaskFile = async (req, res) => {
    try {
        const file = await taskParts_1.TaskFile.findByPk(Number((0, bansiHelpers_1.decodeId)(req)));
        if (!file) {
            res.status(404).json({ message: "ບໍ່ພົບເອກະສານ" });
            return;
        }
        await file.destroy();
        (0, hrHelpers_1.removeQuietly)(path_1.default.join(hrHelpers_1.TASK_FILE_DIR, path_1.default.basename(file.file_name)));
        await logTask(file.task_id, "file_del", byUser(req), { note: file.original_name });
        await reply(req, res, file.task_id, "Successfully deleted task file");
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error deleting task file");
    }
};
exports.deleteTaskFile = deleteTaskFile;
/**
 * ລິ້ງເປີດໄຟລ໌ຊົ່ວຄາວຂອງ app — browser ຂອງມືຖືສົ່ງ token ບໍ່ໄດ້ ຈຶ່ງເຊັນລິ້ງສະເພາະໄຟລ໌ນີ້. ກະແຈແຍກຈາກ login
 * (HMAC ຂອງ secret) ເພື່ອບໍ່ໃຫ້ verifyToken ຮັບລິ້ງນີ້ເປັນ token ເຂົ້າລະບົບ
 */
const fileLinkSecret = () => (0, crypto_1.createHmac)("sha256", jwtConfig_1.adminJwtConfig.secret).update("task-file-link").digest("hex");
/** GET /task/file/open/:token — public (ຢູ່ເທິງ verifyToken), ໃຊ້ໄດ້ພາຍໃນ FILE_LINK_TTL */
const openTaskFile = async (req, res) => {
    try {
        let fileId;
        try {
            fileId = Number(jsonwebtoken_1.default.verify(req.params.token, fileLinkSecret(), { algorithms: ["HS256"] }).file);
        }
        catch {
            res.status(401).json({ message: "ລິ້ງໝົດອາຍຸແລ້ວ — ກົດເປີດເອກະສານໃນແອັບອີກຄັ້ງ" });
            return;
        }
        sendTaskFile(res, await taskParts_1.TaskFile.findByPk(fileId));
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error opening task file");
    }
};
exports.openTaskFile = openTaskFile;
/** ຄອມເມັນຂອງວຽກ ເກົ່າ → ໃໝ່ */
const commentsOf = async (taskId, viewer) => {
    const rows = await taskParts_1.TaskComment.findAll({
        where: { task_id: taskId },
        include: authorInclude,
        order: [["_uuid", "ASC"]],
    });
    return rows.map((row) => {
        const c = row.get({ plain: true });
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
const notifyComment = async (task, body, authorName, authorEmployeeId, actor) => {
    try {
        const assignees = await taskParts_1.TaskAssignee.findAll({ where: { task_id: task._uuid }, attributes: ["employee_id"], raw: true });
        const ids = assignees.map((a) => Number(a.employee_id)).filter((id) => id !== authorEmployeeId);
        if (!ids.length)
            return;
        await (0, notificationController_1.notify)(ids.map((employee_id) => ({
            employee_id,
            type: "task",
            title: `💬 ${authorName} ຄອມເມັນວຽກ`,
            body: `${task.title}\n${body.slice(0, 200)}`,
            ref: `task:${task._uuid}`,
            createdbyid: actor,
            push: true,
        })));
    }
    catch (error) {
        console.error("notifyComment", error);
    }
};
const commentBody = (value) => String(value ?? "").trim().slice(0, MAX_COMMENT);
/** POST /task/comment/:id { body } — :id = ວຽກ; ຜູ້ໃຊ້ເວັບຂຽນຄອມເມັນ; ຄືນຄອມເມັນທັງໝົດ */
const createTaskComment = async (req, res) => {
    try {
        const user = await userModel_1.default.findByPk(Number((0, bansiHelpers_1.actorOf)(req)), { attributes: ["user_uuid", "user_name", "employee_id", "status"] });
        if (!user || Number(user.status) !== 1) {
            res.status(401).json({ message: "ບັນຊີຜູ້ໃຊ້ຖືກປິດໃຊ້ງານ" });
            return;
        }
        const task = await task_1.default.findByPk(Number((0, bansiHelpers_1.decodeId)(req)));
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
        await taskParts_1.TaskComment.create({ task_id: task._uuid, body, user_id: user.user_uuid });
        await notifyComment(task, body, user.user_name, user.employee_id ?? null, user.user_uuid);
        res.status(200).json({ message: "Successfully added comment", data: await commentsOf(task._uuid, { userId: user.user_uuid }) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error adding task comment");
    }
};
exports.createTaskComment = createTaskComment;
/** DELETE /task/comment/:id — :id = ຄອມເມັນ; ຂອງຕົນເອງ ຫຼື ຜູ້ມີສິດລຶບ */
const deleteTaskComment = async (req, res) => {
    try {
        const comment = await taskParts_1.TaskComment.findByPk(Number((0, bansiHelpers_1.decodeId)(req)));
        if (!comment) {
            res.status(404).json({ message: "ບໍ່ພົບຄອມເມັນ" });
            return;
        }
        const userId = Number((0, bansiHelpers_1.actorOf)(req));
        if (comment.user_id !== userId && !(0, permission_1.hasPermission)(await (0, permission_1.currentUser)(req), "deletes")) {
            res.status(403).json({ message: "ລຶບໄດ້ສະເພາະຄອມເມັນຂອງຕົນເອງ" });
            return;
        }
        await comment.destroy();
        res.status(200).json({ message: "Successfully deleted comment", data: await commentsOf(comment.task_id, { userId }) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error deleting task comment");
    }
};
exports.deleteTaskComment = deleteTaskComment;
// ================= ພະນັກງານ (app ມືຖື)
/** ວຽກທີ່ຄົນນີ້ຮັບຜິດຊອບ (ບໍ່ລວມທີ່ເກັບເຂົ້າຄັງ) — null = ບໍ່ແມ່ນວຽກຂອງຄົນນີ້ */
const myTask = async (employeeId, taskId) => {
    const assigned = await taskParts_1.TaskAssignee.count({ where: { task_id: taskId, employee_id: employeeId } });
    if (!assigned)
        return null;
    return task_1.default.findOne({ where: { _uuid: taskId, archived: 0 } });
};
/** GET /task/me — ວຽກທີ່ໄດ້ຮັບມອບໝາຍ (ຍັງບໍ່ສຳເລັດກ່ອນ: ເກີນກຳນົດ → ກຳນົດສົ່ງໃກ້ສຸດ) + ລາຍການຍ່ອຍ + ຈຳນວນທີ່ຍັງຄ້າງ */
const getMyTasks = async (req, res) => {
    try {
        const self = await (0, attendanceController_1.selfEmployee)(req);
        if ("code" in self) {
            res.status(self.code).json({ message: self.message });
            return;
        }
        const mine = await taskParts_1.TaskAssignee.findAll({ where: { employee_id: self.employee._uuid }, attributes: ["task_id"], raw: true });
        const ids = mine.map((a) => Number(a.task_id));
        const rows = ids.length
            ? await task_1.default.findAll({
                where: { _uuid: { [sequelize_1.Op.in]: ids }, archived: 0 },
                include: [projectInclude, assigneeInclude, { model: taskParts_1.TaskItem, as: "items" }, fileInclude, commentCountInclude],
                order: itemOrder,
            })
            : [];
        const today = (0, workCalendar_1.todayLao)();
        const data = rows.map((r) => present(r, today, false, true));
        const rank = (d) => (Number(d.status) === exports.TASK_DONE ? 2 : d.overdue ? 0 : 1);
        data.sort((a, b) => rank(a) - rank(b) || String(a.due_date ?? "9999").localeCompare(String(b.due_date ?? "9999")) || b._uuid - a._uuid);
        res.status(200).json({ data, open: data.filter((d) => Number(d.status) !== exports.TASK_DONE).length, today });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting my tasks");
    }
};
exports.getMyTasks = getMyTasks;
/** PUT /task/me/item/:id { done } — ພະນັກງານໝາຍລາຍການຍ່ອຍຂອງວຽກຕົນເອງ */
const updateMyTaskItem = async (req, res) => {
    try {
        const self = await (0, attendanceController_1.selfEmployee)(req);
        if ("code" in self) {
            res.status(self.code).json({ message: self.message });
            return;
        }
        const item = await taskParts_1.TaskItem.findByPk(Number((0, bansiHelpers_1.decodeId)(req)));
        const row = item ? await myTask(self.employee._uuid, item.task_id) : null;
        if (!item || !row) {
            res.status(404).json({ message: "ບໍ່ພົບລາຍການຍ່ອຍ" });
            return;
        }
        await setItemDone(item, req.body?.done === true || Number(req.body?.done) === 1, self.employee._uuid, { employee_id: self.employee._uuid });
        const saved = await findFull(row._uuid);
        res.status(200).json({ message: "Successfully updated task item", data: saved && present(saved, (0, workCalendar_1.todayLao)(), false, true) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error updating my task item");
    }
};
exports.updateMyTaskItem = updateMyTaskItem;
/** GET /task/me/file/:id — ລິ້ງເປີດເອກະສານຂອງວຽກຕົນເອງ (path ຕໍ່ຈາກ /api) */
const getMyTaskFileLink = async (req, res) => {
    try {
        const self = await (0, attendanceController_1.selfEmployee)(req);
        if ("code" in self) {
            res.status(self.code).json({ message: self.message });
            return;
        }
        const file = await taskParts_1.TaskFile.findByPk(Number((0, bansiHelpers_1.decodeId)(req)), { attributes: ["_uuid", "task_id"] });
        if (!file || !(await myTask(self.employee._uuid, file.task_id))) {
            res.status(404).json({ message: "ບໍ່ພົບເອກະສານ" });
            return;
        }
        const token = jsonwebtoken_1.default.sign({ file: file._uuid }, fileLinkSecret(), { algorithm: "HS256", expiresIn: FILE_LINK_TTL });
        res.status(200).json({ url: `/task/file/open/${token}` });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error creating task file link");
    }
};
exports.getMyTaskFileLink = getMyTaskFileLink;
/** GET /task/me/comment/:id — :id = ວຽກຂອງຕົນເອງ */
const getMyTaskComments = async (req, res) => {
    try {
        const self = await (0, attendanceController_1.selfEmployee)(req);
        if ("code" in self) {
            res.status(self.code).json({ message: self.message });
            return;
        }
        const task = await myTask(self.employee._uuid, Number((0, bansiHelpers_1.decodeId)(req)));
        if (!task) {
            res.status(404).json({ message: "ບໍ່ພົບວຽກ" });
            return;
        }
        res.status(200).json({ data: await commentsOf(task._uuid, { employeeId: self.employee._uuid }) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting my task comments");
    }
};
exports.getMyTaskComments = getMyTaskComments;
/** POST /task/me/comment/:id { body } — :id = ວຽກຂອງຕົນເອງ; ແຈ້ງຜູ້ຮັບຜິດຊອບຄົນອື່ນ; ຄືນຄອມເມັນທັງໝົດ */
const createMyTaskComment = async (req, res) => {
    try {
        const self = await (0, attendanceController_1.selfEmployee)(req);
        if ("code" in self) {
            res.status(self.code).json({ message: self.message });
            return;
        }
        const task = await myTask(self.employee._uuid, Number((0, bansiHelpers_1.decodeId)(req)));
        if (!task) {
            res.status(404).json({ message: "ບໍ່ພົບວຽກ" });
            return;
        }
        const body = commentBody(req.body?.body);
        if (!body) {
            res.status(400).json({ message: "ກະລຸນາພິມຄອມເມັນ" });
            return;
        }
        await taskParts_1.TaskComment.create({ task_id: task._uuid, body, employee_id: self.employee._uuid });
        const name = [self.employee.first_name, self.employee.last_name].filter(Boolean).join(" ");
        await notifyComment(task, body, name, self.employee._uuid, null);
        res.status(200).json({ message: "Successfully added comment", data: await commentsOf(task._uuid, { employeeId: self.employee._uuid }) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error adding my task comment");
    }
};
exports.createMyTaskComment = createMyTaskComment;
/** DELETE /task/me/comment/:id — :id = ຄອມເມັນ; ສະເພາະຂອງຕົນເອງ */
const deleteMyTaskComment = async (req, res) => {
    try {
        const self = await (0, attendanceController_1.selfEmployee)(req);
        if ("code" in self) {
            res.status(self.code).json({ message: self.message });
            return;
        }
        const comment = await taskParts_1.TaskComment.findByPk(Number((0, bansiHelpers_1.decodeId)(req)));
        if (!comment || comment.employee_id !== self.employee._uuid) {
            res.status(404).json({ message: "ບໍ່ພົບຄອມເມັນ" });
            return;
        }
        await comment.destroy();
        res.status(200).json({ message: "Successfully deleted comment", data: await commentsOf(comment.task_id, { employeeId: self.employee._uuid }) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error deleting my task comment");
    }
};
exports.deleteMyTaskComment = deleteMyTaskComment;
