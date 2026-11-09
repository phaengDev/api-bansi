import { Request, Response } from "express";
import { Transaction } from "sequelize";
import Department from "../../models/department";
import Position from "../../models/position";
import Employee from "../../models/employee";
import { decodeId, sendError } from "../bansi/bansiHelpers";
import { profileUrl } from "./hrHelpers";
import { selfEmployee } from "./attendanceController";
import { WORKING, employedOn, todayLao } from "./workCalendar";

/**
 * ໂຄງຮ່າງການຈັດຕັ້ງ — ຫົວໜ້າສາຍງານຂອງແຕ່ລະຄົນ: tbl_employee.reports_to_id (ເລືອກຢູ່ຟອມພະນັກງານ).
 * ຕຳແໜ່ງເປັນລາຍຊື່ກາງມີ Level 1, 2, 3… (1 = ສູງສຸດ, ບໍ່ຈຳກັດຂັ້ນ) — ໃຊ້ແນະນຳຫົວໜ້າສາຍງານ.
 * ພະແນກ executive = ຂັ້ນບໍລິຫານ (ຢູ່ເທິງສຸດ, ບໍ່ນັບເປັນພະແນກ).
 * ຂໍ້ມູນດຽວກັນໃຫ້ເວັບ (GET /org/chart) ແລະ app ພະນັກງານ (GET /org/me) — ບໍ່ມີເງິນເດືອນ, ເບີໂທ ຫຼື ຂໍ້ມູນສ່ວນຕົວອື່ນ
 */

type Person = {
  _uuid: number;
  emp_code: string;
  first_name: string;
  last_name: string | null;
  gender: number;
  profile_url: string | null;
  department_id: number;
  position_id: number | null;
  reports_to_id: number | null;
};

export const buildOrg = async () => {
  const today = todayLao();
  const [departments, positions, employees] = await Promise.all([
    Department.findAll({ order: [["sort", "ASC"], ["depart_code", "ASC"]], raw: true }),
    Position.findAll({ attributes: ["_uuid", "position_name", "level", "status"], raw: true }),
    Employee.findAll({
      attributes: ["_uuid", "emp_code", "first_name", "last_name", "gender", "profile", "department_id", "position_id", "reports_to_id", "start_date", "end_date", "work_status"],
      order: [["first_name", "ASC"]],
      raw: true,
    }),
  ]);
  const all = new Map((employees as any[]).map((e) => [e._uuid, e]));
  const working = (employees as any[]).filter((e) => Number(e.work_status) === WORKING && employedOn(e, today));
  const workingIds = new Set(working.map((e) => e._uuid));

  /** ຫົວໜ້າທີ່ຍັງເຮັດວຽກຢູ່ທີ່ໃກ້ສຸດ — ຫົວໜ້າລາອອກ = ຂຶ້ນໄປຫາຫົວໜ້າຂອງເຂົາ */
  const bossOf = (e: any): number | null => {
    const seen = new Set<number>([e._uuid]);
    let id: number | null = e.reports_to_id ?? null;
    while (id && !workingIds.has(id)) {
      if (seen.has(id)) return null;
      seen.add(id);
      id = all.get(id)?.reports_to_id ?? null;
    }
    return id && id !== e._uuid ? id : null;
  };
  const people: Person[] = working.map((e) => ({
    _uuid: e._uuid,
    emp_code: e.emp_code,
    first_name: e.first_name,
    last_name: e.last_name,
    gender: e.gender,
    profile_url: profileUrl(e.profile),
    department_id: e.department_id,
    position_id: e.position_id,
    reports_to_id: bossOf(e),
  }));
  // ກັນວົນ (ຂໍ້ມູນເກົ່າ / ແກ້ໃນ DB ໂດຍກົງ) — ຄົນທີ່ຍ່າງຂຶ້ນແລ້ວກັບມາຫາຕົນເອງ ຕັດຫົວໜ້າອອກ
  const up = new Map(people.map((p) => [p._uuid, p]));
  for (const p of people) {
    const seen = new Set<number>();
    for (let n: Person | undefined = p; n?.reports_to_id; n = up.get(n.reports_to_id)) {
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
    departments: (departments as any[])
      .filter((d) => Number(d.status) === 1 || usedDepts.has(d._uuid))
      .map((d) => ({ _uuid: d._uuid, depart_code: d.depart_code, depart_name: d.depart_name, sort: d.sort, executive: Number(d.executive) === 1 ? 1 : 0 })),
    positions: (positions as any[])
      .filter((p) => Number(p.status) === 1 || usedPositions.has(p._uuid))
      .map((p) => ({ _uuid: p._uuid, position_name: p.position_name, level: p.level ?? null })),
    people,
  };
};

/**
 * ຫົວໜ້າທີ່ແນະນຳ — ຄົນທີ່ລະດັບສູງກວ່າທີ່ໃກ້ສຸດ: ໃນພະແນກດຽວກັນກ່ອນ, ບໍ່ມີ = ຂັ້ນບໍລິຫານ, ບໍ່ມີອີກ = ໃຜກໍ່ໄດ້ທີ່ສູງກວ່າ.
 * ຕົວຢ່າງ: ພະນັກງານ → ຫົວໜ້າພະແນກຂອງຕົນ; ຫົວໜ້າພະແນກ → ຮອງ; ຮອງ → ຜູ້ອຳນວຍການ. ກົດເກນດຽວກັບເວັບ (orgModel.ts suggestBoss)
 */
export const suggestBoss = (
  person: Pick<Person, "_uuid" | "department_id" | "position_id">,
  people: Pick<Person, "_uuid" | "department_id" | "position_id">[],
  levelOf: (positionId: number | null) => number | null,
  executive: Set<number>,
): number | null => {
  const level = levelOf(person.position_id);
  if (!level || level <= 1) return null;
  const above = people.filter((p) => p._uuid !== person._uuid && (levelOf(p.position_id) ?? Infinity) < level);
  const closest = (list: typeof above) => {
    const top = Math.max(...list.map((p) => levelOf(p.position_id)!));
    return list.filter((p) => levelOf(p.position_id) === top).sort((a, b) => a._uuid - b._uuid)[0]?._uuid ?? null;
  };
  const same = above.filter((p) => p.department_id === person.department_id);
  if (same.length) return closest(same);
  const exec = above.filter((p) => executive.has(p.department_id));
  return above.length ? closest(exec.length ? exec : above) : null;
};

/** ກວດຫົວໜ້າທີ່ເລືອກ — ຕ້ອງເຮັດວຽກຢູ່, ບໍ່ແມ່ນຕົນເອງ, ບໍ່ວົນ (ຫົວໜ້າເປັນລູກທີມຂອງຄົນນີ້) */
export const bossError = async (employeeId: number | null, bossId: number | null, transaction?: Transaction): Promise<string | null> => {
  if (!bossId) return null;
  if (employeeId && bossId === employeeId) return "ລາຍງານຕໍ່ຕົນເອງບໍ່ໄດ້";
  const boss: any = await Employee.findByPk(bossId, { attributes: ["_uuid", "first_name", "work_status"], transaction });
  if (!boss || Number(boss.work_status) !== WORKING) return "ຫົວໜ້າຕ້ອງເປັນພະນັກງານທີ່ເຮັດວຽກຢູ່";
  if (!employeeId) return null;
  const rows: any[] = await Employee.findAll({ attributes: ["_uuid", "reports_to_id"], raw: true, transaction });
  const up = new Map(rows.map((r) => [r._uuid, r.reports_to_id]));
  const seen = new Set<number>();
  for (let id: number | null = bossId; id; id = up.get(id) ?? null) {
    if (id === employeeId) return `ສາຍລາຍງານວົນກັນ — ${boss.first_name} ຢູ່ໃຕ້ຄົນນີ້ແລ້ວ`;
    if (seen.has(id)) break;
    seen.add(id);
  }
  return null;
};

/** ລາອອກ / ລຶບ → ລູກທີມຂອງຄົນນີ້ ໄປລາຍງານຕໍ່ຫົວໜ້າຂອງເຂົາແທນ (ສາຍບໍ່ຂາດ) */
export const releaseReports = async (employeeId: number, transaction?: Transaction) => {
  const me: any = await Employee.findByPk(employeeId, { attributes: ["_uuid", "reports_to_id"], transaction });
  const next = me?.reports_to_id && me.reports_to_id !== employeeId ? me.reports_to_id : null;
  await Employee.update({ reports_to_id: next } as any, { where: { reports_to_id: employeeId }, transaction });
};

/** GET /org/chart — ຜູ້ໃຊ້ລະບົບ (ໜ້າ HR) */
export const getOrgChart = async (_req: Request, res: Response) => {
  try {
    res.status(200).json(await buildOrg());
  } catch (error) {
    sendError(res, error, "Error getting organization chart");
  }
};

/** GET /org/me — app ພະນັກງານ: ຂໍ້ມູນດຽວກັນ + me_id ເພື່ອໝາຍ "ຂ້ອຍ" */
export const getMyOrg = async (req: Request, res: Response) => {
  try {
    const self = await selfEmployee(req);
    if ("code" in self) {
      res.status(self.code).json({ message: self.message });
      return;
    }
    res.status(200).json({ ...(await buildOrg()), me_id: self.employee._uuid });
  } catch (error) {
    sendError(res, error, "Error getting organization chart");
  }
};

/** PUT /org/boss/:id { reports_to_id } — ປ່ຽນຫົວໜ້າຈາກໜ້າໂຄງຮ່າງ (:id = ພະນັກງານ) */
export const setBoss = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const id = Number(decodeId(req));
    const row = await Employee.findByPk(id, { attributes: ["_uuid", "work_status"] });
    if (!row) {
      res.status(404).json({ message: "ບໍ່ພົບພະນັກງານ" });
      return;
    }
    const bossId = Number(req.body?.reports_to_id) || null;
    const error = await bossError(id, bossId);
    if (error) {
      res.status(400).json({ message: error });
      return;
    }
    await Employee.update({ reports_to_id: bossId, updatedAt: new Date() } as any, { where: { _uuid: id } });
    res.status(200).json({ message: "Successfully updated boss", data: await buildOrg() });
  } catch (error) {
    sendError(res, error, "Error updating boss");
  }
};

/**
 * POST /org/auto-boss — ໃສ່ຫົວໜ້າທີ່ແນະນຳໃຫ້ທຸກຄົນທີ່ຍັງບໍ່ມີຫົວໜ້າ (ຕາມລະດັບຂອງຕຳແໜ່ງ).
 * ບໍ່ແຕະຄົນທີ່ມີຫົວໜ້າແລ້ວ; ຂ້າມຄົນທີ່ຕຳແໜ່ງຍັງບໍ່ກຳນົດລະດັບ
 */
export const autoAssignBosses = async (_req: Request, res: Response) => {
  const t = await Employee.sequelize!.transaction();
  try {
    const org = await buildOrg();
    const levels = new Map(org.positions.map((p) => [p._uuid, p.level]));
    const levelOf = (id: number | null) => (id ? levels.get(id) ?? null : null);
    const executive = new Set(org.departments.filter((d) => d.executive === 1).map((d) => d._uuid));
    const boss = new Map(org.people.map((p) => [p._uuid, p.reports_to_id]));
    const climbsTo = (from: number | null, target: number) => {
      const seen = new Set<number>();
      for (let id = from; id; id = boss.get(id) ?? null) {
        if (id === target) return true;
        if (seen.has(id)) return false;
        seen.add(id);
      }
      return false;
    };
    let updated = 0;
    for (const person of org.people) {
      if (person.reports_to_id) continue;
      const pick = suggestBoss(person, org.people, levelOf, executive);
      if (!pick || climbsTo(pick, person._uuid)) continue;
      boss.set(person._uuid, pick);
      await Employee.update({ reports_to_id: pick, updatedAt: new Date() } as any, { where: { _uuid: person._uuid }, transaction: t });
      updated++;
    }
    await t.commit();
    res.status(200).json({ message: "Successfully assigned bosses", updated, data: await buildOrg() });
  } catch (error) {
    await t.rollback();
    sendError(res, error, "Error assigning bosses");
  }
};
