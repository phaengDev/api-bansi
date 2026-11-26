"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRouteOptions = exports.notifyAssignee = exports.assignRoute = exports.resolveRoute = exports.routeOptions = exports.excludedFor = exports.ROUTE_MANUAL = exports.ROUTE_AUTO = exports.FORWARD = void 0;
const sequelize_1 = require("sequelize");
const userModel_1 = __importDefault(require("../../models/userModel"));
const employee_1 = __importDefault(require("../../models/employee"));
const position_1 = __importDefault(require("../../models/position"));
const mainMenuModel_1 = __importDefault(require("../../models/mainMenuModel"));
const loanCredit_1 = require("../../models/loanCredit");
const menuController_1 = require("../menuController");
const notificationController_1 = require("../hr/notificationController");
const glCore_1 = require("../bansi/glCore");
const bansiHelpers_1 = require("../bansi/bansiHelpers");
/**
 * ສົ່ງຄຳຮ້ອງໃຫ້ຜູ້ພິຈາລະນາ (ຕອນສົ່ງພິຈາລະນາ ແລະ ຕອນອະນຸມັດຂັ້ນໜຶ່ງແລ້ວ ສົ່ງຕໍ່ຂັ້ນຕໍ່ໄປ) — 2 ແບບ (ຜູ້ໃຊ້ເລືອກ 2026-11-26):
 *  - ອັດຕະໂນມັດ: ຫົວໜ້າສາຍງານຂອງຜູ້ສົ່ງ (tbl_employee.reports_to_id); ຫົວໜ້າພິຈາລະນາບໍ່ໄດ້ → ຄົນຖັດໄປໃນສາຍງານ
 *  - ເລືອກເອງ: ສະເພາະຄົນທີ່ຕຳແໜ່ງສູງກວ່າຜູ້ສົ່ງ — Level ນ້ອຍກວ່າ (1 = ສູງສຸດ) ຫຼື ຢູ່ເທິງຜູ້ສົ່ງໃນສາຍງານ
 *    (ໃນ Level ດຽວກັນ ຫົວໜ້າ ແລະ ລູກນ້ອງຢູ່ນຳກັນໄດ້); ບັນຊີທີ່ບໍ່ໄດ້ຜູກກັບພະນັກງານ = ຖືວ່າສູງສຸດ
 * ສະເພາະຄົນທີ່ຖືກສົ່ງໃຫ້ພິຈາລະນາຂັ້ນນັ້ນໄດ້; ຜູ້ສົ່ງປ່ຽນຄົນໄດ້, ຄົນທີ່ຖືກສົ່ງໃຫ້ສົ່ງຕໍ່ຂຶ້ນໄປໄດ້ (POST …/route).
 * ທຸກການສົ່ງ = ແຖວ tbl_loan_approval decision 4 (forward_to, forward_mode) ໃຫ້ເຫັນໃນປະຫວັດ
 */
exports.FORWARD = 4;
exports.ROUTE_AUTO = 1;
exports.ROUTE_MANUAL = 2;
const fullName = (e) => [e?.first_name, e?.last_name].filter(Boolean).join(" ") || null;
/** ຜູ້ໃຊ້ທີ່ພິຈາລະນາຄຳຮ້ອງໄດ້: ເປີດໃຊ້, ມີສິດແກ້ໄຂ, ເຂົ້າເມນູ ຄຳຮ້ອງຂໍກູ້ ໄດ້ (menu_access) — ພ້ອມພະນັກງານ / ຕຳແໜ່ງ */
const loadPeople = async (t) => {
    const [menu, users] = await Promise.all([
        mainMenuModel_1.default.findOne({ where: { types: 2, path: "/credit/applications" }, attributes: ["_uuid"], transaction: t }),
        userModel_1.default.findAll({ where: { status: 1 }, attributes: ["user_uuid", "user_name", "menu_access", "employee_id", "updates"], order: [["user_name", "ASC"]], transaction: t }),
    ]);
    const employees = await employee_1.default.findAll({
        attributes: ["_uuid", "first_name", "last_name", "reports_to_id", "position_id", "status"],
        include: [{ model: position_1.default, as: "position", attributes: ["position_name", "level"] }],
        transaction: t,
    });
    const byId = new Map(employees.map((e) => [Number(e._uuid), e]));
    const people = users.map((u) => {
        const e = u.employee_id ? byId.get(Number(u.employee_id)) : undefined;
        const allowed = (0, menuController_1.readMenuAccess)(u.menu_access);
        const pos = e?.position;
        return {
            _uuid: Number(u.user_uuid), name: u.user_name, employee_id: e ? Number(e._uuid) : null, employee: fullName(e),
            position: pos?.position_name ?? null, level: pos?.level === null || pos?.level === undefined ? null : Number(pos.level),
            canDecide: Number(u.updates) === 1 && (!allowed || !menu || allowed.includes(Number(menu._uuid))),
        };
    });
    /** ສາຍງານຂຶ້ນໄປຈາກພະນັກງານຄົນໜຶ່ງ (ບໍ່ລວມຕົນເອງ) — ກັນວົງວຽນ */
    const chainOf = (employeeId) => {
        const chain = [];
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
const excludedFor = async (app, actorId, t) => {
    const ids = new Set([actorId]);
    if (app) {
        ids.add(Number(app.created_by) || 0);
        const approved = await loanCredit_1.LoanApproval.findAll({
            where: { application_id: app._uuid, decision: 1, level: { [sequelize_1.Op.lte]: Number(app.approval_level) } }, attributes: ["approver_id"], transaction: t,
        });
        approved.forEach((a) => ids.add(Number(a.approver_id)));
    }
    return ids;
};
exports.excludedFor = excludedFor;
/** ທາງເລືອກຂອງຜູ້ສົ່ງ (actor): ອັດຕະໂນມັດຈະໄປຫາໃຜ ແລະ ລາຍຊື່ທີ່ເລືອກເອງໄດ້ */
const routeOptions = async (app, actorId, t) => {
    const { people, chainOf } = await loadPeople(t);
    const excluded = await (0, exports.excludedFor)(app, actorId, t);
    const me = people.find((p) => p._uuid === actorId);
    const chain = chainOf(me?.employee_id ?? null);
    const open = people.filter((p) => p.canDecide && !excluded.has(p._uuid));
    const higher = (p) => {
        if (!me?.employee_id)
            return true; // ຜູ້ສົ່ງບໍ່ມີຕຳແໜ່ງ = ສູງສຸດ → ເລືອກໃຜກໍ່ໄດ້
        if (!p.employee_id)
            return true; // ບັນຊີທີ່ບໍ່ມີຕຳແໜ່ງ = ສູງສຸດ
        if (chain.includes(p.employee_id))
            return true;
        return me.level !== null && p.level !== null && p.level < me.level;
    };
    // ອັດຕະໂນມັດ: ຄົນທຳອິດໃນສາຍງານທີ່ພິຈາລະນາໄດ້ (ຂ້າມຫົວໜ້າທີ່ບໍ່ມີບັນຊີ / ບໍ່ມີສິດ)
    let auto = null;
    for (const employeeId of chain) {
        auto = open.find((p) => p.employee_id === employeeId) ?? null;
        if (auto)
            break;
    }
    const strip = ({ _uuid, name, employee, position, level }) => ({ _uuid, name, employee, position, level });
    const manual = open.filter(higher).sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || a.name.localeCompare(b.name));
    return { auto: auto ? strip(auto) : null, manual: manual.map(strip), lineManager: !!chain.length };
};
exports.routeOptions = routeOptions;
/**
 * ຫາຄົນຈາກຄຳສັ່ງ route { mode: "auto" | "manual" | "open", to }. ບໍ່ສົ່ງ route (API ເກົ່າ) = ອັດຕະໂນມັດ ຖ້າມີ,
 * ບໍ່ມີ = ບໍ່ກຳນົດຄົນ (ໃຜທີ່ມີສິດກໍ່ພິຈາລະນາໄດ້ ຄືເກົ່າ); "open" ໄດ້ສະເພາະເມື່ອບໍ່ມີໃຜຕຳແໜ່ງສູງກວ່າຜູ້ສົ່ງ
 */
const resolveRoute = async (route, app, actorId, t) => {
    const options = await (0, exports.routeOptions)(app, actorId, t);
    // ບໍ່ມີໃຜຕຳແໜ່ງສູງກວ່າຜູ້ສົ່ງ (ເຊັ່ນ ຜູ້ອຳນວຍການອະນຸມັດຂັ້ນ 1 ແລ້ວ) → ເປີດໃຫ້ທຸກຄົນທີ່ມີສິດ (ໃຜພິຈາລະນາກ່ອນ = ຜູ້ຮັບ)
    if (route?.mode === "open") {
        if (options.manual.length || options.auto)
            throw new glCore_1.GlError("ມີຜູ້ທີ່ຕຳແໜ່ງສູງກວ່າທ່ານ — ກະລຸນາເລືອກຄົນ ຫຼື ໃຊ້ອັດຕະໂນມັດ");
        return { to: null, mode: null };
    }
    const mode = route?.mode === "manual" ? exports.ROUTE_MANUAL : route?.mode === "auto" ? exports.ROUTE_AUTO : null;
    if (mode === exports.ROUTE_MANUAL) {
        const pick = options.manual.find((p) => p._uuid === Number(route?.to));
        if (!pick)
            throw new glCore_1.GlError("ເລືອກໄດ້ສະເພາະຜູ້ທີ່ມີຕຳແໜ່ງສູງກວ່າທ່ານ ແລະ ມີສິດພິຈາລະນາຄຳຮ້ອງ");
        return { to: pick, mode };
    }
    if (options.auto)
        return { to: options.auto, mode: exports.ROUTE_AUTO };
    if (mode === exports.ROUTE_AUTO)
        throw new glCore_1.GlError("ບໍ່ພົບຫົວໜ້າສາຍງານທີ່ພິຈາລະນາຄຳຮ້ອງໄດ້ — ກະລຸນາເລືອກຜູ້ພິຈາລະນາເອງ");
    return { to: null, mode: null };
};
exports.resolveRoute = resolveRoute;
/** ບັນທຶກການສົ່ງ: ຄຳຮ້ອງລໍຄົນນີ້ ຂັ້ນ level + ແຖວປະຫວັດ (decision 4) */
const assignRoute = async (app, resolved, level, actorId, comment, t) => {
    await app.update({ assigned_to: resolved.to?._uuid ?? null, assigned_by: resolved.to ? actorId : null, assigned_at: resolved.to ? new Date() : null }, { transaction: t });
    if (!resolved.to)
        return;
    await loanCredit_1.LoanApproval.create({
        application_id: app._uuid, level, approver_id: actorId, decision: exports.FORWARD, forward_to: resolved.to._uuid, forward_mode: resolved.mode, comment,
    }, { transaction: t });
};
exports.assignRoute = assignRoute;
/** ແຈ້ງເຕືອນຄົນທີ່ຖືກສົ່ງໃຫ້ (ຖ້າບັນຊີຜູກກັບພະນັກງານ) — ຫຼັງ commit, ບໍ່ໃຫ້ວຽກຫຼັກລໍ */
const notifyAssignee = async (app, level, levels, actorId, extra) => {
    if (!app.assigned_to)
        return;
    try {
        const [user, sender] = await Promise.all([
            userModel_1.default.findByPk(Number(app.assigned_to), { attributes: ["employee_id"] }),
            userModel_1.default.findByPk(actorId, { attributes: ["user_name"] }),
        ]);
        if (!user?.employee_id)
            return;
        await (0, notificationController_1.notify)([{
                employee_id: Number(user.employee_id), type: "credit", push: true, createdbyid: actorId || null, ref: `credit-app:${app._uuid}`,
                title: "ມີຄຳຮ້ອງຂໍກູ້ລໍທ່ານພິຈາລະນາ",
                body: [app.application_no, extra.customer, extra.amount, `ຂັ້ນ ${level}/${levels}`, sender?.user_name ? `ສົ່ງໂດຍ ${sender.user_name}` : null].filter(Boolean).join(" · "),
            }]);
    }
    catch (error) {
        console.error("notifyAssignee", error);
    }
};
exports.notifyAssignee = notifyAssignee;
/** GET /credit/route-options?application_id= — ອັດຕະໂນມັດຈະໄປຫາໃຜ + ລາຍຊື່ທີ່ເລືອກເອງໄດ້ (ສຳລັບຜູ້ໃຊ້ທີ່ login) */
const getRouteOptions = async (req, res) => {
    try {
        const id = Number(req.query.application_id) || 0;
        const app = id ? await loanCredit_1.LoanApplication.findByPk(id) : null;
        if (id && !app)
            throw new glCore_1.GlError("ບໍ່ພົບຄຳຮ້ອງ");
        res.status(200).json({ data: await (0, exports.routeOptions)(app, Number((0, bansiHelpers_1.actorOf)(req)) || 0) });
    }
    catch (error) {
        const known = error instanceof glCore_1.GlError;
        res.status(known ? 400 : 500).json({ message: known ? error.message : "Error getting route options" });
    }
};
exports.getRouteOptions = getRouteOptions;
