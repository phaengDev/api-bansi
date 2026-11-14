"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteMyNoteFolder = exports.renameMyNoteFolder = exports.createMyNoteFolder = exports.deleteMyNote = exports.updateMyNote = exports.createMyNote = exports.getMyNotes = void 0;
const sequelize_1 = require("sequelize");
const note_1 = __importDefault(require("../../models/note"));
const noteFolder_1 = __importDefault(require("../../models/noteFolder"));
const bansiHelpers_1 = require("../bansi/bansiHelpers");
const attendanceController_1 = require("./attendanceController");
/**
 * ໂນດສ່ວນຕົວຂອງພະນັກງານ (app → ເມນູ "ໂນດ") — ຂໍ້ຄວາມ + ຮູບຂີດແຕ້ມ, ເຫັນ / ແກ້ / ລຶບໄດ້ສະເພາະເຈົ້າຂອງ:
 * - GET /note/me?q= — ໂນດທັງໝົດ (ປັກໝຸດກ່ອນ, ແກ້ໄຂຫຼ້າສຸດກ່ອນ; ຄົ້ນຫາໃນຫົວຂໍ້ + ຂໍ້ຄວາມ) + folders (ພ້ອມຈຳນວນໂນດ)
 * - POST /note/me { title?, body?, ink?, color?, pinned?, folder_id? } — ຕ້ອງມີຢ່າງໜ້ອຍ ຫົວຂໍ້ / ຂໍ້ຄວາມ / ຮູບ
 * - PUT /note/me/:id (ສົ່ງສະເພາະຟີວທີ່ປ່ຽນ; ink: null = ລຶບຮູບ), DELETE /note/me/:id
 * ink = JSON ເສັ້ນ vector ຈາກ app (ເກັບເປັນຂໍ້ຄວາມ, ສົ່ງຄືນຄືເກົ່າ) — ໃຫຍ່ສຸດ 4MB;
 * marks = JSON ສີ / ໂຕໜາ / ໄຮໄລ້ ຂອງບາງຄຳໃນ body ([{ s, e, c?, b?, h? }]) — app ສົ່ງພ້ອມ body ສະເໝີ.
 * ໂຟນເດີ: POST /note/me/folders { name }, PUT /note/me/folders/:id { name }, DELETE /note/me/folders/:id
 * (ໂນດຂ້າງໃນຍ້າຍອອກມາຢູ່ນອກ); folder_id ຂອງໂນດ = null → ຢູ່ນອກໂຟນເດີ
 */
const MAX_TITLE = 255;
const MAX_BODY = 20000;
const MAX_INK = 4 * 1024 * 1024;
const MAX_MARKS = 256 * 1024;
const MAX_LIST = 300;
const MAX_FOLDER_NAME = 100;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const me = async (req, res) => {
    const self = await (0, attendanceController_1.selfEmployee)(req);
    if ("code" in self) {
        res.status(self.code).json({ message: self.message });
        return null;
    }
    return Number(self.employee._uuid);
};
/** ໂນດຂອງຂ້ອຍ — ບໍ່ແມ່ນຂອງຂ້ອຍ / ບໍ່ມີ = null (ຕອບ 404 ຄືກັນ) */
const myNote = (req, employeeId) => {
    const id = Number((0, bansiHelpers_1.decodeId)(req)) || 0;
    return id ? note_1.default.findOne({ where: { _uuid: id, employee_id: employeeId } }) : Promise.resolve(null);
};
const present = (n) => ({
    _uuid: n._uuid,
    folder_id: n.folder_id ?? null,
    title: n.title,
    body: n.body,
    marks: n.marks,
    ink: n.ink,
    color: n.color,
    pinned: Number(n.pinned) === 1,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
});
/** ອ່ານຟີວທີ່ສົ່ງມາ (ບໍ່ສົ່ງ = ບໍ່ປ່ຽນ) — ຜິດຮູບແບບ = ຂໍ້ຄວາມ error */
const readInput = (body) => {
    const input = {};
    if (body.title !== undefined) {
        const title = String(body.title ?? "").trim();
        if (title.length > MAX_TITLE)
            return { error: `ຫົວຂໍ້ຍາວເກີນ ${MAX_TITLE} ຕົວອັກສອນ` };
        input.title = title || null;
    }
    if (body.body !== undefined) {
        const text = String(body.body ?? "").replace(/\s+$/, "");
        if (text.length > MAX_BODY)
            return { error: `ໂນດຍາວເກີນ ${MAX_BODY} ຕົວອັກສອນ` };
        input.body = text || null;
    }
    if (body.marks !== undefined) {
        if (body.marks === null || body.marks === "") {
            input.marks = null;
        }
        else {
            const raw = typeof body.marks === "string" ? body.marks : JSON.stringify(body.marks);
            if (raw.length > MAX_MARKS)
                return { error: "ສີຕົວໜັງສືຫຼາຍເກີນ" };
            try {
                const marks = JSON.parse(raw);
                if (!Array.isArray(marks))
                    return { error: "ສີຕົວໜັງສືບໍ່ຖືກຕ້ອງ" };
                input.marks = marks.length ? raw : null;
            }
            catch {
                return { error: "ສີຕົວໜັງສືບໍ່ຖືກຕ້ອງ" };
            }
        }
    }
    if (body.ink !== undefined) {
        if (body.ink === null || body.ink === "") {
            input.ink = null;
        }
        else {
            const raw = typeof body.ink === "string" ? body.ink : JSON.stringify(body.ink);
            if (raw.length > MAX_INK)
                return { error: "ຮູບຂີດແຕ້ມໃຫຍ່ເກີນ — ແບ່ງເປັນຫຼາຍໂນດ" };
            try {
                const ink = JSON.parse(raw);
                if (!ink || typeof ink !== "object" || !Array.isArray(ink.strokes))
                    return { error: "ຮູບຂີດແຕ້ມບໍ່ຖືກຕ້ອງ" };
                input.ink = ink.strokes.length ? raw : null;
            }
            catch {
                return { error: "ຮູບຂີດແຕ້ມບໍ່ຖືກຕ້ອງ" };
            }
        }
    }
    if (body.color !== undefined) {
        const color = String(body.color ?? "").trim();
        if (color && !COLOR.test(color))
            return { error: "ສີບໍ່ຖືກຕ້ອງ" };
        input.color = color || null;
    }
    if (body.pinned !== undefined)
        input.pinned = body.pinned === true || Number(body.pinned) === 1 ? 1 : 0;
    return { input };
};
const isEmpty = (n) => !n.title && !n.body && !n.ink;
/** folder_id ທີ່ສົ່ງມາ: ບໍ່ສົ່ງ = ບໍ່ປ່ຽນ, null / 0 = ຢູ່ນອກໂຟນເດີ, ອື່ນໆ = ຕ້ອງເປັນໂຟນເດີຂອງຂ້ອຍ */
const readFolder = async (body, employeeId) => {
    if (body.folder_id === undefined)
        return {};
    const id = Number(body.folder_id) || 0;
    if (!id)
        return { folder: null };
    const folder = await noteFolder_1.default.findOne({ where: { _uuid: id, employee_id: employeeId }, attributes: ["_uuid"] });
    return folder ? { folder: folder._uuid } : { error: "ບໍ່ພົບໂຟນເດີນີ້" };
};
/** ໂຟນເດີຂອງຂ້ອຍ (ລຽງຕາມຊື່) + ຈຳນວນໂນດຂ້າງໃນ */
const foldersOf = async (employeeId) => {
    const [folders, counts] = await Promise.all([
        noteFolder_1.default.findAll({ where: { employee_id: employeeId }, order: [["name", "ASC"], ["_uuid", "ASC"]] }),
        note_1.default.findAll({
            where: { employee_id: employeeId, folder_id: { [sequelize_1.Op.ne]: null } },
            attributes: ["folder_id", [(0, sequelize_1.fn)("COUNT", (0, sequelize_1.col)("_uuid")), "total"]],
            group: ["folder_id"],
            raw: true,
        }),
    ]);
    const count = new Map(counts.map((c) => [Number(c.folder_id), Number(c.total) || 0]));
    return folders.map((f) => ({ _uuid: f._uuid, name: f.name, count: count.get(f._uuid) ?? 0, createdAt: f.createdAt }));
};
/** GET /note/me?q= */
const getMyNotes = async (req, res) => {
    try {
        const employeeId = await me(req, res);
        if (employeeId === null)
            return;
        const q = String(req.query.q ?? "").trim().slice(0, 100);
        const rows = await note_1.default.findAll({
            where: {
                employee_id: employeeId,
                ...(q ? { [sequelize_1.Op.or]: [{ title: { [sequelize_1.Op.like]: `%${q}%` } }, { body: { [sequelize_1.Op.like]: `%${q}%` } }] } : {}),
            },
            order: [["pinned", "DESC"], ["updatedAt", "DESC"], ["_uuid", "DESC"]],
            limit: MAX_LIST,
        });
        res.status(200).json({ data: rows.map(present), folders: await foldersOf(employeeId) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting my notes");
    }
};
exports.getMyNotes = getMyNotes;
/** POST /note/me */
const createMyNote = async (req, res) => {
    try {
        const employeeId = await me(req, res);
        if (employeeId === null)
            return;
        const result = readInput(req.body ?? {});
        if ("error" in result) {
            res.status(400).json({ message: result.error });
            return;
        }
        if (isEmpty(result.input)) {
            res.status(400).json({ message: "ໂນດຫວ່າງ — ຂຽນ ຫຼື ຂີດແຕ້ມກ່ອນ" });
            return;
        }
        const folder = await readFolder(req.body ?? {}, employeeId);
        if ("error" in folder) {
            res.status(400).json({ message: folder.error });
            return;
        }
        const row = await note_1.default.create({ ...result.input, folder_id: folder.folder ?? null, employee_id: employeeId });
        res.status(200).json({ message: "ບັນທຶກໂນດແລ້ວ", data: present(row) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error creating note");
    }
};
exports.createMyNote = createMyNote;
/** PUT /note/me/:id */
const updateMyNote = async (req, res) => {
    try {
        const employeeId = await me(req, res);
        if (employeeId === null)
            return;
        const note = await myNote(req, employeeId);
        if (!note) {
            res.status(404).json({ message: "ບໍ່ພົບໂນດນີ້" });
            return;
        }
        const result = readInput(req.body ?? {});
        if ("error" in result) {
            res.status(400).json({ message: result.error });
            return;
        }
        const next = { title: note.title, body: note.body, ink: note.ink, ...result.input };
        if (isEmpty(next)) {
            res.status(400).json({ message: "ໂນດຫວ່າງ — ຖ້າບໍ່ໃຊ້ແລ້ວໃຫ້ລຶບອອກ" });
            return;
        }
        const folder = await readFolder(req.body ?? {}, employeeId);
        if ("error" in folder) {
            res.status(400).json({ message: folder.error });
            return;
        }
        await note.update({ ...result.input, ...("folder" in folder ? { folder_id: folder.folder } : {}), updatedAt: new Date() });
        res.status(200).json({ message: "ບັນທຶກໂນດແລ້ວ", data: present(note) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error updating note");
    }
};
exports.updateMyNote = updateMyNote;
/** DELETE /note/me/:id */
const deleteMyNote = async (req, res) => {
    try {
        const employeeId = await me(req, res);
        if (employeeId === null)
            return;
        const note = await myNote(req, employeeId);
        if (!note) {
            res.status(404).json({ message: "ບໍ່ພົບໂນດນີ້" });
            return;
        }
        await note.destroy();
        res.status(200).json({ message: "ລຶບໂນດແລ້ວ" });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error deleting note");
    }
};
exports.deleteMyNote = deleteMyNote;
// ================= ໂຟນເດີ
/** ໂຟນເດີຂອງຂ້ອຍ — ບໍ່ແມ່ນຂອງຂ້ອຍ / ບໍ່ມີ = null */
const myFolder = (req, employeeId) => {
    const id = Number((0, bansiHelpers_1.decodeId)(req)) || 0;
    return id ? noteFolder_1.default.findOne({ where: { _uuid: id, employee_id: employeeId } }) : Promise.resolve(null);
};
/** ຊື່ໂຟນເດີ: ບໍ່ຫວ່າງ, ບໍ່ເກີນ 100, ບໍ່ຊ້ຳກັບໂຟນເດີອື່ນຂອງຂ້ອຍ */
const folderName = async (raw, employeeId, exceptId) => {
    const name = String(raw ?? "").trim();
    if (!name)
        return { error: "ກະລຸນາໃສ່ຊື່ໂຟນເດີ" };
    if (name.length > MAX_FOLDER_NAME)
        return { error: `ຊື່ໂຟນເດີຍາວເກີນ ${MAX_FOLDER_NAME} ຕົວອັກສອນ` };
    const same = await noteFolder_1.default.findOne({
        where: { employee_id: employeeId, name, ...(exceptId ? { _uuid: { [sequelize_1.Op.ne]: exceptId } } : {}) },
        attributes: ["_uuid"],
    });
    return same ? { error: `ມີໂຟນເດີ "${name}" ແລ້ວ` } : { name };
};
/** POST /note/me/folders { name } */
const createMyNoteFolder = async (req, res) => {
    try {
        const employeeId = await me(req, res);
        if (employeeId === null)
            return;
        const result = await folderName(req.body?.name, employeeId);
        if ("error" in result) {
            res.status(400).json({ message: result.error });
            return;
        }
        const folder = await noteFolder_1.default.create({ employee_id: employeeId, name: result.name });
        res.status(200).json({ message: "ສ້າງໂຟນເດີແລ້ວ", data: { _uuid: folder._uuid, name: folder.name, count: 0 } });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error creating note folder");
    }
};
exports.createMyNoteFolder = createMyNoteFolder;
/** PUT /note/me/folders/:id { name } */
const renameMyNoteFolder = async (req, res) => {
    try {
        const employeeId = await me(req, res);
        if (employeeId === null)
            return;
        const folder = await myFolder(req, employeeId);
        if (!folder) {
            res.status(404).json({ message: "ບໍ່ພົບໂຟນເດີນີ້" });
            return;
        }
        const result = await folderName(req.body?.name, employeeId, folder._uuid);
        if ("error" in result) {
            res.status(400).json({ message: result.error });
            return;
        }
        await folder.update({ name: result.name, updatedAt: new Date() });
        res.status(200).json({ message: "ປ່ຽນຊື່ໂຟນເດີແລ້ວ", data: { _uuid: folder._uuid, name: folder.name } });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error renaming note folder");
    }
};
exports.renameMyNoteFolder = renameMyNoteFolder;
/** DELETE /note/me/folders/:id — ໂນດຂ້າງໃນຍ້າຍອອກມາຢູ່ນອກ (ບໍ່ລຶບໂນດ) */
const deleteMyNoteFolder = async (req, res) => {
    try {
        const employeeId = await me(req, res);
        if (employeeId === null)
            return;
        const folder = await myFolder(req, employeeId);
        if (!folder) {
            res.status(404).json({ message: "ບໍ່ພົບໂຟນເດີນີ້" });
            return;
        }
        const moved = await noteFolder_1.default.sequelize.transaction(async (t) => {
            const [count] = await note_1.default.update({ folder_id: null }, { where: { employee_id: employeeId, folder_id: folder._uuid }, transaction: t });
            await folder.destroy({ transaction: t });
            return count;
        });
        res.status(200).json({ message: moved ? `ລຶບໂຟນເດີແລ້ວ — ໂນດ ${moved} ອັນຍ້າຍອອກມາຢູ່ນອກ` : "ລຶບໂຟນເດີແລ້ວ" });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error deleting note folder");
    }
};
exports.deleteMyNoteFolder = deleteMyNoteFolder;
