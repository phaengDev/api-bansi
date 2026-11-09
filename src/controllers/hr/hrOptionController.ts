import { Request, Response } from "express";
import { Op, fn, col } from "sequelize";
import HrOption from "../../models/hrOption";
import Employee from "../../models/employee";
import { decodeId, sendError } from "../bansi/bansiHelpers";

/**
 * ລາຍການຕັ້ງຄ່າຂອງຂໍ້ມູນພະນັກງານ (tbl_hr_option) — HR ເພີ່ມ / ປ່ຽນຊື່ / ປິດ ເອງໄດ້:
 * employee_type → tbl_employee.employee_type_id, education_level → tbl_employee.education_level_id
 */

export const OPTION_FIELDS: Record<string, string> = {
  employee_type: "employee_type_id",
  education_level: "education_level_id",
};

const DEFAULTS: Record<string, string[]> = {
  employee_type: ["ພະນັກງານປະຈຳ", "ຜູ້ບໍລິຫານ", "ພະນັກງານສັນຍາ", "ພະນັກງານຊົ່ວຄາວ", "ນັກສຶກສາຝຶກງານ", "ພະນັກງານຕາມລະດູການ"],
  education_level: ["ມັດທະຍົມຕອນປາຍ", "ຊັ້ນກາງ", "ຊັ້ນສູງ", "ປະລິນຍາຕີ", "ປະລິນຍາໂທ", "ປະລິນຍາເອກ", "ອື່ນໆ"],
};

/** ຕອນເປີດ server: ໃສ່ຄ່າເລີ່ມຕົ້ນໃຫ້ kind ທີ່ຍັງບໍ່ມີຈັກແຖວ (ບໍ່ແຕະອັນທີ່ HR ແກ້ແລ້ວ) */
export const seedHrOptions = async () => {
  for (const [kind, names] of Object.entries(DEFAULTS)) {
    if (await HrOption.count({ where: { kind } })) continue;
    await HrOption.bulkCreate(names.map((name, i) => ({ kind, name, sort: i + 1, status: 1 })));
    console.log(`🌱 tbl_hr_option: ${kind} ${names.length} rows`);
  }
};

/** ຕົວເລືອກໃນຟອມພະນັກງານ — ໃຊ້ໄດ້ສະເພາະ kind ຖືກ ແລະ ເປີດໃຊ້ (ຄ່າເດີມທີ່ຖືກປິດແລ້ວ ຮັກສາໄວ້ໄດ້) */
export const optionError = async (kind: string, id: number | null, current?: number | null) => {
  if (!id) return null;
  const row = await HrOption.findByPk(id, { attributes: ["_uuid", "kind", "status"] });
  if (!row || row.kind !== kind) return "ຕົວເລືອກບໍ່ຖືກຕ້ອງ";
  if (Number(row.status) !== 1 && id !== current) return "ຕົວເລືອກນີ້ຖືກປິດແລ້ວ";
  return null;
};

/** GET /hr-option/fetch — ທຸກລາຍການ + ຈຳນວນພະນັກງານທີ່ເຮັດວຽກຢູ່ ທີ່ໃຊ້ */
export const getHrOptions = async (_req: Request, res: Response) => {
  try {
    const rows: any[] = await HrOption.findAll({ order: [["kind", "ASC"], ["sort", "ASC"], ["_uuid", "ASC"]], raw: true });
    const counts = new Map<string, number>();
    for (const [kind, field] of Object.entries(OPTION_FIELDS)) {
      const used: any[] = await Employee.findAll({
        where: { work_status: 1, [field]: { [Op.ne]: null } },
        attributes: [field, [fn("COUNT", col("_uuid")), "n"]],
        group: [field],
        raw: true,
      });
      for (const u of used) counts.set(`${kind}:${u[field]}`, Number(u.n) || 0);
    }
    res.status(200).json({ data: rows.map((r) => ({ ...r, employees: counts.get(`${r.kind}:${r._uuid}`) ?? 0 })) });
  } catch (error) {
    sendError(res, error, "Error getting HR options");
  }
};

/** GET /hr-option/option — ທີ່ເປີດໃຊ້ ແຍກຕາມ kind */
export const getHrOptionList = async (_req: Request, res: Response) => {
  try {
    const rows = await HrOption.findAll({ where: { status: 1 }, attributes: ["_uuid", "kind", "name"], order: [["sort", "ASC"], ["_uuid", "ASC"]], raw: true });
    const data = Object.fromEntries(Object.keys(OPTION_FIELDS).map((k) => [k, rows.filter((r: any) => r.kind === k)]));
    res.status(200).json({ data });
  } catch (error) {
    sendError(res, error, "Error getting HR option list");
  }
};

const nameTaken = async (kind: string, name: string, exceptId?: number) =>
  (await HrOption.count({ where: { kind, name, ...(exceptId ? { _uuid: { [Op.ne]: exceptId } } : {}) } })) > 0;

/** POST /hr-option/create { kind, name, sort? } */
export const createHrOption = async (req: Request, res: Response) => {
  try {
    const kind = String(req.body?.kind ?? "");
    const name = String(req.body?.name ?? "").trim().slice(0, 150);
    if (!OPTION_FIELDS[kind]) {
      res.status(400).json({ message: "ປະເພດລາຍການບໍ່ຖືກຕ້ອງ" });
      return;
    }
    if (!name) {
      res.status(400).json({ message: "ກະລຸນາປ້ອນຊື່" });
      return;
    }
    if (await nameTaken(kind, name)) {
      res.status(400).json({ message: `"${name}" ມີແລ້ວ` });
      return;
    }
    const sort = Number(req.body?.sort) || (await HrOption.count({ where: { kind } })) + 1;
    const row = await HrOption.create({ kind, name, sort, status: 1 });
    res.status(200).json({ message: "Successfully created option", data: row });
  } catch (error) {
    sendError(res, error, "Error creating HR option");
  }
};

/** PUT /hr-option/:id { name?, sort?, status? } */
export const updateHrOption = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const row = await HrOption.findByPk(Number(decodeId(req)));
    if (!row) {
      res.status(404).json({ message: "ບໍ່ພົບລາຍການ" });
      return;
    }
    const body = req.body || {};
    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const name = String(body.name ?? "").trim().slice(0, 150);
      if (!name) {
        res.status(400).json({ message: "ກະລຸນາປ້ອນຊື່" });
        return;
      }
      if (await nameTaken(row.kind, name, row._uuid)) {
        res.status(400).json({ message: `"${name}" ມີແລ້ວ` });
        return;
      }
      patch.name = name;
    }
    if (body.sort !== undefined) patch.sort = Number(body.sort) || 0;
    if (body.status !== undefined) patch.status = Number(body.status) === 0 ? 0 : 1;
    await row.update({ ...patch, updatedAt: new Date() });
    res.status(200).json({ message: "Successfully updated option", data: row });
  } catch (error) {
    sendError(res, error, "Error updating HR option");
  }
};

/** DELETE /hr-option/:id — ສະເພາະລາຍການທີ່ບໍ່ເຄີຍມີພະນັກງານໃຊ້ */
export const deleteHrOption = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const row = await HrOption.findByPk(Number(decodeId(req)));
    if (!row) {
      res.status(404).json({ message: "ບໍ່ພົບລາຍການ" });
      return;
    }
    const used = await Employee.count({ where: { [OPTION_FIELDS[row.kind]]: row._uuid } });
    if (used) {
      res.status(400).json({ message: `ລຶບບໍ່ໄດ້ — ມີພະນັກງານ ${used} ຄົນໃຊ້ຢູ່ (ປິດໃຊ້ງານແທນ)` });
      return;
    }
    await row.destroy();
    res.status(200).json({ message: "Successfully deleted option" });
  } catch (error) {
    sendError(res, error, "Error deleting HR option");
  }
};
