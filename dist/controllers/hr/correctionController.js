"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rejectCorrection = exports.approveCorrection = exports.getCorrections = exports.cancelMyCorrection = exports.createMyCorrection = exports.getMyCorrections = void 0;
const moment_1 = __importDefault(require("moment"));
const sequelize_1 = require("sequelize");
const attendanceRequest_1 = __importDefault(require("../../models/attendanceRequest"));
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
 * ຄຳຮ້ອງແຈ້ງລືມສະແກນ / ຂໍແກ້ເວລາເຂົ້າ-ອອກວຽກ:
 * - ພະນັກງານ (app ມືຖື): GET/POST /correction/me, PUT /correction/me/cancel/:id
 * - HR: POST /correction/fetch, PUT /correction/approve/:id (ບັນທຶກເວລາລົງ tbl_attendance ຄືກັບ HR ແກ້ເອງ), PUT /correction/reject/:id
 * ເດືອນທີ່ຈ່າຍເງິນເດືອນແລ້ວ ຂໍ/ອະນຸມັດບໍ່ໄດ້
 */
const PENDING = 1;
const APPROVED = 2;
const REJECTED = 3;
const CANCELLED = 4;
const STATUSES = [PENDING, APPROVED, REJECTED, CANCELLED];
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
const present = (row, recorded) => {
    const { employee, ...r } = row.get({ plain: true });
    return {
        ...r,
        employee: employee ? { ...employee, profile_url: (0, hrHelpers_1.profileUrl)(employee.profile) } : null,
        // ເວລາທີ່ບັນທຶກໄວ້ໃນມື້ນັ້ນ (ໃຫ້ HR ທຽບກັບເວລາທີ່ຂໍ)
        ...(recorded !== undefined ? { recorded_in: (0, workCalendar_1.clockOf)(recorded?.check_in), recorded_out: (0, workCalendar_1.clockOf)(recorded?.check_out) } : {}),
    };
};
const dayText = (date) => (0, moment_1.default)(date, "YYYY-MM-DD").format("DD/MM/YYYY");
const text = (value) => String(value ?? "").trim().slice(0, 255) || null;
const yearOf = (value) => (/^\d{4}$/.test(String(value ?? "")) ? String(value) : (0, workCalendar_1.nowLao)().format("YYYY"));
const inYear = (year) => ({ work_date: { [sequelize_1.Op.between]: [`${year}-01-01`, `${year}-12-31`] } });
const paidPeriod = async (date) => (await payroll_1.default.count({ where: { period: date.slice(0, 7), status: PAYROLL_PAID } })) > 0;
const lockedMessage = (date) => `ເດືອນ ${(0, moment_1.default)(date).format("MM/YYYY")} ຈ່າຍເງິນເດືອນແລ້ວ — ແກ້ການເຂົ້າວຽກບໍ່ໄດ້`;
/** "08:05 – 17:30" / "ເຂົ້າ 08:05" / "ອອກ 17:30" */
const timesText = (checkIn, checkOut) => checkIn && checkOut ? `${checkIn} – ${checkOut}` : checkIn ? `ເຂົ້າ ${checkIn}` : `ອອກ ${checkOut}`;
// ================= ພະນັກງານ (app ມືຖື)
/** GET /correction/me?year=YYYY — ຄຳຮ້ອງຂອງຕົນເອງໃນປີ (ໃໝ່ສຸດກ່ອນ) + ຈຳນວນທີ່ລໍຖ້າ */
const getMyCorrections = async (req, res) => {
    try {
        const self = await (0, attendanceController_1.selfEmployee)(req);
        if ("code" in self) {
            res.status(self.code).json({ message: self.message });
            return;
        }
        const year = yearOf(req.query.year);
        const rows = await attendanceRequest_1.default.findAll({
            where: { employee_id: self.employee._uuid, ...inYear(year) },
            order: [["createdAt", "DESC"], ["_uuid", "DESC"]],
        });
        res.status(200).json({
            year,
            data: rows.map((r) => present(r)),
            summary: { pending: rows.filter((r) => Number(r.status) === PENDING).length },
        });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting my attendance requests");
    }
};
exports.getMyCorrections = getMyCorrections;
/** POST /correction/me { work_date, check_in?, check_out?, reason } — ແຈ້ງລືມສະແກນ (ຢ່າງໜ້ອຍ 1 ເວລາ) */
const createMyCorrection = async (req, res) => {
    try {
        const self = await (0, attendanceController_1.selfEmployee)(req);
        if ("code" in self) {
            res.status(self.code).json({ message: self.message });
            return;
        }
        const me = self.employee;
        const body = req.body || {};
        const fail = (message) => res.status(400).json({ message });
        const date = (0, bansiHelpers_1.toDateOnly)(body.work_date);
        if (!date)
            return fail("ກະລຸນາເລືອກວັນທີ");
        if (date > (0, workCalendar_1.todayLao)())
            return fail("ແຈ້ງລືມສະແກນລ່ວງໜ້າບໍ່ໄດ້");
        if (!(0, workCalendar_1.employedOn)(me, date))
            return fail("ວັນທີນີ້ທ່ານຍັງບໍ່ໄດ້ເຂົ້າວຽກ");
        if (await paidPeriod(date))
            return fail(lockedMessage(date));
        const checkIn = String(body.check_in ?? "").trim() || null;
        const checkOut = String(body.check_out ?? "").trim() || null;
        if (!checkIn && !checkOut)
            return fail("ກະລຸນາປ້ອນເວລາເຂົ້າ ຫຼື ເວລາອອກວຽກ");
        if (checkIn && !workCalendar_1.HHMM.test(checkIn))
            return fail("ເວລາເຂົ້າວຽກບໍ່ຖືກຕ້ອງ (HH:mm)");
        if (checkOut && !workCalendar_1.HHMM.test(checkOut))
            return fail("ເວລາອອກວຽກບໍ່ຖືກຕ້ອງ (HH:mm)");
        const reason = text(body.reason);
        if (!reason)
            return fail("ກະລຸນາປ້ອນເຫດຜົນ");
        // ເວລາທີ່ບໍ່ໄດ້ຂໍ = ໃຊ້ເວລາທີ່ສະແກນໄວ້ແລ້ວ — ຕ້ອງມີເວລາເຂົ້າວຽກ ແລະ ອອກຕ້ອງຫຼັງເຂົ້າ
        const recorded = await attendance_1.default.findOne({ where: { employee_id: me._uuid, work_date: date } });
        const finalIn = checkIn ?? (0, workCalendar_1.clockOf)(recorded?.check_in);
        const finalOut = checkOut ?? (0, workCalendar_1.clockOf)(recorded?.check_out);
        if (!finalIn)
            return fail("ມື້ນີ້ຍັງບໍ່ມີເວລາເຂົ້າວຽກ — ກະລຸນາປ້ອນເວລາເຂົ້າວຽກນຳ");
        if (finalOut && finalOut <= finalIn)
            return fail("ເວລາອອກວຽກຕ້ອງຫຼັງເວລາເຂົ້າວຽກ");
        const pending = await attendanceRequest_1.default.findOne({ where: { employee_id: me._uuid, work_date: date, status: PENDING } });
        if (pending)
            return fail(`ມີຄຳຮ້ອງຂອງວັນທີ ${dayText(date)} ລໍຖ້າອະນຸມັດຢູ່ແລ້ວ — ຍົກເລີກອັນເກົ່າກ່ອນ`);
        const row = await attendanceRequest_1.default.create({
            employee_id: me._uuid, work_date: date, check_in: checkIn, check_out: checkOut, reason, status: PENDING,
        });
        res.status(200).json({ message: "ສົ່ງຄຳຮ້ອງແລ້ວ — ລໍຖ້າ HR ອະນຸມັດ", data: present(row) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error creating attendance request");
    }
};
exports.createMyCorrection = createMyCorrection;
/** PUT /correction/me/cancel/:id — ຍົກເລີກຄຳຮ້ອງຂອງຕົນເອງ (ສະເພາະທີ່ລໍຖ້າ) */
const cancelMyCorrection = async (req, res) => {
    try {
        const self = await (0, attendanceController_1.selfEmployee)(req);
        if ("code" in self) {
            res.status(self.code).json({ message: self.message });
            return;
        }
        const id = Number((0, bansiHelpers_1.decodeId)(req));
        const row = Number.isInteger(id) && id > 0 ? await attendanceRequest_1.default.findOne({ where: { _uuid: id, employee_id: self.employee._uuid } }) : null;
        if (!row) {
            res.status(404).json({ message: "ບໍ່ພົບຄຳຮ້ອງ" });
            return;
        }
        if (Number(row.status) !== PENDING) {
            res.status(400).json({ message: "ຍົກເລີກໄດ້ສະເພາະຄຳຮ້ອງທີ່ລໍຖ້າອະນຸມັດ" });
            return;
        }
        await row.update({ status: CANCELLED, updatedAt: new Date() });
        res.status(200).json({ message: "ຍົກເລີກຄຳຮ້ອງແລ້ວ", data: present(row) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error cancelling attendance request");
    }
};
exports.cancelMyCorrection = cancelMyCorrection;
// ================= HR
/** POST /correction/fetch { year?, status? } — ຄຳຮ້ອງທັງໝົດຂອງປີ (ລໍຖ້າກ່ອນ) + ເວລາທີ່ບັນທຶກໄວ້ໃນມື້ນັ້ນ + ສະຫຼຸບຕາມສະຖານະ */
const getCorrections = async (req, res) => {
    try {
        const body = req.body || {};
        const year = yearOf(body.year);
        const status = Number(body.status);
        const [rows, counts] = await Promise.all([
            attendanceRequest_1.default.findAll({
                where: { ...inYear(year), ...(STATUSES.includes(status) ? { status } : {}) },
                include: [employeeInclude],
                order: [["status", "ASC"], ["work_date", "DESC"], ["_uuid", "DESC"]],
            }),
            attendanceRequest_1.default.findAll({
                where: inYear(year),
                attributes: ["status", [(0, sequelize_1.fn)("COUNT", (0, sequelize_1.col)("_uuid")), "total"]],
                group: ["status"],
                raw: true,
            }),
        ]);
        const recorded = rows.length
            ? await attendance_1.default.findAll({
                where: {
                    employee_id: { [sequelize_1.Op.in]: [...new Set(rows.map((r) => r.employee_id))] },
                    work_date: { [sequelize_1.Op.in]: [...new Set(rows.map((r) => String(r.work_date)))] },
                },
            })
            : [];
        const recordOf = (r) => recorded.find((a) => a.employee_id === r.employee_id && String(a.work_date) === String(r.work_date)) ?? null;
        const countOf = (s) => Number(counts.find((c) => Number(c.status) === s)?.total) || 0;
        res.status(200).json({
            year,
            data: rows.map((r) => present(r, recordOf(r))),
            summary: { pending: countOf(PENDING), approved: countOf(APPROVED), rejected: countOf(REJECTED), cancelled: countOf(CANCELLED) },
        });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting attendance requests");
    }
};
exports.getCorrections = getCorrections;
/**
 * PUT /correction/approve/:id { note? } — ອະນຸມັດ: ບັນທຶກເວລາທີ່ຂໍລົງ tbl_attendance (ມາວຽກ, ໂດຍ HR) — ເວລາທີ່ບໍ່ໄດ້ຂໍ ຄົງຕາມທີ່ສະແກນໄວ້;
 * ຄິດມາຊ້າ / ອອກກ່ອນ ໃໝ່ ຄືກັບ POST /attendance/save
 */
const approveCorrection = async (req, res) => {
    const t = await attendanceRequest_1.default.sequelize.transaction();
    let done = false;
    const fail = async (code, message) => {
        await t.rollback();
        done = true;
        res.status(code).json({ message });
    };
    try {
        const row = await attendanceRequest_1.default.findByPk((0, bansiHelpers_1.decodeId)(req), { transaction: t, lock: t.LOCK.UPDATE });
        if (!row)
            return fail(404, "ບໍ່ພົບຄຳຮ້ອງ");
        if (Number(row.status) !== PENDING)
            return fail(400, "ຄຳຮ້ອງນີ້ບໍ່ໄດ້ລໍຖ້າອະນຸມັດແລ້ວ");
        const date = String(row.work_date);
        const employee = await employee_1.default.findByPk(row.employee_id, { transaction: t });
        if (!employee)
            return fail(400, "ບໍ່ພົບພະນັກງານ");
        if (!(0, workCalendar_1.employedOn)(employee, date))
            return fail(400, "ວັນທີນີ້ ພະນັກງານຍັງບໍ່ໄດ້ເຂົ້າວຽກ ຫຼື ລາອອກແລ້ວ");
        if (await paidPeriod(date))
            return fail(400, lockedMessage(date));
        const current = await attendance_1.default.findOne({ where: { employee_id: row.employee_id, work_date: date }, transaction: t, lock: t.LOCK.UPDATE });
        const inText = row.check_in ?? (0, workCalendar_1.clockOf)(current?.check_in);
        const outText = row.check_out ?? (0, workCalendar_1.clockOf)(current?.check_out);
        if (!inText)
            return fail(400, "ມື້ນີ້ບໍ່ມີເວລາເຂົ້າວຽກ — ອະນຸມັດບໍ່ໄດ້ (ໃຫ້ພະນັກງານສົ່ງໃໝ່ພ້ອມເວລາເຂົ້າ)");
        if (outText && outText <= inText)
            return fail(400, "ເວລາອອກວຽກຕ້ອງຫຼັງເວລາເຂົ້າວຽກ");
        const rules = (0, workCalendar_1.workRulesOf)(await (0, workCalendar_1.findCompany)(t));
        const workday = (0, workCalendar_1.isWorkday)(date, rules, await (0, workCalendar_1.holidaysBetween)(date, date, t));
        // ເວລາທີ່ບໍ່ໄດ້ຂໍ = ຮັກສາເວລາສະແກນຈິງ ແລະ ພິກັດໄວ້
        const keep = (existing, wanted, prefix) => {
            if (!wanted)
                return { [`check_${prefix}`]: null };
            if (existing && (0, workCalendar_1.clockOf)(existing) === wanted)
                return { [`check_${prefix}`]: existing };
            return {
                [`check_${prefix}`]: (0, workCalendar_1.atLao)(date, wanted),
                [`${prefix}_latitude`]: null, [`${prefix}_longitude`]: null, [`${prefix}_distance`]: null, [`${prefix}_accuracy`]: null,
            };
        };
        const times = { ...keep(current?.check_in, inText, "in"), ...keep(current?.check_out, outText, "out") };
        const actor = Number((0, bansiHelpers_1.actorOf)(req)) || null;
        const values = {
            ...times,
            ...(0, workCalendar_1.lateEarlyOf)(rules, times.check_in, times.check_out, workday),
            status: workCalendar_1.PRESENT,
            source: workCalendar_1.BY_HR,
            note: `ແຈ້ງລືມສະແກນ: ${row.reason}`.slice(0, 255),
            updatedbyid: actor,
        };
        if (current)
            await current.update({ ...values, updatedAt: new Date() }, { transaction: t });
        else
            await attendance_1.default.create({ employee_id: row.employee_id, work_date: date, ...values }, { transaction: t });
        const note = text(req.body?.note);
        await row.update({ status: APPROVED, review_note: note, reviewedbyid: actor, reviewedAt: new Date(), updatedAt: new Date() }, { transaction: t });
        await t.commit();
        done = true;
        await (0, notificationController_1.notify)([{
                employee_id: Number(row.employee_id),
                type: "attendance",
                title: "ແຈ້ງລືມສະແກນໄດ້ຮັບການອະນຸມັດແລ້ວ ✅",
                body: [`${dayText(date)} · ${timesText(row.check_in, row.check_out)}`, note].filter(Boolean).join("\n"),
                ref: `correction:${row._uuid}`,
                createdbyid: actor,
            }]);
        const saved = await attendanceRequest_1.default.findByPk(row._uuid, { include: [employeeInclude] });
        res.status(200).json({ message: "ອະນຸມັດ ແລະ ບັນທຶກເວລາແລ້ວ", data: saved && present(saved) });
    }
    catch (error) {
        if (!done)
            await t.rollback();
        (0, bansiHelpers_1.sendError)(res, error, "Error approving attendance request");
    }
};
exports.approveCorrection = approveCorrection;
/** PUT /correction/reject/:id { note? } — ປະຕິເສດ (ສະເພາະທີ່ລໍຖ້າ) */
const rejectCorrection = async (req, res) => {
    try {
        const row = await attendanceRequest_1.default.findByPk((0, bansiHelpers_1.decodeId)(req));
        if (!row) {
            res.status(404).json({ message: "ບໍ່ພົບຄຳຮ້ອງ" });
            return;
        }
        if (Number(row.status) !== PENDING) {
            res.status(400).json({ message: "ຄຳຮ້ອງນີ້ບໍ່ໄດ້ລໍຖ້າອະນຸມັດແລ້ວ" });
            return;
        }
        const actor = Number((0, bansiHelpers_1.actorOf)(req)) || null;
        const note = text(req.body?.note);
        await row.update({ status: REJECTED, review_note: note, reviewedbyid: actor, reviewedAt: new Date(), updatedAt: new Date() });
        await (0, notificationController_1.notify)([{
                employee_id: Number(row.employee_id),
                type: "attendance",
                title: "ແຈ້ງລືມສະແກນບໍ່ໄດ້ຮັບການອະນຸມັດ",
                body: [`${dayText(String(row.work_date))} · ${timesText(row.check_in, row.check_out)}`, note].filter(Boolean).join("\n"),
                ref: `correction:${row._uuid}`,
                createdbyid: actor,
            }]);
        const saved = await attendanceRequest_1.default.findByPk(row._uuid, { include: [employeeInclude] });
        res.status(200).json({ message: "ປະຕິເສດຄຳຮ້ອງແລ້ວ", data: saved && present(saved) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error rejecting attendance request");
    }
};
exports.rejectCorrection = rejectCorrection;
