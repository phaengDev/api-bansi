"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleWorkPlanReminders = exports.deleteMyWorkPlan = exports.addMyWorkPlanProgress = exports.updateMyWorkPlan = exports.createMyWorkPlan = exports.getMyWorkPlan = exports.getMyWorkPlans = void 0;
const moment_1 = __importDefault(require("moment"));
const sequelize_1 = require("sequelize");
const workPlanModel_1 = __importDefault(require("../../models/workPlanModel"));
const employee_1 = __importDefault(require("../../models/employee"));
const notification_1 = __importDefault(require("../../models/notification"));
const utils_1 = require("../../utils");
const bansiHelpers_1 = require("../bansi/bansiHelpers");
const attendanceController_1 = require("./attendanceController");
const notificationController_1 = require("./notificationController");
const workCalendar_1 = require("./workCalendar");
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
const logOf = (raw) => {
    try {
        const value = JSON.parse(raw || "[]");
        return Array.isArray(value) ? value : [];
    }
    catch {
        return [];
    }
};
const withEntry = (raw, entry) => JSON.stringify([...logOf(raw), { ...entry, at: new Date().toISOString() }].slice(-MAX_LOG));
/** ລາຍການ (ໜ້າປະຕິທິນ) ສົ່ງສະເພາະການອັບເດດຫຼ້າສຸດ; ລາຍລະອຽດ (withLog) ສົ່ງປະຫວັດທັງໝົດ */
const planOf = (row, withLog = false) => {
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
const doneChange = (plan, done, note) => {
    if (done)
        return { done: 1, progress: 100, done_at: new Date(), progress_log: withEntry(plan.progress_log, { kind: "done", progress: 100, note }) };
    const last = [...logOf(plan.progress_log)].reverse().find((e) => e.kind === "update" && e.progress < 100);
    const progress = last?.progress ?? 0;
    return { done: 0, progress, done_at: null, progress_log: withEntry(plan.progress_log, { kind: "reopen", progress, note }) };
};
const daysBetween = (from, to) => (0, moment_1.default)(to, "YYYY-MM-DD").diff((0, moment_1.default)(from, "YYYY-MM-DD"), "days");
/** ເງື່ອນໄຂຂອງແຕ່ລະແຖບ (ແຜນຂອງຂ້ອຍທີ່ຍັງບໍ່ຖືກລຶບ) */
const scopesOf = (employeeId, today) => {
    const mine = { employee_id: employeeId, status: 1 };
    return {
        active: { ...mine, done: 0, start_date: { [sequelize_1.Op.lte]: today } },
        upcoming: { ...mine, done: 0, start_date: { [sequelize_1.Op.gt]: today } },
        history: { ...mine, done: 1 },
    };
};
/** active: ກາຍກຳນົດ / ໃກ້ກຳນົດກ່ອນ; upcoming: ເລີ່ມກ່ອນ; history: ປິດຫຼ້າສຸດກ່ອນ */
const ORDER = {
    active: [["end_date", "ASC"], ["createdAt", "ASC"]],
    upcoming: [["start_date", "ASC"], ["createdAt", "ASC"]],
    history: [["done_at", "DESC"], ["updatedAt", "DESC"]],
};
/** ແຜນຂອງຂ້ອຍທີ່ຍັງບໍ່ຖືກລຶບ — ບໍ່ແມ່ນຂອງຂ້ອຍ / ບໍ່ມີ = null (ຕອບ 404 ຄືກັນ ບໍ່ບອກວ່າມີຢູ່) */
const myPlan = (req, employeeId) => {
    const id = Number((0, bansiHelpers_1.decodeId)(req));
    return Number.isInteger(id) && id > 0
        ? workPlanModel_1.default.findOne({ where: { _uuid: id, employee_id: employeeId, status: 1 } })
        : Promise.resolve(null);
};
/** GET /employee/me/workplan?scope=active|upcoming|history&offset= ຫຼື scope=range&from=&to= (ບໍ່ສົ່ງ scope = active) */
const getMyWorkPlans = async (req, res) => {
    try {
        const self = await (0, attendanceController_1.selfEmployee)(req);
        if ("code" in self) {
            res.status(self.code).json({ message: self.message });
            return;
        }
        const today = (0, workCalendar_1.todayLao)();
        if (req.query.scope === "range") {
            const from = (0, bansiHelpers_1.toDateOnly)(req.query.from);
            const to = (0, bansiHelpers_1.toDateOnly)(req.query.to);
            if (!from || !to || to < from || daysBetween(from, to) >= MAX_RANGE_DAYS) {
                res.status(400).json({ message: "ຊ່ວງວັນທີບໍ່ຖືກຕ້ອງ (ບໍ່ເກີນ 1 ປີ)" });
                return;
            }
            const rows = await workPlanModel_1.default.findAll({
                where: { employee_id: self.employee._uuid, status: 1, start_date: { [sequelize_1.Op.lte]: to }, end_date: { [sequelize_1.Op.gte]: from } },
                order: [["start_date", "ASC"], ["createdAt", "ASC"]],
                limit: MAX_ROWS + 1,
            });
            res.status(200).json({ today, scope: "range", from, to, data: rows.slice(0, MAX_ROWS).map((r) => planOf(r)), has_more: rows.length > MAX_ROWS });
            return;
        }
        const scopes = scopesOf(self.employee._uuid, today);
        const scope = String(req.query.scope ?? "active");
        if (!(scope in scopes)) {
            res.status(400).json({ message: "scope ບໍ່ຖືກຕ້ອງ" });
            return;
        }
        const history = scope === "history";
        const limit = history ? HISTORY_PAGE : MAX_ROWS;
        const offset = history ? Math.max(0, Math.floor(Number(req.query.offset) || 0)) : 0;
        const [rows, active, upcoming, done, overdue] = await Promise.all([
            workPlanModel_1.default.findAll({ where: scopes[scope], order: ORDER[scope], limit: limit + 1, offset }),
            workPlanModel_1.default.count({ where: scopes.active }),
            workPlanModel_1.default.count({ where: scopes.upcoming }),
            workPlanModel_1.default.count({ where: scopes.history }),
            workPlanModel_1.default.count({ where: { ...scopes.active, end_date: { [sequelize_1.Op.lt]: today } } }),
        ]);
        res.status(200).json({
            today,
            scope,
            data: rows.slice(0, limit).map((r) => planOf(r)),
            has_more: rows.length > limit,
            counts: { active, upcoming, history: done, overdue },
        });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting work plans");
    }
};
exports.getMyWorkPlans = getMyWorkPlans;
/** GET /employee/me/workplan/:id — ລາຍລະອຽດ + ປະຫວັດການອັບເດດທັງໝົດ */
const getMyWorkPlan = async (req, res) => {
    try {
        const self = await (0, attendanceController_1.selfEmployee)(req);
        if ("code" in self) {
            res.status(self.code).json({ message: self.message });
            return;
        }
        const plan = await myPlan(req, self.employee._uuid);
        if (!plan) {
            res.status(404).json({ message: "ບໍ່ພົບແຜນວຽກນີ້" });
            return;
        }
        res.status(200).json({ today: (0, workCalendar_1.todayLao)(), data: planOf(plan, true) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting work plan");
    }
};
exports.getMyWorkPlan = getMyWorkPlan;
/** ກວດ ແລະ ແປງຂໍ້ມູນຈາກ body — has(key) = ສົ່ງມາບໍ່ (ແກ້ໄຂສົ່ງສະເພາະຟີວທີ່ປ່ຽນ) */
const readInput = (body, existing) => {
    const has = (key) => body[key] !== undefined;
    const input = {};
    if (has("title") || !existing) {
        const title = String(body.title ?? "").trim();
        if (!title)
            return { error: "ກະລຸນາປ້ອນສິ່ງທີ່ຈະເຮັດ" };
        if (title.length > MAX_TITLE)
            return { error: `ຫົວຂໍ້ຍາວໄດ້ບໍ່ເກີນ ${MAX_TITLE} ຕົວອັກສອນ` };
        input.title = title;
    }
    if (has("note")) {
        const note = String(body.note ?? "").trim();
        if (note.length > MAX_NOTE)
            return { error: `ລາຍລະອຽດຍາວໄດ້ບໍ່ເກີນ ${MAX_NOTE} ຕົວອັກສອນ` };
        input.note = note;
    }
    if (has("start_date") || !existing) {
        const start = (0, bansiHelpers_1.toDateOnly)(body.start_date);
        if (!start)
            return { error: "ວັນທີເລີ່ມບໍ່ຖືກຕ້ອງ" };
        input.start_date = start;
    }
    if (has("end_date") && body.end_date) {
        const end = (0, bansiHelpers_1.toDateOnly)(body.end_date);
        if (!end)
            return { error: "ວັນທີສິ້ນສຸດບໍ່ຖືກຕ້ອງ" };
        input.end_date = end;
    }
    if (has("done"))
        input.done = body.done === true || Number(body.done) === 1 ? 1 : 0;
    const start = input.start_date ?? existing?.start_date;
    // ສ້າງໃໝ່ບໍ່ໃສ່ວັນສິ້ນສຸດ = ມື້ດຽວ; ແກ້ວັນເລີ່ມໃຫ້ກາຍວັນສິ້ນສຸດເກົ່າ = ເລື່ອນວັນສິ້ນສຸດຕາມ
    let end = input.end_date ?? existing?.end_date ?? start;
    if (!input.end_date && end < start)
        end = start;
    if (end < start)
        return { error: "ວັນທີສິ້ນສຸດຕ້ອງບໍ່ກ່ອນວັນທີເລີ່ມ" };
    if (daysBetween(start, end) >= MAX_PLAN_DAYS)
        return { error: "ແຜນໜຶ່ງຍາວໄດ້ບໍ່ເກີນ 1 ປີ" };
    if (!existing || end !== existing.end_date)
        input.end_date = end;
    return { input };
};
/** POST /employee/me/workplan */
const createMyWorkPlan = async (req, res) => {
    try {
        const self = await (0, attendanceController_1.selfEmployee)(req);
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
        const row = await workPlanModel_1.default.create({
            ...result.input,
            _uuid: await (0, utils_1.maxid)(workPlanModel_1.default, "_uuid"),
            userid: 0,
            employee_id: self.employee._uuid,
            note: result.input.note ?? "",
            done: result.input.done ?? 0,
            status: 1,
            createdAt: now,
            updatedAt: now,
        });
        res.status(200).json({ message: "ບັນທຶກແຜນວຽກແລ້ວ", data: planOf(row) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error creating work plan");
    }
};
exports.createMyWorkPlan = createMyWorkPlan;
/** PUT /employee/me/workplan/:id */
const updateMyWorkPlan = async (req, res) => {
    try {
        const self = await (0, attendanceController_1.selfEmployee)(req);
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
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error updating work plan");
    }
};
exports.updateMyWorkPlan = updateMyWorkPlan;
/**
 * POST /employee/me/workplan/:id/progress { progress, note? } — ອັບເດດຄວາມຄືບໜ້າ (ອັບເດດໄດ້ເລື້ອຍໆ ຈົນກວ່າຈະສຳເລັດ).
 * progress 100 = ປິດແຜນ; ແຜນທີ່ປິດແລ້ວ ອັບເດດຕ່ຳກວ່າ 100 = ເປີດຄືນ. ບໍ່ປ່ຽນ % ຕ້ອງມີບັນທຶກ
 */
const addMyWorkPlanProgress = async (req, res) => {
    try {
        const self = await (0, attendanceController_1.selfEmployee)(req);
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
        }
        else {
            // ແຜນທີ່ປິດແລ້ວ ອັບເດດຕ່ຳກວ່າ 100 = ເປີດຄືນ
            await plan.update({
                progress,
                progress_log: withEntry(plan.progress_log, { kind: "update", progress, note }),
                ...(wasDone && progress < 100 ? { done: 0, done_at: null } : {}),
                updatedAt: new Date(),
            });
        }
        res.status(200).json({ message, data: planOf(plan, true) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error updating work plan progress");
    }
};
exports.addMyWorkPlanProgress = addMyWorkPlanProgress;
/** DELETE /employee/me/workplan/:id */
const deleteMyWorkPlan = async (req, res) => {
    try {
        const self = await (0, attendanceController_1.selfEmployee)(req);
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
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error deleting work plan");
    }
};
exports.deleteMyWorkPlan = deleteMyWorkPlan;
/** ເວລາເຕືອນແຜນວຽກປະຈຳວັນ (ເວລາລາວ) — ກ່ອນເລີ່ມວຽກ */
const REMINDER_HOUR = 7;
const REMINDER_MINUTE = 30;
/** ຊື່ແຜນທີ່ສະແດງໃນແຈ້ງເຕືອນ (ທີ່ເຫຼືອ = "ແລະ ອີກ N ລາຍການ") */
const REMINDER_LIST = 4;
/** ແຈ້ງພະນັກງານທີ່ມີແຜນວຽກຍັງບໍ່ສຳເລັດ (ມື້ນີ້ + ກາຍກຳນົດ) — ref "workplan:<date>" ກັນສົ່ງຊ້ຳ (server ເປີດຄືນກໍ່ບໍ່ຊ້ຳ) */
const remindTodaysPlans = async () => {
    const today = (0, workCalendar_1.todayLao)();
    // ລວມແຜນທີ່ກາຍກຳນົດແລ້ວ ແຕ່ຍັງບໍ່ປິດ — ເຕືອນທຸກເຊົ້າຈົນກວ່າຈະສຳເລັດ
    const plans = await workPlanModel_1.default.findAll({
        where: { employee_id: { [sequelize_1.Op.ne]: null }, status: 1, done: 0, start_date: { [sequelize_1.Op.lte]: today } },
        attributes: ["employee_id", "title", "end_date", "progress"],
        order: [["end_date", "ASC"], ["createdAt", "ASC"]],
    });
    const titlesOf = new Map();
    for (const p of plans) {
        const list = titlesOf.get(Number(p.employee_id)) ?? [];
        const tags = [Number(p.progress) > 0 ? `${p.progress}%` : null, p.end_date < today ? "ກາຍກຳນົດ" : null].filter(Boolean);
        list.push(tags.length ? `${p.title} (${tags.join(", ")})` : p.title);
        titlesOf.set(Number(p.employee_id), list);
    }
    if (!titlesOf.size)
        return;
    const ref = `workplan:${today}`;
    const [people, sent] = await Promise.all([
        employee_1.default.findAll({ attributes: ["_uuid", "start_date", "end_date", "work_status"], where: { _uuid: { [sequelize_1.Op.in]: [...titlesOf.keys()] }, work_status: workCalendar_1.WORKING } }),
        notification_1.default.findAll({ where: { ref, employee_id: { [sequelize_1.Op.in]: [...titlesOf.keys()] } }, attributes: ["employee_id"], raw: true }),
    ]);
    const already = new Set(sent.map((n) => Number(n.employee_id)));
    await (0, notificationController_1.notify)(people
        .filter((e) => (0, workCalendar_1.employedOn)(e, today) && !already.has(e._uuid))
        .map((e) => {
        const titles = titlesOf.get(e._uuid) ?? [];
        const lines = titles.slice(0, REMINDER_LIST).map((t) => `• ${t}`);
        if (titles.length > REMINDER_LIST)
            lines.push(`ແລະ ອີກ ${titles.length - REMINDER_LIST} ລາຍການ`);
        return { employee_id: e._uuid, type: "workplan", ref, title: `ແຜນວຽກທີ່ຕ້ອງເຮັດ ${titles.length} ລາຍການ 📝`, body: lines.join("\n"), push: true };
    }));
};
/**
 * ຕັ້ງເວລາເຕືອນແຜນວຽກທຸກມື້ 07:30 (ເວລາລາວ) — ເອີ້ນເທື່ອດຽວຕອນເປີດ server (App.ts). ເປີດ server ຫຼັງ 07:30 = ເຕືອນຂອງມື້ນີ້ທັນທີ
 */
const scheduleWorkPlanReminders = () => {
    const run = () => remindTodaysPlans().catch((error) => console.error("❌ work plan reminders:", error));
    const atOf = (day) => day.clone().startOf("day").hour(REMINDER_HOUR).minute(REMINDER_MINUTE);
    const next = () => {
        const now = (0, workCalendar_1.nowLao)();
        const at = atOf(now);
        if (!at.isAfter(now))
            at.add(1, "day");
        setTimeout(() => {
            run();
            next();
        }, at.diff(now));
    };
    if (!atOf((0, workCalendar_1.nowLao)()).isAfter((0, workCalendar_1.nowLao)()))
        run();
    next();
};
exports.scheduleWorkPlanReminders = scheduleWorkPlanReminders;
