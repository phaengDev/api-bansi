"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rejectLeave = exports.approveLeave = exports.getLeaves = exports.cancelMyLeave = exports.createMyLeave = exports.getMyLeaves = void 0;
const moment_1 = __importDefault(require("moment"));
const sequelize_1 = require("sequelize");
const leaveRequest_1 = __importDefault(require("../../models/leaveRequest"));
const attendance_1 = __importDefault(require("../../models/attendance"));
const employee_1 = __importDefault(require("../../models/employee"));
const department_1 = __importDefault(require("../../models/department"));
const position_1 = __importDefault(require("../../models/position"));
const payroll_1 = __importDefault(require("../../models/payroll"));
const bansiHelpers_1 = require("../bansi/bansiHelpers");
const hrHelpers_1 = require("./hrHelpers");
const attendanceController_1 = require("./attendanceController");
const notificationController_1 = require("./notificationController");
const workCalendar_1 = require("./workCalendar");
/**
 * ຄຳຂໍລາພັກ:
 * - ພະນັກງານ (app ມືຖື): GET/POST /leave/me, PUT /leave/me/cancel/:id — ສະເພາະຄຳຂໍຂອງຕົນເອງ (ບັນຊີຕ້ອງຜູກກັບພະນັກງານ)
 * - HR: POST /leave/fetch, PUT /leave/approve/:id (ບັນທຶກລາພັກລົງ tbl_attendance ທຸກມື້ເຮັດວຽກໃນຊ່ວງ), PUT /leave/reject/:id
 * ເດືອນທີ່ຈ່າຍເງິນເດືອນແລ້ວ ຂໍ/ອະນຸມັດລາພັກບໍ່ໄດ້ (ຄືກັບການແກ້ການເຂົ້າວຽກ)
 */
const PENDING = 1;
const APPROVED = 2;
const REJECTED = 3;
const CANCELLED = 4;
const STATUSES = [PENDING, APPROVED, REJECTED, CANCELLED];
/** ປະເພດ = status ຂອງ tbl_attendance ທີ່ຈະບັນທຶກ */
const LEAVE_TYPES = [workCalendar_1.PAID_LEAVE, workCalendar_1.UNPAID_LEAVE];
/** ຂໍໄດ້ສູງສຸດຕໍ່ຄັ້ງ (ວັນປະຕິທິນ) */
const MAX_RANGE_DAYS = 60;
/** status ຂອງ tbl_payroll — ຈ່າຍແລ້ວ */
const PAYROLL_PAID = 2;
const employeeInclude = {
    model: employee_1.default,
    as: "employee",
    attributes: ["_uuid", "emp_code", "first_name", "last_name", "phone", "profile"],
    include: [
        { model: department_1.default, as: "department", attributes: ["_uuid", "depart_name"] },
        { model: position_1.default, as: "position", attributes: ["_uuid", "position_name"] },
    ],
};
const present = (row) => {
    const { employee, ...r } = row.get({ plain: true });
    return { ...r, employee: employee ? { ...employee, profile_url: (0, hrHelpers_1.profileUrl)(employee.profile) } : null };
};
const findWithEmployee = (id) => leaveRequest_1.default.findByPk(id, { include: [employeeInclude] });
const dayText = (date) => (0, moment_1.default)(date, "YYYY-MM-DD").format("DD/MM/YYYY");
const text = (value) => String(value ?? "").trim().slice(0, 255) || null;
/** ປີ "YYYY" — ບໍ່ສົ່ງ / ຜິດ = ປີນີ້ */
const yearOf = (value) => (/^\d{4}$/.test(String(value ?? "")) ? String(value) : (0, workCalendar_1.nowLao)().format("YYYY"));
/** ຄຳຂໍທີ່ມີມື້ໃດໜຶ່ງຢູ່ໃນປີ */
const overlapsYear = (year) => ({
    start_date: { [sequelize_1.Op.lte]: `${year}-12-31` },
    end_date: { [sequelize_1.Op.gte]: `${year}-01-01` },
});
const datesBetween = (start, end) => {
    const dates = [];
    for (const d = (0, moment_1.default)(start, "YYYY-MM-DD"); d.format("YYYY-MM-DD") <= end; d.add(1, "day"))
        dates.push(d.format("YYYY-MM-DD"));
    return dates;
};
/** ມື້ເຮັດວຽກໃນຊ່ວງ (ບໍ່ລວມວັນພັກປະຈຳອາທິດ ແລະ ວັນພັກລັດຖະການ) */
const workdaysIn = async (start, end, t) => {
    const [company, holidays] = await Promise.all([(0, workCalendar_1.findCompany)(t), (0, workCalendar_1.holidaysBetween)(start, end, t)]);
    const rules = (0, workCalendar_1.workRulesOf)(company);
    return datesBetween(start, end).filter((d) => (0, workCalendar_1.isWorkday)(d, rules, holidays));
};
/** ເດືອນທຳອິດໃນຊ່ວງທີ່ຈ່າຍເງິນເດືອນແລ້ວ — ບໍ່ມີ = null */
const lockedPeriod = async (start, end, t) => {
    const months = [];
    for (const m = (0, moment_1.default)(start, "YYYY-MM-DD").startOf("month"); m.format("YYYY-MM") <= end.slice(0, 7); m.add(1, "month")) {
        months.push(m.format("YYYY-MM"));
    }
    const row = await payroll_1.default.findOne({
        where: { period: { [sequelize_1.Op.in]: months }, status: PAYROLL_PAID },
        attributes: ["period"],
        order: [["period", "ASC"]],
        transaction: t,
    });
    return row ? String(row.period) : null;
};
const lockedMessage = (period) => `ເດືອນ ${(0, moment_1.default)(`${period}-01`).format("MM/YYYY")} ຈ່າຍເງິນເດືອນແລ້ວ — ຂໍ ຫຼື ອະນຸມັດລາພັກໃນເດືອນນີ້ບໍ່ໄດ້`;
/** ວັນທີເລີ່ມ / ສິ້ນສຸດ (ບໍ່ສົ່ງວັນສິ້ນສຸດ = ມື້ດຽວ) */
const parseRange = (body) => {
    const start = (0, bansiHelpers_1.toDateOnly)(body.start_date);
    const end = (0, bansiHelpers_1.toDateOnly)(body.end_date) ?? start;
    if (!start || !end)
        return { error: "ວັນທີບໍ່ຖືກຕ້ອງ" };
    if (end < start)
        return { error: "ວັນທີສິ້ນສຸດຕ້ອງບໍ່ກ່ອນວັນທີເລີ່ມ" };
    if ((0, moment_1.default)(end).diff((0, moment_1.default)(start), "days") + 1 > MAX_RANGE_DAYS)
        return { error: `ຂໍລາພັກໄດ້ບໍ່ເກີນ ${MAX_RANGE_DAYS} ວັນຕໍ່ຄັ້ງ` };
    return { start, end };
};
/**
 * ບັນທຶກລາພັກລົງ tbl_attendance ທຸກມື້ເຮັດວຽກໃນຊ່ວງທີ່ເປັນພະນັກງານຢູ່ (ລວມມື້ທີ່ຍັງບໍ່ຮອດ) — ມື້ທີ່ສະແກນມາວຽກແລ້ວ ບໍ່ທັບ ແລະ ບໍ່ນັບ
 */
const writeLeaveDays = async (employee, start, end, leaveType, reason, actor, t) => {
    const locked = await lockedPeriod(start, end, t);
    if (locked)
        return { error: lockedMessage(locked) };
    const dates = (await workdaysIn(start, end, t)).filter((d) => (0, workCalendar_1.employedOn)(employee, d));
    if (!dates.length)
        return { error: "ບໍ່ມີມື້ເຮັດວຽກໃນຊ່ວງນີ້ໃຫ້ບັນທຶກລາພັກ" };
    const existing = await attendance_1.default.findAll({
        where: { employee_id: employee._uuid, work_date: { [sequelize_1.Op.in]: dates } },
        transaction: t,
        lock: t.LOCK.UPDATE,
    });
    const byDate = new Map(existing.map((a) => [String(a.work_date), a]));
    const values = {
        check_in: null, in_latitude: null, in_longitude: null, in_distance: null, in_accuracy: null,
        check_out: null, out_latitude: null, out_longitude: null, out_distance: null, out_accuracy: null,
        late_minutes: 0,
        early_minutes: 0,
        status: leaveType,
        source: workCalendar_1.BY_HR,
        note: `ລາພັກ: ${reason}`.slice(0, 255),
        updatedbyid: actor,
    };
    const worked = [];
    let applied = 0;
    for (const date of dates) {
        const current = byDate.get(date);
        if (current && Number(current.status) === workCalendar_1.PRESENT && current.check_in) {
            worked.push(date);
            continue;
        }
        if (current)
            await current.update({ ...values, updatedAt: new Date() }, { transaction: t });
        else
            await attendance_1.default.create({ employee_id: employee._uuid, work_date: date, ...values }, { transaction: t });
        applied++;
    }
    if (!applied)
        return { error: "ທຸກມື້ໃນຊ່ວງນີ້ພະນັກງານມາວຽກແລ້ວ — ບໍ່ມີມື້ໃຫ້ບັນທຶກລາພັກ" };
    return { applied, worked };
};
/** ຄຳຂໍທີ່ລໍຖ້າ / ອະນຸມັດແລ້ວ ທີ່ຊ້ອນກັບຊ່ວງນີ້ */
const overlappingLeave = (employeeId, start, end, t) => leaveRequest_1.default.findOne({
    where: {
        employee_id: employeeId,
        status: { [sequelize_1.Op.in]: [PENDING, APPROVED] },
        start_date: { [sequelize_1.Op.lte]: end },
        end_date: { [sequelize_1.Op.gte]: start },
    },
    transaction: t,
});
/** ແຈ້ງເຕືອນພະນັກງານເລື່ອງການລາພັກ (ອະນຸມັດ / ປະຕິເສດ) */
const notifyLeave = (row, title, lines, actor) => (0, notificationController_1.notify)([{
        employee_id: Number(row.employee_id),
        type: "leave",
        title,
        body: lines.filter(Boolean).join("\n") || null,
        ref: `leave:${row._uuid}`,
        createdbyid: actor,
    }]);
const overlapMessage = (row) => `ຊ່ວງວັນທີນີ້ຊ້ຳກັບການລາພັກ ${dayText(row.start_date)} – ${dayText(row.end_date)} ທີ່ມີຢູ່ແລ້ວ`;
// ================= ພະນັກງານ (app ມືຖື)
/** GET /leave/me?year=YYYY — ຄຳຂໍຂອງຕົນເອງໃນປີ (ໃໝ່ສຸດກ່ອນ) + ສະຫຼຸບມື້ທີ່ອະນຸມັດແລ້ວ */
const getMyLeaves = async (req, res) => {
    try {
        const self = await (0, attendanceController_1.selfEmployee)(req);
        if ("code" in self) {
            res.status(self.code).json({ message: self.message });
            return;
        }
        const year = yearOf(req.query.year);
        const rows = await leaveRequest_1.default.findAll({
            where: { employee_id: self.employee._uuid, ...overlapsYear(year) },
            order: [["start_date", "DESC"], ["_uuid", "DESC"]],
        });
        const data = rows.map(present);
        const approvedDays = (type) => data
            .filter((r) => Number(r.status) === APPROVED && Number(r.leave_type) === type)
            .reduce((n, r) => n + (Number(r.days) || 0), 0);
        res.status(200).json({
            year,
            data,
            summary: {
                pending: data.filter((r) => Number(r.status) === PENDING).length,
                paid_days: approvedDays(workCalendar_1.PAID_LEAVE),
                unpaid_days: approvedDays(workCalendar_1.UNPAID_LEAVE),
            },
        });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting my leave requests");
    }
};
exports.getMyLeaves = getMyLeaves;
/** POST /leave/me { leave_type: 2 | 3, start_date, end_date?, reason } — ສົ່ງຄຳຂໍລາພັກ (ລໍຖ້າ HR ອະນຸມັດ) */
const createMyLeave = async (req, res) => {
    try {
        const self = await (0, attendanceController_1.selfEmployee)(req);
        if ("code" in self) {
            res.status(self.code).json({ message: self.message });
            return;
        }
        const { employee } = self;
        const body = req.body || {};
        const fail = (message) => res.status(400).json({ message });
        const leaveType = Number(body.leave_type);
        if (!LEAVE_TYPES.includes(leaveType))
            return fail("ກະລຸນາເລືອກປະເພດການລາພັກ");
        const range = parseRange(body);
        if ("error" in range)
            return fail(range.error);
        const reason = text(body.reason);
        if (!reason)
            return fail("ກະລຸນາປ້ອນເຫດຜົນການລາພັກ");
        if (employee.start_date && range.start < String(employee.start_date))
            return fail("ວັນທີເລີ່ມຕ້ອງບໍ່ກ່ອນວັນເຂົ້າວຽກ");
        const locked = await lockedPeriod(range.start, range.end);
        if (locked)
            return fail(lockedMessage(locked));
        const workdays = await workdaysIn(range.start, range.end);
        if (!workdays.length)
            return fail("ຊ່ວງວັນທີນີ້ເປັນວັນພັກທັງໝົດ — ບໍ່ຕ້ອງຂໍລາພັກ");
        const overlap = await overlappingLeave(employee._uuid, range.start, range.end);
        if (overlap)
            return fail(overlapMessage(overlap));
        const row = await leaveRequest_1.default.create({
            employee_id: employee._uuid,
            leave_type: leaveType,
            start_date: range.start,
            end_date: range.end,
            days: workdays.length,
            reason,
            status: PENDING,
        });
        res.status(200).json({ message: "ສົ່ງຄຳຂໍລາພັກສຳເລັດ — ລໍຖ້າ HR ອະນຸມັດ", data: present(row) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error creating leave request");
    }
};
exports.createMyLeave = createMyLeave;
/** PUT /leave/me/cancel/:id — ຍົກເລີກຄຳຂໍຂອງຕົນເອງ (ສະເພາະທີ່ຍັງລໍຖ້າ) */
const cancelMyLeave = async (req, res) => {
    try {
        const self = await (0, attendanceController_1.selfEmployee)(req);
        if ("code" in self) {
            res.status(self.code).json({ message: self.message });
            return;
        }
        const row = await leaveRequest_1.default.findByPk((0, bansiHelpers_1.decodeId)(req));
        if (!row || Number(row.employee_id) !== self.employee._uuid) {
            res.status(404).json({ message: "ບໍ່ພົບຄຳຂໍລາພັກ" });
            return;
        }
        if (Number(row.status) !== PENDING) {
            res.status(400).json({ message: "ຍົກເລີກໄດ້ສະເພາະຄຳຂໍທີ່ຍັງລໍຖ້າອະນຸມັດ" });
            return;
        }
        await row.update({ status: CANCELLED, updatedAt: new Date() });
        res.status(200).json({ message: "ຍົກເລີກຄຳຂໍລາພັກແລ້ວ", data: present(row) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error cancelling leave request");
    }
};
exports.cancelMyLeave = cancelMyLeave;
// ================= HR
/** POST /leave/fetch { status?, year? } — ຄຳຂໍຂອງທຸກຄົນ (ລໍຖ້າກ່ອນ, ໃໝ່ສຸດກ່ອນ) + ຈຳນວນຕາມສະຖານະຂອງປີ */
const getLeaves = async (req, res) => {
    try {
        const body = req.body || {};
        const year = yearOf(body.year);
        const status = Number(body.status);
        const [rows, counts] = await Promise.all([
            leaveRequest_1.default.findAll({
                where: { ...overlapsYear(year), ...(STATUSES.includes(status) ? { status } : {}) },
                include: [employeeInclude],
                order: [["status", "ASC"], ["start_date", "DESC"], ["_uuid", "DESC"]],
            }),
            leaveRequest_1.default.findAll({
                where: overlapsYear(year),
                attributes: ["status", [(0, sequelize_1.fn)("COUNT", (0, sequelize_1.col)("_uuid")), "total"]],
                group: ["status"],
                raw: true,
            }),
        ]);
        const countOf = (s) => Number(counts.find((c) => Number(c.status) === s)?.total) || 0;
        res.status(200).json({
            year,
            data: rows.map(present),
            summary: { pending: countOf(PENDING), approved: countOf(APPROVED), rejected: countOf(REJECTED), cancelled: countOf(CANCELLED) },
        });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting leave requests");
    }
};
exports.getLeaves = getLeaves;
/**
 * PUT /leave/approve/:id { leave_type?, note? } — ອະນຸມັດ: ບັນທຶກ status ລາພັກ (HR ປ່ຽນປະເພດໄດ້) ລົງ tbl_attendance
 * ທຸກມື້ເຮັດວຽກໃນຊ່ວງທີ່ເປັນພະນັກງານຢູ່ (ລວມມື້ທີ່ຍັງບໍ່ຮອດ). ມື້ທີ່ສະແກນມາວຽກແລ້ວ ບໍ່ທັບ ແລະ ບໍ່ນັບ
 */
const approveLeave = async (req, res) => {
    const t = await leaveRequest_1.default.sequelize.transaction();
    let done = false;
    const fail = async (code, message) => {
        await t.rollback();
        done = true;
        res.status(code).json({ message });
    };
    try {
        const row = await leaveRequest_1.default.findByPk((0, bansiHelpers_1.decodeId)(req), { transaction: t, lock: t.LOCK.UPDATE });
        if (!row)
            return fail(404, "ບໍ່ພົບຄຳຂໍລາພັກ");
        if (Number(row.status) !== PENDING)
            return fail(400, "ຄຳຂໍນີ້ບໍ່ໄດ້ລໍຖ້າອະນຸມັດແລ້ວ");
        const body = req.body || {};
        const leaveType = body.leave_type === undefined || body.leave_type === null ? Number(row.leave_type) : Number(body.leave_type);
        if (!LEAVE_TYPES.includes(leaveType))
            return fail(400, "ປະເພດການລາພັກບໍ່ຖືກຕ້ອງ");
        const employee = await employee_1.default.findByPk(row.employee_id, { transaction: t });
        if (!employee)
            return fail(400, "ບໍ່ພົບພະນັກງານ");
        const actor = Number((0, bansiHelpers_1.actorOf)(req)) || null;
        const result = await writeLeaveDays(employee, String(row.start_date), String(row.end_date), leaveType, row.reason, actor, t);
        if ("error" in result)
            return fail(400, result.error);
        const { applied, worked } = result;
        await row.update({
            status: APPROVED,
            leave_type: leaveType,
            days: applied,
            review_note: text(body.note),
            reviewedbyid: actor,
            reviewedAt: new Date(),
            updatedAt: new Date(),
        }, { transaction: t });
        await t.commit();
        done = true;
        await notifyLeave(row, "ຄຳຂໍລາພັກໄດ້ຮັບການອະນຸມັດແລ້ວ ✅", [`${dayText(row.start_date)} – ${dayText(row.end_date)} · ${applied} ມື້`, text(body.note)], actor);
        const saved = await findWithEmployee(row._uuid);
        res.status(200).json({
            message: worked.length ? `ອະນຸມັດແລ້ວ ${applied} ມື້ (ບໍ່ນັບ ${worked.length} ມື້ທີ່ມາວຽກແລ້ວ)` : `ອະນຸມັດແລ້ວ ${applied} ມື້`,
            data: saved && present(saved),
            worked,
        });
    }
    catch (error) {
        if (!done)
            await t.rollback();
        // ພະນັກງານສະແກນມື້ດຽວກັນພ້ອມກັນ (UNIQUE employee_id + work_date)
        if (error instanceof sequelize_1.UniqueConstraintError) {
            res.status(409).json({ message: "ມີການບັນທຶກການເຂົ້າວຽກພ້ອມກັນ — ລອງໃໝ່ອີກຄັ້ງ" });
            return;
        }
        (0, bansiHelpers_1.sendError)(res, error, "Error approving leave request");
    }
};
exports.approveLeave = approveLeave;
/** PUT /leave/reject/:id { note? } — ປະຕິເສດ (ສະເພາະທີ່ຍັງລໍຖ້າ) */
const rejectLeave = async (req, res) => {
    try {
        const row = await leaveRequest_1.default.findByPk((0, bansiHelpers_1.decodeId)(req));
        if (!row) {
            res.status(404).json({ message: "ບໍ່ພົບຄຳຂໍລາພັກ" });
            return;
        }
        if (Number(row.status) !== PENDING) {
            res.status(400).json({ message: "ຄຳຂໍນີ້ບໍ່ໄດ້ລໍຖ້າອະນຸມັດແລ້ວ" });
            return;
        }
        await row.update({
            status: REJECTED,
            review_note: text(req.body?.note),
            reviewedbyid: Number((0, bansiHelpers_1.actorOf)(req)) || null,
            reviewedAt: new Date(),
            updatedAt: new Date(),
        });
        await notifyLeave(row, "ຄຳຂໍລາພັກບໍ່ໄດ້ຮັບການອະນຸມັດ", [`${dayText(row.start_date)} – ${dayText(row.end_date)}`, text(req.body?.note)], Number((0, bansiHelpers_1.actorOf)(req)) || null);
        const saved = await findWithEmployee(row._uuid);
        res.status(200).json({ message: "ປະຕິເສດຄຳຂໍລາພັກແລ້ວ", data: saved && present(saved) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error rejecting leave request");
    }
};
exports.rejectLeave = rejectLeave;
