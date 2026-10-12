"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rejectLeave = exports.approveLeave = exports.getLeaveBalance = exports.getLeaves = exports.cancelMyLeave = exports.createMyLeave = exports.getMyLeaves = void 0;
const moment_1 = __importDefault(require("moment"));
const sequelize_1 = require("sequelize");
const leaveRequest_1 = __importDefault(require("../../models/leaveRequest"));
const leaveType_1 = __importDefault(require("../../models/leaveType"));
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
 * - HR: POST /leave/fetch, POST /leave/balance, PUT /leave/approve/:id (ບັນທຶກລາພັກລົງ tbl_attendance ທຸກມື້ເຮັດວຽກໃນຊ່ວງ),
 *   PUT /leave/reject/:id
 * ເດືອນທີ່ຈ່າຍເງິນເດືອນແລ້ວ ຂໍ/ອະນຸມັດລາພັກບໍ່ໄດ້ (ຄືກັບການແກ້ການເຂົ້າວຽກ).
 * ປະເພດ (tbl_leave_type) ມີຂີດຈຳກັດມື້ເຮັດວຽກຕໍ່ປີ / ຕໍ່ຄັ້ງ (ນັບຄຳຂໍທີ່ລໍຖ້າ + ອະນຸມັດແລ້ວ) — ເກີນ = ຍັງຂໍໄດ້ ແລະ ແຈ້ງພະນັກງານ;
 * HR ຕັດສິນຕອນອະນຸມັດວ່າ ໄດ້ ຫຼື ບໍ່ໄດ້ເງິນເດືອນ (paid)
 */
const PENDING = 1;
const APPROVED = 2;
const REJECTED = 3;
const CANCELLED = 4;
const STATUSES = [PENDING, APPROVED, REJECTED, CANCELLED];
/** status ຂອງ tbl_attendance ທີ່ຈະບັນທຶກ (leave_type) — app ລຸ້ນເກົ່າສົ່ງຄ່ານີ້ແທນ leave_type_id */
const LEAVE_TYPES = [workCalendar_1.PAID_LEAVE, workCalendar_1.UNPAID_LEAVE];
const TYPE_ORDER = [["sort", "ASC"], ["_uuid", "ASC"]];
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
const typeInclude = { model: leaveType_1.default, as: "type", attributes: ["_uuid", "name", "paid", "max_per_year", "max_per_request"] };
const present = (row) => {
    const { employee, ...r } = row.get({ plain: true });
    return { ...r, employee: employee ? { ...employee, profile_url: (0, hrHelpers_1.profileUrl)(employee.profile) } : null };
};
const findWithEmployee = (id) => leaveRequest_1.default.findByPk(id, { include: [employeeInclude, typeInclude] });
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
    const applied = [];
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
        applied.push(date);
    }
    if (!applied.length)
        return { error: "ທຸກມື້ໃນຊ່ວງນີ້ພະນັກງານມາວຽກແລ້ວ — ບໍ່ມີມື້ໃຫ້ບັນທຶກລາພັກ" };
    return { applied, worked };
};
const statusOfType = (type) => (Number(type.paid) === 1 ? workCalendar_1.PAID_LEAVE : workCalendar_1.UNPAID_LEAVE);
/**
 * ປະເພດທີ່ພະນັກງານເລືອກ: leave_type_id (ຕ້ອງໃຊ້ງານຢູ່). app ລຸ້ນເກົ່າສົ່ງແຕ່ leave_type 2 | 3 → ປະເພດທຳອິດທີ່ paid ກົງກັນ;
 * ຍັງບໍ່ໄດ້ຕັ້ງປະເພດຈັກອັນ = ແບບເກົ່າ (ບໍ່ມີປະເພດ, ບໍ່ມີຂີດຈຳກັດ)
 */
const resolveType = async (body) => {
    if (body.leave_type_id !== undefined && body.leave_type_id !== null && body.leave_type_id !== "") {
        const type = await leaveType_1.default.findOne({ where: { _uuid: Number(body.leave_type_id) || 0, status: 1 } });
        return type ? { type, status: statusOfType(type) } : { error: "ບໍ່ພົບປະເພດການລາພັກ ຫຼື ປະເພດນີ້ປິດໃຊ້ງານແລ້ວ" };
    }
    const legacy = Number(body.leave_type);
    if (!LEAVE_TYPES.includes(legacy))
        return { error: "ກະລຸນາເລືອກປະເພດການລາພັກ" };
    const type = await leaveType_1.default.findOne({ where: { status: 1, paid: legacy === workCalendar_1.PAID_LEAVE ? 1 : 0 }, order: TYPE_ORDER });
    if (type)
        return { type, status: legacy };
    if (await leaveType_1.default.count({ where: { status: 1 } }))
        return { error: "ກະລຸນາອັບເດດ app ແລ້ວເລືອກປະເພດການລາພັກ" };
    return { type: null, status: legacy };
};
/** ມື້ເຮັດວຽກຂອງຄຳຂໍທີ່ຕົກໃນປີ — ຢູ່ໃນປີທັງໝົດ = days ທີ່ບັນທຶກໄວ້, ຂ້າມປີ = ນັບມື້ເຮັດວຽກສ່ວນທີ່ຢູ່ໃນປີນັ້ນ */
const daysInYear = async (row, year, t) => {
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;
    const start = String(row.start_date);
    const end = String(row.end_date);
    if (start >= from && end <= to)
        return Number(row.days) || 0;
    return (await workdaysIn(start > from ? start : from, end < to ? end : to, t)).length;
};
/** ມື້ຂອງປະເພດໃນປີ: used = ອະນຸມັດແລ້ວ, pending = ລໍຖ້າ — exceptId = ຄຳຂໍທີ່ກຳລັງກວດ (ບໍ່ນັບຕົວເອງ) */
const usageOf = async (employeeId, typeId, year, exceptId, t) => {
    const rows = await leaveRequest_1.default.findAll({
        where: {
            employee_id: employeeId,
            leave_type_id: typeId,
            status: { [sequelize_1.Op.in]: [PENDING, APPROVED] },
            ...overlapsYear(year),
            ...(exceptId ? { _uuid: { [sequelize_1.Op.ne]: exceptId } } : {}),
        },
        transaction: t,
    });
    let used = 0;
    let pending = 0;
    for (const row of rows) {
        const days = await daysInYear(row, year, t);
        if (Number(row.status) === APPROVED)
            used += days;
        else
            pending += days;
    }
    return { used, pending };
};
/**
 * ກວດຂີດຈຳກັດຂອງປະເພດ — ຕໍ່ຄັ້ງ: ມື້ເຮັດວຽກທັງໝົດຂອງຄຳຂໍ; ຕໍ່ປີ: ອະນຸມັດ + ລໍຖ້າ + ຄຳຂໍນີ້ (ແຍກຕາມປີເມື່ອຂ້າມປີ).
 * ຜ່ານ = null, ບໍ່ຜ່ານ = ຂໍ້ຄວາມບອກມື້ທີ່ເຫຼືອ
 */
const quotaError = async (employeeId, type, dates, exceptId, t) => {
    if (!type)
        return null;
    const perRequest = Number(type.max_per_request) || 0;
    if (perRequest && dates.length > perRequest) {
        return `${type.name} ລາໄດ້ບໍ່ເກີນ ${perRequest} ມື້ຕໍ່ຄັ້ງ (ຄຳຂໍນີ້ ${dates.length} ມື້ເຮັດວຽກ)`;
    }
    const perYear = Number(type.max_per_year) || 0;
    if (!perYear)
        return null;
    const byYear = new Map();
    dates.forEach((d) => byYear.set(d.slice(0, 4), (byYear.get(d.slice(0, 4)) ?? 0) + 1));
    for (const [year, count] of byYear) {
        const { used, pending } = await usageOf(employeeId, type._uuid, year, exceptId, t);
        const left = Math.max(0, perYear - used - pending);
        if (count > left) {
            return `${type.name} ປີ ${year} ລາໄດ້ ${perYear} ມື້ — ໃຊ້ແລ້ວ ${used} ມື້${pending ? `, ລໍຖ້າອະນຸມັດ ${pending} ມື້` : ""}, ເຫຼືອ ${left} ມື້ (ຄຳຂໍນີ້ ${count} ມື້)`;
        }
    }
    return null;
};
/** ທຸກປະເພດທີ່ໃຊ້ງານ + ມື້ທີ່ໃຊ້/ລໍຖ້າ/ເຫຼືອ ຂອງພະນັກງານໃນປີ (remaining null = ບໍ່ຈຳກັດ) */
const balancesOf = async (employeeId, year, exceptId) => {
    const types = await leaveType_1.default.findAll({ where: { status: 1 }, order: TYPE_ORDER });
    return Promise.all(types.map(async (type) => {
        const { used, pending } = await usageOf(employeeId, type._uuid, year, exceptId);
        const perYear = Number(type.max_per_year) || 0;
        return {
            _uuid: type._uuid,
            name: type.name,
            paid: Number(type.paid),
            description: type.description,
            max_per_year: type.max_per_year,
            max_per_request: type.max_per_request,
            used,
            pending,
            remaining: perYear ? Math.max(0, perYear - used - pending) : null,
        };
    }));
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
        push: true,
    }]);
const overlapMessage = (row) => `ຊ່ວງວັນທີນີ້ຊ້ຳກັບການລາພັກ ${dayText(row.start_date)} – ${dayText(row.end_date)} ທີ່ມີຢູ່ແລ້ວ`;
// ================= ພະນັກງານ (app ມືຖື)
/**
 * GET /leave/me?year=YYYY — ຄຳຂໍຂອງຕົນເອງໃນປີ (ໃໝ່ສຸດກ່ອນ) + ສະຫຼຸບມື້ທີ່ອະນຸມັດແລ້ວ
 * + types: ປະເພດທີ່ເລືອກໄດ້ ພ້ອມມື້ທີ່ເຫຼືອຂອງປີ (ສຳລັບຟອມຂໍລາໃນ app)
 */
const getMyLeaves = async (req, res) => {
    try {
        const self = await (0, attendanceController_1.selfEmployee)(req);
        if ("code" in self) {
            res.status(self.code).json({ message: self.message });
            return;
        }
        const year = yearOf(req.query.year);
        const [rows, types] = await Promise.all([
            leaveRequest_1.default.findAll({
                where: { employee_id: self.employee._uuid, ...overlapsYear(year) },
                include: [typeInclude],
                order: [["start_date", "DESC"], ["_uuid", "DESC"]],
            }),
            balancesOf(self.employee._uuid, year),
        ]);
        const data = rows.map(present);
        const approvedDays = (type) => data
            .filter((r) => Number(r.status) === APPROVED && Number(r.leave_type) === type)
            .reduce((n, r) => n + (Number(r.days) || 0), 0);
        res.status(200).json({
            year,
            data,
            types,
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
/**
 * POST /leave/me { leave_type_id, start_date, end_date?, reason } — ສົ່ງຄຳຂໍລາພັກ (ລໍຖ້າ HR ອະນຸມັດ);
 * app ລຸ້ນເກົ່າສົ່ງ leave_type: 2 | 3 ແທນ leave_type_id ໄດ້ (ເບິ່ງ resolveType)
 */
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
        const resolved = await resolveType(body);
        if ("error" in resolved)
            return fail(resolved.error);
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
        // ເກີນຂີດຈຳກັດຂອງປະເພດ = ຍັງຂໍໄດ້ (ແຈ້ງພະນັກງານ) — HR ຕັດສິນຕອນອະນຸມັດວ່າ ໄດ້ / ບໍ່ໄດ້ເງິນເດືອນ
        const overQuota = await quotaError(employee._uuid, resolved.type, workdays);
        const row = await leaveRequest_1.default.create({
            employee_id: employee._uuid,
            leave_type_id: resolved.type?._uuid ?? null,
            leave_type: resolved.status,
            start_date: range.start,
            end_date: range.end,
            days: workdays.length,
            reason,
            status: PENDING,
        });
        const saved = await leaveRequest_1.default.findByPk(row._uuid, { include: [typeInclude] });
        res.status(200).json({
            message: overQuota
                ? `ສົ່ງຄຳຂໍລາພັກແລ້ວ — ${resolved.type?.name ?? "ປະເພດນີ້"} ລາຄົບສິດແລ້ວ, HR ຈະພິຈາລະນາວ່າໄດ້ ຫຼື ບໍ່ໄດ້ເງິນເດືອນ`
                : "ສົ່ງຄຳຂໍລາພັກສຳເລັດ — ລໍຖ້າ HR ອະນຸມັດ",
            over_quota: !!overQuota,
            data: present(saved ?? row),
        });
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
                include: [employeeInclude, typeInclude],
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
 * POST /leave/balance { leave_id } (HR) — ມື້ທີ່ເຫຼືອຂອງແຕ່ລະປະເພດ ສຳລັບພະນັກງານຂອງຄຳຂໍ ໃນປີຂອງວັນທີເລີ່ມ
 * (ບໍ່ນັບຄຳຂໍນີ້ເອງ — ເບິ່ງວ່າອະນຸມັດໄດ້ຫຼືບໍ່)
 */
const getLeaveBalance = async (req, res) => {
    try {
        const row = await leaveRequest_1.default.findByPk(Number(req.body?.leave_id) || 0);
        if (!row) {
            res.status(404).json({ message: "ບໍ່ພົບຄຳຂໍລາພັກ" });
            return;
        }
        const year = String(row.start_date).slice(0, 4);
        res.status(200).json({ year, data: await balancesOf(Number(row.employee_id), year, row._uuid) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting leave balance");
    }
};
exports.getLeaveBalance = getLeaveBalance;
/**
 * PUT /leave/approve/:id { leave_type_id?, paid?, note? } — ອະນຸມັດ: ບັນທຶກ status ລາພັກ (HR ປ່ຽນປະເພດໄດ້) ລົງ tbl_attendance
 * ທຸກມື້ເຮັດວຽກໃນຊ່ວງທີ່ເປັນພະນັກງານຢູ່ (ລວມມື້ທີ່ຍັງບໍ່ຮອດ). ມື້ທີ່ສະແກນມາວຽກແລ້ວ ບໍ່ທັບ ແລະ ບໍ່ນັບ.
 * paid (1 ໄດ້ເງິນເດືອນ / 0 ຕັດເງິນ) = HR ຕັດສິນເອງ — ບໍ່ສົ່ງ = ຕາມປະເພດ. ເກີນຂີດຈຳກັດຂອງປະເພດ ບໍ່ບລັອກ (HR ເຫັນຄຳເຕືອນໃນໜ້າເວັບ)
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
        // ປະເພດໃໝ່ທີ່ HR ເລືອກ (ຕ້ອງໃຊ້ງານຢູ່) ຫຼື ປະເພດເດີມຂອງຄຳຂໍ (ປິດໃຊ້ງານພາຍຫຼັງກໍ່ຍັງອະນຸມັດໄດ້); ຄຳຂໍເກົ່າບໍ່ມີປະເພດ = null
        const changed = body.leave_type_id !== undefined && body.leave_type_id !== null && body.leave_type_id !== "";
        const type = changed
            ? await leaveType_1.default.findOne({ where: { _uuid: Number(body.leave_type_id) || 0, status: 1 }, transaction: t })
            : row.leave_type_id ? await leaveType_1.default.findByPk(row.leave_type_id, { transaction: t }) : null;
        if (changed && !type)
            return fail(400, "ບໍ່ພົບປະເພດການລາພັກ ຫຼື ປະເພດນີ້ປິດໃຊ້ງານແລ້ວ");
        // HR ເລືອກ ໄດ້ / ບໍ່ໄດ້ເງິນເດືອນ ເອງ (ເຊັ່ນ ລາເກີນສິດ = ຕັດເງິນ) — ບໍ່ສົ່ງ = ຕາມປະເພດ
        const paidChoice = body.paid === undefined || body.paid === null || body.paid === ""
            ? null
            : Number(body.paid) === 1 || body.paid === true;
        const leaveType = paidChoice === null
            ? (type ? statusOfType(type) : Number(row.leave_type))
            : (paidChoice ? workCalendar_1.PAID_LEAVE : workCalendar_1.UNPAID_LEAVE);
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
            leave_type_id: type?._uuid ?? null,
            leave_type: leaveType,
            days: applied.length,
            review_note: text(body.note),
            reviewedbyid: actor,
            reviewedAt: new Date(),
            updatedAt: new Date(),
        }, { transaction: t });
        await t.commit();
        done = true;
        await notifyLeave(row, "ຄຳຂໍລາພັກໄດ້ຮັບການອະນຸມັດແລ້ວ ✅", [
            [type?.name, `${dayText(row.start_date)} – ${dayText(row.end_date)} · ${applied.length} ມື້`].filter(Boolean).join(" · "),
            leaveType === workCalendar_1.PAID_LEAVE ? "ໄດ້ເງິນເດືອນ" : "ບໍ່ໄດ້ເງິນເດືອນ (ຫັກເງິນເດືອນ)",
            text(body.note),
        ], actor);
        const saved = await findWithEmployee(row._uuid);
        res.status(200).json({
            message: worked.length ? `ອະນຸມັດແລ້ວ ${applied.length} ມື້ (ບໍ່ນັບ ${worked.length} ມື້ທີ່ມາວຽກແລ້ວ)` : `ອະນຸມັດແລ້ວ ${applied.length} ມື້`,
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
