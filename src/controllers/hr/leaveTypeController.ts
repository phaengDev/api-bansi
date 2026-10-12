import { Request, Response } from "express";
import { Op, col, fn } from "sequelize";
import LeaveType from "../../models/leaveType";
import LeaveRequest from "../../models/leaveRequest";
import { actorOf, decodeId, sendError } from "../bansi/bansiHelpers";

/**
 * ປະເພດການລາພັກ (HR) — GET /leave-type/fetch, POST /leave-type/create, PUT /leave-type/:id, DELETE /leave-type/:id.
 * ຂີດຈຳກັດ (ມື້ເຮັດວຽກ) ຕໍ່ປີ / ຕໍ່ຄັ້ງ — ເກີນ = ພະນັກງານຍັງຂໍໄດ້ (app ແຈ້ງເຕືອນ), HR ຕັດສິນ ໄດ້/ບໍ່ໄດ້ເງິນເດືອນ ຕອນອະນຸມັດ
 */

/** ລາໄດ້ສູງສຸດທີ່ຕັ້ງໄດ້ (ມື້) — ກົງກັບ MAX_RANGE_DAYS ຂອງ leaveController ຕໍ່ຄັ້ງ, ທັງປີ ≤ 366 */
const MAX_LIMIT = 366;

const text = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max) || null;

/** ຂີດຈຳກັດມື້ — ຫວ່າງ / 0 = null (ບໍ່ຈຳກັດ), ຈຳນວນເຕັມ 1–366, ອື່ນ = NaN */
const limitOf = (value: unknown) => {
  if (value === undefined || value === null || String(value).trim() === "" || Number(value) === 0) return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= MAX_LIMIT ? n : NaN;
};

/** ລວມຄ່າໃໝ່ກັບແຖວເດີມ (PUT ສົ່ງສະເພາະ { status } ຈາກສະວິດໃນບັດໄດ້) ແລ້ວກວດ */
const parseInput = async (body: any, row?: LeaveType): Promise<Record<string, unknown> | { error: string }> => {
  const has = (key: string) => body[key] !== undefined;
  const name = has("name") ? text(body.name, 100) : row?.name ?? null;
  if (!name) return { error: "ກະລຸນາປ້ອນຊື່ປະເພດການລາພັກ" };

  const perYear = has("max_per_year") ? limitOf(body.max_per_year) : row?.max_per_year ?? null;
  const perRequest = has("max_per_request") ? limitOf(body.max_per_request) : row?.max_per_request ?? null;
  if (Number.isNaN(perYear) || Number.isNaN(perRequest)) return { error: `ຈຳນວນມື້ຕ້ອງເປັນຕົວເລກ 1–${MAX_LIMIT} (ຫວ່າງ = ບໍ່ຈຳກັດ)` };
  if (perYear !== null && perRequest !== null && perRequest > perYear) return { error: "ມື້ຕໍ່ຄັ້ງຕ້ອງບໍ່ເກີນມື້ຕໍ່ປີ" };

  const taken = await LeaveType.findOne({
    where: { name, ...(row ? { _uuid: { [Op.ne]: row._uuid } } : {}) },
    attributes: ["_uuid"],
  });
  if (taken) return { error: `ມີປະເພດ "${name}" ແລ້ວ` };

  const flag = (key: "paid" | "status", fallback: number) =>
    has(key) ? (Number(body[key]) === 1 || body[key] === true ? 1 : 0) : fallback;
  return {
    name,
    paid: flag("paid", row ? Number(row.paid) : 1),
    max_per_year: perYear,
    max_per_request: perRequest,
    description: has("description") ? text(body.description, 255) : row?.description ?? null,
    // ລຳດັບອັດຕະໂນມັດ — ປະເພດໃໝ່ຕໍ່ທ້າຍ, ແກ້ໄຂຮັກສາລຳດັບເດີມ
    sort: row ? row.sort : (Number(await LeaveType.max("sort")) || 0) + 1,
    status: flag("status", row ? Number(row.status) : 1),
  };
};

/** GET /leave-type/fetch — ທຸກປະເພດ (ລຽງຕາມ sort) + ຈຳນວນຄຳຂໍທີ່ອ້າງອີງ (ມີ = ລຶບບໍ່ໄດ້, ປິດແທນ) */
export const getLeaveTypes = async (_req: Request, res: Response) => {
  try {
    const [rows, counts] = await Promise.all([
      LeaveType.findAll({ order: [["sort", "ASC"], ["_uuid", "ASC"]] }),
      LeaveRequest.findAll({
        where: { leave_type_id: { [Op.ne]: null } },
        attributes: ["leave_type_id", [fn("COUNT", col("_uuid")), "total"]],
        group: ["leave_type_id"],
        raw: true,
      }) as Promise<any[]>,
    ]);
    const used = new Map(counts.map((c) => [Number(c.leave_type_id), Number(c.total) || 0]));
    res.status(200).json({ data: rows.map((r) => ({ ...r.get({ plain: true }), request_count: used.get(r._uuid) ?? 0 })) });
  } catch (error) {
    sendError(res, error, "Error getting leave types");
  }
};

/** POST /leave-type/create { name, paid, max_per_year?, max_per_request?, description? } */
export const createLeaveType = async (req: Request, res: Response) => {
  try {
    const input = await parseInput(req.body || {});
    if ("error" in input) {
      res.status(400).json({ message: input.error });
      return;
    }
    const actor = Number(actorOf(req)) || null;
    const row = await LeaveType.create({ ...input, createdbyid: actor, updatedbyid: actor });
    res.status(200).json({ message: "ເພີ່ມປະເພດການລາພັກແລ້ວ", data: row });
  } catch (error) {
    sendError(res, error, "Error creating leave type");
  }
};

/** PUT /leave-type/:id — ແກ້ໄຂ ຫຼື ເປີດ/ປິດ ({ status }); ຂີດຈຳກັດໃໝ່ມີຜົນກັບຄຳຂໍ ແລະ ການອະນຸມັດຕໍ່ຈາກນີ້ */
export const updateLeaveType = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const row = await LeaveType.findByPk(decodeId(req));
    if (!row) {
      res.status(404).json({ message: "ບໍ່ພົບປະເພດການລາພັກ" });
      return;
    }
    const input = await parseInput(req.body || {}, row);
    if ("error" in input) {
      res.status(400).json({ message: input.error });
      return;
    }
    await row.update({ ...input, updatedbyid: Number(actorOf(req)) || null, updatedAt: new Date() });
    res.status(200).json({ message: "ບັນທຶກປະເພດການລາພັກແລ້ວ", data: row });
  } catch (error) {
    sendError(res, error, "Error updating leave type");
  }
};

/** DELETE /leave-type/:id — ສະເພາະປະເພດທີ່ຍັງບໍ່ມີຄຳຂໍ (ມີແລ້ວໃຫ້ປິດໃຊ້ງານແທນ ເພື່ອຮັກສາປະຫວັດ) */
export const deleteLeaveType = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const row = await LeaveType.findByPk(decodeId(req));
    if (!row) {
      res.status(404).json({ message: "ບໍ່ພົບປະເພດການລາພັກ" });
      return;
    }
    if (await LeaveRequest.count({ where: { leave_type_id: row._uuid } })) {
      res.status(400).json({ message: "ປະເພດນີ້ມີຄຳຂໍລາພັກແລ້ວ — ລຶບບໍ່ໄດ້, ປິດໃຊ້ງານແທນ" });
      return;
    }
    await row.destroy();
    res.status(200).json({ message: "ລຶບປະເພດການລາພັກແລ້ວ" });
  } catch (error) {
    sendError(res, error, "Error deleting leave type");
  }
};
