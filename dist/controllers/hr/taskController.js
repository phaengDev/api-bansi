"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteMyAssignedTask = exports.updateMyAssignedTaskStatus = exports.createMyAssignedTask = exports.getMyAssignedTasks = exports.deleteMyTaskComment = exports.createMyTaskComment = exports.getMyTaskComments = exports.getMyTaskFileLink = exports.updateMyTaskItem = exports.updateMyTaskProgress = exports.getMyTasks = exports.deleteTaskComment = exports.createTaskComment = exports.openTaskFile = exports.deleteTaskFile = exports.downloadTaskFile = exports.uploadTaskFiles = exports.updateTaskItem = exports.bulkTasks = exports.toggleTaskStar = exports.updateTaskStatus = exports.updateTask = exports.createTask = exports.getTask = exports.getTasks = exports.deleteTaskProject = exports.updateTaskProject = exports.createTaskProject = exports.getTaskProjects = exports.TASK_DONE = exports.TASK_DOING = exports.TASK_PENDING = void 0;
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
const orgController_1 = require("./orgController");
const workCalendar_1 = require("./workCalendar");
/**
 * ມອບໝາຍວຽກ:
 * - HR / ຫົວໜ້າ (ເວັບ): POST /task/fetch, GET /task/:id, POST /task/create, PUT /task/:id, PUT /task/status/:id,
 *   POST /task/bulk { ids, action: status | archive | unarchive | delete }, PUT /task/star/:id, PUT /task/item/:id,
 *   ໂປຣເຈັກ /task/project/*, ເອກະສານຄັດຕິດ POST / DELETE /task/file/:id, GET /task/file/download/:id, ຄອມເມັນ POST / DELETE /task/comment/:id
 * - ພະນັກງານ (app): GET /task/me, PUT /task/me/item/:id, PUT /task/me/progress/:id, GET /task/me/file/:id,
 *   GET / POST / DELETE /task/me/comment/:id — ສະເພາະວຽກທີ່ຕົນເອງຮັບຜິດຊອບ ຫຼື ມອບໝາຍເອງ. ແຕ່ລະຄົນອັບເດດຄວາມຄືບໜ້າ
 *   ສ່ວນຂອງຕົນ (ສະຖານະ + %) ແລະ ລາຍງານທາງຄອມເມັນ; ສະຖານະຂອງວຽກ (ລວມ "ສຳເລັດ") ຜູ້ມອບໝາຍເປັນຜູ້ອັບເດດ
 * - ຫົວໜ້າ (app) ມອບໝາຍໃຫ້ລູກທີມຕາມໂຄງຮ່າງ (ລູກທີມໂດຍກົງ + ລູກທີມຂອງລູກທີມ): GET /task/me/assigned (ວຽກທີ່ມອບໝາຍ + ລູກທີມ),
 *   POST /task/me/assigned, PUT /task/me/assigned/:id/status, DELETE /task/me/assigned/:id (ເກັບເຂົ້າຄັງ)
 * ມອບໝາຍ (ສ້າງ / ເພີ່ມຄົນ) = ແຈ້ງເຕືອນເດັ້ງຂຶ້ນຈໍມືຖືຂອງຜູ້ຮັບຜິດຊອບທັນທີ. ທຸກການປ່ຽນແປງລົງໄທມ໌ໄລນ໌ (tbl_task_log) — ເວັບເບິ່ງໃນ GET /task/:id
 */
exports.TASK_PENDING = 1;
exports.TASK_DOING = 2;
exports.TASK_DONE = 3;
/** ຄວາມຄືບໜ້າສ່ວນຂອງແຕ່ລະຄົນ (tbl_task_assignee.status) */
const PERSON_TODO = 1;
const PERSON_DOING = 2;
const PERSON_DONE = 3;
const STATUSES = [exports.TASK_PENDING, exports.TASK_DOING, exports.TASK_DONE];
const PRIORITIES = [1, 2, 3];
const MAX_ASSIGNEES = 50;
const MAX_ITEMS = 50;
const MAX_FILES = 20;
const FILE_LINK_TTL = "10m";
const MAX_COMMENT = 2000;
const COLOR = /^#[0-9a-f]{6}$/i;
const STATUS_TEXT = { 1: "ລໍຖ້າດຳເນີນການ", 2: "ກຳລັງດຳເນີນການ", 3: "ສຳເລັດແລ້ວ" };
const employeeInclude = {
    model: employee_1.default,
    as: "employee",
    attributes: ["_uuid", "emp_code", "first_name", "last_name", "profile", "work_status"],
};
const projectInclude = { model: taskParts_1.TaskProject, as: "project", attributes: ["_uuid", "name", "color", "status"] };
const assigneeInclude = { model: taskParts_1.TaskAssignee, as: "assignees", attributes: ["employee_id", "is_lead", "status", "progress", "active_at"], include: [employeeInclude] };
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
            status: Number(a.status ?? 1),
            progress: Number(a.progress ?? 0),
            active_at: a.active_at ?? null,
        }))
            .sort((a, b) => Number(b.is_lead) - Number(a.is_lead)),
        items_total: items.length,
        items_done: items.filter((i) => Number(i.done) === 1).length,
        ...(withItems ? { items: items.map((i) => ({ _uuid: i._uuid, title: i.title, done: Number(i.done) === 1, done_at: i.done_at, done_by: i.done_by })), files } : {}),
        files_total: files.length,
        comments_total: comments.length,
        starred,
        overdue: isOverdue(r, today),
        ...quadrantOf(r),
    };
};
/**
 * ສຳຄັນ / ດ່ວນ (ຕາຕະລາງບໍລິຫານເວລາ) — app ຕັ້ງໄວ້ = ຕາມນັ້ນ; ບໍ່ໄດ້ຕັ້ງ = ເອົາຕາມ priority ຂອງເວັບ:
 * ດ່ວນ (3) = ສຳຄັນ + ດ່ວນ, ສຳຄັນ (2) = ສຳຄັນ + ບໍ່ດ່ວນ, ປົກກະຕິ (1) = null (ຍັງບໍ່ໄດ້ຈັດ)
 */
const quadrantOf = (r) => {
    if (r.important !== null && r.important !== undefined) {
        return { important: Number(r.important) === 1, urgent: Number(r.urgent) === 1 };
    }
    const priority = Number(r.priority);
    return priority >= 2 ? { important: true, urgent: priority === 3 } : { important: null, urgent: null };
};
/** priority ຈາກ ສຳຄັນ / ດ່ວນ: ດ່ວນ = 3, ສຳຄັນ = 2, ນອກນັ້ນ = 1 */
const priorityOf = (important, urgent) => (urgent ? 3 : important ? 2 : 1);
/** ປ້າຍໃນຫົວຂໍ້ແຈ້ງເຕືອນ: "ສຳຄັນ · ເລັ່ງດ່ວນ" / "ສຳຄັນ" / "ເລັ່ງດ່ວນ"; ບໍ່ສຳຄັນ + ບໍ່ດ່ວນ ຫຼື ຍັງບໍ່ໄດ້ຈັດ = ບໍ່ມີ */
const quadrantText = (r) => {
    const { important, urgent } = quadrantOf(r);
    return [important && "ສຳຄັນ", urgent && "ເລັ່ງດ່ວນ"].filter(Boolean).join(" · ");
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
/** ແຈ້ງຜູ້ຮັບຜິດຊອບວ່າໄດ້ຮັບມອບໝາຍວຽກ — ເດັ້ງຂຶ້ນຈໍມືຖື; from = ຊື່ຫົວໜ້າທີ່ມອບໝາຍຈາກ app */
const notifyAssigned = async (task, employeeIds, actor, from) => {
    if (!employeeIds.length)
        return;
    const priority = quadrantText(task);
    await (0, notificationController_1.notify)(employeeIds.map((employee_id) => ({
        employee_id,
        type: "task",
        title: `${priority ? `[${priority}] ` : ""}ທ່ານໄດ້ຮັບມອບໝາຍວຽກ 📋`,
        body: [task.title, from ? `ມອບໝາຍໂດຍ ${from}` : null, task.due_date ? `ກຳນົດສົ່ງ ${dayText(task.due_date)}` : null].filter(Boolean).join("\n"),
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
    // ສຳຄັນ / ດ່ວນ (ເວັບ ແລະ app): ສົ່ງທັງສອງເປັນ null = ລ້າງ (ຍັງບໍ່ໄດ້ຈັດ); ບໍ່ສົ່ງເລີຍ = ໃຊ້ priority
    const flag = (v) => v === true || Number(v) === 1;
    const given = (v) => v !== undefined && v !== null;
    const sent = "important" in body || "urgent" in body;
    const flags = !sent ? null
        : given(body.important) || given(body.urgent) ? { important: flag(body.important) ? 1 : 0, urgent: flag(body.urgent) ? 1 : 0 }
            : { important: null, urgent: null };
    const priority = flags ? priorityOf(flags.important === 1, flags.urgent === 1) : Number(body.priority ?? 1);
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
        flags,
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
/** ຊ່ອງທີ່ຕ່າງຈາກເດີມ — ຊື່ກົງກັບທີ່ໜ້າເວັບໃຊ້ສະແດງໃນໄທມ໌ໄລນ໌; ສຳຄັນ / ດ່ວນ ປ່ຽນ = "priority" ຄືກັນ */
const changedFields = (before, values, flags) => {
    const same = (a, b) => String(a ?? "") === String(b ?? "");
    const quadrant = (r) => JSON.stringify(quadrantOf(r));
    return [
        !same(before.title, values.title) && "title",
        !same(before.detail, values.detail) && "detail",
        !same(before.project_id, values.project_id) && "project",
        (!same(before.priority, values.priority) || quadrant(before) !== quadrant({ ...before, ...values, ...flags })) && "priority",
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
        const row = await task_1.default.create({ ...input.values, ...input.flags, status: exports.TASK_PENDING, createdbyid: actor, updatedbyid: actor }, { transaction: t });
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
        const statusChanged = status !== Number(row.status);
        const leadBefore = current.find((a) => Number(a.is_lead) === 1);
        const sameAssignees = current.length === input.assigneeIds.length
            && current.every((a) => input.assigneeIds.includes(Number(a.employee_id)))
            && Number(leadBefore?.employee_id) === input.leadId;
        // ຄຳຂໍແບບເກົ່າປ່ຽນ priority (ບໍ່ສົ່ງ ສຳຄັນ / ດ່ວນ) = ລ້າງຄ່າເດີມ ໃຫ້ເອົາຕາມ priority ໃໝ່
        const flags = input.flags ?? (input.values.priority !== Number(row.priority) ? { important: null, urgent: null } : {});
        const fields = changedFields(row.get({ plain: true }), input.values, flags);
        await row.update({ ...input.values, ...flags, ...statusFields(row, status), updatedbyid: actor, updatedAt: new Date() }, { transaction: t });
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
    // ຊື່ຂອງຄົນທີ່ຖືກແຈ້ງເຖິງ (to_ids) — ໂຫຼດເທື່ອດຽວທັງລາຍການ
    const toIds = [...new Set(rows.flatMap((row) => idsOf(row.to_ids)))];
    const people = toIds.length ? await employee_1.default.findAll({ where: { _uuid: { [sequelize_1.Op.in]: toIds } }, attributes: ["_uuid", "first_name", "last_name"], raw: true }) : [];
    const nameOf = new Map(people.map((e) => [Number(e._uuid), [e.first_name, e.last_name].filter(Boolean).join(" ")]));
    return rows.map((row) => {
        const c = row.get({ plain: true });
        return {
            _uuid: c._uuid,
            body: c.body,
            createdAt: c.createdAt,
            ...authorOf(c),
            mine: c.employee_id ? c.employee_id === viewer.employeeId : !!c.user_id && c.user_id === viewer.userId,
            to: idsOf(c.to_ids).filter((id) => nameOf.has(id)).map((id) => ({ employee_id: id, name: nameOf.get(id) })),
            // ຜູ້ມອບໝາຍແຈ້ງເຖິງຄົນທີ່ກຳລັງເບິ່ງ (app ໄຮໄລ້)
            to_me: !!viewer.employeeId && idsOf(c.to_ids).includes(viewer.employeeId),
        };
    });
};
const idsOf = (value) => String(value ?? "").split(",").map(Number).filter((n) => n > 0);
/** ຄົນທີ່ເລືອກແຈ້ງເຖິງ — ເອົາສະເພາະຜູ້ຮັບຜິດຊອບຂອງວຽກນີ້; ຫວ່າງ = ແຈ້ງທຸກຄົນ */
const recipientsOf = async (taskId, raw) => {
    const asked = [...new Set((Array.isArray(raw) ? raw : []).map(Number).filter((n) => n > 0))];
    if (!asked.length)
        return [];
    const rows = await taskParts_1.TaskAssignee.findAll({ where: { task_id: taskId, employee_id: { [sequelize_1.Op.in]: asked } }, attributes: ["employee_id"], raw: true });
    return rows.map((a) => Number(a.employee_id));
};
/**
 * ແຈ້ງວ່າມີຄອມເມັນໃໝ່ (ຍົກເວັ້ນຄົນຂຽນ) — to ຫວ່າງ = ຜູ້ຮັບຜິດຊອບທຸກຄົນ + ຫົວໜ້າທີ່ມອບໝາຍຈາກ app;
 * to ມີ = ສະເພາະຄົນທີ່ຜູ້ມອບໝາຍເລືອກ (ເຊັ່ນ ເລັ່ງວຽກບາງຄົນ). ສົ່ງບໍ່ໄດ້ ບໍ່ໃຫ້ຄອມເມັນລົ້ມ
 */
const notifyComment = async (task, body, authorName, authorEmployeeId, actor, to = []) => {
    try {
        const assignees = to.length ? [] : await taskParts_1.TaskAssignee.findAll({ where: { task_id: task._uuid }, attributes: ["employee_id"], raw: true });
        const people = to.length ? to : [...assignees.map((a) => Number(a.employee_id)), Number(task.assigned_by_employee_id) || 0];
        const ids = [...new Set(people)].filter((id) => id > 0 && id !== authorEmployeeId);
        if (!ids.length)
            return;
        await (0, notificationController_1.notify)(ids.map((employee_id) => ({
            employee_id,
            type: "task",
            title: to.length ? `📣 ${authorName} ແຈ້ງເຖິງເຈົ້າ` : `💬 ${authorName} ຄອມເມັນວຽກ`,
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
/** POST /task/comment/:id { body, to?: [employee_id] } — :id = ວຽກ; ຜູ້ໃຊ້ເວັບຂຽນຄອມເມັນ; to = ແຈ້ງສະເພາະຄົນເຫຼົ່ານີ້ (ຫວ່າງ = ທຸກຄົນ); ຄືນຄອມເມັນທັງໝົດ */
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
        const to = await recipientsOf(task._uuid, req.body?.to);
        await taskParts_1.TaskComment.create({ task_id: task._uuid, body, user_id: user.user_uuid, to_ids: to.length ? to.join(",") : null });
        await notifyComment(task, body, user.user_name, user.employee_id ?? null, user.user_uuid, to);
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
    const task = await task_1.default.findOne({ where: { _uuid: taskId, archived: 0 } });
    if (!task)
        return null;
    // ຫົວໜ້າທີ່ມອບໝາຍເອງ ເບິ່ງ / ຄອມເມັນ / ເປີດເອກະສານໄດ້ຄືກັບຜູ້ຮັບຜິດຊອບ
    if (Number(task.assigned_by_employee_id) === employeeId)
        return task;
    const assigned = await taskParts_1.TaskAssignee.count({ where: { task_id: taskId, employee_id: employeeId } });
    return assigned ? task : null;
};
/** ບັນທຶກວ່າຄົນນີ້ຫາກໍ່ເຮັດບາງຢ່າງໃນວຽກ (ສະແດງ "ອັບເດດລ່າສຸດ" ໃນເວັບ) — ບໍ່ແມ່ນຜູ້ຮັບຜິດຊອບ (ເຊັ່ນ ຫົວໜ້າທີ່ມອບໝາຍ) = ບໍ່ມີຫຍັງປ່ຽນ */
const touchActive = (taskId, employeeId) => taskParts_1.TaskAssignee.update({ active_at: new Date() }, { where: { task_id: taskId, employee_id: employeeId } }).catch((error) => console.error("touchActive", error));
/** ຊື່ຜູ້ມອບໝາຍຂອງແຕ່ລະວຽກ: ຫົວໜ້າໃນ app (ພະນັກງານ) ຫຼື ຜູ້ໃຊ້ເວັບທີ່ສ້າງ — ໂຫຼດເທື່ອດຽວທັງລາຍການ */
const withAssigners = async (rows) => {
    const employeeIds = [...new Set(rows.map((r) => Number(r.assigned_by_employee_id)).filter((id) => id > 0))];
    const userIds = [...new Set(rows.filter((r) => !r.assigned_by_employee_id).map((r) => Number(r.createdbyid)).filter((id) => id > 0))];
    const [employees, users] = await Promise.all([
        employeeIds.length ? employee_1.default.findAll({ where: { _uuid: { [sequelize_1.Op.in]: employeeIds } }, attributes: ["_uuid", "first_name", "last_name", "profile"], raw: true }) : [],
        userIds.length
            ? userModel_1.default.findAll({ where: { user_uuid: { [sequelize_1.Op.in]: userIds } }, attributes: ["user_uuid", "user_name"], include: [{ model: employee_1.default, as: "employee", attributes: ["first_name", "last_name", "profile"] }] })
            : [],
    ]);
    const byEmployee = new Map(employees.map((e) => [Number(e._uuid), e]));
    const byUser = new Map(users.map((u) => [Number(u.user_uuid), u.get({ plain: true })]));
    const nameOf = (e) => [e?.first_name, e?.last_name].filter(Boolean).join(" ");
    return rows.map((r) => {
        const e = byEmployee.get(Number(r.assigned_by_employee_id));
        const u = e ? null : byUser.get(Number(r.createdbyid));
        const name = e ? nameOf(e) : u ? nameOf(u.employee) || u.user_name : null;
        return { ...r, assigned_by: name ? { employee_id: e ? Number(e._uuid) : null, name, profile_url: (0, hrHelpers_1.profileUrl)(e?.profile ?? u?.employee?.profile) } : null };
    });
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
        const nudges = await nudgesFor(self.employee._uuid, ids);
        const data = (await withAssigners(rows.map((r) => present(r, today, false, true)))).map((d) => {
            const n = nudges.get(Number(d._uuid));
            const mine = d.assignees.find((a) => a.employee_id === self.employee._uuid);
            // open = ຖືກແຈ້ງ / ເລັ່ງ ແລ້ວຍັງບໍ່ໄດ້ເຮັດຫຍັງໃນວຽກຫຼັງຈາກນັ້ນ (ອັບເດດ, ໝາຍລາຍການຍ່ອຍ, ຄອມເມັນ)
            // ເວລາເກັບເປັນວິນາທີ — ວິນາທີດຽວກັນ = ຍັງບໍ່ຕອບ
            return n ? { ...d, nudge: { ...n, open: !mine?.active_at || new Date(mine.active_at) <= new Date(n.createdAt) } } : d;
        });
        const rank = (d) => (Number(d.status) === exports.TASK_DONE ? 2 : d.overdue ? 0 : 1);
        data.sort((a, b) => rank(a) - rank(b) || String(a.due_date ?? "9999").localeCompare(String(b.due_date ?? "9999")) || b._uuid - a._uuid);
        res.status(200).json({ data, open: data.filter((d) => Number(d.status) !== exports.TASK_DONE).length, today });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting my tasks");
    }
};
exports.getMyTasks = getMyTasks;
/**
 * PUT /task/me/progress/:id { status, progress, note } — :id = ວຽກ; ພະນັກງານອັບເດດຄວາມຄືບໜ້າສ່ວນຂອງຕົນ:
 * status 1 ຍັງບໍ່ເລີ່ມ (0 %), 2 ກຳລັງເຮັດ (0–99 %), 3 ສຳເລັດ (100 %). ບໍ່ປ່ຽນສະຖານະຂອງວຽກ — ຜູ້ມອບໝາຍເປັນຜູ້ປິດວຽກ.
 * note = ລາຍງານສັ້ນໆ → ລົງເປັນຄອມເມັນ (ແຈ້ງຄືຄອມເມັນ). ສຳເລັດສ່ວນຂອງຕົນ → ແຈ້ງຫົວໜ້າທີ່ມອບໝາຍຈາກ app ແລະ ຫົວໜ້າວຽກ
 */
const updateMyTaskProgress = async (req, res) => {
    try {
        const self = await (0, attendanceController_1.selfEmployee)(req);
        if ("code" in self) {
            res.status(self.code).json({ message: self.message });
            return;
        }
        const me = self.employee._uuid;
        const task = await myTask(me, Number((0, bansiHelpers_1.decodeId)(req)));
        const mine = task ? await taskParts_1.TaskAssignee.findOne({ where: { task_id: task._uuid, employee_id: me } }) : null;
        if (!task || !mine) {
            res.status(404).json({ message: "ບໍ່ພົບວຽກທີ່ທ່ານຮັບຜິດຊອບ" });
            return;
        }
        if (Number(task.status) === exports.TASK_DONE) {
            res.status(400).json({ message: "ວຽກນີ້ປິດແລ້ວ (ສຳເລັດ) — ອັບເດດຄວາມຄືບໜ້າບໍ່ໄດ້" });
            return;
        }
        const status = Number(req.body?.status);
        if (![PERSON_TODO, PERSON_DOING, PERSON_DONE].includes(status)) {
            res.status(400).json({ message: "ສະຖານະບໍ່ຖືກຕ້ອງ" });
            return;
        }
        const asked = Math.round(Number(req.body?.progress) || 0);
        const progress = status === PERSON_TODO ? 0 : status === PERSON_DONE ? 100 : Math.min(99, Math.max(0, asked));
        const note = commentBody(req.body?.note);
        const changed = status !== Number(mine.status) || progress !== Number(mine.progress);
        if (!changed && !note) {
            res.status(400).json({ message: "ບໍ່ມີຫຍັງປ່ຽນ" });
            return;
        }
        const wasDone = Number(mine.status) === PERSON_DONE;
        await mine.update({ status, progress, active_at: new Date(), updatedAt: new Date() });
        if (changed)
            await logTask(task._uuid, "progress", { employee_id: me }, { status, note: String(progress) });
        const name = [self.employee.first_name, self.employee.last_name].filter(Boolean).join(" ");
        if (note) {
            await taskParts_1.TaskComment.create({ task_id: task._uuid, body: note, employee_id: me });
            await notifyComment(task, note, name, me, null);
        }
        if (status === PERSON_DONE && !wasDone)
            await notifyPartDone(task, name, me);
        const saved = await findFull(task._uuid);
        res.status(200).json({ message: "ບັນທຶກຄວາມຄືບໜ້າແລ້ວ", data: saved && present(saved, (0, workCalendar_1.todayLao)(), false, true) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error updating my task progress");
    }
};
exports.updateMyTaskProgress = updateMyTaskProgress;
/** ຄົນໜຶ່ງເຮັດສ່ວນຂອງຕົນສຳເລັດ → ແຈ້ງຫົວໜ້າທີ່ມອບໝາຍຈາກ app + ຫົວໜ້າວຽກ (ຍົກເວັ້ນຕົນເອງ); ສົ່ງບໍ່ໄດ້ ບໍ່ໃຫ້ການບັນທຶກລົ້ມ */
const notifyPartDone = async (task, name, me) => {
    try {
        const people = await taskParts_1.TaskAssignee.findAll({ where: { task_id: task._uuid }, attributes: ["employee_id", "is_lead", "status"], raw: true });
        const done = people.filter((p) => Number(p.status) === PERSON_DONE).length;
        const lead = people.find((p) => Number(p.is_lead) === 1);
        const ids = [...new Set([Number(task.assigned_by_employee_id) || 0, Number(lead?.employee_id) || 0])].filter((id) => id > 0 && id !== me);
        if (!ids.length)
            return;
        await (0, notificationController_1.notify)(ids.map((employee_id) => ({
            employee_id,
            type: "task",
            title: done === people.length ? `✅ ທຸກຄົນເຮັດສ່ວນຂອງຕົນສຳເລັດແລ້ວ` : `✅ ${name} ເຮັດສ່ວນຂອງຕົນສຳເລັດ`,
            body: `${task.title}
ສຳເລັດ ${done}/${people.length} ຄົນ`,
            ref: `task:${task._uuid}`,
            createdbyid: null,
            push: true,
        })));
    }
    catch (error) {
        console.error("notifyPartDone", error);
    }
};
/** ຂໍ້ຄວາມລ່າສຸດທີ່ຜູ້ມອບໝາຍແຈ້ງເຖິງຄົນນີ້ (ຄອມເມັນທີ່ເລືອກ to) ຂອງແຕ່ລະວຽກ — app ສະແດງ "ຖືກເລັ່ງ" */
const nudgesFor = async (employeeId, taskIds) => {
    const latest = new Map();
    if (!taskIds.length)
        return latest;
    const rows = await taskParts_1.TaskComment.findAll({
        where: { task_id: { [sequelize_1.Op.in]: taskIds }, to_ids: { [sequelize_1.Op.ne]: null } },
        include: authorInclude,
        order: [["_uuid", "DESC"]],
    });
    for (const row of rows) {
        const c = row.get({ plain: true });
        if (latest.has(Number(c.task_id)) || !idsOf(c.to_ids).includes(employeeId))
            continue;
        latest.set(Number(c.task_id), { body: c.body, author_name: authorOf(c).author_name, createdAt: c.createdAt });
    }
    return latest;
};
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
        await touchActive(row._uuid, self.employee._uuid);
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
/**
 * POST /task/me/comment/:id { body, to? } — :id = ວຽກຂອງຕົນເອງ; ແຈ້ງຜູ້ຮັບຜິດຊອບຄົນອື່ນ; ຄືນຄອມເມັນທັງໝົດ.
 * to (ແຈ້ງສະເພາະບາງຄົນ) ໃຊ້ໄດ້ສະເພາະຫົວໜ້າທີ່ມອບໝາຍວຽກນີ້ — ຄົນອື່ນສົ່ງມາ = ບໍ່ສົນໃຈ (ແຈ້ງທຸກຄົນ)
 */
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
        const to = Number(task.assigned_by_employee_id) === self.employee._uuid ? await recipientsOf(task._uuid, req.body?.to) : [];
        await taskParts_1.TaskComment.create({ task_id: task._uuid, body, employee_id: self.employee._uuid, to_ids: to.length ? to.join(",") : null });
        await touchActive(task._uuid, self.employee._uuid);
        const name = [self.employee.first_name, self.employee.last_name].filter(Boolean).join(" ");
        await notifyComment(task, body, name, self.employee._uuid, null, to);
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
// ================= ຫົວໜ້າມອບໝາຍວຽກໃຫ້ລູກທີມ (app)
/**
 * ລູກທີມທັງໝົດຂອງພະນັກງານຕາມໂຄງຮ່າງ (ຫົວໜ້າສາຍງານ) — ລູກທີມໂດຍກົງ (depth 1) + ລູກທີມຂອງລູກທີມ…,
 * ສະເພາະຄົນທີ່ເຮັດວຽກຢູ່; ລຽງ ໃກ້ກ່ອນ → ຕຳແໜ່ງສູງກ່ອນ → ຊື່
 */
const teamOf = async (employeeId) => {
    const org = await (0, orgController_1.buildOrg)();
    const kids = new Map();
    for (const p of org.people) {
        if (p.reports_to_id)
            kids.set(p.reports_to_id, [...(kids.get(p.reports_to_id) ?? []), p._uuid]);
    }
    const depth = new Map();
    const queue = [[employeeId, 0]];
    while (queue.length) {
        const [id, d] = queue.shift();
        for (const kid of kids.get(id) ?? []) {
            if (kid === employeeId || depth.has(kid))
                continue;
            depth.set(kid, d + 1);
            queue.push([kid, d + 1]);
        }
    }
    const positions = new Map(org.positions.map((p) => [p._uuid, p]));
    const departments = new Map(org.departments.map((d) => [d._uuid, d]));
    return org.people
        .filter((p) => depth.has(p._uuid))
        .map((p) => ({
        _uuid: p._uuid,
        emp_code: p.emp_code,
        first_name: p.first_name,
        last_name: p.last_name,
        profile_url: p.profile_url,
        position: (p.position_id && positions.get(p.position_id)?.position_name) || null,
        department: departments.get(p.department_id)?.depart_name ?? null,
        level: (p.position_id && positions.get(p.position_id)?.level) || null,
        depth: depth.get(p._uuid),
    }))
        .sort((a, b) => a.depth - b.depth || (a.level ?? 99) - (b.level ?? 99) || a.first_name.localeCompare(b.first_name));
};
/** ວຽກທີ່ຫົວໜ້າຄົນນີ້ມອບໝາຍຈາກ app (ຍັງບໍ່ເກັບເຂົ້າຄັງ) */
const assignedTask = (employeeId, taskId) => task_1.default.findOne({ where: { _uuid: taskId, archived: 0, assigned_by_employee_id: employeeId } });
const fullName = (e) => [e.first_name, e.last_name].filter(Boolean).join(" ");
/** ວຽກ 1 ລາຍການ (ພ້ອມລາຍການຍ່ອຍ + ຊື່ຜູ້ມອບໝາຍ) ສົ່ງກັບໃຫ້ app */
const presentForApp = async (id) => {
    const row = await findFull(id);
    return row ? (await withAssigners([present(row, (0, workCalendar_1.todayLao)(), false, true)]))[0] : null;
};
/** GET /task/me/assigned — ວຽກທີ່ຂ້ອຍມອບໝາຍໃຫ້ລູກທີມ (ຍັງບໍ່ສຳເລັດກ່ອນ) + ລູກທີມທີ່ມອບໝາຍໄດ້ (team ຫວ່າງ = ບໍ່ມີລູກທີມ) */
const getMyAssignedTasks = async (req, res) => {
    try {
        const self = await (0, attendanceController_1.selfEmployee)(req);
        if ("code" in self) {
            res.status(self.code).json({ message: self.message });
            return;
        }
        const me = self.employee._uuid;
        const [team, rows] = await Promise.all([
            teamOf(me),
            task_1.default.findAll({
                where: { assigned_by_employee_id: me, archived: 0 },
                include: [projectInclude, assigneeInclude, { model: taskParts_1.TaskItem, as: "items" }, fileInclude, commentCountInclude],
                order: itemOrder,
            }),
        ]);
        const today = (0, workCalendar_1.todayLao)();
        const data = await withAssigners(rows.map((r) => present(r, today, false, true)));
        const rank = (d) => (Number(d.status) === exports.TASK_DONE ? 2 : d.overdue ? 0 : 1);
        data.sort((a, b) => rank(a) - rank(b) || String(a.due_date ?? "9999").localeCompare(String(b.due_date ?? "9999")) || b._uuid - a._uuid);
        res.status(200).json({ data, open: data.filter((d) => Number(d.status) !== exports.TASK_DONE).length, team, today });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting tasks I assigned");
    }
};
exports.getMyAssignedTasks = getMyAssignedTasks;
/**
 * POST /task/me/assigned { title, detail, important, urgent, start_date, due_date, assignee_ids, lead_id, items: [{ title }] } —
 * ມອບໝາຍໃຫ້ລູກທີມຂອງຕົນເອງເທົ່ານັ້ນ (ບໍ່ມີໂປຣເຈັກ); ແຈ້ງເຕືອນຜູ້ຮັບຜິດຊອບທັນທີ
 */
const createMyAssignedTask = async (req, res) => {
    const self = await (0, attendanceController_1.selfEmployee)(req);
    if ("code" in self) {
        res.status(self.code).json({ message: self.message });
        return;
    }
    const t = await task_1.default.sequelize.transaction();
    try {
        const me = self.employee._uuid;
        const input = await parseTask({ ...(req.body || {}), project_id: null });
        if ("error" in input) {
            await t.rollback();
            res.status(400).json({ message: input.error });
            return;
        }
        const team = new Set((await teamOf(me)).map((p) => p._uuid));
        if (input.assigneeIds.some((id) => !team.has(id))) {
            await t.rollback();
            res.status(403).json({ message: "ມອບໝາຍໄດ້ສະເພາະລູກທີມຂອງເຈົ້າ (ຕາມໂຄງຮ່າງ)" });
            return;
        }
        const row = await task_1.default.create({ ...input.values, ...input.flags, status: exports.TASK_PENDING, assigned_by_employee_id: me }, { transaction: t });
        const added = await syncAssignees(row._uuid, input.assigneeIds, input.leadId, t);
        await syncItems(row._uuid, input.items, t);
        await logTask(row._uuid, "create", { employee_id: me }, {}, t);
        await t.commit();
        await notifyAssigned(row, added, null, fullName(self.employee));
        res.status(200).json({ message: `ມອບໝາຍວຽກແລ້ວ — ແຈ້ງເຕືອນ ${added.length} ຄົນ`, data: await presentForApp(row._uuid) });
    }
    catch (error) {
        await t.rollback();
        (0, bansiHelpers_1.sendError)(res, error, "Error assigning task");
    }
};
exports.createMyAssignedTask = createMyAssignedTask;
/** PUT /task/me/assigned/:id/status { status } — ສະເພາະຫົວໜ້າທີ່ມອບໝາຍ; ແຈ້ງຜູ້ຮັບຜິດຊອບວ່າສະຖານະປ່ຽນ */
const updateMyAssignedTaskStatus = async (req, res) => {
    try {
        const self = await (0, attendanceController_1.selfEmployee)(req);
        if ("code" in self) {
            res.status(self.code).json({ message: self.message });
            return;
        }
        const me = self.employee._uuid;
        const row = await assignedTask(me, Number((0, bansiHelpers_1.decodeId)(req)));
        const status = Number(req.body?.status);
        if (!row) {
            res.status(404).json({ message: "ບໍ່ພົບວຽກທີ່ເຈົ້າມອບໝາຍ" });
            return;
        }
        if (!STATUSES.includes(status)) {
            res.status(400).json({ message: "ສະຖານະບໍ່ຖືກຕ້ອງ" });
            return;
        }
        if (status !== Number(row.status)) {
            await row.update({ ...statusFields(row, status), updatedAt: new Date() });
            await logTask(row._uuid, "update", { employee_id: me }, { fields: ["status"], status });
            const assignees = await taskParts_1.TaskAssignee.findAll({ where: { task_id: row._uuid }, attributes: ["employee_id"], raw: true });
            await (0, notificationController_1.notify)(assignees.map((a) => ({
                employee_id: Number(a.employee_id),
                type: "task",
                title: status === exports.TASK_DONE ? "✅ ວຽກສຳເລັດແລ້ວ" : `📋 ວຽກ: ${STATUS_TEXT[status]}`,
                body: `${row.title}\n${fullName(self.employee)} ປ່ຽນສະຖານະເປັນ "${STATUS_TEXT[status]}"`,
                ref: `task:${row._uuid}`,
                createdbyid: null,
                push: true,
            }))).catch((error) => console.error("notify task status", error));
        }
        res.status(200).json({ message: `ປ່ຽນສະຖານະເປັນ "${STATUS_TEXT[status]}" ແລ້ວ`, data: await presentForApp(row._uuid) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error updating assigned task status");
    }
};
exports.updateMyAssignedTaskStatus = updateMyAssignedTaskStatus;
/** DELETE /task/me/assigned/:id — ຫົວໜ້າລຶບວຽກທີ່ຕົນເອງມອບໝາຍ (ເກັບເຂົ້າຄັງ — HR ຍັງເບິ່ງໄດ້ໃນເວັບ) */
const deleteMyAssignedTask = async (req, res) => {
    try {
        const self = await (0, attendanceController_1.selfEmployee)(req);
        if ("code" in self) {
            res.status(self.code).json({ message: self.message });
            return;
        }
        const row = await assignedTask(self.employee._uuid, Number((0, bansiHelpers_1.decodeId)(req)));
        if (!row) {
            res.status(404).json({ message: "ບໍ່ພົບວຽກທີ່ເຈົ້າມອບໝາຍ" });
            return;
        }
        await row.update({ archived: 1, updatedAt: new Date() });
        await logTask(row._uuid, "archive", { employee_id: self.employee._uuid });
        res.status(200).json({ message: "ລຶບວຽກແລ້ວ" });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error deleting assigned task");
    }
};
exports.deleteMyAssignedTask = deleteMyAssignedTask;
