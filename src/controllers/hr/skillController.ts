import { Request, Response } from "express";
import { Op } from "sequelize";
import Employee from "../../models/employee";
import { EmployeeSkill, Skill, SkillType } from "../../models/skill";
import { decodeId, sendError } from "../bansi/bansiHelpers";
import { findFull } from "./employeeController";

/**
 * ທັກສະ — ໝວດ (ມີລະດັບຂອງໝວດ ຈາກຕ່ຳຫາສູງ) → ທັກສະ. HR ເພີ່ມ/ແກ້/ປິດເອງໄດ້;
 * ທັກສະຂອງພະນັກງານບັນທຶກຄືນທັງໝົດ (PUT /employee/skills/:id)
 */

const DEFAULTS: { name: string; levels: string[]; skills: string[] }[] = [
  { name: "ພາສາ", levels: ["A1", "A2", "B1", "B2", "C1", "C2"], skills: ["ລາວ", "ອັງກິດ", "ໄທ", "ຈີນ", "ຫວຽດນາມ"] },
  { name: "ຄອມພິວເຕີ", levels: ["ພື້ນຖານ", "ປານກາງ", "ດີ", "ຊ່ຽວຊານ"], skills: ["Word", "Excel", "PowerPoint"] },
  { name: "Soft skills", levels: ["ພື້ນຖານ", "ປານກາງ", "ດີ", "ຊ່ຽວຊານ"], skills: ["ການສື່ສານ", "ການເຮັດວຽກເປັນທີມ", "ການແກ້ໄຂບັນຫາ", "ການນຳພາ"] },
];

/** ຕອນເປີດ server: ຍັງບໍ່ມີໝວດທັກສະຈັກອັນ = ໃສ່ຄ່າເລີ່ມຕົ້ນ */
export const seedSkills = async () => {
  if (await SkillType.count()) return;
  for (const [i, d] of DEFAULTS.entries()) {
    const type = await SkillType.create({ name: d.name, levels: JSON.stringify(d.levels), sort: i + 1, status: 1 });
    await Skill.bulkCreate(d.skills.map((name, j) => ({ type_id: type._uuid, name, sort: j + 1, status: 1 })));
  }
  console.log(`🌱 tbl_skill_type: ${DEFAULTS.length} types`);
};

export const levelsOf = (raw: unknown): string[] => {
  try {
    const list = JSON.parse(String(raw ?? "[]"));
    return Array.isArray(list) ? list.map((x) => String(x)).filter(Boolean) : [];
  } catch {
    return [];
  }
};

const parseLevels = (raw: unknown) => {
  const list = (Array.isArray(raw) ? raw : String(raw ?? "").split(","))
    .map((x) => String(x).trim().slice(0, 50))
    .filter(Boolean);
  return [...new Set(list)].slice(0, 20);
};

/** GET /skill/fetch — ໝວດ + ທັກສະ + ຈຳນວນພະນັກງານທີ່ມີທັກສະນັ້ນ */
export const getSkills = async (_req: Request, res: Response) => {
  try {
    const [types, used] = await Promise.all([
      SkillType.findAll({
        include: [{ model: Skill, as: "skills" }],
        order: [["sort", "ASC"], ["_uuid", "ASC"], [{ model: Skill, as: "skills" }, "sort", "ASC"], [{ model: Skill, as: "skills" }, "_uuid", "ASC"]],
      }),
      EmployeeSkill.findAll({ attributes: ["skill_id"], raw: true }),
    ]);
    const count = new Map<number, number>();
    for (const u of used as any[]) count.set(u.skill_id, (count.get(u.skill_id) ?? 0) + 1);
    const data = types.map((row) => {
      const t: any = row.get({ plain: true });
      return { ...t, levels: levelsOf(t.levels), skills: (t.skills ?? []).map((s: any) => ({ ...s, employees: count.get(s._uuid) ?? 0 })) };
    });
    res.status(200).json({ data });
  } catch (error) {
    sendError(res, error, "Error getting skills");
  }
};

/** POST /skill-type/create { name, levels[] } · PUT /skill-type/:id { name?, levels?, status?, sort? } */
export const saveSkillType = async (req: Request<{ id?: string }>, res: Response) => {
  try {
    const body = req.body || {};
    const row = req.params.id ? await SkillType.findByPk(Number(decodeId(req as Request<{ id: string }>))) : null;
    if (req.params.id && !row) {
      res.status(404).json({ message: "ບໍ່ພົບໝວດທັກສະ" });
      return;
    }
    const patch: Record<string, unknown> = {};
    if (body.name !== undefined || !row) {
      const name = String(body.name ?? "").trim().slice(0, 100);
      if (!name) {
        res.status(400).json({ message: "ກະລຸນາປ້ອນຊື່ໝວດ" });
        return;
      }
      patch.name = name;
    }
    if (body.levels !== undefined || !row) {
      const levels = parseLevels(body.levels);
      if (!levels.length) {
        res.status(400).json({ message: "ກະລຸນາປ້ອນລະດັບຢ່າງໜ້ອຍ 1 ລະດັບ" });
        return;
      }
      patch.levels = JSON.stringify(levels);
    }
    if (body.sort !== undefined) patch.sort = Number(body.sort) || 0;
    if (body.status !== undefined) patch.status = Number(body.status) === 0 ? 0 : 1;
    const saved = row
      ? await row.update({ ...patch, updatedAt: new Date() })
      : await SkillType.create({ ...patch, sort: Number(body.sort) || (await SkillType.count()) + 1, status: 1 });
    res.status(200).json({ message: "Successfully saved skill type", data: { ...saved.get({ plain: true }), levels: levelsOf(saved.levels) } });
  } catch (error) {
    sendError(res, error, "Error saving skill type");
  }
};

/** DELETE /skill-type/:id — ລຶບພ້ອມທັກສະໃນໝວດ ຖ້າບໍ່ມີພະນັກງານໃຊ້ */
export const deleteSkillType = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const row = await SkillType.findByPk(Number(decodeId(req)));
    if (!row) {
      res.status(404).json({ message: "ບໍ່ພົບໝວດທັກສະ" });
      return;
    }
    const skillIds = (await Skill.findAll({ where: { type_id: row._uuid }, attributes: ["_uuid"], raw: true })).map((s: any) => s._uuid);
    const used = skillIds.length ? await EmployeeSkill.count({ where: { skill_id: { [Op.in]: skillIds } } }) : 0;
    if (used) {
      res.status(400).json({ message: `ລຶບບໍ່ໄດ້ — ພະນັກງານມີທັກສະໃນໝວດນີ້ ${used} ລາຍການ (ປິດໃຊ້ງານແທນ)` });
      return;
    }
    await Skill.destroy({ where: { type_id: row._uuid } });
    await row.destroy();
    res.status(200).json({ message: "Successfully deleted skill type" });
  } catch (error) {
    sendError(res, error, "Error deleting skill type");
  }
};

/** POST /skill/create { type_id, name } · PUT /skill/:id { name?, status?, sort? } */
export const saveSkill = async (req: Request<{ id?: string }>, res: Response) => {
  try {
    const body = req.body || {};
    const row = req.params.id ? await Skill.findByPk(Number(decodeId(req as Request<{ id: string }>))) : null;
    if (req.params.id && !row) {
      res.status(404).json({ message: "ບໍ່ພົບທັກສະ" });
      return;
    }
    const typeId = row ? row.type_id : Number(body.type_id);
    if (!row && !(await SkillType.count({ where: { _uuid: typeId } }))) {
      res.status(400).json({ message: "ກະລຸນາເລືອກໝວດທັກສະ" });
      return;
    }
    const patch: Record<string, unknown> = {};
    if (body.name !== undefined || !row) {
      const name = String(body.name ?? "").trim().slice(0, 100);
      if (!name) {
        res.status(400).json({ message: "ກະລຸນາປ້ອນຊື່ທັກສະ" });
        return;
      }
      if (await Skill.count({ where: { type_id: typeId, name, ...(row ? { _uuid: { [Op.ne]: row._uuid } } : {}) } })) {
        res.status(400).json({ message: `"${name}" ມີແລ້ວໃນໝວດນີ້` });
        return;
      }
      patch.name = name;
    }
    if (body.sort !== undefined) patch.sort = Number(body.sort) || 0;
    if (body.status !== undefined) patch.status = Number(body.status) === 0 ? 0 : 1;
    const saved = row
      ? await row.update({ ...patch, updatedAt: new Date() })
      : await Skill.create({ ...patch, type_id: typeId, sort: (await Skill.count({ where: { type_id: typeId } })) + 1, status: 1 });
    res.status(200).json({ message: "Successfully saved skill", data: saved });
  } catch (error) {
    sendError(res, error, "Error saving skill");
  }
};

/** DELETE /skill/:id — ສະເພາະທັກສະທີ່ບໍ່ມີພະນັກງານໃຊ້ */
export const deleteSkill = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const row = await Skill.findByPk(Number(decodeId(req)));
    if (!row) {
      res.status(404).json({ message: "ບໍ່ພົບທັກສະ" });
      return;
    }
    const used = await EmployeeSkill.count({ where: { skill_id: row._uuid } });
    if (used) {
      res.status(400).json({ message: `ລຶບບໍ່ໄດ້ — ມີພະນັກງານ ${used} ຄົນ (ປິດໃຊ້ງານແທນ)` });
      return;
    }
    await row.destroy();
    res.status(200).json({ message: "Successfully deleted skill" });
  } catch (error) {
    sendError(res, error, "Error deleting skill");
  }
};

/**
 * PUT /employee/skills/:id { skills: [{ skill_id, level }] } — ບັນທຶກທັກສະຂອງພະນັກງານຄືນທັງໝົດ.
 * ລະດັບຕ້ອງຢູ່ໃນລະດັບຂອງໝວດ (ບໍ່ສົ່ງ = ບໍ່ລະບຸ); ທັກສະຊ້ຳ ເອົາອັນສຸດທ້າຍ
 */
export const setEmployeeSkills = async (req: Request<{ id: string }>, res: Response) => {
  const t = await Employee.sequelize!.transaction();
  try {
    const employee = await Employee.findByPk(Number(decodeId(req)), { attributes: ["_uuid"], transaction: t });
    if (!employee) {
      await t.rollback();
      res.status(404).json({ message: "ບໍ່ພົບພະນັກງານ" });
      return;
    }
    const raw = Array.isArray(req.body?.skills) ? req.body.skills : [];
    const wanted = new Map<number, string | null>();
    for (const item of raw) {
      const id = Number(item?.skill_id);
      if (id > 0) wanted.set(id, item?.level ? String(item.level).slice(0, 50) : null);
    }
    const skills = wanted.size
      ? await Skill.findAll({ where: { _uuid: { [Op.in]: [...wanted.keys()] } }, include: [{ model: SkillType, as: "type" }], transaction: t })
      : [];
    if (skills.length !== wanted.size) {
      await t.rollback();
      res.status(400).json({ message: "ມີທັກສະທີ່ບໍ່ພົບ" });
      return;
    }
    for (const s of skills as any[]) {
      const level = wanted.get(s._uuid);
      if (level && !levelsOf(s.type?.levels).includes(level)) {
        await t.rollback();
        res.status(400).json({ message: `ລະດັບ "${level}" ບໍ່ມີໃນໝວດ ${s.type?.name}` });
        return;
      }
    }
    await EmployeeSkill.destroy({ where: { employee_id: employee._uuid }, transaction: t });
    await EmployeeSkill.bulkCreate([...wanted].map(([skill_id, level]) => ({ employee_id: employee._uuid, skill_id, level })), { transaction: t });
    await t.commit();
    res.status(200).json({ message: "Successfully saved employee skills", data: await findFull(employee._uuid) });
  } catch (error) {
    await t.rollback();
    sendError(res, error, "Error saving employee skills");
  }
};
