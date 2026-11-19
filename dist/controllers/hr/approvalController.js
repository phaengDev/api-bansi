"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.decideMyApproval = exports.getMyApprovalList = exports.getMyApprovals = void 0;
const moment_1 = __importDefault(require("moment"));
const sequelize_1 = require("sequelize");
const userModel_1 = __importDefault(require("../../models/userModel"));
const employee_1 = __importDefault(require("../../models/employee"));
const department_1 = __importDefault(require("../../models/department"));
const position_1 = __importDefault(require("../../models/position"));
const leaveRequest_1 = __importDefault(require("../../models/leaveRequest"));
const leaveType_1 = __importDefault(require("../../models/leaveType"));
const attendanceRequest_1 = __importDefault(require("../../models/attendanceRequest"));
const attendance_1 = __importDefault(require("../../models/attendance"));
const salaryAdvance_1 = __importDefault(require("../../models/salaryAdvance"));
const bansiHelpers_1 = require("../bansi/bansiHelpers");
const attendanceController_1 = require("./attendanceController");
const hrHelpers_1 = require("./hrHelpers");
const leaveController_1 = require("./leaveController");
const correctionController_1 = require("./correctionController");
const advanceController_1 = require("./advanceController");
const approvers_1 = require("./approvers");
const workCalendar_1 = require("./workCalendar");
/**
 * ອະນຸມັດຄຳຂໍຜ່ານ app — ສະເພາະພະນັກງານທີ່ຜູກກັບບັນຊີຜູ້ໃຊ້ ແລະ HR ຕິກສິດແຕ່ລະປະເພດໃນຟອມຜູ້ໃຊ້ (ເວັບ).
 * ເຫັນຄຳຂໍຂອງທຸກຄົນ (ຄືໃນເວັບ) ຍົກເວັ້ນຂອງຕົນເອງ — ອະນຸມັດຄຳຂໍຂອງຕົນເອງບໍ່ໄດ້.
 * ອະນຸມັດ / ປະຕິເສດ ໃຊ້ຂັ້ນຕອນດຽວກັບເວັບ (ບັນທຶກມື້ລາ / ເວລາເຂົ້າວຽກ, ແຈ້ງຜູ້ຂໍ, ອັບເດດເງິນເດືອນຮ່າງ) ໂດຍຜູ້ອະນຸມັດ = ບັນຊີຜູ້ໃຊ້ທີ່ຜູກ.
 * ເບີກເງິນລ່ວງໜ້າ: ອະນຸມັດ / ປະຕິເສດ ຕາມຈຳນວນທີ່ຂໍ — ການຈ່າຍເງິນຍັງເຮັດຢູ່ເວັບ.
 * - GET /approve/me — ສິດ + ຈຳນວນທີ່ລໍຖ້າ (app ສະແດງເມນູສະເພາະຄົນທີ່ມີສິດ)
 * - GET /approve/me/:kind — ລໍຖ້າອະນຸມັດ (ເກົ່າສຸດກ່ອນ) + ທີ່ຕັດສິນແລ້ວໃນ 30 ມື້
 * - PUT /approve/me/:kind/:id/approve { note? }, PUT /approve/me/:kind/:id/reject { note? }
 * ລາພັກລູກທີມ (kind "team"): ຫົວໜ້າທີມອະນຸມັດຂັ້ນທຳອິດ — ບໍ່ຕ້ອງມີສິດຈາກ HR, ເຫັນສະເພາະຄຳຂໍທີ່ລໍຕົນ (lead_id).
 * ລາພັກ (kind "leave", HR) ບໍ່ສະແດງຄຳຂໍທີ່ຍັງລໍຫົວໜ້າທີມ
 */
const PENDING = 1;
const HISTORY_DAYS = 30;
const HISTORY_LIMIT = 30;
const personInclude = {
    model: employee_1.default,
    as: "employee",
    attributes: ["_uuid", "emp_code", "first_name", "last_name", "profile", "basic_salary"],
    include: [
        { model: department_1.default, as: "department", attributes: ["depart_name"] },
        { model: position_1.default, as: "position", attributes: ["position_name"] },
    ],
};
const KINDS = ["leave", "correction", "advance", "team"];
const HR_KINDS = ["leave", "correction", "advance"];
/** ລາພັກທີ່ HR ຕັດສິນໄດ້ = ບໍ່ໄດ້ລໍຫົວໜ້າທີມ */
const notWaitingLead = { [sequelize_1.Op.or]: [{ lead_status: null }, { lead_status: { [sequelize_1.Op.ne]: leaveController_1.LEAD_WAITING } }] };
/** ສະຖານະແບບດຽວກັນທຸກປະເພດ (ເບີກເງິນ: ອະນຸມັດ / ຈ່າຍແລ້ວ / ຫັກຄົບ = approved) */
const stateOf = (kind, status) => {
    if (status === PENDING)
        return "pending";
    if (kind === "advance")
        return status === 5 ? "rejected" : status === 6 ? "cancelled" : "approved";
    return status === 2 ? "approved" : status === 3 ? "rejected" : "cancelled";
};
const ADVANCE_STATES = { 2: "ອະນຸມັດແລ້ວ — ລໍຖ້າຈ່າຍ", 3: "ຈ່າຍແລ້ວ — ກຳລັງຫັກຄືນ", 4: "ຫັກຄືນຄົບແລ້ວ" };
const day = (date) => (0, moment_1.default)(String(date), "YYYY-MM-DD").format("DD/MM/YYYY");
const kip = (value) => `₭ ${Math.round(Number(value) || 0).toLocaleString("en-US")}`;
const period = (value) => (0, moment_1.default)(`${value}-01`).format("MM/YYYY");
const clock = (value) => (value ? (0, moment_1.default)(value).utcOffset(7 * 60).format("HH:mm") : null);
const times = (inText, outText) => inText && outText ? `${inText} – ${outText}` : inText ? `ເຂົ້າ ${inText}` : outText ? `ອອກ ${outText}` : "—";
/** ສິດຂອງຄົນທີ່ເອີ້ນ (ພະນັກງານ + ບັນຊີຜູ້ໃຊ້ທີ່ຜູກ) */
const approverOf = async (req) => {
    const self = await (0, attendanceController_1.selfEmployee)(req);
    if ("code" in self)
        return self;
    const user = await userModel_1.default.findOne({
        where: { employee_id: self.employee._uuid, status: 1 },
        attributes: ["user_uuid", "approve_leave", "approve_correction", "approve_advance"],
    });
    const me = Number(self.employee._uuid);
    const rights = Object.fromEntries(HR_KINDS.map((k) => [k, !!user && Number(user[approvers_1.APPROVAL_FLAGS[k]]) === 1]));
    // ຫົວໜ້າທີມ: ມີລູກທີມ ຫຼື ມີຄຳຂໍທີ່ເຄີຍລໍຕົນ (ປ່ຽນໂຄງຮ່າງພາຍຫຼັງກໍ່ຍັງເຫັນ)
    rights.team = (await employee_1.default.count({ where: { reports_to_id: me, work_status: workCalendar_1.WORKING } })) > 0
        || (await leaveRequest_1.default.count({ where: { lead_id: me } })) > 0;
    return { me, user, rights };
};
const modelOf = (kind) => (kind === "leave" || kind === "team" ? leaveRequest_1.default : kind === "correction" ? attendanceRequest_1.default : salaryAdvance_1.default);
/** ຊື່ຜູ້ອະນຸມັດ (ຊື່ພະນັກງານທີ່ຜູກ ຫຼື ຊື່ບັນຊີ) */
const reviewerNames = async (ids) => {
    const unique = [...new Set(ids.filter((id) => id > 0))];
    if (!unique.length)
        return new Map();
    const users = await userModel_1.default.findAll({
        where: { user_uuid: { [sequelize_1.Op.in]: unique } },
        attributes: ["user_uuid", "user_name"],
        include: [{ model: employee_1.default, as: "employee", attributes: ["first_name", "last_name"] }],
    });
    return new Map(users.map((u) => [Number(u.user_uuid), (0, approvers_1.fullName)(u.employee) || u.user_name]));
};
/** ຄຳຂໍ → ຮູບແບບດຽວກັນສຳລັບ app: ຫົວຂໍ້, ລາຍລະອຽດ (lines), ຄຳເຕືອນ (warn), ເຫດຜົນ, ຜົນການຕັດສິນ */
const itemsOf = async (kind, rows) => {
    const reviewers = await reviewerNames(rows.map((r) => Number(r.reviewedbyid) || 0));
    return Promise.all(rows.map(async (row) => {
        const r = row.get({ plain: true });
        const e = r.employee ?? {};
        // ຂັ້ນຫົວໜ້າທີມ: "ລໍຖ້າ" = ລໍຕົນ; ອະນຸມັດແລ້ວ = ສົ່ງຕໍ່ HR
        const pending = kind === "team" ? Number(r.status) === PENDING && Number(r.lead_status) === leaveController_1.LEAD_WAITING : Number(r.status) === PENDING;
        const lines = [];
        const warn = [];
        let title = "";
        if (kind === "leave" || kind === "team") {
            title = r.type?.name ?? "ລາພັກ";
            lines.push(`${day(r.start_date)} – ${day(r.end_date)} · ${r.days} ມື້`);
            if (pending && r.leave_type_id) {
                // ສິດທີ່ເຫຼືອຂອງປະເພດນີ້ (ບໍ່ນັບຄຳຂໍນີ້) — ໃຫ້ຜູ້ອະນຸມັດເຫັນກ່ອນຕັດສິນ
                const balance = (await (0, leaveController_1.balancesOf)(r.employee_id, String(r.start_date).slice(0, 4), r._uuid)).find((b) => b._uuid === r.leave_type_id);
                if (balance && balance.remaining !== null) {
                    lines.push(`ສິດ${balance.name}ເຫຼືອ ${balance.remaining} ມື້`);
                    if (Number(r.days) > balance.remaining)
                        warn.push(`ເກີນສິດ ${Number(r.days) - balance.remaining} ມື້ — ອະນຸມັດແລ້ວຈະເປັນ ${balance.paid ? "ໄດ້ເງິນເດືອນຕາມປະເພດ" : "ບໍ່ໄດ້ເງິນເດືອນ"}`);
                }
            }
            if (kind === "team") {
                if (Number(r.lead_status) === leaveController_1.LEAD_APPROVED) {
                    lines.push(Number(r.status) === PENDING ? "ສົ່ງຕໍ່ HR ແລ້ວ — ລໍ HR ອະນຸມັດ" : Number(r.status) === 2 ? "HR ອະນຸມັດແລ້ວ" : Number(r.status) === 3 ? "HR ບໍ່ອະນຸມັດ" : "ພະນັກງານຍົກເລີກ");
                }
            }
            else {
                if (Number(r.lead_status) === leaveController_1.LEAD_APPROVED)
                    lines.push(`✓ ຫົວໜ້າທີມ${r.lead ? ` (${(0, approvers_1.fullName)(r.lead)})` : ""} ອະນຸມັດແລ້ວ${r.lead_note ? `: ${r.lead_note}` : ""}`);
                if (Number(r.lead_status) === leaveController_1.LEAD_REJECTED)
                    lines.push(`ຫົວໜ້າທີມ${r.lead ? ` (${(0, approvers_1.fullName)(r.lead)})` : ""} ບໍ່ອະນຸມັດ`);
                if (!pending)
                    lines.push(Number(r.leave_type) === 2 ? "ໄດ້ເງິນເດືອນ" : "ບໍ່ໄດ້ເງິນເດືອນ");
            }
        }
        else if (kind === "correction") {
            title = `ລືມສະແກນ ${day(r.work_date)}`;
            lines.push(`ຂໍ: ${times(r.check_in, r.check_out)}`);
            if (pending) {
                const scan = await attendance_1.default.findOne({ where: { employee_id: r.employee_id, work_date: r.work_date }, attributes: ["check_in", "check_out"] });
                lines.push(`ສະແກນໄວ້: ${times(clock(scan?.check_in), clock(scan?.check_out))}`);
            }
        }
        else {
            title = `ເບີກເງິນ ${kip(r.amount)}`;
            lines.push(`ຜ່ອນ ${r.installments} ເດືອນ · ຫັກ ${kip(r.monthly_deduction)}/ເດືອນ · ເລີ່ມ ${period(r.start_period)}`);
            if (pending) {
                lines.push(`ເງິນເດືອນພື້ນຖານ ${kip(e.basic_salary)}`);
                const owed = await (0, advanceController_1.advanceBalanceOf)(r.employee_id);
                if (owed > 0)
                    warn.push(`ຍັງຄ້າງເບີກເກົ່າ ${kip(owed)}`);
            }
            else if (ADVANCE_STATES[Number(r.status)]) {
                lines.push(ADVANCE_STATES[Number(r.status)]);
            }
        }
        // ລາພັກລູກທີມ: ສະຖານະ / ໝາຍເຫດ / ເວລາ = ຂອງການຕັດສິນຂັ້ນຫົວໜ້າ
        const team = kind === "team";
        return {
            _uuid: r._uuid,
            kind,
            state: team
                ? (pending ? "pending" : Number(r.lead_status) === leaveController_1.LEAD_APPROVED ? "approved" : Number(r.lead_status) === leaveController_1.LEAD_REJECTED ? "rejected" : stateOf("leave", Number(r.status)))
                : stateOf(kind, Number(r.status)),
            title,
            lines,
            warn,
            reason: r.reason ?? null,
            // ໃບລາທີ່ແນບ (ລາພັກ) — app ເປີດຜ່ານ GET /leave/me/file/:id (ຜູ້ມີສິດອະນຸມັດລາພັກເປີດໄດ້)
            files: (r.files ?? []).map((f) => ({ _uuid: f._uuid, original_name: f.original_name, mime_type: f.mime_type, file_size: f.file_size })),
            created_at: r.createdAt,
            reviewed_at: team ? r.lead_at ?? null : r.reviewedAt ?? null,
            review_note: team ? r.lead_note ?? null : r.review_note ?? null,
            reviewer: team ? (r.lead ? (0, approvers_1.fullName)(r.lead) : null) : reviewers.get(Number(r.reviewedbyid)) ?? null,
            person: {
                _uuid: e._uuid,
                emp_code: e.emp_code,
                name: (0, approvers_1.fullName)(e),
                profile_url: (0, hrHelpers_1.profileUrl)(e.profile),
                department: e.department?.depart_name ?? null,
                position: e.position?.position_name ?? null,
            },
        };
    }));
};
/** GET /approve/me — ສິດຂອງຂ້ອຍ + ຈຳນວນຄຳຂໍທີ່ລໍຖ້າ (ບໍ່ລວມຂອງຕົນເອງ); ບໍ່ມີສິດ = ທຸກອັນ false */
const getMyApprovals = async (req, res) => {
    try {
        const who = await approverOf(req);
        if ("code" in who) {
            res.status(who.code).json({ message: who.message });
            return;
        }
        const pending = Object.fromEntries(await Promise.all(KINDS.map(async (kind) => [
            kind,
            !who.rights[kind]
                ? 0
                : kind === "team"
                    ? await leaveRequest_1.default.count({ where: { lead_id: who.me, status: PENDING, lead_status: leaveController_1.LEAD_WAITING } })
                    : await modelOf(kind).count({ where: { status: PENDING, employee_id: { [sequelize_1.Op.ne]: who.me }, ...(kind === "leave" ? notWaitingLead : {}) } }),
        ])));
        res.status(200).json({ rights: who.rights, pending });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting my approvals");
    }
};
exports.getMyApprovals = getMyApprovals;
/** GET /approve/me/:kind — ລໍຖ້າອະນຸມັດ (ເກົ່າສຸດກ່ອນ) + ທີ່ຕັດສິນແລ້ວໃນ 30 ມື້ (ໃໝ່ສຸດກ່ອນ) */
const getMyApprovalList = async (req, res) => {
    try {
        const kind = req.params.kind;
        if (!KINDS.includes(kind)) {
            res.status(404).json({ message: "ບໍ່ພົບປະເພດຄຳຂໍ" });
            return;
        }
        const who = await approverOf(req);
        if ("code" in who) {
            res.status(who.code).json({ message: who.message });
            return;
        }
        if (!who.rights[kind]) {
            res.status(403).json({ message: "ທ່ານບໍ່ມີສິດອະນຸມັດຄຳຂໍປະເພດນີ້" });
            return;
        }
        const model = modelOf(kind);
        const leaveLike = kind === "leave" || kind === "team";
        const include = [personInclude, ...(leaveLike ? [{ model: leaveType_1.default, as: "type", attributes: ["name"] }, leaveController_1.leaveFileInclude, leaveController_1.leadInclude] : [])];
        const notMine = { employee_id: { [sequelize_1.Op.ne]: who.me } };
        const since = (0, moment_1.default)().subtract(HISTORY_DAYS, "days").toDate();
        // ລາພັກລູກທີມ: ລໍຕົນ / ທີ່ຕົນຕັດສິນແລ້ວໃນ 30 ມື້; ລາພັກ (HR): ບໍ່ລວມທີ່ລໍຫົວໜ້າທີມ
        const pendingWhere = kind === "team"
            ? { lead_id: who.me, status: PENDING, lead_status: leaveController_1.LEAD_WAITING }
            : { ...notMine, status: PENDING, ...(kind === "leave" ? notWaitingLead : {}) };
        const recentWhere = kind === "team"
            ? { lead_id: who.me, lead_status: { [sequelize_1.Op.in]: [leaveController_1.LEAD_APPROVED, leaveController_1.LEAD_REJECTED] }, lead_at: { [sequelize_1.Op.gte]: since } }
            : { ...notMine, status: { [sequelize_1.Op.ne]: PENDING }, updatedAt: { [sequelize_1.Op.gte]: since } };
        const [pending, recent] = await Promise.all([
            model.findAll({ where: pendingWhere, include, order: [["createdAt", "ASC"], ["_uuid", "ASC"]] }),
            model.findAll({
                where: recentWhere,
                include,
                order: [[kind === "team" ? "lead_at" : "updatedAt", "DESC"], ["_uuid", "DESC"]],
                limit: HISTORY_LIMIT,
            }),
        ]);
        res.status(200).json({ pending: await itemsOf(kind, pending), recent: await itemsOf(kind, recent) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting approval list");
    }
};
exports.getMyApprovalList = getMyApprovalList;
const HANDLERS = {
    leave: { approve: leaveController_1.approveLeave, reject: leaveController_1.rejectLeave },
    correction: { approve: correctionController_1.approveCorrection, reject: correctionController_1.rejectCorrection },
    advance: { approve: advanceController_1.approveAdvance, reject: advanceController_1.rejectAdvance },
};
/** PUT /approve/me/:kind/:id/:action (approve | reject) { note? } — ຂັ້ນຕອນດຽວກັບເວັບ; app ສົ່ງແຕ່ໝາຍເຫດ (ປະເພດ / ຈຳນວນເງິນ ຕາມຄຳຂໍ) */
const decideMyApproval = async (req, res) => {
    try {
        const kind = req.params.kind;
        const action = req.params.action;
        if (!KINDS.includes(kind) || !["approve", "reject"].includes(action)) {
            res.status(404).json({ message: "ບໍ່ພົບຄຳສັ່ງ" });
            return;
        }
        const who = await approverOf(req);
        if ("code" in who) {
            res.status(who.code).json({ message: who.message });
            return;
        }
        // ຫົວໜ້າທີມ: ກວດວ່າຄຳຂໍລໍຕົນຢູ່ (ໃນ decideLeaveAsLead) — ບໍ່ຕ້ອງມີບັນຊີຜູ້ໃຊ້
        if (kind === "team") {
            const note = String(req.body?.note ?? "").trim().slice(0, 255) || null;
            await (0, leaveController_1.decideLeaveAsLead)(Number((0, bansiHelpers_1.decodeId)(req)) || 0, who.me, action === "approve", note, res);
            return;
        }
        if (!who.rights[kind] || !who.user) {
            res.status(403).json({ message: "ທ່ານບໍ່ມີສິດອະນຸມັດຄຳຂໍປະເພດນີ້" });
            return;
        }
        const row = await modelOf(kind).findByPk((0, bansiHelpers_1.decodeId)(req), { attributes: ["_uuid", "employee_id"] });
        if (!row) {
            res.status(404).json({ message: "ບໍ່ພົບຄຳຂໍ" });
            return;
        }
        if (Number(row.employee_id) === who.me) {
            res.status(403).json({ message: "ອະນຸມັດຄຳຂໍຂອງຕົນເອງບໍ່ໄດ້ — ໃຫ້ຜູ້ມີສິດຄົນອື່ນ ຫຼື HR ເປັນຜູ້ອະນຸມັດ" });
            return;
        }
        // ຜູ້ອະນຸມັດ = ບັນຊີຜູ້ໃຊ້ທີ່ຜູກ (reviewedbyid / ຜູ້ບັນທຶກເວລາ) ຄືກັບອະນຸມັດໃນເວັບ
        req.user = { ...req.user, sub: who.user.user_uuid };
        req.body = { note: req.body?.note };
        await HANDLERS[kind][action](req, res);
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error deciding approval");
    }
};
exports.decideMyApproval = decideMyApproval;
