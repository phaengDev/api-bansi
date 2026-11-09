"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadResumeFile = exports.deleteResume = exports.updateResume = exports.createResume = void 0;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const employee_1 = __importDefault(require("../../models/employee"));
const employeeResume_1 = __importDefault(require("../../models/employeeResume"));
const bansiHelpers_1 = require("../bansi/bansiHelpers");
const hrHelpers_1 = require("./hrHelpers");
const employeeController_1 = require("./employeeController");
/**
 * ປະຫວັດຫຍໍ້ຂອງພະນັກງານ — ປະສົບການເຮັດວຽກ (1), ການສຶກສາ (2), ການຝຶກອົບຮົມ (3)
 * ແຕ່ລະແຖວແນບໃບຢັ້ງຢືນໄດ້ 1 ໄຟລ໌ (multipart field "files", ເກັບຄືເອກະສານພະນັກງານ)
 */
const KINDS = [1, 2, 3];
const fileOf = (req) => (req.files ?? [])[0];
const discard = (req) => (req.files ?? []).forEach((f) => (0, hrHelpers_1.removeQuietly)(f.path));
const parse = (body) => {
    const kind = Number(body.kind);
    if (!KINDS.includes(kind))
        return { error: "ປະເພດປະຫວັດບໍ່ຖືກຕ້ອງ" };
    const title = String(body.title ?? "").trim().slice(0, 200);
    if (!title)
        return { error: "ກະລຸນາປ້ອນຊື່ບ່ອນເຮັດວຽກ / ສະຖາບັນ / ຫຼັກສູດ" };
    const start = body.start_date ? (0, bansiHelpers_1.toDateOnly)(body.start_date) : null;
    const end = body.end_date ? (0, bansiHelpers_1.toDateOnly)(body.end_date) : null;
    if ((body.start_date && !start) || (body.end_date && !end))
        return { error: "ວັນທີບໍ່ຖືກຕ້ອງ" };
    if (start && end && end < start)
        return { error: "ວັນທີສິ້ນສຸດຕ້ອງບໍ່ກ່ອນວັນທີເລີ່ມ" };
    return {
        kind,
        title,
        subtitle: String(body.subtitle ?? "").trim().slice(0, 200) || null,
        start_date: start,
        end_date: end,
        description: String(body.description ?? "").trim().slice(0, 4000) || null,
    };
};
const fileFields = (file) => ({
    file_name: file.filename,
    original_name: (0, hrHelpers_1.originalNameOf)(file).slice(0, 255),
    mime_type: file.mimetype?.slice(0, 100) ?? null,
    file_size: file.size,
});
/** POST /employee/resume/:id (multipart) — :id = ພະນັກງານ */
const createResume = async (req, res) => {
    try {
        const employee = await employee_1.default.findByPk(Number((0, bansiHelpers_1.decodeId)(req)), { attributes: ["_uuid"] });
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
        const row = await employeeResume_1.default.create({ ...input, employee_id: employee._uuid, ...(file ? fileFields(file) : {}), createdbyid: Number((0, bansiHelpers_1.actorOf)(req)) || null });
        res.status(200).json({ message: "Successfully created resume line", data: await (0, employeeController_1.findFull)(row.employee_id) });
    }
    catch (error) {
        discard(req);
        (0, bansiHelpers_1.sendError)(res, error, "Error creating resume line");
    }
};
exports.createResume = createResume;
/** PUT /employee/resume-line/:id (multipart) — ໄຟລ໌ໃໝ່ = ແທນອັນເກົ່າ, remove_file=1 = ລຶບໄຟລ໌ */
const updateResume = async (req, res) => {
    try {
        const row = await employeeResume_1.default.findByPk(Number((0, bansiHelpers_1.decodeId)(req)));
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
        if (old)
            (0, hrHelpers_1.removeQuietly)(path_1.default.join(hrHelpers_1.DOCUMENT_DIR, path_1.default.basename(old)));
        res.status(200).json({ message: "Successfully updated resume line", data: await (0, employeeController_1.findFull)(row.employee_id) });
    }
    catch (error) {
        discard(req);
        (0, bansiHelpers_1.sendError)(res, error, "Error updating resume line");
    }
};
exports.updateResume = updateResume;
/** DELETE /employee/resume-line/:id */
const deleteResume = async (req, res) => {
    try {
        const row = await employeeResume_1.default.findByPk(Number((0, bansiHelpers_1.decodeId)(req)));
        if (!row) {
            res.status(404).json({ message: "ບໍ່ພົບລາຍການ" });
            return;
        }
        const file = row.file_name;
        await row.destroy();
        if (file)
            (0, hrHelpers_1.removeQuietly)(path_1.default.join(hrHelpers_1.DOCUMENT_DIR, path_1.default.basename(file)));
        res.status(200).json({ message: "Successfully deleted resume line", data: await (0, employeeController_1.findFull)(row.employee_id) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error deleting resume line");
    }
};
exports.deleteResume = deleteResume;
/** GET /employee/resume-line/file/:id — ດາວໂຫຼດໃບຢັ້ງຢືນ */
const downloadResumeFile = async (req, res) => {
    try {
        const row = await employeeResume_1.default.findByPk(Number((0, bansiHelpers_1.decodeId)(req)));
        const filePath = row?.file_name && path_1.default.join(hrHelpers_1.DOCUMENT_DIR, path_1.default.basename(row.file_name));
        if (!row || !filePath || !fs_1.default.existsSync(filePath)) {
            res.status(404).json({ message: "ບໍ່ພົບໄຟລ໌" });
            return;
        }
        res.download(filePath, row.original_name ?? path_1.default.basename(filePath));
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error downloading resume file");
    }
};
exports.downloadResumeFile = downloadResumeFile;
