import { Request, Response } from "express";
import { Op, Transaction } from "sequelize";
import Users from "../../models/userModel";
import Employee from "../../models/employee";
import Position from "../../models/position";
import MainMenu from "../../models/mainMenuModel";
import { LoanApplication, LoanApproval } from "../../models/loanCredit";
import { readMenuAccess } from "../menuController";
import { notify } from "../hr/notificationController";
import { GlError } from "../bansi/glCore";
import { actorOf } from "../bansi/bansiHelpers";

/**
 * ສົ່ງຄຳຮ້ອງໃຫ້ຜູ້ພິຈາລະນາ (ຕອນສົ່ງພິຈາລະນາ ແລະ ຕອນອະນຸມັດຂັ້ນໜຶ່ງແລ້ວ ສົ່ງຕໍ່ຂັ້ນຕໍ່ໄປ) — 2 ແບບ (ຜູ້ໃຊ້ເລືອກ 2026-11-26):
 *  - ອັດຕະໂນມັດ: ຫົວໜ້າສາຍງານຂອງຜູ້ສົ່ງ (tbl_employee.reports_to_id); ຫົວໜ້າພິຈາລະນາບໍ່ໄດ້ → ຄົນຖັດໄປໃນສາຍງານ
 *  - ເລືອກເອງ: ສະເພາະຄົນທີ່ຕຳແໜ່ງສູງກວ່າຜູ້ສົ່ງ — Level ນ້ອຍກວ່າ (1 = ສູງສຸດ) ຫຼື ຢູ່ເທິງຜູ້ສົ່ງໃນສາຍງານ
 *    (ໃນ Level ດຽວກັນ ຫົວໜ້າ ແລະ ລູກນ້ອງຢູ່ນຳກັນໄດ້); ບັນຊີທີ່ບໍ່ໄດ້ຜູກກັບພະນັກງານ = ຖືວ່າສູງສຸດ
 * ສະເພາະຄົນທີ່ຖືກສົ່ງໃຫ້ພິຈາລະນາຂັ້ນນັ້ນໄດ້; ຜູ້ສົ່ງປ່ຽນຄົນໄດ້, ຄົນທີ່ຖືກສົ່ງໃຫ້ສົ່ງຕໍ່ຂຶ້ນໄປໄດ້ (POST …/route).
 * ທຸກການສົ່ງ = ແຖວ tbl_loan_approval decision 4 (forward_to, forward_mode) ໃຫ້ເຫັນໃນປະຫວັດ
 */
export const FORWARD = 4;
export const ROUTE_AUTO = 1;
export const ROUTE_MANUAL = 2;

export type RouteInput = { mode?: unknown; to?: unknown } | null | undefined;
export type RoutePerson = { _uuid: number; name: string; employee: string | null; position: string | null; level: number | null };
type Person = RoutePerson & { employee_id: number | null };

const fullName = (e: { first_name?: string | null; last_name?: string | null } | null | undefined) => [e?.first_name, e?.last_name].filter(Boolean).join(" ") || null;

/** ຜູ້ໃຊ້ທີ່ພິຈາລະນາຄຳຮ້ອງໄດ້: ເປີດໃຊ້, ມີສິດແກ້ໄຂ, ເຂົ້າເມນູ ຄຳຮ້ອງຂໍກູ້ ໄດ້ (menu_access) — ພ້ອມພະນັກງານ / ຕຳແໜ່ງ */
const loadPeople = async (t?: Transaction) => {
  const [menu, users] = await Promise.all([
    MainMenu.findOne({ where: { types: 2, path: "/credit/applications" }, attributes: ["_uuid"], transaction: t }),
    Users.findAll({ where: { status: 1 }, attributes: ["user_uuid", "user_name", "menu_access", "employee_id", "updates"], order: [["user_name", "ASC"]], transaction: t }),
  ]);
  const employees = await Employee.findAll({
    attributes: ["_uuid", "first_name", "last_name", "reports_to_id", "position_id", "status"],
    include: [{ model: Position, as: "position", attributes: ["position_name", "level"] }],
    transaction: t,
  });
  const byId = new Map(employees.map((e) => [Number(e._uuid), e]));
  const people: (Person & { canDecide: boolean })[] = users.map((u) => {
    const e = u.employee_id ? byId.get(Number(u.employee_id)) : undefined;
    const allowed = readMenuAccess(u.menu_access);
    const pos = (e as any)?.position;
    return {
      _uuid: Number(u.user_uuid), name: u.user_name, employee_id: e ? Number(e._uuid) : null, employee: fullName(e),
      position: pos?.position_name ?? null, level: pos?.level === null || pos?.level === undefined ? null : Number(pos.level),
      canDecide: Number(u.updates) === 1 && (!allowed || !menu || allowed.includes(Number(menu._uuid))),
    };
  });
  /** ສາຍງານຂຶ້ນໄປຈາກພະນັກງານຄົນໜຶ່ງ (ບໍ່ລວມຕົນເອງ) — ກັນວົງວຽນ */
  const chainOf = (employeeId: number | null) => {
    const chain: number[] = [];
    let current = employeeId ? byId.get(employeeId) : undefined;
    while (current?.reports_to_id && !chain.includes(Number(current.reports_to_id)) && chain.length < 50) {
      chain.push(Number(current.reports_to_id));
      current = byId.get(Number(current.reports_to_id));
    }
    return chain;
  };
  return { people, chainOf };
};

/** ຄົນທີ່ບໍ່ໃຫ້ພິຈາລະນາຂັ້ນຕໍ່ໄປ: ຜູ້ສ້າງ, ຜູ້ທີ່ອະນຸມັດຂັ້ນກ່ອນໃນຮອບນີ້ (maker-checker) ແລະ ຜູ້ສົ່ງເອງ */
export const excludedFor = async (app: LoanApplication | null, actorId: number, t?: Transaction) => {
  const ids = new Set<number>([actorId]);
  if (app) {
    ids.add(Number(app.created_by) || 0);
    const approved = await LoanApproval.findAll({
      where: { application_id: app._uuid, decision: 1, level: { [Op.lte]: Number(app.approval_level) } }, attributes: ["approver_id"], transaction: t,
    });
    approved.forEach((a) => ids.add(Number(a.approver_id)));
  }
  return ids;
};

/** ທາງເລືອກຂອງຜູ້ສົ່ງ (actor): ອັດຕະໂນມັດຈະໄປຫາໃຜ ແລະ ລາຍຊື່ທີ່ເລືອກເອງໄດ້ */
export const routeOptions = async (app: LoanApplication | null, actorId: number, t?: Transaction) => {
  const { people, chainOf } = await loadPeople(t);
  const excluded = await excludedFor(app, actorId, t);
  const me = people.find((p) => p._uuid === actorId);
  const chain = chainOf(me?.employee_id ?? null);
  const open = people.filter((p) => p.canDecide && !excluded.has(p._uuid));
  const higher = (p: Person) => {
    if (!me?.employee_id) return true; // ຜູ້ສົ່ງບໍ່ມີຕຳແໜ່ງ = ສູງສຸດ → ເລືອກໃຜກໍ່ໄດ້
    if (!p.employee_id) return true; // ບັນຊີທີ່ບໍ່ມີຕຳແໜ່ງ = ສູງສຸດ
    if (chain.includes(p.employee_id)) return true;
    return me.level !== null && p.level !== null && p.level < me.level;
  };
  // ອັດຕະໂນມັດ: ຄົນທຳອິດໃນສາຍງານທີ່ພິຈາລະນາໄດ້ (ຂ້າມຫົວໜ້າທີ່ບໍ່ມີບັນຊີ / ບໍ່ມີສິດ)
  let auto: Person | null = null;
  for (const employeeId of chain) {
    auto = open.find((p) => p.employee_id === employeeId) ?? null;
    if (auto) break;
  }
  const strip = ({ _uuid, name, employee, position, level }: Person): RoutePerson => ({ _uuid, name, employee, position, level });
  const manual = open.filter(higher).sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || a.name.localeCompare(b.name));
  return { auto: auto ? strip(auto) : null, manual: manual.map(strip), lineManager: !!chain.length };
};

/**
 * ຫາຄົນຈາກຄຳສັ່ງ route { mode: "auto" | "manual" | "open", to }. ບໍ່ສົ່ງ route (API ເກົ່າ) = ອັດຕະໂນມັດ ຖ້າມີ,
 * ບໍ່ມີ = ບໍ່ກຳນົດຄົນ (ໃຜທີ່ມີສິດກໍ່ພິຈາລະນາໄດ້ ຄືເກົ່າ); "open" ໄດ້ສະເພາະເມື່ອບໍ່ມີໃຜຕຳແໜ່ງສູງກວ່າຜູ້ສົ່ງ
 */
export const resolveRoute = async (route: RouteInput, app: LoanApplication | null, actorId: number, t?: Transaction) => {
  const options = await routeOptions(app, actorId, t);
  // ບໍ່ມີໃຜຕຳແໜ່ງສູງກວ່າຜູ້ສົ່ງ (ເຊັ່ນ ຜູ້ອຳນວຍການອະນຸມັດຂັ້ນ 1 ແລ້ວ) → ເປີດໃຫ້ທຸກຄົນທີ່ມີສິດ (ໃຜພິຈາລະນາກ່ອນ = ຜູ້ຮັບ)
  if (route?.mode === "open") {
    if (options.manual.length || options.auto) throw new GlError("ມີຜູ້ທີ່ຕຳແໜ່ງສູງກວ່າທ່ານ — ກະລຸນາເລືອກຄົນ ຫຼື ໃຊ້ອັດຕະໂນມັດ");
    return { to: null, mode: null };
  }
  const mode = route?.mode === "manual" ? ROUTE_MANUAL : route?.mode === "auto" ? ROUTE_AUTO : null;
  if (mode === ROUTE_MANUAL) {
    const pick = options.manual.find((p) => p._uuid === Number(route?.to));
    if (!pick) throw new GlError("ເລືອກໄດ້ສະເພາະຜູ້ທີ່ມີຕຳແໜ່ງສູງກວ່າທ່ານ ແລະ ມີສິດພິຈາລະນາຄຳຮ້ອງ");
    return { to: pick, mode };
  }
  if (options.auto) return { to: options.auto, mode: ROUTE_AUTO };
  if (mode === ROUTE_AUTO) throw new GlError("ບໍ່ພົບຫົວໜ້າສາຍງານທີ່ພິຈາລະນາຄຳຮ້ອງໄດ້ — ກະລຸນາເລືອກຜູ້ພິຈາລະນາເອງ");
  return { to: null, mode: null };
};

/** ບັນທຶກການສົ່ງ: ຄຳຮ້ອງລໍຄົນນີ້ ຂັ້ນ level + ແຖວປະຫວັດ (decision 4) */
export const assignRoute = async (app: LoanApplication, resolved: Awaited<ReturnType<typeof resolveRoute>>, level: number, actorId: number, comment: string | null, t: Transaction) => {
  await app.update({ assigned_to: resolved.to?._uuid ?? null, assigned_by: resolved.to ? actorId : null, assigned_at: resolved.to ? new Date() : null } as any, { transaction: t });
  if (!resolved.to) return;
  await LoanApproval.create({
    application_id: app._uuid, level, approver_id: actorId, decision: FORWARD, forward_to: resolved.to._uuid, forward_mode: resolved.mode, comment,
  } as any, { transaction: t });
};

/** ແຈ້ງເຕືອນຄົນທີ່ຖືກສົ່ງໃຫ້ (ຖ້າບັນຊີຜູກກັບພະນັກງານ) — ຫຼັງ commit, ບໍ່ໃຫ້ວຽກຫຼັກລໍ */
export const notifyAssignee = async (app: LoanApplication, level: number, levels: number, actorId: number, extra: { customer?: string | null; amount?: string }) => {
  if (!app.assigned_to) return;
  try {
    const [user, sender] = await Promise.all([
      Users.findByPk(Number(app.assigned_to), { attributes: ["employee_id"] }),
      Users.findByPk(actorId, { attributes: ["user_name"] }),
    ]);
    if (!user?.employee_id) return;
    await notify([{
      employee_id: Number(user.employee_id), type: "credit", push: true, createdbyid: actorId || null, ref: `credit-app:${app._uuid}`,
      title: "ມີຄຳຮ້ອງຂໍກູ້ລໍທ່ານພິຈາລະນາ",
      body: [app.application_no, extra.customer, extra.amount, `ຂັ້ນ ${level}/${levels}`, sender?.user_name ? `ສົ່ງໂດຍ ${sender.user_name}` : null].filter(Boolean).join(" · "),
    }]);
  } catch (error) {
    console.error("notifyAssignee", error);
  }
};

/** GET /credit/route-options?application_id= — ອັດຕະໂນມັດຈະໄປຫາໃຜ + ລາຍຊື່ທີ່ເລືອກເອງໄດ້ (ສຳລັບຜູ້ໃຊ້ທີ່ login) */
export const getRouteOptions = async (req: Request, res: Response) => {
  try {
    const id = Number(req.query.application_id) || 0;
    const app = id ? await LoanApplication.findByPk(id) : null;
    if (id && !app) throw new GlError("ບໍ່ພົບຄຳຮ້ອງ");
    res.status(200).json({ data: await routeOptions(app, Number(actorOf(req)) || 0) });
  } catch (error) {
    const known = error instanceof GlError;
    res.status(known ? 400 : 500).json({ message: known ? error.message : "Error getting route options" });
  }
};
