"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.originalNameOf = exports.removeQuietly = exports.documentUpload = exports.uniformPhotoUpload = exports.companyLogoUpload = exports.profileUpload = exports.asJson = exports.storageIn = exports.MAX_FILE = exports.companyLogoUrl = exports.profileUrl = exports.districtInclude = exports.phoneDigits = exports.APP_PHONE = exports.DEFAULT_APP_PASSWORD = exports.DOCUMENT_DIR = exports.COMPANY_FOLDER = exports.PROFILE_FOLDER = void 0;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const multer_1 = __importDefault(require("multer"));
const utils_1 = require("../../utils");
const province_1 = __importDefault(require("../../models/province"));
const district_1 = __importDefault(require("../../models/district"));
/** ຮູບພະນັກງານ — uploads/employee (ເປີດຜ່ານ /image ຄືໂລໂກ້ທະນາຄານ) */
exports.PROFILE_FOLDER = "employee";
/** ໂລໂກ້ບໍລິສັດ — uploads/company */
exports.COMPANY_FOLDER = "company";
/** ເອກະສານຄັດຕິດຂອງພະນັກງານ — ນອກ uploads (ບໍ່ມີ URL ສາທາລະນະ), ດາວໂຫຼດຜ່ານ API ທີ່ login ແລ້ວເທົ່ານັ້ນ */
exports.DOCUMENT_DIR = path_1.default.join(__dirname, "..", "..", "private", "employee-docs");
/** ລະຫັດຜ່ານ app ພະນັກງານ ຕອນສ້າງພະນັກງານ / HR ຕັ້ງຄືນ — ເຂົ້າ app ຄັ້ງທຳອິດແລ້ວຄວນປ່ຽນ (must_change_password) */
exports.DEFAULT_APP_PASSWORD = "123";
/** ເບີໂທພະນັກງານ = ຊື່ເຂົ້າ app ແລະ ເບີຮັບ OTP — ບັງຄັບ 20 + 8 ຕົວເລກ (ເຊັ່ນ 2052160011) */
exports.APP_PHONE = /^20\d{8}$/;
/** ເອົາສະເພາະຕົວເລກ (ຕັດຍະຫວ່າງ, ຂີດ) */
const phoneDigits = (value) => String(value ?? "").replace(/\D/g, "");
exports.phoneDigits = phoneDigits;
/** ເມືອງ + ແຂວງຂອງເມືອງ — ບໍລິສັດ ແລະ ພະນັກງານເກັບແຕ່ district_id (ແຂວງມາກັບເມືອງ) */
exports.districtInclude = {
    model: district_1.default,
    as: "district",
    attributes: ["_uuid", "district_name", "province_id"],
    include: [{ model: province_1.default, as: "province", attributes: ["_uuid", "province_name"] }],
};
const profileUrl = (file) => (file ? `${(0, utils_1.url)()}/${exports.PROFILE_FOLDER}/${file}` : null);
exports.profileUrl = profileUrl;
const companyLogoUrl = (file) => (file ? `${(0, utils_1.url)()}/${exports.COMPANY_FOLDER}/${file}` : null);
exports.companyLogoUrl = companyLogoUrl;
exports.MAX_FILE = 5 * 1024 * 1024;
const DOCUMENT_TYPES = /\.(jpe?g|png|webp|pdf|docx?|xlsx?)$/i;
const IMAGE_TYPES = /\.(jpe?g|png|webp)$/i;
const uniqueName = (original) => `${Date.now()}-${Math.round(Math.random() * 1e9)}${path_1.default.extname(original).toLowerCase()}`;
const storageIn = (dir) => {
    fs_1.default.mkdirSync(dir, { recursive: true });
    return multer_1.default.diskStorage({
        destination: (_req, _file, cb) => cb(null, dir),
        filename: (_req, file, cb) => cb(null, uniqueName(file.originalname)),
    });
};
exports.storageIn = storageIn;
/** multer ທີ່ error ເປັນ JSON 400 (ໄຟລ໌ໃຫຍ່ເກີນ / ປະເພດບໍ່ອະນຸຍາດ) ແທນໜ້າ HTML 500 ຂອງ Express */
const asJson = (handler, tooLargeMessage = "ໄຟລ໌ໃຫຍ່ເກີນ 5MB") => (req, res, next) => handler(req, res, (error) => {
    if (!error)
        return next();
    const tooLarge = error?.code === "LIMIT_FILE_SIZE";
    res.status(400).json({ message: tooLarge ? tooLargeMessage : error.message || "ອັບໂຫຼດໄຟລ໌ບໍ່ສຳເລັດ" });
});
exports.asJson = asJson;
/** ຮູບ 1 ໄຟລ໌ (JPG, PNG, WEBP) ລົງ uploads/<folder> */
const imageUpload = (folder, field) => (0, exports.asJson)((0, multer_1.default)({
    storage: (0, exports.storageIn)(path_1.default.join(__dirname, "..", "..", "uploads", folder)),
    limits: { fileSize: exports.MAX_FILE },
    fileFilter: (_req, file, cb) => IMAGE_TYPES.test(file.originalname) ? cb(null, true) : cb(new Error("ຮູບຕ້ອງເປັນ JPG, PNG ຫຼື WEBP")),
}).single(field));
/** ຮູບພະນັກງານ field "profile" */
exports.profileUpload = imageUpload(exports.PROFILE_FOLDER, "profile");
/** ໂລໂກ້ບໍລິສັດ field "logo" */
exports.companyLogoUpload = imageUpload(exports.COMPANY_FOLDER, "logo");
/** ຮູບເສື້ອເຄື່ອງແບບ field "photo" */
exports.uniformPhotoUpload = imageUpload(exports.COMPANY_FOLDER, "photo");
/** ເອກະສານສູງສຸດ 5 ໄຟລ໌ຕໍ່ເທື່ອ field "files" — ຮູບ, PDF, Word, Excel */
exports.documentUpload = (0, exports.asJson)((0, multer_1.default)({
    storage: (0, exports.storageIn)(exports.DOCUMENT_DIR),
    limits: { fileSize: exports.MAX_FILE, files: 5 },
    fileFilter: (_req, file, cb) => DOCUMENT_TYPES.test(file.originalname) ? cb(null, true) : cb(new Error("ອະນຸຍາດສະເພາະຮູບ, PDF, Word, Excel")),
}).array("files", 5));
/** ລຶບໄຟລ໌ໂດຍບໍ່ສົນວ່າມີຢູ່ຫຼືບໍ່ (ໃຊ້ຕອນ rollback / ລຶບຂໍ້ມູນ) */
const removeQuietly = (filePath) => {
    fs_1.default.promises.unlink(filePath).catch(() => undefined);
};
exports.removeQuietly = removeQuietly;
/** multer ເກັບຊື່ໄຟລ໌ເປັນ latin1 — ແປງຄືນເປັນ UTF-8 ໃຫ້ຊື່ພາສາລາວຖືກຕ້ອງ */
const originalNameOf = (file) => Buffer.from(file.originalname, "latin1").toString("utf8");
exports.originalNameOf = originalNameOf;
