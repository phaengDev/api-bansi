"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deletePosition = exports.updatePosition = exports.createPosition = exports.getPositionOption = exports.getPositions = exports.MAX_LEVEL = void 0;
const sequelize_1 = require("sequelize");
const position_1 = __importDefault(require("../../models/position"));
const employee_1 = __importDefault(require("../../models/employee"));
const bansiHelpers_1 = require("../bansi/bansiHelpers");
/**
 * ຕຳແໜ່ງ — ລາຍຊື່ກາງຂອງທັງບໍລິສັດ (ພິມເທື່ອດຽວ ໃຊ້ໄດ້ທຸກພະແນກ), ຊື່ບໍ່ຊ້ຳ.
 * level = Level 1, 2, 3… (1 = ສູງສຸດ) ບໍ່ຈຳກັດຈຳນວນຂັ້ນ — ແຕ່ລະອົງກອນມີຂັ້ນບໍ່ເທົ່າກັນ.
 * ໃຊ້ແນະນຳ "ຫົວໜ້າສາຍງານ" (ຄົນທີ່ Level ສູງກວ່າທີ່ໃກ້ສຸດ) ແລະ ລຽງໂຄງຮ່າງ.
 * ຕຳແໜ່ງທີ່ເຄີຍມີພະນັກງານ (ລວມຄົນລາອອກ) ລຶບບໍ່ໄດ້ — ປິດແທນ
 */
const WORKING = 1;
/** ກັນຄ່າຜິດປົກກະຕິເທົ່ານັ້ນ — ບໍ່ແມ່ນຈຳນວນຂັ້ນຂອງອົງກອນ */
exports.MAX_LEVEL = 99;
const parseLevel = (raw) => {
    if (raw === null || raw === undefined || raw === "")
        return null;
    const level = Number(raw);
    return Number.isInteger(level) && level >= 1 && level <= exports.MAX_LEVEL ? level : undefined;
};
const nameTaken = async (name, exceptId) => (await position_1.default.count({
    where: { [sequelize_1.Op.and]: [(0, sequelize_1.where)((0, sequelize_1.fn)("LOWER", (0, sequelize_1.col)("position_name")), name.toLowerCase()), ...(exceptId ? [{ _uuid: { [sequelize_1.Op.ne]: exceptId } }] : [])] },
})) > 0;
const order = [[(0, sequelize_1.fn)("ISNULL", (0, sequelize_1.col)("level")), "ASC"], ["level", "ASC"], ["sort", "ASC"], ["position_name", "ASC"]];
/** GET /position/fetch — ທຸກຕຳແໜ່ງ + ຈຳນວນພະນັກງານທີ່ເຮັດວຽກຢູ່ */
const getPositions = async (_req, res) => {
    try {
        const [rows, counts] = await Promise.all([
            position_1.default.findAll({ order, raw: true }),
            employee_1.default.findAll({
                where: { work_status: WORKING },
                attributes: ["position_id", [(0, sequelize_1.fn)("COUNT", (0, sequelize_1.col)("_uuid")), "n"]],
                group: ["position_id"],
                raw: true,
            }),
        ]);
        const byPosition = new Map(counts.map((c) => [Number(c.position_id), Number(c.n) || 0]));
        const data = rows.map((r) => ({ ...r, employees: byPosition.get(r._uuid) ?? 0 }));
        res.status(200).json({ data, total: data.length });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting positions");
    }
};
exports.getPositions = getPositions;
/** GET /position/option — ຕຳແໜ່ງທີ່ເປີດໃຊ້ (ຟອມພະນັກງານ) */
const getPositionOption = async (_req, res) => {
    try {
        const data = await position_1.default.findAll({ where: { status: 1 }, attributes: ["_uuid", "position_name", "level"], order });
        res.status(200).json({ data });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting position option");
    }
};
exports.getPositionOption = getPositionOption;
/** POST /position/create { position_name, level?, sort?, status? } */
const createPosition = async (req, res) => {
    try {
        const body = req.body || {};
        const name = String(body.position_name ?? "").trim().slice(0, 150);
        if (!name) {
            res.status(400).json({ message: "ກະລຸນາປ້ອນຊື່ຕຳແໜ່ງ" });
            return;
        }
        const level = parseLevel(body.level);
        if (level === undefined) {
            res.status(400).json({ message: "ລະດັບບໍ່ຖືກຕ້ອງ" });
            return;
        }
        if (await nameTaken(name)) {
            res.status(400).json({ message: `ຕຳແໜ່ງ "${name}" ມີແລ້ວ` });
            return;
        }
        const row = await position_1.default.create({ position_name: name, level, sort: Number(body.sort) || 0, status: Number(body.status ?? 1) === 0 ? 0 : 1 });
        res.status(200).json({ message: "Successfully created position", data: row });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error creating position");
    }
};
exports.createPosition = createPosition;
/** PUT /position/:id — ສົ່ງສະເພາະຖັນທີ່ປ່ຽນ (ເຊັ່ນ { status }) */
const updatePosition = async (req, res) => {
    try {
        const id = Number((0, bansiHelpers_1.decodeId)(req));
        const row = await position_1.default.findByPk(id);
        if (!row) {
            res.status(404).json({ message: "ບໍ່ພົບຕຳແໜ່ງ" });
            return;
        }
        const body = req.body || {};
        const patch = {};
        if (body.position_name !== undefined) {
            const name = String(body.position_name ?? "").trim().slice(0, 150);
            if (!name) {
                res.status(400).json({ message: "ກະລຸນາປ້ອນຊື່ຕຳແໜ່ງ" });
                return;
            }
            if (await nameTaken(name, id)) {
                res.status(400).json({ message: `ຕຳແໜ່ງ "${name}" ມີແລ້ວ` });
                return;
            }
            patch.position_name = name;
        }
        if (body.level !== undefined) {
            const level = parseLevel(body.level);
            if (level === undefined) {
                res.status(400).json({ message: "ລະດັບບໍ່ຖືກຕ້ອງ" });
                return;
            }
            patch.level = level;
        }
        if (body.sort !== undefined)
            patch.sort = Number(body.sort) || 0;
        if (body.status !== undefined)
            patch.status = Number(body.status) === 0 ? 0 : 1;
        await row.update({ ...patch, updatedAt: new Date() });
        res.status(200).json({ message: "Successfully updated position", data: row });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error updating position");
    }
};
exports.updatePosition = updatePosition;
/** DELETE /position/:id — ສະເພາະຕຳແໜ່ງທີ່ບໍ່ເຄີຍມີພະນັກງານ (ລວມຄົນລາອອກ) */
const deletePosition = async (req, res) => {
    try {
        const id = Number((0, bansiHelpers_1.decodeId)(req));
        const row = await position_1.default.findByPk(id);
        const used = row ? await employee_1.default.count({ where: { position_id: id } }) : 0;
        if (!row || used) {
            res.status(row ? 400 : 404).json({ message: row ? `ລຶບບໍ່ໄດ້ — ມີພະນັກງານ ${used} ຄົນ (ປິດໃຊ້ງານແທນ)` : "ບໍ່ພົບຕຳແໜ່ງ" });
            return;
        }
        await row.destroy();
        res.status(200).json({ message: "Successfully deleted position" });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error deleting position");
    }
};
exports.deletePosition = deletePosition;
