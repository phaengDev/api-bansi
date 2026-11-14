import { Request, Response } from "express";
import { Op, col, fn } from "sequelize";
import Note from "../../models/note";
import NoteFolder from "../../models/noteFolder";
import { decodeId, sendError } from "../bansi/bansiHelpers";
import { selfEmployee } from "./attendanceController";

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

const me = async (req: Request, res: Response) => {
  const self = await selfEmployee(req);
  if ("code" in self) {
    res.status(self.code).json({ message: self.message });
    return null;
  }
  return Number(self.employee._uuid);
};

/** ໂນດຂອງຂ້ອຍ — ບໍ່ແມ່ນຂອງຂ້ອຍ / ບໍ່ມີ = null (ຕອບ 404 ຄືກັນ) */
const myNote = (req: Request<{ id: string }>, employeeId: number) => {
  const id = Number(decodeId(req)) || 0;
  return id ? Note.findOne({ where: { _uuid: id, employee_id: employeeId } }) : Promise.resolve(null);
};

const present = (n: Note) => ({
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

type NoteInput = { folder_id?: number | null; title?: string | null; body?: string | null; marks?: string | null; ink?: string | null; color?: string | null; pinned?: number };

/** ອ່ານຟີວທີ່ສົ່ງມາ (ບໍ່ສົ່ງ = ບໍ່ປ່ຽນ) — ຜິດຮູບແບບ = ຂໍ້ຄວາມ error */
const readInput = (body: any): { input: NoteInput } | { error: string } => {
  const input: NoteInput = {};
  if (body.title !== undefined) {
    const title = String(body.title ?? "").trim();
    if (title.length > MAX_TITLE) return { error: `ຫົວຂໍ້ຍາວເກີນ ${MAX_TITLE} ຕົວອັກສອນ` };
    input.title = title || null;
  }
  if (body.body !== undefined) {
    const text = String(body.body ?? "").replace(/\s+$/, "");
    if (text.length > MAX_BODY) return { error: `ໂນດຍາວເກີນ ${MAX_BODY} ຕົວອັກສອນ` };
    input.body = text || null;
  }
  if (body.marks !== undefined) {
    if (body.marks === null || body.marks === "") {
      input.marks = null;
    } else {
      const raw = typeof body.marks === "string" ? body.marks : JSON.stringify(body.marks);
      if (raw.length > MAX_MARKS) return { error: "ສີຕົວໜັງສືຫຼາຍເກີນ" };
      try {
        const marks = JSON.parse(raw);
        if (!Array.isArray(marks)) return { error: "ສີຕົວໜັງສືບໍ່ຖືກຕ້ອງ" };
        input.marks = marks.length ? raw : null;
      } catch {
        return { error: "ສີຕົວໜັງສືບໍ່ຖືກຕ້ອງ" };
      }
    }
  }
  if (body.ink !== undefined) {
    if (body.ink === null || body.ink === "") {
      input.ink = null;
    } else {
      const raw = typeof body.ink === "string" ? body.ink : JSON.stringify(body.ink);
      if (raw.length > MAX_INK) return { error: "ຮູບຂີດແຕ້ມໃຫຍ່ເກີນ — ແບ່ງເປັນຫຼາຍໂນດ" };
      try {
        const ink = JSON.parse(raw);
        if (!ink || typeof ink !== "object" || !Array.isArray(ink.strokes)) return { error: "ຮູບຂີດແຕ້ມບໍ່ຖືກຕ້ອງ" };
        input.ink = ink.strokes.length ? raw : null;
      } catch {
        return { error: "ຮູບຂີດແຕ້ມບໍ່ຖືກຕ້ອງ" };
      }
    }
  }
  if (body.color !== undefined) {
    const color = String(body.color ?? "").trim();
    if (color && !COLOR.test(color)) return { error: "ສີບໍ່ຖືກຕ້ອງ" };
    input.color = color || null;
  }
  if (body.pinned !== undefined) input.pinned = body.pinned === true || Number(body.pinned) === 1 ? 1 : 0;
  return { input };
};

const isEmpty = (n: { title?: string | null; body?: string | null; ink?: string | null }) => !n.title && !n.body && !n.ink;

/** folder_id ທີ່ສົ່ງມາ: ບໍ່ສົ່ງ = ບໍ່ປ່ຽນ, null / 0 = ຢູ່ນອກໂຟນເດີ, ອື່ນໆ = ຕ້ອງເປັນໂຟນເດີຂອງຂ້ອຍ */
const readFolder = async (body: any, employeeId: number): Promise<{ folder?: number | null } | { error: string }> => {
  if (body.folder_id === undefined) return {};
  const id = Number(body.folder_id) || 0;
  if (!id) return { folder: null };
  const folder = await NoteFolder.findOne({ where: { _uuid: id, employee_id: employeeId }, attributes: ["_uuid"] });
  return folder ? { folder: folder._uuid } : { error: "ບໍ່ພົບໂຟນເດີນີ້" };
};

/** ໂຟນເດີຂອງຂ້ອຍ (ລຽງຕາມຊື່) + ຈຳນວນໂນດຂ້າງໃນ */
const foldersOf = async (employeeId: number) => {
  const [folders, counts] = await Promise.all([
    NoteFolder.findAll({ where: { employee_id: employeeId }, order: [["name", "ASC"], ["_uuid", "ASC"]] }),
    Note.findAll({
      where: { employee_id: employeeId, folder_id: { [Op.ne]: null } },
      attributes: ["folder_id", [fn("COUNT", col("_uuid")), "total"]],
      group: ["folder_id"],
      raw: true,
    }) as Promise<any[]>,
  ]);
  const count = new Map(counts.map((c) => [Number(c.folder_id), Number(c.total) || 0]));
  return folders.map((f) => ({ _uuid: f._uuid, name: f.name, count: count.get(f._uuid) ?? 0, createdAt: f.createdAt }));
};

/** GET /note/me?q= */
export const getMyNotes = async (req: Request, res: Response) => {
  try {
    const employeeId = await me(req, res);
    if (employeeId === null) return;
    const q = String(req.query.q ?? "").trim().slice(0, 100);
    const rows = await Note.findAll({
      where: {
        employee_id: employeeId,
        ...(q ? { [Op.or]: [{ title: { [Op.like]: `%${q}%` } }, { body: { [Op.like]: `%${q}%` } }] } : {}),
      },
      order: [["pinned", "DESC"], ["updatedAt", "DESC"], ["_uuid", "DESC"]],
      limit: MAX_LIST,
    });
    res.status(200).json({ data: rows.map(present), folders: await foldersOf(employeeId) });
  } catch (error) {
    sendError(res, error, "Error getting my notes");
  }
};

/** POST /note/me */
export const createMyNote = async (req: Request, res: Response) => {
  try {
    const employeeId = await me(req, res);
    if (employeeId === null) return;
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
    const row = await Note.create({ ...result.input, folder_id: folder.folder ?? null, employee_id: employeeId });
    res.status(200).json({ message: "ບັນທຶກໂນດແລ້ວ", data: present(row) });
  } catch (error) {
    sendError(res, error, "Error creating note");
  }
};

/** PUT /note/me/:id */
export const updateMyNote = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const employeeId = await me(req, res);
    if (employeeId === null) return;
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
  } catch (error) {
    sendError(res, error, "Error updating note");
  }
};

/** DELETE /note/me/:id */
export const deleteMyNote = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const employeeId = await me(req, res);
    if (employeeId === null) return;
    const note = await myNote(req, employeeId);
    if (!note) {
      res.status(404).json({ message: "ບໍ່ພົບໂນດນີ້" });
      return;
    }
    await note.destroy();
    res.status(200).json({ message: "ລຶບໂນດແລ້ວ" });
  } catch (error) {
    sendError(res, error, "Error deleting note");
  }
};

// ================= ໂຟນເດີ

/** ໂຟນເດີຂອງຂ້ອຍ — ບໍ່ແມ່ນຂອງຂ້ອຍ / ບໍ່ມີ = null */
const myFolder = (req: Request<{ id: string }>, employeeId: number) => {
  const id = Number(decodeId(req)) || 0;
  return id ? NoteFolder.findOne({ where: { _uuid: id, employee_id: employeeId } }) : Promise.resolve(null);
};

/** ຊື່ໂຟນເດີ: ບໍ່ຫວ່າງ, ບໍ່ເກີນ 100, ບໍ່ຊ້ຳກັບໂຟນເດີອື່ນຂອງຂ້ອຍ */
const folderName = async (raw: unknown, employeeId: number, exceptId?: number): Promise<{ name: string } | { error: string }> => {
  const name = String(raw ?? "").trim();
  if (!name) return { error: "ກະລຸນາໃສ່ຊື່ໂຟນເດີ" };
  if (name.length > MAX_FOLDER_NAME) return { error: `ຊື່ໂຟນເດີຍາວເກີນ ${MAX_FOLDER_NAME} ຕົວອັກສອນ` };
  const same = await NoteFolder.findOne({
    where: { employee_id: employeeId, name, ...(exceptId ? { _uuid: { [Op.ne]: exceptId } } : {}) },
    attributes: ["_uuid"],
  });
  return same ? { error: `ມີໂຟນເດີ "${name}" ແລ້ວ` } : { name };
};

/** POST /note/me/folders { name } */
export const createMyNoteFolder = async (req: Request, res: Response) => {
  try {
    const employeeId = await me(req, res);
    if (employeeId === null) return;
    const result = await folderName(req.body?.name, employeeId);
    if ("error" in result) {
      res.status(400).json({ message: result.error });
      return;
    }
    const folder = await NoteFolder.create({ employee_id: employeeId, name: result.name });
    res.status(200).json({ message: "ສ້າງໂຟນເດີແລ້ວ", data: { _uuid: folder._uuid, name: folder.name, count: 0 } });
  } catch (error) {
    sendError(res, error, "Error creating note folder");
  }
};

/** PUT /note/me/folders/:id { name } */
export const renameMyNoteFolder = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const employeeId = await me(req, res);
    if (employeeId === null) return;
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
  } catch (error) {
    sendError(res, error, "Error renaming note folder");
  }
};

/** DELETE /note/me/folders/:id — ໂນດຂ້າງໃນຍ້າຍອອກມາຢູ່ນອກ (ບໍ່ລຶບໂນດ) */
export const deleteMyNoteFolder = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const employeeId = await me(req, res);
    if (employeeId === null) return;
    const folder = await myFolder(req, employeeId);
    if (!folder) {
      res.status(404).json({ message: "ບໍ່ພົບໂຟນເດີນີ້" });
      return;
    }
    const moved = await NoteFolder.sequelize!.transaction(async (t) => {
      const [count] = await Note.update({ folder_id: null }, { where: { employee_id: employeeId, folder_id: folder._uuid }, transaction: t });
      await folder.destroy({ transaction: t });
      return count;
    });
    res.status(200).json({ message: moved ? `ລຶບໂຟນເດີແລ້ວ — ໂນດ ${moved} ອັນຍ້າຍອອກມາຢູ່ນອກ` : "ລຶບໂຟນເດີແລ້ວ" });
  } catch (error) {
    sendError(res, error, "Error deleting note folder");
  }
};
