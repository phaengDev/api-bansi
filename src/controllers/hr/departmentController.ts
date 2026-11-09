import { Request, Response } from "express";
import { Op, fn, col } from "sequelize";
import Department from "../../models/department";
import Employee from "../../models/employee";
import Province from "../../models/province";
import District from "../../models/district";
import { decodeId, sendError } from "../bansi/bansiHelpers";

/**
 * ພະແນກ — ລະຫັດ, ຊື່, ລາຍລະອຽດ, ລຳດັບ ແລະ executive (ຂັ້ນບໍລິຫານ: ຢູ່ເທິງສຸດຂອງໂຄງຮ່າງ, ບໍ່ນັບເປັນພະແນກ).
 * ຕຳແໜ່ງເປັນລາຍຊື່ກາງ (positionController) ແລະ ສາຍບັງຄັບບັນຊາຢູ່ຝັ່ງພະນັກງານ (reports_to_id).
 * ພະແນກທີ່ເຄີຍມີພະນັກງານ ລຶບບໍ່ໄດ້ — ປິດແທນ
 */

const WORKING = 1;

/** ຈຳນວນພະນັກງານທີ່ເຮັດວຽກຢູ່ ຕໍ່ພະແນກ */
const headcount = async () => {
  const rows: any[] = await Employee.findAll({
    where: { work_status: WORKING },
    attributes: ["department_id", [fn("COUNT", col("_uuid")), "n"]],
    group: ["department_id"],
    raw: true,
  });
  return new Map(rows.map((r) => [Number(r.department_id), Number(r.n) || 0]));
};

/** GET /department/fetch — ທຸກພະແນກ + ຈຳນວນພະນັກງານທີ່ເຮັດວຽກຢູ່ */
export const getDepartments = async (_req: Request, res: Response) => {
  try {
    const [rows, counts] = await Promise.all([
      Department.findAll({ order: [["sort", "ASC"], ["depart_code", "ASC"]], raw: true }),
      headcount(),
    ]);
    const data = (rows as any[]).map((r) => ({ ...r, employees: counts.get(r._uuid) ?? 0 }));
    res.status(200).json({ data, total: data.length });
  } catch (error) {
    sendError(res, error, "Error getting departments");
  }
};

/** GET /department/option — ພະແນກທີ່ໃຊ້ງານ (ຟອມພະນັກງານ) */
export const getDepartmentOption = async (_req: Request, res: Response) => {
  try {
    const data = await Department.findAll({
      where: { status: 1 },
      attributes: ["_uuid", "depart_code", "depart_name", "executive"],
      order: [["sort", "ASC"], ["depart_code", "ASC"]],
    });
    res.status(200).json({ data });
  } catch (error) {
    sendError(res, error, "Error getting department option");
  }
};

const codeTaken = async (code: string, exceptId?: number) =>
  (await Department.count({ where: { depart_code: code, ...(exceptId ? { _uuid: { [Op.ne]: exceptId } } : {}) } })) > 0;

/** POST /department/create { depart_code, depart_name, description?, sort?, executive? } */
export const createDepartment = async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const code = String(body.depart_code ?? "").trim().toUpperCase().slice(0, 30);
    const name = String(body.depart_name ?? "").trim().slice(0, 150);
    if (!code || !name) {
      res.status(400).json({ message: "ກະລຸນາປ້ອນລະຫັດ ແລະ ຊື່ພະແນກ" });
      return;
    }
    if (await codeTaken(code)) {
      res.status(400).json({ message: `ລະຫັດ ${code} ມີແລ້ວ` });
      return;
    }
    const row = await Department.create({
      depart_code: code,
      depart_name: name,
      description: String(body.description ?? "").trim().slice(0, 255) || null,
      sort: Number(body.sort) || 0,
      status: Number(body.status ?? 1) === 0 ? 0 : 1,
      executive: Number(body.executive) === 1 ? 1 : 0,
    });
    res.status(200).json({ message: "Successfully created department", data: row });
  } catch (error) {
    sendError(res, error, "Error creating department");
  }
};

/** PUT /department/:id — ສົ່ງສະເພາະຖັນທີ່ປ່ຽນ (ເຊັ່ນ { status }) */
export const updateDepartment = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const id = Number(decodeId(req));
    const row = await Department.findByPk(id);
    if (!row) {
      res.status(404).json({ message: "ບໍ່ພົບພະແນກ" });
      return;
    }
    const body = req.body || {};
    const patch: Record<string, unknown> = {};
    if (body.depart_code !== undefined) {
      const code = String(body.depart_code ?? "").trim().toUpperCase().slice(0, 30);
      if (!code) {
        res.status(400).json({ message: "ກະລຸນາປ້ອນລະຫັດພະແນກ" });
        return;
      }
      if (await codeTaken(code, id)) {
        res.status(400).json({ message: `ລະຫັດ ${code} ມີແລ້ວ` });
        return;
      }
      patch.depart_code = code;
    }
    if (body.depart_name !== undefined) {
      const name = String(body.depart_name ?? "").trim().slice(0, 150);
      if (!name) {
        res.status(400).json({ message: "ກະລຸນາປ້ອນຊື່ພະແນກ" });
        return;
      }
      patch.depart_name = name;
    }
    if (body.description !== undefined) patch.description = String(body.description ?? "").trim().slice(0, 255) || null;
    if (body.sort !== undefined) patch.sort = Number(body.sort) || 0;
    if (body.status !== undefined) patch.status = Number(body.status) === 0 ? 0 : 1;
    if (body.executive !== undefined) patch.executive = Number(body.executive) === 1 ? 1 : 0;
    await row.update({ ...patch, updatedAt: new Date() });
    res.status(200).json({ message: "Successfully updated department", data: row });
  } catch (error) {
    sendError(res, error, "Error updating department");
  }
};

/** DELETE /department/:id — ສະເພາະພະແນກທີ່ບໍ່ເຄີຍມີພະນັກງານ (ລວມຄົນລາອອກ) */
export const deleteDepartment = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const id = Number(decodeId(req));
    const row = await Department.findByPk(id);
    const used = row ? await Employee.count({ where: { department_id: id } }) : 0;
    if (!row || used) {
      res.status(row ? 400 : 404).json({ message: row ? `ລຶບບໍ່ໄດ້ — ມີພະນັກງານ ${used} ຄົນ (ປິດໃຊ້ງານແທນ)` : "ບໍ່ພົບພະແນກ" });
      return;
    }
    await row.destroy();
    res.status(200).json({ message: "Successfully deleted department" });
  } catch (error) {
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
