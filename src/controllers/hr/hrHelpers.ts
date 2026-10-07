import path from "path";
import fs from "fs";
import multer from "multer";
import { Request, Response, NextFunction, RequestHandler } from "express";
import { url } from "../../utils";

/** ຮູບພະນັກງານ — uploads/employee (ເປີດຜ່ານ /image ຄືໂລໂກ້ທະນາຄານ) */
export const PROFILE_FOLDER = "employee";

/** ເອກະສານຄັດຕິດຂອງພະນັກງານ — ນອກ uploads (ບໍ່ມີ URL ສາທາລະນະ), ດາວໂຫຼດຜ່ານ API ທີ່ login ແລ້ວເທົ່ານັ້ນ */
export const DOCUMENT_DIR = path.join(__dirname, "..", "..", "private", "employee-docs");

export const profileUrl = (file: string | null | undefined) => (file ? `${url()}/${PROFILE_FOLDER}/${file}` : null);

export const MAX_FILE = 5 * 1024 * 1024;
const DOCUMENT_TYPES = /\.(jpe?g|png|webp|pdf|docx?|xlsx?)$/i;
const IMAGE_TYPES = /\.(jpe?g|png|webp)$/i;

const uniqueName = (original: string) =>
  `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(original).toLowerCase()}`;

const storageIn = (dir: string) => {
  fs.mkdirSync(dir, { recursive: true });
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dir),
    filename: (_req, file, cb) => cb(null, uniqueName(file.originalname)),
  });
};

/** multer ທີ່ error ເປັນ JSON 400 (ໄຟລ໌ໃຫຍ່ເກີນ / ປະເພດບໍ່ອະນຸຍາດ) ແທນໜ້າ HTML 500 ຂອງ Express */
const asJson = (handler: RequestHandler): RequestHandler => (req: Request, res: Response, next: NextFunction) =>
  handler(req, res, (error?: unknown) => {
    if (!error) return next();
    const tooLarge = (error as any)?.code === "LIMIT_FILE_SIZE";
    res.status(400).json({ message: tooLarge ? "ໄຟລ໌ໃຫຍ່ເກີນ 5MB" : (error as Error).message || "ອັບໂຫຼດໄຟລ໌ບໍ່ສຳເລັດ" });
  });

/** ຮູບພະນັກງານ 1 ໄຟລ໌ field "profile" — JPG, PNG, WEBP */
export const profileUpload = asJson(
  multer({
    storage: storageIn(path.join(__dirname, "..", "..", "uploads", PROFILE_FOLDER)),
    limits: { fileSize: MAX_FILE },
    fileFilter: (_req, file, cb) =>
      IMAGE_TYPES.test(file.originalname) ? cb(null, true) : cb(new Error("ຮູບຕ້ອງເປັນ JPG, PNG ຫຼື WEBP")),
  }).single("profile")
);

/** ເອກະສານສູງສຸດ 5 ໄຟລ໌ຕໍ່ເທື່ອ field "files" — ຮູບ, PDF, Word, Excel */
export const documentUpload = asJson(
  multer({
    storage: storageIn(DOCUMENT_DIR),
    limits: { fileSize: MAX_FILE, files: 5 },
    fileFilter: (_req, file, cb) =>
      DOCUMENT_TYPES.test(file.originalname) ? cb(null, true) : cb(new Error("ອະນຸຍາດສະເພາະຮູບ, PDF, Word, Excel")),
  }).array("files", 5)
);

/** ລຶບໄຟລ໌ໂດຍບໍ່ສົນວ່າມີຢູ່ຫຼືບໍ່ (ໃຊ້ຕອນ rollback / ລຶບຂໍ້ມູນ) */
export const removeQuietly = (filePath: string) => {
  fs.promises.unlink(filePath).catch(() => undefined);
};

/** multer ເກັບຊື່ໄຟລ໌ເປັນ latin1 — ແປງຄືນເປັນ UTF-8 ໃຫ້ຊື່ພາສາລາວຖືກຕ້ອງ */
export const originalNameOf = (file: Express.Multer.File) => Buffer.from(file.originalname, "latin1").toString("utf8");
