import path from "path";
import fs from "fs";
import multer from "multer";
import { Request, Response, NextFunction, RequestHandler } from "express";
import { url } from "../../utils";
import Province from "../../models/province";
import District from "../../models/district";

/** ຮູບພະນັກງານ — uploads/employee (ເປີດຜ່ານ /image ຄືໂລໂກ້ທະນາຄານ) */
export const PROFILE_FOLDER = "employee";
/** ໂລໂກ້ບໍລິສັດ — uploads/company */
export const COMPANY_FOLDER = "company";

/** ເອກະສານຄັດຕິດຂອງພະນັກງານ — ນອກ uploads (ບໍ່ມີ URL ສາທາລະນະ), ດາວໂຫຼດຜ່ານ API ທີ່ login ແລ້ວເທົ່ານັ້ນ */
export const DOCUMENT_DIR = path.join(__dirname, "..", "..", "private", "employee-docs");

/** ລະຫັດຜ່ານ app ພະນັກງານ ຕອນສ້າງພະນັກງານ / HR ຕັ້ງຄືນ — ເຂົ້າ app ຄັ້ງທຳອິດແລ້ວຄວນປ່ຽນ (must_change_password) */
export const DEFAULT_APP_PASSWORD = "123";
/** ເບີໂທພະນັກງານ = ຊື່ເຂົ້າ app ແລະ ເບີຮັບ OTP — ບັງຄັບ 20 + 8 ຕົວເລກ (ເຊັ່ນ 2052160011) */
export const APP_PHONE = /^20\d{8}$/;
/** ເອົາສະເພາະຕົວເລກ (ຕັດຍະຫວ່າງ, ຂີດ) */
export const phoneDigits = (value: unknown) => String(value ?? "").replace(/\D/g, "");

/** ເມືອງ + ແຂວງຂອງເມືອງ — ບໍລິສັດ ແລະ ພະນັກງານເກັບແຕ່ district_id (ແຂວງມາກັບເມືອງ) */
export const districtInclude = {
  model: District,
  as: "district",
  attributes: ["_uuid", "district_name", "province_id"],
  include: [{ model: Province, as: "province", attributes: ["_uuid", "province_name"] }],
};

export const profileUrl = (file: string | null | undefined) => (file ? `${url()}/${PROFILE_FOLDER}/${file}` : null);
export const companyLogoUrl = (file: string | null | undefined) => (file ? `${url()}/${COMPANY_FOLDER}/${file}` : null);

export const MAX_FILE = 5 * 1024 * 1024;
const DOCUMENT_TYPES = /\.(jpe?g|png|webp|pdf|docx?|xlsx?)$/i;
const IMAGE_TYPES = /\.(jpe?g|png|webp)$/i;

const uniqueName = (original: string) =>
  `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(original).toLowerCase()}`;

export const storageIn = (dir: string) => {
  fs.mkdirSync(dir, { recursive: true });
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dir),
    filename: (_req, file, cb) => cb(null, uniqueName(file.originalname)),
  });
};

/** multer ທີ່ error ເປັນ JSON 400 (ໄຟລ໌ໃຫຍ່ເກີນ / ປະເພດບໍ່ອະນຸຍາດ) ແທນໜ້າ HTML 500 ຂອງ Express */
export const asJson = (handler: RequestHandler, tooLargeMessage = "ໄຟລ໌ໃຫຍ່ເກີນ 5MB"): RequestHandler => (req: Request, res: Response, next: NextFunction) =>
  handler(req, res, (error?: unknown) => {
    if (!error) return next();
    const tooLarge = (error as any)?.code === "LIMIT_FILE_SIZE";
    res.status(400).json({ message: tooLarge ? tooLargeMessage : (error as Error).message || "ອັບໂຫຼດໄຟລ໌ບໍ່ສຳເລັດ" });
  });

/** ຮູບ 1 ໄຟລ໌ (JPG, PNG, WEBP) ລົງ uploads/<folder> */
const imageUpload = (folder: string, field: string) => asJson(
  multer({
    storage: storageIn(path.join(__dirname, "..", "..", "uploads", folder)),
    limits: { fileSize: MAX_FILE },
    fileFilter: (_req, file, cb) =>
      IMAGE_TYPES.test(file.originalname) ? cb(null, true) : cb(new Error("ຮູບຕ້ອງເປັນ JPG, PNG ຫຼື WEBP")),
  }).single(field)
);

/** ຮູບພະນັກງານ field "profile" */
export const profileUpload = imageUpload(PROFILE_FOLDER, "profile");
/** ໂລໂກ້ບໍລິສັດ field "logo" */
export const companyLogoUpload = imageUpload(COMPANY_FOLDER, "logo");
/** ຮູບເສື້ອເຄື່ອງແບບ field "photo" */
export const uniformPhotoUpload = imageUpload(COMPANY_FOLDER, "photo");

/** ຮູບໃບບິນຂອງລາຍຮັບ-ລາຍຈ່າຍສ່ວນຕົວ — ນອກ uploads ຄືເອກະສານ (ບໍ່ມີ URL ສາທາລະນະ), ເປີດຜ່ານ API ຂອງເຈົ້າຂອງເທົ່ານັ້ນ */
export const RECEIPT_DIR = path.join(__dirname, "..", "..", "private", "money-receipts");

/** ຮູບໃບບິນ 1 ໄຟລ໌ field "photo" (JPG, PNG, WEBP) — ຟີວອື່ນຂອງ multipart ມາໃນ req.body */
export const receiptUpload = asJson(
  multer({
    storage: storageIn(RECEIPT_DIR),
    limits: { fileSize: MAX_FILE },
    fileFilter: (_req, file, cb) =>
      IMAGE_TYPES.test(file.originalname) ? cb(null, true) : cb(new Error("ຮູບຕ້ອງເປັນ JPG, PNG ຫຼື WEBP")),
  }).single("photo")
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
