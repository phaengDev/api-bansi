"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.autoAssignBosses = exports.setBoss = exports.getMyOrg = exports.getOrgChart = exports.releaseReports = exports.bossError = exports.suggestBoss = exports.buildOrg = void 0;
const department_1 = __importDefault(require("../../models/department"));
const position_1 = __importDefault(require("../../models/position"));
const employee_1 = __importDefault(require("../../models/employee"));
const bansiHelpers_1 = require("../bansi/bansiHelpers");
const hrHelpers_1 = require("./hrHelpers");
const attendanceController_1 = require("./attendanceController");
const workCalendar_1 = require("./workCalendar");
const buildOrg = async () => {
    const today = (0, workCalendar_1.todayLao)();
    const [departments, positions, employees] = await Promise.all([
        department_1.default.findAll({ order: [["sort", "ASC"], ["depart_code", "ASC"]], raw: true }),
        position_1.default.findAll({ attributes: ["_uuid", "position_name", "level", "status"], raw: true }),
        employee_1.default.findAll({
            attributes: ["_uuid", "emp_code", "first_name", "last_name", "gender", "profile", "department_id", "position_id", "reports_to_id", "start_date", "end_date", "work_status"],
            order: [["first_name", "ASC"]],
            raw: true,
        }),
    ]);
    const all = new Map(employees.map((e) => [e._uuid, e]));
    const working = employees.filter((e) => Number(e.work_status) === workCalendar_1.WORKING && (0, workCalendar_1.employedOn)(e, today));
    const workingIds = new Set(working.map((e) => e._uuid));
    /** ຫົວໜ້າທີ່ຍັງເຮັດວຽກຢູ່ທີ່ໃກ້ສຸດ — ຫົວໜ້າລາອອກ = ຂຶ້ນໄປຫາຫົວໜ້າຂອງເຂົາ */
    const bossOf = (e) => {
        const seen = new Set([e._uuid]);
        let id = e.reports_to_id ?? null;
        while (id && !workingIds.has(id)) {
            if (seen.has(id))
                return null;
            seen.add(id);
            id = all.get(id)?.reports_to_id ?? null;
        }
        return id && id !== e._uuid ? id : null;
    };
    const people = working.map((e) => ({
        _uuid: e._uuid,
        emp_code: e.emp_code,
        first_name: e.first_name,
        last_name: e.last_name,
        gender: e.gender,
        profile_url: (0, hrHelpers_1.profileUrl)(e.profile),
        department_id: e.department_id,
        position_id: e.position_id,
        reports_to_id: bossOf(e),
    }));
    // ກັນວົນ (ຂໍ້ມູນເກົ່າ / ແກ້ໃນ DB ໂດຍກົງ) — ຄົນທີ່ຍ່າງຂຶ້ນແລ້ວກັບມາຫາຕົນເອງ ຕັດຫົວໜ້າອອກ
    const up = new Map(people.map((p) => [p._uuid, p]));
    for (const p of people) {
        const seen = new Set();
        for (let n = p; n?.reports_to_id; n = up.get(n.reports_to_id)) {
            if (seen.has(n._uuid)) {
                p.reports_to_id = null;
                break;
            }
            seen.add(n._uuid);
        }
    }
    const usedPositions = new Set(people.map((p) => p.position_id));
    const usedDepts = new Set(people.map((p) => p.department_id));
    return {
        departments: departments
            .filter((d) => Number(d.status) === 1 || usedDepts.has(d._uuid))
            .map((d) => ({ _uuid: d._uuid, depart_code: d.depart_code, depart_name: d.depart_name, sort: d.sort, executive: Number(d.executive) === 1 ? 1 : 0 })),
        positions: positions
            .filter((p) => Number(p.status) === 1 || usedPositions.has(p._uuid))
            .map((p) => ({ _uuid: p._uuid, position_name: p.position_name, level: p.level ?? null })),
        people,
    };
};
exports.buildOrg = buildOrg;
/**
 * ຫົວໜ້າທີ່ແນະນຳ — ຄົນທີ່ລະດັບສູງກວ່າທີ່ໃກ້ສຸດ: ໃນພະແນກດຽວກັນກ່ອນ, ບໍ່ມີ = ຂັ້ນບໍລິຫານ, ບໍ່ມີອີກ = ໃຜກໍ່ໄດ້ທີ່ສູງກວ່າ.
 * ຕົວຢ່າງ: ພະນັກງານ → ຫົວໜ້າພະແນກຂອງຕົນ; ຫົວໜ້າພະແນກ → ຮອງ; ຮອງ → ຜູ້ອຳນວຍການ. ກົດເກນດຽວກັບເວັບ (orgModel.ts suggestBoss)
 */
const suggestBoss = (person, people, levelOf, executive) => {
    const level = levelOf(person.position_id);
    if (!level || level <= 1)
        return null;
    const above = people.filter((p) => p._uuid !== person._uuid && (levelOf(p.position_id) ?? Infinity) < level);
    const closest = (list) => {
        const top = Math.max(...list.map((p) => levelOf(p.position_id)));
        return list.filter((p) => levelOf(p.position_id) === top).sort((a, b) => a._uuid - b._uuid)[0]?._uuid ?? null;
    };
    const same = above.filter((p) => p.department_id === person.department_id);
    if (same.length)
        return closest(same);
    const exec = above.filter((p) => executive.has(p.department_id));
    return above.length ? closest(exec.length ? exec : above) : null;
};
exports.suggestBoss = suggestBoss;
/** ກວດຫົວໜ້າທີ່ເລືອກ — ຕ້ອງເຮັດວຽກຢູ່, ບໍ່ແມ່ນຕົນເອງ, ບໍ່ວົນ (ຫົວໜ້າເປັນລູກທີມຂອງຄົນນີ້) */
const bossError = async (employeeId, bossId, transaction) => {
    if (!bossId)
        return null;
    if (employeeId && bossId === employeeId)
        return "ລາຍງານຕໍ່ຕົນເອງບໍ່ໄດ້";
    const boss = await employee_1.default.findByPk(bossId, { attributes: ["_uuid", "first_name", "work_status"], transaction });
    if (!boss || Number(boss.work_status) !== workCalendar_1.WORKING)
        return "ຫົວໜ້າຕ້ອງເປັນພະນັກງານທີ່ເຮັດວຽກຢູ່";
    if (!employeeId)
        return null;
    const rows = await employee_1.default.findAll({ attributes: ["_uuid", "reports_to_id"], raw: true, transaction });
    const up = new Map(rows.map((r) => [r._uuid, r.reports_to_id]));
    const seen = new Set();
    for (let id = bossId; id; id = up.get(id) ?? null) {
        if (id === employeeId)
            return `ສາຍລາຍງານວົນກັນ — ${boss.first_name} ຢູ່ໃຕ້ຄົນນີ້ແລ້ວ`;
        if (seen.has(id))
            break;
        seen.add(id);
    }
    return null;
};
exports.bossError = bossError;
/** ລາອອກ / ລຶບ → ລູກທີມຂອງຄົນນີ້ ໄປລາຍງານຕໍ່ຫົວໜ້າຂອງເຂົາແທນ (ສາຍບໍ່ຂາດ) */
const releaseReports = async (employeeId, transaction) => {
    const me = await employee_1.default.findByPk(employeeId, { attributes: ["_uuid", "reports_to_id"], transaction });
    const next = me?.reports_to_id && me.reports_to_id !== employeeId ? me.reports_to_id : null;
    await employee_1.default.update({ reports_to_id: next }, { where: { reports_to_id: employeeId }, transaction });
};
exports.releaseReports = releaseReports;
/** GET /org/chart — ຜູ້ໃຊ້ລະບົບ (ໜ້າ HR) */
const getOrgChart = async (_req, res) => {
    try {
        res.status(200).json(await (0, exports.buildOrg)());
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting organization chart");
    }
};
exports.getOrgChart = getOrgChart;
/** GET /org/me — app ພະນັກງານ: ຂໍ້ມູນດຽວກັນ + me_id ເພື່ອໝາຍ "ຂ້ອຍ" */
const getMyOrg = async (req, res) => {
    try {
        const self = await (0, attendanceController_1.selfEmployee)(req);
        if ("code" in self) {
            res.status(self.code).json({ message: self.message });
            return;
        }
        res.status(200).json({ ...(await (0, exports.buildOrg)()), me_id: self.employee._uuid });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting organization chart");
    }
};
exports.getMyOrg = getMyOrg;
/** PUT /org/boss/:id { reports_to_id } — ປ່ຽນຫົວໜ້າຈາກໜ້າໂຄງຮ່າງ (:id = ພະນັກງານ) */
const setBoss = async (req, res) => {
    try {
        const id = Number((0, bansiHelpers_1.decodeId)(req));
        const row = await employee_1.default.findByPk(id, { attributes: ["_uuid", "work_status"] });
        if (!row) {
            res.status(404).json({ message: "ບໍ່ພົບພະນັກງານ" });
            return;
        }
        const bossId = Number(req.body?.reports_to_id) || null;
        const error = await (0, exports.bossError)(id, bossId);
        if (error) {
            res.status(400).json({ message: error });
            return;
        }
        await employee_1.default.update({ reports_to_id: bossId, updatedAt: new Date() }, { where: { _uuid: id } });
        res.status(200).json({ message: "Successfully updated boss", data: await (0, exports.buildOrg)() });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error updating boss");
    }
};
exports.setBoss = setBoss;
/**
 * POST /org/auto-boss — ໃສ່ຫົວໜ້າທີ່ແນະນຳໃຫ້ທຸກຄົນທີ່ຍັງບໍ່ມີຫົວໜ້າ (ຕາມລະດັບຂອງຕຳແໜ່ງ).
 * ບໍ່ແຕະຄົນທີ່ມີຫົວໜ້າແລ້ວ; ຂ້າມຄົນທີ່ຕຳແໜ່ງຍັງບໍ່ກຳນົດລະດັບ
 */
const autoAssignBosses = async (_req, res) => {
    const t = await employee_1.default.sequelize.transaction();
    try {
        const org = await (0, exports.buildOrg)();
        const levels = new Map(org.positions.map((p) => [p._uuid, p.level]));
        const levelOf = (id) => (id ? levels.get(id) ?? null : null);
        const executive = new Set(org.departments.filter((d) => d.executive === 1).map((d) => d._uuid));
        const boss = new Map(org.people.map((p) => [p._uuid, p.reports_to_id]));
        const climbsTo = (from, target) => {
            const seen = new Set();
            for (let id = from; id; id = boss.get(id) ?? null) {
                if (id === target)
                    return true;
                if (seen.has(id))
                    return false;
                seen.add(id);
            }
            return false;
        };
        let updated = 0;
        for (const person of org.people) {
            if (person.reports_to_id)
                continue;
            const pick = (0, exports.suggestBoss)(person, org.people, levelOf, executive);
            if (!pick || climbsTo(pick, person._uuid))
                continue;
            boss.set(person._uuid, pick);
            await employee_1.default.update({ reports_to_id: pick, updatedAt: new Date() }, { where: { _uuid: person._uuid }, transaction: t });
            updated++;
        }
        await t.commit();
        res.status(200).json({ message: "Successfully assigned bosses", updated, data: await (0, exports.buildOrg)() });
    }
    catch (error) {
        await t.rollback();
        (0, bansiHelpers_1.sendError)(res, error, "Error assigning bosses");
    }
};
exports.autoAssignBosses = autoAssignBosses;
