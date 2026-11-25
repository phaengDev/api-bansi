"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadCompanyDocument = exports.deleteCompanyDocument = exports.updateCompanyDocument = exports.createCompanyDocument = exports.getCompanyDocuments = exports.companyDocsDue = exports.COMPANY_DOC_AHEAD_DAYS = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const companyDocument_1 = __importDefault(require("../../models/companyDocument"));
const bansiHelpers_1 = require("../bansi/bansiHelpers");
const hrHelpers_1 = require("./hrHelpers");
const workCalendar_1 = require("./workCalendar");
/**
 * ເອກະສານຂອງບໍລິສັດ — doc_type: 1 ໃບທະບຽນວິສາຫະກິດ, 2 ໃບທະບຽນອາກອນ, 3 ໃບອະນຸຍາດດຳເນີນທຸລະກິດ, 4 ອື່ນໆ.
 * ໃກ້ໝົດອາຍຸ = ໝົດແລ້ວ ຫຼື ໝົດພາຍໃນ 60 ມື້ (ຕໍ່ໃບອະນຸຍາດໃຊ້ເວລາ) — companyDocsDue() ໃຊ້ຮ່ວມກັບ GET /hr/pending
 */
const DOC_TYPES = [1, 2, 3, 4];
exports.COMPANY_DOC_AHEAD_DAYS = 60;
const daysLeft = (date) => {
    if (!date)
        return null;
    const today = (0, workCalendar_1.nowLao)().format("YYYY-MM-DD");
    return Math.round((new Date(`${date}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000);
};
const present = (row) => {
    const { file_name: file, ...rest } = row.get({ plain: true });
    return { ...rest, has_file: !!file, days_left: daysLeft(rest.expiry_date) };
};
/** ຈຳນວນເອກະສານທີ່ໝົດແລ້ວ ຫຼື ໃກ້ໝົດ (ພາຍໃນ 60 ມື້) */
const companyDocsDue = async () => {
    const rows = await companyDocument_1.default.findAll({ attributes: ["expiry_date"], raw: true });
    return rows.filter((row) => {
        const days = daysLeft(row.expiry_date);
        return days !== null && days <= exports.COMPANY_DOC_AHEAD_DAYS;
    }).length;
};
exports.companyDocsDue = companyDocsDue;
/** GET /company/document — ທຸກເອກະສານ: ໃກ້ໝົດກ່ອນ, ແລ້ວຕາມປະເພດ */
const getCompanyDocuments = async (_req, res) => {
    try {
        const rows = (await companyDocument_1.default.findAll({ order: [["doc_type", "ASC"], ["_uuid", "ASC"]] })).map(present);
        rows.sort((a, b) => (a.days_left ?? 99999) - (b.days_left ?? 99999));
        res.status(200).json({ data: rows, ahead_days: exports.COMPANY_DOC_AHEAD_DAYS });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting company documents");
    }
};
exports.getCompanyDocuments = getCompanyDocuments;
const parseInput = (body) => {
    const title = String(body.title ?? "").trim().slice(0, 150);
    if (!title)
        return { error: "ກະລຸນາປ້ອນຊື່ເອກະສານ" };
    const docType = Number(body.doc_type);
    const issue = (0, bansiHelpers_1.toDateOnly)(body.issue_date);
    const expiry = (0, bansiHelpers_1.toDateOnly)(body.expiry_date);
    if (issue && expiry && expiry < issue)
        return { error: "ວັນໝົດອາຍຸຕ້ອງຫຼັງວັນອອກ" };
    const text = (value, max) => String(value ?? "").trim().slice(0, max) || null;
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
const uploaded = (req) => req.file;
const fileFields = (file) => ({
    file_name: file.filename, original_name: file.originalname, mime_type: file.mimetype, file_size: file.size,
});
const discard = (req) => {
    const file = uploaded(req);
    if (file)
        (0, hrHelpers_1.removeQuietly)(path_1.default.join(hrHelpers_1.COMPANY_DOC_DIR, file.filename));
};
/** POST /company/document (multipart, file ບໍ່ບັງຄັບ) */
const createCompanyDocument = async (req, res) => {
    try {
        const input = parseInput(req.body || {});
        if ("error" in input) {
            discard(req);
            res.status(400).json({ message: input.error });
            return;
        }
        const file = uploaded(req);
        const row = await companyDocument_1.default.create({ ...input, ...(file ? fileFields(file) : {}), createdbyid: Number((0, bansiHelpers_1.actorOf)(req)) || null });
        res.status(200).json({ message: "Successfully created company document", data: present(row) });
    }
    catch (error) {
        discard(req);
        (0, bansiHelpers_1.sendError)(res, error, "Error creating company document");
    }
};
exports.createCompanyDocument = createCompanyDocument;
/** PUT /company/document/:id (multipart) — ໄຟລ໌ໃໝ່ແທນໄຟລ໌ເກົ່າ, remove_file=1 = ລຶບໄຟລ໌ */
const updateCompanyDocument = async (req, res) => {
    try {
        const row = await companyDocument_1.default.findByPk(Number((0, bansiHelpers_1.decodeId)(req)));
        const input = parseInput(req.body || {});
        if (!row || "error" in input) {
            discard(req);
            res.status(row ? 400 : 404).json({ message: row ? input.error : "ບໍ່ພົບເອກະສານ" });
            return;
        }
        const file = uploaded(req);
        const removeFile = Number(req.body?.remove_file) === 1;
        const oldFile = (file || removeFile) && row.file_name ? row.file_name : null;
        const fileChange = file ? fileFields(file) : removeFile ? { file_name: null, original_name: null, mime_type: null, file_size: null } : {};
        await row.update({ ...input, ...fileChange, updatedAt: new Date() });
        if (oldFile)
            (0, hrHelpers_1.removeQuietly)(path_1.default.join(hrHelpers_1.COMPANY_DOC_DIR, path_1.default.basename(oldFile)));
        res.status(200).json({ message: "Successfully updated company document", data: present(row) });
    }
    catch (error) {
        discard(req);
        (0, bansiHelpers_1.sendError)(res, error, "Error updating company document");
    }
};
exports.updateCompanyDocument = updateCompanyDocument;
/** DELETE /company/document/:id — ລຶບແຖວ ແລະ ໄຟລ໌ */
const deleteCompanyDocument = async (req, res) => {
    try {
        const row = await companyDocument_1.default.findByPk(Number((0, bansiHelpers_1.decodeId)(req)));
        if (!row) {
            res.status(404).json({ message: "ບໍ່ພົບເອກະສານ" });
            return;
        }
        await row.destroy();
        if (row.file_name)
            (0, hrHelpers_1.removeQuietly)(path_1.default.join(hrHelpers_1.COMPANY_DOC_DIR, path_1.default.basename(row.file_name)));
        res.status(200).json({ message: "Successfully deleted company document" });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error deleting company document");
    }
};
exports.deleteCompanyDocument = deleteCompanyDocument;
/** GET /company/document/download/:id */
const downloadCompanyDocument = async (req, res) => {
    try {
        const row = await companyDocument_1.default.findByPk(Number((0, bansiHelpers_1.decodeId)(req)));
        const filePath = row?.file_name ? path_1.default.join(hrHelpers_1.COMPANY_DOC_DIR, path_1.default.basename(row.file_name)) : null;
        if (!row || !filePath || !fs_1.default.existsSync(filePath)) {
            res.status(404).json({ message: "ບໍ່ພົບໄຟລ໌" });
            return;
        }
        res.download(filePath, row.original_name ?? path_1.default.basename(filePath));
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error downloading company document");
    }
};
exports.downloadCompanyDocument = downloadCompanyDocument;
