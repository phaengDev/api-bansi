"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setEmployeeSkills = exports.deleteSkill = exports.saveSkill = exports.deleteSkillType = exports.saveSkillType = exports.getSkills = exports.levelsOf = exports.seedSkills = void 0;
const sequelize_1 = require("sequelize");
const employee_1 = __importDefault(require("../../models/employee"));
const skill_1 = require("../../models/skill");
const bansiHelpers_1 = require("../bansi/bansiHelpers");
const employeeController_1 = require("./employeeController");
/**
 * ທັກສະ — ໝວດ (ມີລະດັບຂອງໝວດ ຈາກຕ່ຳຫາສູງ) → ທັກສະ. HR ເພີ່ມ/ແກ້/ປິດເອງໄດ້;
 * ທັກສະຂອງພະນັກງານບັນທຶກຄືນທັງໝົດ (PUT /employee/skills/:id)
 */
const DEFAULTS = [
    { name: "ພາສາ", levels: ["A1", "A2", "B1", "B2", "C1", "C2"], skills: ["ລາວ", "ອັງກິດ", "ໄທ", "ຈີນ", "ຫວຽດນາມ"] },
    { name: "ຄອມພິວເຕີ", levels: ["ພື້ນຖານ", "ປານກາງ", "ດີ", "ຊ່ຽວຊານ"], skills: ["Word", "Excel", "PowerPoint"] },
    { name: "Soft skills", levels: ["ພື້ນຖານ", "ປານກາງ", "ດີ", "ຊ່ຽວຊານ"], skills: ["ການສື່ສານ", "ການເຮັດວຽກເປັນທີມ", "ການແກ້ໄຂບັນຫາ", "ການນຳພາ"] },
];
/** ຕອນເປີດ server: ຍັງບໍ່ມີໝວດທັກສະຈັກອັນ = ໃສ່ຄ່າເລີ່ມຕົ້ນ */
const seedSkills = async () => {
    if (await skill_1.SkillType.count())
        return;
    for (const [i, d] of DEFAULTS.entries()) {
        const type = await skill_1.SkillType.create({ name: d.name, levels: JSON.stringify(d.levels), sort: i + 1, status: 1 });
        await skill_1.Skill.bulkCreate(d.skills.map((name, j) => ({ type_id: type._uuid, name, sort: j + 1, status: 1 })));
    }
    console.log(`🌱 tbl_skill_type: ${DEFAULTS.length} types`);
};
exports.seedSkills = seedSkills;
const levelsOf = (raw) => {
    try {
        const list = JSON.parse(String(raw ?? "[]"));
        return Array.isArray(list) ? list.map((x) => String(x)).filter(Boolean) : [];
    }
    catch {
        return [];
    }
};
exports.levelsOf = levelsOf;
const parseLevels = (raw) => {
    const list = (Array.isArray(raw) ? raw : String(raw ?? "").split(","))
        .map((x) => String(x).trim().slice(0, 50))
        .filter(Boolean);
    return [...new Set(list)].slice(0, 20);
};
/** GET /skill/fetch — ໝວດ + ທັກສະ + ຈຳນວນພະນັກງານທີ່ມີທັກສະນັ້ນ */
const getSkills = async (_req, res) => {
    try {
        const [types, used] = await Promise.all([
            skill_1.SkillType.findAll({
                include: [{ model: skill_1.Skill, as: "skills" }],
                order: [["sort", "ASC"], ["_uuid", "ASC"], [{ model: skill_1.Skill, as: "skills" }, "sort", "ASC"], [{ model: skill_1.Skill, as: "skills" }, "_uuid", "ASC"]],
            }),
            skill_1.EmployeeSkill.findAll({ attributes: ["skill_id"], raw: true }),
        ]);
        const count = new Map();
        for (const u of used)
            count.set(u.skill_id, (count.get(u.skill_id) ?? 0) + 1);
        const data = types.map((row) => {
            const t = row.get({ plain: true });
            return { ...t, levels: (0, exports.levelsOf)(t.levels), skills: (t.skills ?? []).map((s) => ({ ...s, employees: count.get(s._uuid) ?? 0 })) };
        });
        res.status(200).json({ data });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting skills");
    }
};
exports.getSkills = getSkills;
/** POST /skill-type/create { name, levels[] } · PUT /skill-type/:id { name?, levels?, status?, sort? } */
const saveSkillType = async (req, res) => {
    try {
        const body = req.body || {};
        const row = req.params.id ? await skill_1.SkillType.findByPk(Number((0, bansiHelpers_1.decodeId)(req))) : null;
        if (req.params.id && !row) {
            res.status(404).json({ message: "ບໍ່ພົບໝວດທັກສະ" });
            return;
        }
        const patch = {};
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
        if (body.sort !== undefined)
            patch.sort = Number(body.sort) || 0;
        if (body.status !== undefined)
            patch.status = Number(body.status) === 0 ? 0 : 1;
        const saved = row
            ? await row.update({ ...patch, updatedAt: new Date() })
            : await skill_1.SkillType.create({ ...patch, sort: Number(body.sort) || (await skill_1.SkillType.count()) + 1, status: 1 });
        res.status(200).json({ message: "Successfully saved skill type", data: { ...saved.get({ plain: true }), levels: (0, exports.levelsOf)(saved.levels) } });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error saving skill type");
    }
};
exports.saveSkillType = saveSkillType;
/** DELETE /skill-type/:id — ລຶບພ້ອມທັກສະໃນໝວດ ຖ້າບໍ່ມີພະນັກງານໃຊ້ */
const deleteSkillType = async (req, res) => {
    try {
        const row = await skill_1.SkillType.findByPk(Number((0, bansiHelpers_1.decodeId)(req)));
        if (!row) {
            res.status(404).json({ message: "ບໍ່ພົບໝວດທັກສະ" });
            return;
        }
        const skillIds = (await skill_1.Skill.findAll({ where: { type_id: row._uuid }, attributes: ["_uuid"], raw: true })).map((s) => s._uuid);
        const used = skillIds.length ? await skill_1.EmployeeSkill.count({ where: { skill_id: { [sequelize_1.Op.in]: skillIds } } }) : 0;
        if (used) {
            res.status(400).json({ message: `ລຶບບໍ່ໄດ້ — ພະນັກງານມີທັກສະໃນໝວດນີ້ ${used} ລາຍການ (ປິດໃຊ້ງານແທນ)` });
            return;
        }
        await skill_1.Skill.destroy({ where: { type_id: row._uuid } });
        await row.destroy();
        res.status(200).json({ message: "Successfully deleted skill type" });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error deleting skill type");
    }
};
exports.deleteSkillType = deleteSkillType;
/** POST /skill/create { type_id, name } · PUT /skill/:id { name?, status?, sort? } */
const saveSkill = async (req, res) => {
    try {
        const body = req.body || {};
        const row = req.params.id ? await skill_1.Skill.findByPk(Number((0, bansiHelpers_1.decodeId)(req))) : null;
        if (req.params.id && !row) {
            res.status(404).json({ message: "ບໍ່ພົບທັກສະ" });
            return;
        }
        const typeId = row ? row.type_id : Number(body.type_id);
        if (!row && !(await skill_1.SkillType.count({ where: { _uuid: typeId } }))) {
            res.status(400).json({ message: "ກະລຸນາເລືອກໝວດທັກສະ" });
            return;
        }
        const patch = {};
        if (body.name !== undefined || !row) {
            const name = String(body.name ?? "").trim().slice(0, 100);
            if (!name) {
                res.status(400).json({ message: "ກະລຸນາປ້ອນຊື່ທັກສະ" });
                return;
            }
            if (await skill_1.Skill.count({ where: { type_id: typeId, name, ...(row ? { _uuid: { [sequelize_1.Op.ne]: row._uuid } } : {}) } })) {
                res.status(400).json({ message: `"${name}" ມີແລ້ວໃນໝວດນີ້` });
                return;
            }
            patch.name = name;
        }
        if (body.sort !== undefined)
            patch.sort = Number(body.sort) || 0;
        if (body.status !== undefined)
            patch.status = Number(body.status) === 0 ? 0 : 1;
        const saved = row
            ? await row.update({ ...patch, updatedAt: new Date() })
            : await skill_1.Skill.create({ ...patch, type_id: typeId, sort: (await skill_1.Skill.count({ where: { type_id: typeId } })) + 1, status: 1 });
        res.status(200).json({ message: "Successfully saved skill", data: saved });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error saving skill");
    }
};
exports.saveSkill = saveSkill;
/** DELETE /skill/:id — ສະເພາະທັກສະທີ່ບໍ່ມີພະນັກງານໃຊ້ */
const deleteSkill = async (req, res) => {
    try {
        const row = await skill_1.Skill.findByPk(Number((0, bansiHelpers_1.decodeId)(req)));
        if (!row) {
            res.status(404).json({ message: "ບໍ່ພົບທັກສະ" });
            return;
        }
        const used = await skill_1.EmployeeSkill.count({ where: { skill_id: row._uuid } });
        if (used) {
            res.status(400).json({ message: `ລຶບບໍ່ໄດ້ — ມີພະນັກງານ ${used} ຄົນ (ປິດໃຊ້ງານແທນ)` });
            return;
        }
        await row.destroy();
        res.status(200).json({ message: "Successfully deleted skill" });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error deleting skill");
    }
};
exports.deleteSkill = deleteSkill;
/**
 * PUT /employee/skills/:id { skills: [{ skill_id, level }] } — ບັນທຶກທັກສະຂອງພະນັກງານຄືນທັງໝົດ.
 * ລະດັບຕ້ອງຢູ່ໃນລະດັບຂອງໝວດ (ບໍ່ສົ່ງ = ບໍ່ລະບຸ); ທັກສະຊ້ຳ ເອົາອັນສຸດທ້າຍ
 */
const setEmployeeSkills = async (req, res) => {
    const t = await employee_1.default.sequelize.transaction();
    try {
        const employee = await employee_1.default.findByPk(Number((0, bansiHelpers_1.decodeId)(req)), { attributes: ["_uuid"], transaction: t });
        if (!employee) {
            await t.rollback();
            res.status(404).json({ message: "ບໍ່ພົບພະນັກງານ" });
            return;
        }
        const raw = Array.isArray(req.body?.skills) ? req.body.skills : [];
        const wanted = new Map();
        for (const item of raw) {
            const id = Number(item?.skill_id);
            if (id > 0)
                wanted.set(id, item?.level ? String(item.level).slice(0, 50) : null);
        }
        const skills = wanted.size
            ? await skill_1.Skill.findAll({ where: { _uuid: { [sequelize_1.Op.in]: [...wanted.keys()] } }, include: [{ model: skill_1.SkillType, as: "type" }], transaction: t })
            : [];
        if (skills.length !== wanted.size) {
            await t.rollback();
            res.status(400).json({ message: "ມີທັກສະທີ່ບໍ່ພົບ" });
            return;
        }
        for (const s of skills) {
            const level = wanted.get(s._uuid);
            if (level && !(0, exports.levelsOf)(s.type?.levels).includes(level)) {
                await t.rollback();
                res.status(400).json({ message: `ລະດັບ "${level}" ບໍ່ມີໃນໝວດ ${s.type?.name}` });
                return;
            }
        }
        await skill_1.EmployeeSkill.destroy({ where: { employee_id: employee._uuid }, transaction: t });
        await skill_1.EmployeeSkill.bulkCreate([...wanted].map(([skill_id, level]) => ({ employee_id: employee._uuid, skill_id, level })), { transaction: t });
        await t.commit();
        res.status(200).json({ message: "Successfully saved employee skills", data: await (0, employeeController_1.findFull)(employee._uuid) });
    }
    catch (error) {
        await t.rollback();
        (0, bansiHelpers_1.sendError)(res, error, "Error saving employee skills");
    }
};
exports.setEmployeeSkills = setEmployeeSkills;
