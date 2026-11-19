import { Request, Response } from "express";
import moment from "moment";
import { Op } from "sequelize";
import Users from "../../models/userModel";
import Employee from "../../models/employee";
import Department from "../../models/department";
import Position from "../../models/position";
import LeaveRequest from "../../models/leaveRequest";
import LeaveType from "../../models/leaveType";
import AttendanceRequest from "../../models/attendanceRequest";
import Attendance from "../../models/attendance";
import SalaryAdvance from "../../models/salaryAdvance";
import { decodeId, sendError } from "../bansi/bansiHelpers";
import { selfEmployee } from "./attendanceController";
import { profileUrl } from "./hrHelpers";
import { LEAD_APPROVED, LEAD_REJECTED, LEAD_WAITING, approveLeave, balancesOf, decideLeaveAsLead, leadInclude, leaveFileInclude, rejectLeave } from "./leaveController";
import { approveCorrection, rejectCorrection } from "./correctionController";
import { advanceBalanceOf, approveAdvance, rejectAdvance } from "./advanceController";
import { APPROVAL_FLAGS, ApprovalKind, fullName } from "./approvers";
import { WORKING } from "./workCalendar";

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
  model: Employee,
  as: "employee",
  attributes: ["_uuid", "emp_code", "first_name", "last_name", "profile", "basic_salary"],
  include: [
    { model: Department, as: "department", attributes: ["depart_name"] },
    { model: Position, as: "position", attributes: ["position_name"] },
  ],
};

/** team = ລາພັກຂອງລູກທີມ (ຂັ້ນຫົວໜ້າທີມ) */
type Kind = ApprovalKind | "team";
const KINDS: Kind[] = ["leave", "correction", "advance", "team"];
const HR_KINDS: ApprovalKind[] = ["leave", "correction", "advance"];

/** ລາພັກທີ່ HR ຕັດສິນໄດ້ = ບໍ່ໄດ້ລໍຫົວໜ້າທີມ */
const notWaitingLead = { [Op.or]: [{ lead_status: null }, { lead_status: { [Op.ne]: LEAD_WAITING } }] };

/** ສະຖານະແບບດຽວກັນທຸກປະເພດ (ເບີກເງິນ: ອະນຸມັດ / ຈ່າຍແລ້ວ / ຫັກຄົບ = approved) */
const stateOf = (kind: Kind, status: number) => {
  if (status === PENDING) return "pending";
  if (kind === "advance") return status === 5 ? "rejected" : status === 6 ? "cancelled" : "approved";
  return status === 2 ? "approved" : status === 3 ? "rejected" : "cancelled";
};
const ADVANCE_STATES: Record<number, string> = { 2: "ອະນຸມັດແລ້ວ — ລໍຖ້າຈ່າຍ", 3: "ຈ່າຍແລ້ວ — ກຳລັງຫັກຄືນ", 4: "ຫັກຄືນຄົບແລ້ວ" };

const day = (date: unknown) => moment(String(date), "YYYY-MM-DD").format("DD/MM/YYYY");
const kip = (value: unknown) => `₭ ${Math.round(Number(value) || 0).toLocaleString("en-US")}`;
const period = (value: unknown) => moment(`${value}-01`).format("MM/YYYY");
const clock = (value: Date | null | undefined) => (value ? moment(value).utcOffset(7 * 60).format("HH:mm") : null);
const times = (inText: string | null, outText: string | null) =>
  inText && outText ? `${inText} – ${outText}` : inText ? `ເຂົ້າ ${inText}` : outText ? `ອອກ ${outText}` : "—";

/** ສິດຂອງຄົນທີ່ເອີ້ນ (ພະນັກງານ + ບັນຊີຜູ້ໃຊ້ທີ່ຜູກ) */
const approverOf = async (req: Request) => {
  const self = await selfEmployee(req);
  if ("code" in self) return self;
  const user = await Users.findOne({
    where: { employee_id: self.employee._uuid, status: 1 },
    attributes: ["user_uuid", "approve_leave", "approve_correction", "approve_advance"],
  });
  const me = Number(self.employee._uuid);
  const rights = Object.fromEntries(HR_KINDS.map((k) => [k, !!user && Number(user[APPROVAL_FLAGS[k]]) === 1])) as Record<Kind, boolean>;
  // ຫົວໜ້າທີມ: ມີລູກທີມ ຫຼື ມີຄຳຂໍທີ່ເຄີຍລໍຕົນ (ປ່ຽນໂຄງຮ່າງພາຍຫຼັງກໍ່ຍັງເຫັນ)
  rights.team = (await Employee.count({ where: { reports_to_id: me, work_status: WORKING } })) > 0
    || (await LeaveRequest.count({ where: { lead_id: me } })) > 0;
  return { me, user, rights };
};

const modelOf = (kind: Kind): any => (kind === "leave" || kind === "team" ? LeaveRequest : kind === "correction" ? AttendanceRequest : SalaryAdvance);

/** ຊື່ຜູ້ອະນຸມັດ (ຊື່ພະນັກງານທີ່ຜູກ ຫຼື ຊື່ບັນຊີ) */
const reviewerNames = async (ids: number[]) => {
  const unique = [...new Set(ids.filter((id) => id > 0))];
  if (!unique.length) return new Map<number, string>();
  const users = await Users.findAll({
    where: { user_uuid: { [Op.in]: unique } },
    attributes: ["user_uuid", "user_name"],
    include: [{ model: Employee, as: "employee", attributes: ["first_name", "last_name"] }],
  });
  return new Map(users.map((u: any) => [Number(u.user_uuid), fullName(u.employee) || u.user_name]));
};

/** ຄຳຂໍ → ຮູບແບບດຽວກັນສຳລັບ app: ຫົວຂໍ້, ລາຍລະອຽດ (lines), ຄຳເຕືອນ (warn), ເຫດຜົນ, ຜົນການຕັດສິນ */
const itemsOf = async (kind: Kind, rows: any[]) => {
  const reviewers = await reviewerNames(rows.map((r) => Number(r.reviewedbyid) || 0));
  return Promise.all(rows.map(async (row) => {
    const r: any = row.get({ plain: true });
    const e = r.employee ?? {};
    // ຂັ້ນຫົວໜ້າທີມ: "ລໍຖ້າ" = ລໍຕົນ; ອະນຸມັດແລ້ວ = ສົ່ງຕໍ່ HR
    const pending = kind === "team" ? Number(r.status) === PENDING && Number(r.lead_status) === LEAD_WAITING : Number(r.status) === PENDING;
    const lines: string[] = [];
    const warn: string[] = [];
    let title = "";
    if (kind === "leave" || kind === "team") {
      title = r.type?.name ?? "ລາພັກ";
      lines.push(`${day(r.start_date)} – ${day(r.end_date)} · ${r.days} ມື້`);
      if (pending && r.leave_type_id) {
        // ສິດທີ່ເຫຼືອຂອງປະເພດນີ້ (ບໍ່ນັບຄຳຂໍນີ້) — ໃຫ້ຜູ້ອະນຸມັດເຫັນກ່ອນຕັດສິນ
        const balance = (await balancesOf(r.employee_id, String(r.start_date).slice(0, 4), r._uuid)).find((b) => b._uuid === r.leave_type_id);
        if (balance && balance.remaining !== null) {
          lines.push(`ສິດ${balance.name}ເຫຼືອ ${balance.remaining} ມື້`);
          if (Number(r.days) > balance.remaining) warn.push(`ເກີນສິດ ${Number(r.days) - balance.remaining} ມື້ — ອະນຸມັດແລ້ວຈະເປັນ ${balance.paid ? "ໄດ້ເງິນເດືອນຕາມປະເພດ" : "ບໍ່ໄດ້ເງິນເດືອນ"}`);
        }
      }
      if (kind === "team") {
        if (Number(r.lead_status) === LEAD_APPROVED) {
          lines.push(Number(r.status) === PENDING ? "ສົ່ງຕໍ່ HR ແລ້ວ — ລໍ HR ອະນຸມັດ" : Number(r.status) === 2 ? "HR ອະນຸມັດແລ້ວ" : Number(r.status) === 3 ? "HR ບໍ່ອະນຸມັດ" : "ພະນັກງານຍົກເລີກ");
        }
      } else {
        if (Number(r.lead_status) === LEAD_APPROVED) lines.push(`✓ ຫົວໜ້າທີມ${r.lead ? ` (${fullName(r.lead)})` : ""} ອະນຸມັດແລ້ວ${r.lead_note ? `: ${r.lead_note}` : ""}`);
        if (Number(r.lead_status) === LEAD_REJECTED) lines.push(`ຫົວໜ້າທີມ${r.lead ? ` (${fullName(r.lead)})` : ""} ບໍ່ອະນຸມັດ`);
        if (!pending) lines.push(Number(r.leave_type) === 2 ? "ໄດ້ເງິນເດືອນ" : "ບໍ່ໄດ້ເງິນເດືອນ");
      }
    } else if (kind === "correction") {
      title = `ລືມສະແກນ ${day(r.work_date)}`;
      lines.push(`ຂໍ: ${times(r.check_in, r.check_out)}`);
      if (pending) {
        const scan = await Attendance.findOne({ where: { employee_id: r.employee_id, work_date: r.work_date }, attributes: ["check_in", "check_out"] });
        lines.push(`ສະແກນໄວ້: ${times(clock(scan?.check_in), clock(scan?.check_out))}`);
      }
    } else {
      title = `ເບີກເງິນ ${kip(r.amount)}`;
      lines.push(`ຜ່ອນ ${r.installments} ເດືອນ · ຫັກ ${kip(r.monthly_deduction)}/ເດືອນ · ເລີ່ມ ${period(r.start_period)}`);
      if (pending) {
        lines.push(`ເງິນເດືອນພື້ນຖານ ${kip(e.basic_salary)}`);
        const owed = await advanceBalanceOf(r.employee_id);
        if (owed > 0) warn.push(`ຍັງຄ້າງເບີກເກົ່າ ${kip(owed)}`);
      } else if (ADVANCE_STATES[Number(r.status)]) {
        lines.push(ADVANCE_STATES[Number(r.status)]);
      }
    }
    // ລາພັກລູກທີມ: ສະຖານະ / ໝາຍເຫດ / ເວລາ = ຂອງການຕັດສິນຂັ້ນຫົວໜ້າ
    const team = kind === "team";
    return {
      _uuid: r._uuid,
      kind,
      state: team
        ? (pending ? "pending" : Number(r.lead_status) === LEAD_APPROVED ? "approved" : Number(r.lead_status) === LEAD_REJECTED ? "rejected" : stateOf("leave", Number(r.status)))
        : stateOf(kind, Number(r.status)),
      title,
      lines,
      warn,
      reason: r.reason ?? null,
      // ໃບລາທີ່ແນບ (ລາພັກ) — app ເປີດຜ່ານ GET /leave/me/file/:id (ຜູ້ມີສິດອະນຸມັດລາພັກເປີດໄດ້)
      files: (r.files ?? []).map((f: any) => ({ _uuid: f._uuid, original_name: f.original_name, mime_type: f.mime_type, file_size: f.file_size })),
      created_at: r.createdAt,
      reviewed_at: team ? r.lead_at ?? null : r.reviewedAt ?? null,
      review_note: team ? r.lead_note ?? null : r.review_note ?? null,
      reviewer: team ? (r.lead ? fullName(r.lead) : null) : reviewers.get(Number(r.reviewedbyid)) ?? null,
      person: {
        _uuid: e._uuid,
        emp_code: e.emp_code,
        name: fullName(e),
        profile_url: profileUrl(e.profile),
        department: e.department?.depart_name ?? null,
        position: e.position?.position_name ?? null,
      },
    };
  }));
};

/** GET /approve/me — ສິດຂອງຂ້ອຍ + ຈຳນວນຄຳຂໍທີ່ລໍຖ້າ (ບໍ່ລວມຂອງຕົນເອງ); ບໍ່ມີສິດ = ທຸກອັນ false */
export const getMyApprovals = async (req: Request, res: Response) => {
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
          ? await LeaveRequest.count({ where: { lead_id: who.me, status: PENDING, lead_status: LEAD_WAITING } })
          : await modelOf(kind).count({ where: { status: PENDING, employee_id: { [Op.ne]: who.me }, ...(kind === "leave" ? notWaitingLead : {}) } }),
    ])));
    res.status(200).json({ rights: who.rights, pending });
  } catch (error) {
    sendError(res, error, "Error getting my approvals");
  }
};

/** GET /approve/me/:kind — ລໍຖ້າອະນຸມັດ (ເກົ່າສຸດກ່ອນ) + ທີ່ຕັດສິນແລ້ວໃນ 30 ມື້ (ໃໝ່ສຸດກ່ອນ) */
export const getMyApprovalList = async (req: Request<{ kind: string }>, res: Response) => {
  try {
    const kind = req.params.kind as Kind;
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
    const include = [personInclude, ...(leaveLike ? [{ model: LeaveType, as: "type", attributes: ["name"] }, leaveFileInclude, leadInclude] : [])];
    const notMine = { employee_id: { [Op.ne]: who.me } };
    const since = moment().subtract(HISTORY_DAYS, "days").toDate();
    // ລາພັກລູກທີມ: ລໍຕົນ / ທີ່ຕົນຕັດສິນແລ້ວໃນ 30 ມື້; ລາພັກ (HR): ບໍ່ລວມທີ່ລໍຫົວໜ້າທີມ
    const pendingWhere = kind === "team"
      ? { lead_id: who.me, status: PENDING, lead_status: LEAD_WAITING }
      : { ...notMine, status: PENDING, ...(kind === "leave" ? notWaitingLead : {}) };
    const recentWhere = kind === "team"
      ? { lead_id: who.me, lead_status: { [Op.in]: [LEAD_APPROVED, LEAD_REJECTED] }, lead_at: { [Op.gte]: since } }
      : { ...notMine, status: { [Op.ne]: PENDING }, updatedAt: { [Op.gte]: since } };
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
  } catch (error) {
    sendError(res, error, "Error getting approval list");
  }
};

const HANDLERS: Record<ApprovalKind, { approve: (req: any, res: Response) => Promise<unknown>; reject: (req: any, res: Response) => Promise<unknown> }> = {
  leave: { approve: approveLeave, reject: rejectLeave },
  correction: { approve: approveCorrection, reject: rejectCorrection },
  advance: { approve: approveAdvance, reject: rejectAdvance },
};

/** PUT /approve/me/:kind/:id/:action (approve | reject) { note? } — ຂັ້ນຕອນດຽວກັບເວັບ; app ສົ່ງແຕ່ໝາຍເຫດ (ປະເພດ / ຈຳນວນເງິນ ຕາມຄຳຂໍ) */
export const decideMyApproval = async (req: Request<{ kind: string; id: string; action: string }>, res: Response) => {
  try {
    const kind = req.params.kind as Kind;
    const action = req.params.action as "approve" | "reject";
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
      await decideLeaveAsLead(Number(decodeId(req)) || 0, who.me, action === "approve", note, res);
      return;
    }
    if (!who.rights[kind] || !who.user) {
      res.status(403).json({ message: "ທ່ານບໍ່ມີສິດອະນຸມັດຄຳຂໍປະເພດນີ້" });
      return;
    }
    const row = await modelOf(kind).findByPk(decodeId(req), { attributes: ["_uuid", "employee_id"] });
    if (!row) {
      res.status(404).json({ message: "ບໍ່ພົບຄຳຂໍ" });
      return;
    }
    if (Number(row.employee_id) === who.me) {
      res.status(403).json({ message: "ອະນຸມັດຄຳຂໍຂອງຕົນເອງບໍ່ໄດ້ — ໃຫ້ຜູ້ມີສິດຄົນອື່ນ ຫຼື HR ເປັນຜູ້ອະນຸມັດ" });
      return;
    }
    // ຜູ້ອະນຸມັດ = ບັນຊີຜູ້ໃຊ້ທີ່ຜູກ (reviewedbyid / ຜູ້ບັນທຶກເວລາ) ຄືກັບອະນຸມັດໃນເວັບ
    (req as any).user = { ...(req as any).user, sub: who.user.user_uuid };
    req.body = { note: req.body?.note };
    await HANDLERS[kind as ApprovalKind][action](req, res);
  } catch (error) {
    sendError(res, error, "Error deciding approval");
  }
};
