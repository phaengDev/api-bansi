import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import CompanyDocument from "../../models/companyDocument";
import { actorOf, decodeId, sendError, toDateOnly } from "../bansi/bansiHelpers";
import { COMPANY_DOC_DIR, removeQuietly } from "./hrHelpers";
import { nowLao } from "./workCalendar";

/**
 * ເອກະສານຂອງບໍລິສັດ — doc_type: 1 ໃບທະບຽນວິສາຫະກິດ, 2 ໃບທະບຽນອາກອນ, 3 ໃບອະນຸຍາດດຳເນີນທຸລະກິດ, 4 ອື່ນໆ.
 * ໃກ້ໝົດອາຍຸ = ໝົດແລ້ວ ຫຼື ໝົດພາຍໃນ 60 ມື້ (ຕໍ່ໃບອະນຸຍາດໃຊ້ເວລາ) — companyDocsDue() ໃຊ້ຮ່ວມກັບ GET /hr/pending
 */
const DOC_TYPES = [1, 2, 3, 4];
export const COMPANY_DOC_AHEAD_DAYS = 60;

const daysLeft = (date: string | null) => {
  if (!date) return null;
  const today = nowLao().format("YYYY-MM-DD");
  return Math.round((new Date(`${date}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86_400_000);
};

const present = (row: CompanyDocument) => {
  const { file_name: file, ...rest }: any = row.get({ plain: true });
  return { ...rest, has_file: !!file, days_left: daysLeft(rest.expiry_date) };
};

/** ຈຳນວນເອກະສານທີ່ໝົດແລ້ວ ຫຼື ໃກ້ໝົດ (ພາຍໃນ 60 ມື້) */
export const companyDocsDue = async () => {
  const rows = await CompanyDocument.findAll({ attributes: ["expiry_date"], raw: true }) as any[];
  return rows.filter((row) => {
    const days = daysLeft(row.expiry_date);
    return days !== null && days <= COMPANY_DOC_AHEAD_DAYS;
  }).length;
};

/** GET /company/document — ທຸກເອກະສານ: ໃກ້ໝົດກ່ອນ, ແລ້ວຕາມປະເພດ */
export const getCompanyDocuments = async (_req: Request, res: Response) => {
  try {
    const rows = (await CompanyDocument.findAll({ order: [["doc_type", "ASC"], ["_uuid", "ASC"]] })).map(present);
    rows.sort((a, b) => (a.days_left ?? 99999) - (b.days_left ?? 99999));
    res.status(200).json({ data: rows, ahead_days: COMPANY_DOC_AHEAD_DAYS });
  } catch (error) {
    sendError(res, error, "Error getting company documents");
  }
};

const parseInput = (body: any) => {
  const title = String(body.title ?? "").trim().slice(0, 150);
  if (!title) return { error: "ກະລຸນາປ້ອນຊື່ເອກະສານ" };
  const docType = Number(body.doc_type);
  const issue = toDateOnly(body.issue_date);
  const expiry = toDateOnly(body.expiry_date);
  if (issue && expiry && expiry < issue) return { error: "ວັນໝົດອາຍຸຕ້ອງຫຼັງວັນອອກ" };
  const text = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max) || null;
  return {
    doc_type: DOC_TYPES.includes(docType) ? docType : 4,
    title,
    doc_no: text(body.doc_no, 80),
    issued_by: text(body.issued_by, 150),
    issue_date: issue,
    expiry_date: expiry,
    note: text(body.note, 2000),
  };
};

const uploaded = (req: Request) => (req as any).file as Express.Multer.File | undefined;
const fileFields = (file: Express.Multer.File) => ({
  file_name: file.filename, original_name: file.originalname, mime_type: file.mimetype, file_size: file.size,
});
const discard = (req: Request) => {
  const file = uploaded(req);
  if (file) removeQuietly(path.join(COMPANY_DOC_DIR, file.filename));
};

/** POST /company/document (multipart, file ບໍ່ບັງຄັບ) */
export const createCompanyDocument = async (req: Request, res: Response) => {
  try {
    const input = parseInput(req.body || {});
    if ("error" in input) {
      discard(req);
      res.status(400).json({ message: input.error });
      return;
    }
    const file = uploaded(req);
    const row = await CompanyDocument.create({ ...input, ...(file ? fileFields(file) : {}), createdbyid: Number(actorOf(req)) || null });
    res.status(200).json({ message: "Successfully created company document", data: present(row) });
  } catch (error) {
    discard(req);
    sendError(res, error, "Error creating company document");
  }
};

/** PUT /company/document/:id (multipart) — ໄຟລ໌ໃໝ່ແທນໄຟລ໌ເກົ່າ, remove_file=1 = ລຶບໄຟລ໌ */
export const updateCompanyDocument = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const row = await CompanyDocument.findByPk(Number(decodeId(req)));
    const input = parseInput(req.body || {});
    if (!row || "error" in input) {
      discard(req);
      res.status(row ? 400 : 404).json({ message: row ? (input as any).error : "ບໍ່ພົບເອກະສານ" });
      return;
    }
    const file = uploaded(req);
    const removeFile = Number(req.body?.remove_file) === 1;
    const oldFile = (file || removeFile) && row.file_name ? row.file_name : null;
    const fileChange = file ? fileFields(file) : removeFile ? { file_name: null, original_name: null, mime_type: null, file_size: null } : {};
    await row.update({ ...input, ...fileChange, updatedAt: new Date() });
    if (oldFile) removeQuietly(path.join(COMPANY_DOC_DIR, path.basename(oldFile)));
    res.status(200).json({ message: "Successfully updated company document", data: present(row) });
  } catch (error) {
    discard(req);
    sendError(res, error, "Error updating company document");
  }
};

/** DELETE /company/document/:id — ລຶບແຖວ ແລະ ໄຟລ໌ */
export const deleteCompanyDocument = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const row = await CompanyDocument.findByPk(Number(decodeId(req)));
    if (!row) {
      res.status(404).json({ message: "ບໍ່ພົບເອກະສານ" });
      return;
    }
    await row.destroy();
    if (row.file_name) removeQuietly(path.join(COMPANY_DOC_DIR, path.basename(row.file_name)));
    res.status(200).json({ message: "Successfully deleted company document" });
  } catch (error) {
    sendError(res, error, "Error deleting company document");
  }
};

/** GET /company/document/download/:id */
export const downloadCompanyDocument = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const row = await CompanyDocument.findByPk(Number(decodeId(req)));
    const filePath = row?.file_name ? path.join(COMPANY_DOC_DIR, path.basename(row.file_name)) : null;
    if (!row || !filePath || !fs.existsSync(filePath)) {
      res.status(404).json({ message: "ບໍ່ພົບໄຟລ໌" });
      return;
    }
    res.download(filePath, row.original_name ?? path.basename(filePath));
  } catch (error) {
    sendError(res, error, "Error downloading company document");
  }
};
