import { Request, Response } from "express";
import { Op, Transaction, fn, col } from "sequelize";
import Department from "../../models/department";
import Position from "../../models/position";
import Employee from "../../models/employee";
import Province from "../../models/province";
import District from "../../models/district";
import { decodeId, sendError } from "../bansi/bansiHelpers";

/**
 * ພະແນກ + ຕຳແໜ່ງຂອງພະແນກ — ຕຳແໜ່ງບັນທຶກພ້ອມກັບພະແນກ (positions: [{ _uuid?, position_name, status? }]):
 * ແຖວທີ່ບໍ່ສົ່ງມາອີກ = ລຶບ, ແຕ່ຖ້າມີພະນັກງານໃຊ້ຢູ່ ຈະປິດ (status 0) ແທນ. ພະແນກທີ່ມີພະນັກງານ ລຶບບໍ່ໄດ້ (ປິດແທນ)
 */

const WORKING = 1;

type PositionInput = { _uuid?: number; position_name: string; status: number };

/** ຈຳນວນພະນັກງານທີ່ເຮັດວຽກຢູ່ ຕໍ່ພະແນກ ແລະ ຕໍ່ຕຳແໜ່ງ */
const headcount = async () => {
  const rows: any[] = await Employee.findAll({
    where: { work_status: WORKING },
    attributes: ["department_id", "position_id", [fn("COUNT", col("_uuid")), "n"]],
    group: ["department_id", "position_id"],
    raw: true,
  });
  const byDepartment = new Map<number, number>();
  const byPosition = new Map<number, number>();
  for (const r of rows) {
    const n = Number(r.n) || 0;
    byDepartment.set(Number(r.department_id), (byDepartment.get(Number(r.department_id)) ?? 0) + n);
    if (r.position_id) byPosition.set(Number(r.position_id), (byPosition.get(Number(r.position_id)) ?? 0) + n);
  }
  return { byDepartment, byPosition };
};

const positionOrder: any = [[{ model: Position, as: "positions" }, "sort", "ASC"], [{ model: Position, as: "positions" }, "_uuid", "ASC"]];

/** GET /department/fetch — ທຸກພະແນກ + ຕຳແໜ່ງ + ຈຳນວນພະນັກງານທີ່ເຮັດວຽກຢູ່ */
export const getDepartments = async (_req: Request, res: Response) => {
  try {
    const [rows, counts] = await Promise.all([
      Department.findAll({
        include: [{ model: Position, as: "positions" }],
        order: [["sort", "ASC"], ["depart_code", "ASC"], ...positionOrder],
      }),
      headcount(),
    ]);
    const data = rows.map((row) => {
      const r: any = row.get({ plain: true });
      return {
        ...r,
        employees: counts.byDepartment.get(r._uuid) ?? 0,
        positions: (r.positions ?? []).map((p: any) => ({ ...p, employees: counts.byPosition.get(p._uuid) ?? 0 })),
      };
    });
    res.status(200).json({ data, total: data.length });
  } catch (error) {
    sendError(res, error, "Error getting departments");
  }
};

/** GET /department/option — ພະແນກທີ່ໃຊ້ງານ + ຕຳແໜ່ງທີ່ໃຊ້ງານ (ຟອມພະນັກງານ) */
export const getDepartmentOption = async (_req: Request, res: Response) => {
  try {
    const data = await Department.findAll({
      where: { status: 1 },
      include: [{ model: Position, as: "positions", where: { status: 1 }, required: false }],
      order: [["sort", "ASC"], ["depart_code", "ASC"], ...positionOrder],
    });
    res.status(200).json({ data });
  } catch (error) {
    sendError(res, error, "Error getting department option");
  }
};

const parsePositions = (raw: unknown): PositionInput[] | { error: string } => {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return { error: "ຂໍ້ມູນຕຳແໜ່ງບໍ່ຖືກຕ້ອງ" };
  const list: PositionInput[] = [];
  const names = new Set<string>();
  for (const item of raw) {
    const name = String(item?.position_name ?? "").trim().slice(0, 150);
    if (!name) continue;
    const key = name.toLowerCase();
    if (names.has(key)) return { error: `ຕຳແໜ່ງ "${name}" ຊ້ຳກັນ` };
    names.add(key);
    const id = Number(item?._uuid);
    list.push({ ...(id > 0 ? { _uuid: id } : {}), position_name: name, status: Number(item?.status ?? 1) === 0 ? 0 : 1 });
  }
  return list;
};

/** ບັນທຶກຕຳແໜ່ງຂອງພະແນກໃຫ້ກົງກັບລາຍການທີ່ສົ່ງມາ — ອັນທີ່ຫາຍໄປ: ມີຄົນໃຊ້ = ປິດ, ບໍ່ມີ = ລຶບ */
const syncPositions = async (departmentId: number, positions: PositionInput[], t: Transaction) => {
  const existing = await Position.findAll({ where: { department_id: departmentId }, transaction: t });
  const keep = new Set(positions.filter((p) => p._uuid).map((p) => p._uuid));
  for (const row of existing) {
    if (keep.has(row._uuid)) continue;
    const used = await Employee.count({ where: { position_id: row._uuid }, transaction: t });
    if (used) await row.update({ status: 0, updatedAt: new Date() }, { transaction: t });
    else await row.destroy({ transaction: t });
  }
  for (const [index, p] of positions.entries()) {
    const row = p._uuid ? existing.find((e) => e._uuid === p._uuid) : null;
    if (row) {
      await row.update({ position_name: p.position_name, status: p.status, sort: index + 1, updatedAt: new Date() }, { transaction: t });
    } else {
      await Position.create({ department_id: departmentId, position_name: p.position_name, status: p.status, sort: index + 1 }, { transaction: t });
    }
  }
};

const codeTaken = async (code: string, exceptId?: number) =>
  (await Department.count({ where: { depart_code: code, ...(exceptId ? { _uuid: { [Op.ne]: exceptId } } : {}) } })) > 0;

/** POST /department/create { depart_code, depart_name, description?, sort?, positions? } */
export const createDepartment = async (req: Request, res: Response) => {
  const t = await Department.sequelize!.transaction();
  const fail = async (message: string) => {
    await t.rollback();
    res.status(400).json({ message });
  };
  try {
    const body = req.body || {};
    const code = String(body.depart_code ?? "").trim().toUpperCase().slice(0, 30);
    const name = String(body.depart_name ?? "").trim().slice(0, 150);
    if (!code || !name) return fail("ກະລຸນາປ້ອນລະຫັດ ແລະ ຊື່ພະແນກ");
    if (await codeTaken(code)) return fail(`ລະຫັດ ${code} ມີແລ້ວ`);
    const positions = parsePositions(body.positions);
    if ("error" in positions) return fail(positions.error);
    const row = await Department.create(
      {
        depart_code: code,
        depart_name: name,
        description: String(body.description ?? "").trim().slice(0, 255) || null,
        sort: Number(body.sort) || 0,
        status: Number(body.status ?? 1) === 0 ? 0 : 1,
      },
      { transaction: t }
    );
    await syncPositions(row._uuid, positions, t);
    await t.commit();
    res.status(200).json({ message: "Successfully created department", data: row });
  } catch (error) {
    await t.rollback();
    sendError(res, error, "Error creating department");
  }
};

/** PUT /department/:id — ສົ່ງສະເພາະຖັນທີ່ປ່ຽນ (ເຊັ່ນ { status }); ສົ່ງ positions = ບັນທຶກຕຳແໜ່ງທັງໝົດຄືນ */
export const updateDepartment = async (req: Request<{ id: string }>, res: Response) => {
  const t = await Department.sequelize!.transaction();
  const fail = async (code: number, message: string) => {
    await t.rollback();
    res.status(code).json({ message });
  };
  try {
    const id = Number(decodeId(req));
    const row = await Department.findByPk(id, { transaction: t });
    if (!row) return fail(404, "ບໍ່ພົບພະແນກ");
    const body = req.body || {};
    const patch: Record<string, unknown> = {};
    if (body.depart_code !== undefined) {
      const code = String(body.depart_code ?? "").trim().toUpperCase().slice(0, 30);
      if (!code) return fail(400, "ກະລຸນາປ້ອນລະຫັດພະແນກ");
      if (await codeTaken(code, id)) return fail(400, `ລະຫັດ ${code} ມີແລ້ວ`);
      patch.depart_code = code;
    }
    if (body.depart_name !== undefined) {
      const name = String(body.depart_name ?? "").trim().slice(0, 150);
      if (!name) return fail(400, "ກະລຸນາປ້ອນຊື່ພະແນກ");
      patch.depart_name = name;
    }
    if (body.description !== undefined) patch.description = String(body.description ?? "").trim().slice(0, 255) || null;
    if (body.sort !== undefined) patch.sort = Number(body.sort) || 0;
    if (body.status !== undefined) patch.status = Number(body.status) === 0 ? 0 : 1;
    await row.update({ ...patch, updatedAt: new Date() }, { transaction: t });
    if (body.positions !== undefined) {
      const positions = parsePositions(body.positions);
      if ("error" in positions) return fail(400, positions.error);
      await syncPositions(id, positions, t);
    }
    await t.commit();
    res.status(200).json({ message: "Successfully updated department", data: row });
  } catch (error) {
    await t.rollback();
    sendError(res, error, "Error updating department");
  }
};

/** DELETE /department/:id — ສະເພາະພະແນກທີ່ບໍ່ເຄີຍມີພະນັກງານ (ລວມຄົນລາອອກ) */
export const deleteDepartment = async (req: Request<{ id: string }>, res: Response) => {
  const t = await Department.sequelize!.transaction();
  try {
    const id = Number(decodeId(req));
    const row = await Department.findByPk(id, { transaction: t });
    const used = row ? await Employee.count({ where: { department_id: id }, transaction: t }) : 0;
    if (!row || used) {
      await t.rollback();
      res.status(row ? 400 : 404).json({ message: row ? `ລຶບບໍ່ໄດ້ — ມີພະນັກງານ ${used} ຄົນ (ປິດໃຊ້ງານແທນ)` : "ບໍ່ພົບພະແນກ" });
      return;
    }
    await Position.destroy({ where: { department_id: id }, transaction: t });
    await row.destroy({ transaction: t });
    await t.commit();
    res.status(200).json({ message: "Successfully deleted department" });
  } catch (error) {
    await t.rollback();
    sendError(res, error, "Error deleting department");
  }
};

/** GET /address/province — 18 ແຂວງ ພ້ອມເມືອງ (ຟອມທີ່ຢູ່ຂອງພະນັກງານ) */
export const getProvinces = async (_req: Request, res: Response) => {
  try {
    const data = await Province.findAll({
      include: [{ model: District, as: "districts", attributes: ["_uuid", "district_name"] }],
      order: [["_uuid", "ASC"], [{ model: District, as: "districts" }, "_uuid", "ASC"]],
    });
    res.status(200).json({ data });
  } catch (error) {
    sendError(res, error, "Error getting provinces");
  }
};
