import { Request, Response } from "express";
import path from "path";
import fs from "fs";
import Employee from "../../models/employee";
import EmployeeResume from "../../models/employeeResume";
import { actorOf, decodeId, sendError, toDateOnly } from "../bansi/bansiHelpers";
import { DOCUMENT_DIR, originalNameOf, removeQuietly } from "./hrHelpers";
import { findFull } from "./employeeController";

/**
 * ປະຫວັດຫຍໍ້ຂອງພະນັກງານ — ປະສົບການເຮັດວຽກ (1), ການສຶກສາ (2), ການຝຶກອົບຮົມ (3)
 * ແຕ່ລະແຖວແນບໃບຢັ້ງຢືນໄດ້ 1 ໄຟລ໌ (multipart field "files", ເກັບຄືເອກະສານພະນັກງານ)
 */

const KINDS = [1, 2, 3];
const fileOf = (req: Request) => (((req as any).files ?? []) as Express.Multer.File[])[0];
const discard = (req: Request) => (((req as any).files ?? []) as Express.Multer.File[]).forEach((f) => removeQuietly(f.path));

const parse = (body: any): Record<string, unknown> | { error: string } => {
  const kind = Number(body.kind);
  if (!KINDS.includes(kind)) return { error: "ປະເພດປະຫວັດບໍ່ຖືກຕ້ອງ" };
  const title = String(body.title ?? "").trim().slice(0, 200);
  if (!title) return { error: "ກະລຸນາປ້ອນຊື່ບ່ອນເຮັດວຽກ / ສະຖາບັນ / ຫຼັກສູດ" };
  const start = body.start_date ? toDateOnly(body.start_date) : null;
  const end = body.end_date ? toDateOnly(body.end_date) : null;
  if ((body.start_date && !start) || (body.end_date && !end)) return { error: "ວັນທີບໍ່ຖືກຕ້ອງ" };
  if (start && end && end < start) return { error: "ວັນທີສິ້ນສຸດຕ້ອງບໍ່ກ່ອນວັນທີເລີ່ມ" };
  return {
    kind,
    title,
    subtitle: String(body.subtitle ?? "").trim().slice(0, 200) || null,
    start_date: start,
    end_date: end,
    description: String(body.description ?? "").trim().slice(0, 4000) || null,
  };
};

const fileFields = (file: Express.Multer.File) => ({
  file_name: file.filename,
  original_name: originalNameOf(file).slice(0, 255),
  mime_type: file.mimetype?.slice(0, 100) ?? null,
  file_size: file.size,
});

/** POST /employee/resume/:id (multipart) — :id = ພະນັກງານ */
export const createResume = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const employee = await Employee.findByPk(Number(decodeId(req)), { attributes: ["_uuid"] });
    if (!employee) {
      discard(req);
      res.status(404).json({ message: "ບໍ່ພົບພະນັກງານ" });
      return;
    }
    const input = parse(req.body || {});
    if ("error" in input) {
      discard(req);
      res.status(400).json({ message: input.error });
      return;
    }
    const file = fileOf(req);
    const row = await EmployeeResume.create({ ...input, employee_id: employee._uuid, ...(file ? fileFields(file) : {}), createdbyid: Number(actorOf(req)) || null });
    res.status(200).json({ message: "Successfully created resume line", data: await findFull(row.employee_id) });
  } catch (error) {
    discard(req);
    sendError(res, error, "Error creating resume line");
  }
};

/** PUT /employee/resume-line/:id (multipart) — ໄຟລ໌ໃໝ່ = ແທນອັນເກົ່າ, remove_file=1 = ລຶບໄຟລ໌ */
export const updateResume = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const row = await EmployeeResume.findByPk(Number(decodeId(req)));
    if (!row) {
      discard(req);
      res.status(404).json({ message: "ບໍ່ພົບລາຍການ" });
      return;
    }
    const input = parse({ ...row.get({ plain: true }), ...(req.body || {}) });
    if ("error" in input) {
      discard(req);
      res.status(400).json({ message: input.error });
      return;
    }
    const file = fileOf(req);
    const dropOld = !!file || Number(req.body?.remove_file) === 1;
    const old = dropOld ? row.file_name : null;
    const fileChange = file ? fileFields(file) : dropOld ? { file_name: null, original_name: null, mime_type: null, file_size: null } : {};
    await row.update({ ...input, ...fileChange, updatedAt: new Date() });
    if (old) removeQuietly(path.join(DOCUMENT_DIR, path.basename(old)));
    res.status(200).json({ message: "Successfully updated resume line", data: await findFull(row.employee_id) });
  } catch (error) {
    discard(req);
    sendError(res, error, "Error updating resume line");
  }
};

/** DELETE /employee/resume-line/:id */
export const deleteResume = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const row = await EmployeeResume.findByPk(Number(decodeId(req)));
    if (!row) {
      res.status(404).json({ message: "ບໍ່ພົບລາຍການ" });
      return;
    }
    const file = row.file_name;
    await row.destroy();
    if (file) removeQuietly(path.join(DOCUMENT_DIR, path.basename(file)));
    res.status(200).json({ message: "Successfully deleted resume line", data: await findFull(row.employee_id) });
  } catch (error) {
    sendError(res, error, "Error deleting resume line");
  }
};

/** GET /employee/resume-line/file/:id — ດາວໂຫຼດໃບຢັ້ງຢືນ */
export const downloadResumeFile = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const row = await EmployeeResume.findByPk(Number(decodeId(req)));
    const filePath = row?.file_name && path.join(DOCUMENT_DIR, path.basename(row.file_name));
    if (!row || !filePath || !fs.existsSync(filePath)) {
      res.status(404).json({ message: "ບໍ່ພົບໄຟລ໌" });
      return;
    }
    res.download(filePath, row.original_name ?? path.basename(filePath));
  } catch (error) {
    sendError(res, error, "Error downloading resume file");
  }
};
