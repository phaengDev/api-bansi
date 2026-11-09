import { Request, Response } from "express";
import { Op, fn, col, where } from "sequelize";
import Position from "../../models/position";
import Employee from "../../models/employee";
import { decodeId, sendError } from "../bansi/bansiHelpers";

/**
 * ຕຳແໜ່ງ — ລາຍຊື່ກາງຂອງທັງບໍລິສັດ (ພິມເທື່ອດຽວ ໃຊ້ໄດ້ທຸກພະແນກ), ຊື່ບໍ່ຊ້ຳ.
 * level = Level 1, 2, 3… (1 = ສູງສຸດ) ບໍ່ຈຳກັດຈຳນວນຂັ້ນ — ແຕ່ລະອົງກອນມີຂັ້ນບໍ່ເທົ່າກັນ.
 * ໃຊ້ແນະນຳ "ຫົວໜ້າສາຍງານ" (ຄົນທີ່ Level ສູງກວ່າທີ່ໃກ້ສຸດ) ແລະ ລຽງໂຄງຮ່າງ.
 * ຕຳແໜ່ງທີ່ເຄີຍມີພະນັກງານ (ລວມຄົນລາອອກ) ລຶບບໍ່ໄດ້ — ປິດແທນ
 */

const WORKING = 1;
/** ກັນຄ່າຜິດປົກກະຕິເທົ່ານັ້ນ — ບໍ່ແມ່ນຈຳນວນຂັ້ນຂອງອົງກອນ */
export const MAX_LEVEL = 99;

const parseLevel = (raw: unknown) => {
  if (raw === null || raw === undefined || raw === "") return null;
  const level = Number(raw);
  return Number.isInteger(level) && level >= 1 && level <= MAX_LEVEL ? level : undefined;
};

const nameTaken = async (name: string, exceptId?: number) =>
  (await Position.count({
    where: { [Op.and]: [where(fn("LOWER", col("position_name")), name.toLowerCase()), ...(exceptId ? [{ _uuid: { [Op.ne]: exceptId } }] : [])] },
  })) > 0;

const order: any = [[fn("ISNULL", col("level")), "ASC"], ["level", "ASC"], ["sort", "ASC"], ["position_name", "ASC"]];

/** GET /position/fetch — ທຸກຕຳແໜ່ງ + ຈຳນວນພະນັກງານທີ່ເຮັດວຽກຢູ່ */
export const getPositions = async (_req: Request, res: Response) => {
  try {
    const [rows, counts] = await Promise.all([
      Position.findAll({ order, raw: true }),
      Employee.findAll({
        where: { work_status: WORKING },
        attributes: ["position_id", [fn("COUNT", col("_uuid")), "n"]],
        group: ["position_id"],
        raw: true,
      }),
    ]);
    const byPosition = new Map((counts as any[]).map((c) => [Number(c.position_id), Number(c.n) || 0]));
    const data = (rows as any[]).map((r) => ({ ...r, employees: byPosition.get(r._uuid) ?? 0 }));
    res.status(200).json({ data, total: data.length });
  } catch (error) {
    sendError(res, error, "Error getting positions");
  }
};

/** GET /position/option — ຕຳແໜ່ງທີ່ເປີດໃຊ້ (ຟອມພະນັກງານ) */
export const getPositionOption = async (_req: Request, res: Response) => {
  try {
    const data = await Position.findAll({ where: { status: 1 }, attributes: ["_uuid", "position_name", "level"], order });
    res.status(200).json({ data });
  } catch (error) {
    sendError(res, error, "Error getting position option");
  }
};

/** POST /position/create { position_name, level?, sort?, status? } */
export const createPosition = async (req: Request, res: Response) => {
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
    const row = await Position.create({ position_name: name, level, sort: Number(body.sort) || 0, status: Number(body.status ?? 1) === 0 ? 0 : 1 });
    res.status(200).json({ message: "Successfully created position", data: row });
  } catch (error) {
    sendError(res, error, "Error creating position");
  }
};

/** PUT /position/:id — ສົ່ງສະເພາະຖັນທີ່ປ່ຽນ (ເຊັ່ນ { status }) */
export const updatePosition = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const id = Number(decodeId(req));
    const row = await Position.findByPk(id);
    if (!row) {
      res.status(404).json({ message: "ບໍ່ພົບຕຳແໜ່ງ" });
      return;
    }
    const body = req.body || {};
    const patch: Record<string, unknown> = {};
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
    if (body.sort !== undefined) patch.sort = Number(body.sort) || 0;
    if (body.status !== undefined) patch.status = Number(body.status) === 0 ? 0 : 1;
    await row.update({ ...patch, updatedAt: new Date() });
    res.status(200).json({ message: "Successfully updated position", data: row });
  } catch (error) {
    sendError(res, error, "Error updating position");
  }
};

/** DELETE /position/:id — ສະເພາະຕຳແໜ່ງທີ່ບໍ່ເຄີຍມີພະນັກງານ (ລວມຄົນລາອອກ) */
export const deletePosition = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const id = Number(decodeId(req));
    const row = await Position.findByPk(id);
    const used = row ? await Employee.count({ where: { position_id: id } }) : 0;
    if (!row || used) {
      res.status(row ? 400 : 404).json({ message: row ? `ລຶບບໍ່ໄດ້ — ມີພະນັກງານ ${used} ຄົນ (ປິດໃຊ້ງານແທນ)` : "ບໍ່ພົບຕຳແໜ່ງ" });
      return;
    }
    await row.destroy();
    res.status(200).json({ message: "Successfully deleted position" });
  } catch (error) {
    sendError(res, error, "Error deleting position");
  }
};
