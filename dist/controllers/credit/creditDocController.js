"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNotice = exports.deleteDocument = exports.downloadDocument = exports.uploadDocuments = exports.getDocuments = void 0;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const loan_1 = __importDefault(require("../../models/loan"));
const loanCredit_1 = require("../../models/loanCredit");
const glCore_1 = require("../bansi/glCore");
const bansiHelpers_1 = require("../bansi/bansiHelpers");
const loanController_1 = require("../bansi/loanController");
const hrHelpers_1 = require("../hr/hrHelpers");
const creditPenalty_1 = require("./creditPenalty");
/**
 * ເອກະສານແນບ (tbl_loan_document) ຂອງ ລູກຄ້າ / ຄຳຮ້ອງ / ສັນຍາ / ຫຼັກຊັບ ແລະ ປະຫວັດການແຈ້ງເຕືອນ (tbl_loan_notice).
 * ໄຟລ໌ຢູ່ private/credit-docs (ບໍ່ເປີດສາທາລະນະ) — ດາວໂຫຼດຜ່ານ API ທີ່ກວດ token
 */
const OWNERS = { customer: loanCredit_1.LoanCustomer, application: loanCredit_1.LoanApplication, loan: loan_1.default, collateral: loanCredit_1.LoanCollateral };
const DOC_TYPES = ["ID_CARD", "FAMILY_BOOK", "PASSPORT", "COMPANY_REG", "CONTRACT", "LAND_TITLE", "VEHICLE_REG", "INCOME", "PHOTO", "OTHER"];
/** ກວດເຈົ້າຂອງ (ຢູ່ບໍລິສັດດຽວກັນ — model ກັ່ນຕາມບໍລິສັດ) */
const ownerOf = async (type, id) => {
    const model = OWNERS[String(type)];
    if (!model)
        throw new glCore_1.GlError("ປະເພດເຈົ້າຂອງເອກະສານບໍ່ຖືກຕ້ອງ");
    const row = await model.findByPk(Number(id), { attributes: ["_uuid"] });
    if (!row)
        throw new glCore_1.GlError("ບໍ່ພົບຂໍ້ມູນທີ່ຈະແນບເອກະສານ");
    return { type: String(type), id: Number(row._uuid) };
};
const present = (rows, names) => rows.map((d) => ({
    _uuid: d._uuid, owner_type: d.owner_type, owner_id: d.owner_id, doc_type: d.doc_type, title: d.title, file_name: d.file_name,
    mime: d.mime, size: d.size, expiry_date: d.expiry_date, createdAt: d.createdAt, by: names.get(Number(d.uploaded_by)) ?? null,
}));
/** GET /credit/document?owner_type&owner_id — ລາຍການເອກະສານ (ໃໝ່ສຸດກ່ອນ) */
const getDocuments = async (req, res) => {
    try {
        const owner = await ownerOf(req.query.owner_type, req.query.owner_id);
        const rows = await loanCredit_1.LoanDocument.findAll({ where: { owner_type: owner.type, owner_id: owner.id }, order: [["_uuid", "DESC"]] });
        res.status(200).json({ data: present(rows, await (0, creditPenalty_1.userNames)(rows.map((r) => r.uploaded_by))) });
    }
    catch (error) {
        (0, loanController_1.fail)(res, error, "Error getting documents");
    }
};
exports.getDocuments = getDocuments;
/** POST /credit/document (multipart: files[], owner_type, owner_id, doc_type, title?, expiry_date?) — ສູງສຸດ 5 ໄຟລ໌ຕໍ່ເທື່ອ */
const uploadDocuments = async (req, res) => {
    const files = (req.files ?? []);
    try {
        const owner = await ownerOf(req.body?.owner_type, req.body?.owner_id);
        if (!files.length)
            throw new glCore_1.GlError("ກະລຸນາເລືອກໄຟລ໌");
        const docType = DOC_TYPES.includes(String(req.body?.doc_type)) ? String(req.body.doc_type) : "OTHER";
        const title = String(req.body?.title ?? "").trim().slice(0, 200) || null;
        await loanCredit_1.LoanDocument.bulkCreate(files.map((f) => ({
            owner_type: owner.type, owner_id: owner.id, doc_type: docType, title: title ?? (0, hrHelpers_1.originalNameOf)(f).slice(0, 200),
            file_path: f.filename, file_name: (0, hrHelpers_1.originalNameOf)(f).slice(0, 200), mime: f.mimetype?.slice(0, 100) ?? null, size: f.size,
            expiry_date: (0, bansiHelpers_1.toDateOnly)(req.body?.expiry_date), uploaded_by: Number((0, bansiHelpers_1.actorOf)(req)) || null,
        })));
        res.status(200).json({ message: "Successfully uploaded documents" });
    }
    catch (error) {
        files.forEach((f) => (0, hrHelpers_1.removeQuietly)(f.path));
        (0, loanController_1.fail)(res, error, "Error uploading documents");
    }
};
exports.uploadDocuments = uploadDocuments;
/** GET /credit/document/download/:id */
const downloadDocument = async (req, res) => {
    try {
        const doc = await loanCredit_1.LoanDocument.findByPk(Number(req.params.id));
        const filePath = doc && path_1.default.join(hrHelpers_1.CREDIT_DOC_DIR, path_1.default.basename(doc.file_path));
        if (!doc || !filePath || !fs_1.default.existsSync(filePath)) {
            res.status(404).json({ message: "ບໍ່ພົບໄຟລ໌" });
            return;
        }
        res.download(filePath, doc.file_name ?? path_1.default.basename(doc.file_path));
    }
    catch (error) {
        (0, loanController_1.fail)(res, error, "Error downloading document");
    }
};
exports.downloadDocument = downloadDocument;
/** DELETE /credit/document/:id */
const deleteDocument = async (req, res) => {
    try {
        const doc = await loanCredit_1.LoanDocument.findByPk(Number(req.params.id));
        if (!doc)
            throw new glCore_1.GlError("ບໍ່ພົບເອກະສານ");
        (0, hrHelpers_1.removeQuietly)(path_1.default.join(hrHelpers_1.CREDIT_DOC_DIR, path_1.default.basename(doc.file_path)));
        await doc.destroy();
        res.status(200).json({ message: "Successfully deleted document" });
    }
    catch (error) {
        (0, loanController_1.fail)(res, error, "Error deleting document");
    }
};
exports.deleteDocument = deleteDocument;
// ================= ແຈ້ງເຕືອນ
/**
 * POST /credit/notice { loan_id, installment_no?, notice_type (1 ກ່ອນຄົບກຳນົດ, 2 ເລີຍກຳນົດ, 3 ໃບແຈ້ງໜີ້), channel (1 SMS / ຂໍ້ຄວາມ, 2 push, 3 ພິມ), phone, message }
 * — ບັນທຶກວ່າສົ່ງແລ້ວ (ສົ່ງເອງຜ່ານ WhatsApp / SMS ຂອງໂທລະສັບ; ຍັງບໍ່ມີຜູ້ໃຫ້ບໍລິການ SMS)
 */
const createNotice = async (req, res) => {
    try {
        const body = req.body ?? {};
        const loan = await loan_1.default.findByPk(Number(body.loan_id), { attributes: ["_uuid", "customer_id"] });
        if (!loan || !loan.customer_id)
            throw new glCore_1.GlError("ບໍ່ພົບສັນຍາສິນເຊື່ອ");
        const message = String(body.message ?? "").trim();
        if (!message)
            throw new glCore_1.GlError("ກະລຸນາປ້ອນຂໍ້ຄວາມ");
        const row = await loanCredit_1.LoanNotice.create({
            loan_id: loan._uuid, installment_no: Number(body.installment_no) || null,
            notice_type: [1, 2, 3].includes(Number(body.notice_type)) ? Number(body.notice_type) : 2,
            channel: [1, 2, 3].includes(Number(body.channel)) ? Number(body.channel) : 1,
            phone: String(body.phone ?? "").trim().slice(0, 50) || null, message: message.slice(0, 2000),
            sent_at: new Date(), status: 1,
        });
        res.status(200).json({ message: "Successfully logged notice", data: row });
    }
    catch (error) {
        (0, loanController_1.fail)(res, error, "Error logging notice");
    }
};
exports.createNotice = createNotice;
