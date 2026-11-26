import { Request, Response } from "express";
import path from "path";
import fs from "fs";
import Loan from "../../models/loan";
import { LoanApplication, LoanCollateral, LoanCustomer, LoanDocument, LoanNotice } from "../../models/loanCredit";
import { GlError } from "../bansi/glCore";
import { actorOf, toDateOnly } from "../bansi/bansiHelpers";
import { fail } from "../bansi/loanController";
import { CREDIT_DOC_DIR, originalNameOf, removeQuietly } from "../hr/hrHelpers";
import { userNames } from "./creditPenalty";

/**
 * ເອກະສານແນບ (tbl_loan_document) ຂອງ ລູກຄ້າ / ຄຳຮ້ອງ / ສັນຍາ / ຫຼັກຊັບ ແລະ ປະຫວັດການແຈ້ງເຕືອນ (tbl_loan_notice).
 * ໄຟລ໌ຢູ່ private/credit-docs (ບໍ່ເປີດສາທາລະນະ) — ດາວໂຫຼດຜ່ານ API ທີ່ກວດ token
 */

const OWNERS: Record<string, any> = { customer: LoanCustomer, application: LoanApplication, loan: Loan, collateral: LoanCollateral };
const DOC_TYPES = ["ID_CARD", "FAMILY_BOOK", "PASSPORT", "COMPANY_REG", "CONTRACT", "LAND_TITLE", "VEHICLE_REG", "INCOME", "PHOTO", "OTHER"];

/** ກວດເຈົ້າຂອງ (ຢູ່ບໍລິສັດດຽວກັນ — model ກັ່ນຕາມບໍລິສັດ) */
const ownerOf = async (type: unknown, id: unknown) => {
  const model = OWNERS[String(type)];
  if (!model) throw new GlError("ປະເພດເຈົ້າຂອງເອກະສານບໍ່ຖືກຕ້ອງ");
  const row = await model.findByPk(Number(id), { attributes: ["_uuid"] });
  if (!row) throw new GlError("ບໍ່ພົບຂໍ້ມູນທີ່ຈະແນບເອກະສານ");
  return { type: String(type), id: Number(row._uuid) };
};

const present = (rows: LoanDocument[], names: Map<number, string>) => rows.map((d) => ({
  _uuid: d._uuid, owner_type: d.owner_type, owner_id: d.owner_id, doc_type: d.doc_type, title: d.title, file_name: d.file_name,
  mime: d.mime, size: d.size, expiry_date: d.expiry_date, createdAt: d.createdAt, by: names.get(Number(d.uploaded_by)) ?? null,
}));

/** GET /credit/document?owner_type&owner_id — ລາຍການເອກະສານ (ໃໝ່ສຸດກ່ອນ) */
export const getDocuments = async (req: Request, res: Response) => {
  try {
    const owner = await ownerOf(req.query.owner_type, req.query.owner_id);
    const rows = await LoanDocument.findAll({ where: { owner_type: owner.type, owner_id: owner.id }, order: [["_uuid", "DESC"]] });
    res.status(200).json({ data: present(rows, await userNames(rows.map((r) => r.uploaded_by))) });
  } catch (error) {
    fail(res, error, "Error getting documents");
  }
};

/** POST /credit/document (multipart: files[], owner_type, owner_id, doc_type, title?, expiry_date?) — ສູງສຸດ 5 ໄຟລ໌ຕໍ່ເທື່ອ */
export const uploadDocuments = async (req: Request, res: Response) => {
  const files = ((req as any).files ?? []) as Express.Multer.File[];
  try {
    const owner = await ownerOf(req.body?.owner_type, req.body?.owner_id);
    if (!files.length) throw new GlError("ກະລຸນາເລືອກໄຟລ໌");
    const docType = DOC_TYPES.includes(String(req.body?.doc_type)) ? String(req.body.doc_type) : "OTHER";
    const title = String(req.body?.title ?? "").trim().slice(0, 200) || null;
    await LoanDocument.bulkCreate(files.map((f) => ({
      owner_type: owner.type, owner_id: owner.id, doc_type: docType, title: title ?? originalNameOf(f).slice(0, 200),
      file_path: f.filename, file_name: originalNameOf(f).slice(0, 200), mime: f.mimetype?.slice(0, 100) ?? null, size: f.size,
      expiry_date: toDateOnly(req.body?.expiry_date), uploaded_by: Number(actorOf(req)) || null,
    })) as any);
    res.status(200).json({ message: "Successfully uploaded documents" });
  } catch (error) {
    files.forEach((f) => removeQuietly(f.path));
    fail(res, error, "Error uploading documents");
  }
};

/** GET /credit/document/download/:id */
export const downloadDocument = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const doc = await LoanDocument.findByPk(Number(req.params.id));
    const filePath = doc && path.join(CREDIT_DOC_DIR, path.basename(doc.file_path));
    if (!doc || !filePath || !fs.existsSync(filePath)) {
      res.status(404).json({ message: "ບໍ່ພົບໄຟລ໌" });
      return;
    }
    res.download(filePath, doc.file_name ?? path.basename(doc.file_path));
  } catch (error) {
    fail(res, error, "Error downloading document");
  }
};

/** DELETE /credit/document/:id */
export const deleteDocument = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const doc = await LoanDocument.findByPk(Number(req.params.id));
    if (!doc) throw new GlError("ບໍ່ພົບເອກະສານ");
    removeQuietly(path.join(CREDIT_DOC_DIR, path.basename(doc.file_path)));
    await doc.destroy();
    res.status(200).json({ message: "Successfully deleted document" });
  } catch (error) {
    fail(res, error, "Error deleting document");
  }
};

// ================= ແຈ້ງເຕືອນ

/**
 * POST /credit/notice { loan_id, installment_no?, notice_type (1 ກ່ອນຄົບກຳນົດ, 2 ເລີຍກຳນົດ, 3 ໃບແຈ້ງໜີ້), channel (1 SMS / ຂໍ້ຄວາມ, 2 push, 3 ພິມ), phone, message }
 * — ບັນທຶກວ່າສົ່ງແລ້ວ (ສົ່ງເອງຜ່ານ WhatsApp / SMS ຂອງໂທລະສັບ; ຍັງບໍ່ມີຜູ້ໃຫ້ບໍລິການ SMS)
 */
export const createNotice = async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const loan = await Loan.findByPk(Number(body.loan_id), { attributes: ["_uuid", "customer_id"] });
    if (!loan || !loan.customer_id) throw new GlError("ບໍ່ພົບສັນຍາສິນເຊື່ອ");
    const message = String(body.message ?? "").trim();
    if (!message) throw new GlError("ກະລຸນາປ້ອນຂໍ້ຄວາມ");
    const row = await LoanNotice.create({
      loan_id: loan._uuid, installment_no: Number(body.installment_no) || null,
      notice_type: [1, 2, 3].includes(Number(body.notice_type)) ? Number(body.notice_type) : 2,
      channel: [1, 2, 3].includes(Number(body.channel)) ? Number(body.channel) : 1,
      phone: String(body.phone ?? "").trim().slice(0, 50) || null, message: message.slice(0, 2000),
      sent_at: new Date(), status: 1,
    } as any);
    res.status(200).json({ message: "Successfully logged notice", data: row });
  } catch (error) {
    fail(res, error, "Error logging notice");
  }
};
