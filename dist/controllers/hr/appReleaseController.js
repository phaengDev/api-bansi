"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLatestAppRelease = exports.deleteAppRelease = exports.createAppRelease = exports.getAppReleases = exports.requireReleaseKey = exports.apkUpload = exports.APP_FOLDER = void 0;
const path_1 = __importDefault(require("path"));
const multer_1 = __importDefault(require("multer"));
const crypto_1 = require("crypto");
const sequelize_1 = require("sequelize");
const appRelease_1 = __importDefault(require("../../models/appRelease"));
const userModel_1 = __importDefault(require("../../models/userModel"));
const utils_1 = require("../../utils");
const apkInfo_1 = require("../../utils/apkInfo");
const bansiHelpers_1 = require("../bansi/bansiHelpers");
const hrHelpers_1 = require("./hrHelpers");
/**
 * ອັບເດດແອັບພະນັກງານ Android ໂດຍບໍ່ຕ້ອງສົ່ງໄຟລ໌ໃຫ້ທຸກຄົນ — HR ອັບໂຫຼດ app-release.apk ໃນເວັບ,
 * ແອັບກວດ GET /app/release ຕອນເປີດ: ເລກ build ສູງກວ່າຂອງເຄື່ອງ = ຂຶ້ນແຖບ "ມີເວີຊັນໃໝ່" → ກົດດາວໂຫຼດ + ຕິດຕັ້ງເອງ
 */
/** ໄຟລ໌ຢູ່ uploads/app — ເປີດຜ່ານ /image/app/<file_name> */
exports.APP_FOLDER = "app";
const ANDROID = "android";
/** applicationId ຂອງແອັບ oacbroker — ກັນອັບໂຫຼດ APK ຂອງແອັບອື່ນຜິດ */
const APP_PACKAGE = "com.oacbroker.oacbroker";
/** Cloudflare (ທາງເຂົ້າ api) ຮັບໄຟລ໌ບໍ່ເກີນ 100MB ຕໍ່ເທື່ອ */
const MAX_APK = 100 * 1024 * 1024;
/** ເກັບໄວ້ລຸ້ນດຽວ — ອັບໂຫຼດລຸ້ນໃໝ່ = ລຶບລຸ້ນເກົ່າ (ແຖວ + ໄຟລ໌ APK 50–80MB) ທັນທີ ບໍ່ໃຫ້ດິສກ໌ຂອງເຊີບເວີເຕັມ */
const KEEP = 1;
const APP_DIR = path_1.default.join(__dirname, "..", "..", "uploads", exports.APP_FOLDER);
/** ໄຟລ໌ .apk 1 ໄຟລ໌ field "apk" */
exports.apkUpload = (0, hrHelpers_1.asJson)((0, multer_1.default)({
    storage: (0, hrHelpers_1.storageIn)(APP_DIR),
    limits: { fileSize: MAX_APK },
    fileFilter: (_req, file, cb) => (/\.apk$/i.test(file.originalname) ? cb(null, true) : cb(new Error("ກະລຸນາເລືອກໄຟລ໌ .apk"))),
}).single("apk"), "ໄຟລ໌ໃຫຍ່ເກີນ 100MB");
/**
 * POST /app-release/publish — Mac ທີ່ build ແອັບອັບໂຫຼດເອງຫຼັງ build (tool/release_android.sh ຂອງ oacbroker) ໂດຍບໍ່ຕ້ອງ
 * login ເວັບ: header X-Release-Key ຕ້ອງກົງກັບ APP_RELEASE_KEY ໃນ .env (ບໍ່ຕັ້ງ = ປິດທາງນີ້). ກວດກ່ອນ multer ຮັບໄຟລ໌.
 * ຄົນທີ່ໄດ້ກະແຈໄປ ກໍ່ສົ່ງໄດ້ແຕ່ APK ຂອງ OAC HR ທີ່ເລກ build ສູງກວ່າ — ລາຍເຊັນບໍ່ກົງ ໂທລະສັບບໍ່ຍອມຕິດຕັ້ງທັບ
 */
const requireReleaseKey = (req, res, next) => {
    const expected = Buffer.from(process.env.APP_RELEASE_KEY ?? "");
    const given = Buffer.from(String(req.get("x-release-key") ?? ""));
    if (expected.length < 32) {
        res.status(404).json({ message: "ບໍ່ໄດ້ເປີດການອັບໂຫຼດອັດຕະໂນມັດ (APP_RELEASE_KEY)" });
        return;
    }
    if (given.length !== expected.length || !(0, crypto_1.timingSafeEqual)(given, expected)) {
        res.status(401).json({ message: "X-Release-Key ບໍ່ຖືກຕ້ອງ" });
        return;
    }
    next();
};
exports.requireReleaseKey = requireReleaseKey;
const present = (row, uploader) => ({
    ...row.get({ plain: true }),
    url: `${(0, utils_1.url)()}/${exports.APP_FOLDER}/${row.file_name}`,
    ...(uploader !== undefined ? { createdby_name: uploader } : {}),
});
const removeRelease = async (row) => {
    (0, hrHelpers_1.removeQuietly)(path_1.default.join(APP_DIR, row.file_name));
    await row.destroy();
};
/** GET /app-release/fetch — ລຸ້ນທີ່ເກັບໄວ້ (KEEP = 1 ລຸ້ນ) + ຊື່ຜູ້ອັບໂຫຼດ */
const getAppReleases = async (_req, res) => {
    try {
        const rows = await appRelease_1.default.findAll({ where: { platform: ANDROID }, order: [["build_number", "DESC"]] });
        const ids = [...new Set(rows.map((r) => Number(r.createdbyid)).filter(Boolean))];
        const users = ids.length ? await userModel_1.default.findAll({ where: { user_uuid: { [sequelize_1.Op.in]: ids } }, attributes: ["user_uuid", "user_name"] }) : [];
        const nameOf = new Map(users.map((u) => [Number(u.user_uuid), u.user_name]));
        res.status(200).json({ data: rows.map((r) => present(r, nameOf.get(Number(r.createdbyid)) ?? null)) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error fetching app releases");
    }
};
exports.getAppReleases = getAppReleases;
/**
 * POST /app-release/create (multipart: apk, notes) — ອ່ານເລກ build / ເວີຊັນຈາກ APK ເອງ; ຕ້ອງເປັນແອັບ OAC HR ແລະ
 * ເລກ build ສູງກວ່າລຸ້ນລ່າສຸດ (ບໍ່ດັ່ງນັ້ນ ແອັບບໍ່ເຫັນວ່າເປັນລຸ້ນໃໝ່). ບັນທຶກແລ້ວ ລຸ້ນເກົ່າ (ເກີນ KEEP) ຖືກລຶບອອກເອງ
 */
const createAppRelease = async (req, res) => {
    const file = req.file;
    if (!file) {
        res.status(400).json({ message: "ກະລຸນາເລືອກໄຟລ໌ .apk" });
        return;
    }
    const reject = (message) => {
        (0, hrHelpers_1.removeQuietly)(file.path);
        res.status(400).json({ message });
    };
    try {
        const info = await (0, apkInfo_1.readApkInfo)(file.path);
        if (!info)
            return reject("ອ່ານໄຟລ໌ນີ້ບໍ່ໄດ້ — ຕ້ອງເປັນໄຟລ໌ APK ຂອງແອັບ (app-release.apk)");
        if (info.packageName !== APP_PACKAGE)
            return reject(`ໄຟລ໌ນີ້ບໍ່ແມ່ນແອັບ OAC HR (${info.packageName})`);
        const notes = String(req.body?.notes ?? "").trim();
        if (notes.length > 1000)
            return reject("ມີຫຍັງໃໝ່ ຍາວໄດ້ບໍ່ເກີນ 1000 ຕົວອັກສອນ");
        const latest = Number(await appRelease_1.default.max("build_number", { where: { platform: ANDROID } })) || 0;
        if (info.versionCode <= latest) {
            return reject(`ເລກ build ຂອງໄຟລ໌ນີ້ (${info.versionCode}) ຕ້ອງສູງກວ່າລຸ້ນລ່າສຸດ (${latest}) — ເພີ່ມເລກຫຼັງ + ຂອງ version ໃນ pubspec.yaml ແລ້ວ build ໃໝ່`);
        }
        const row = await appRelease_1.default.create({
            platform: ANDROID,
            version_name: info.versionName?.slice(0, 30) ?? null,
            build_number: info.versionCode,
            file_name: file.filename,
            file_size: file.size,
            notes: notes || null,
            createdbyid: Number((0, bansiHelpers_1.actorOf)(req)) || null,
        });
        const old = await appRelease_1.default.findAll({ where: { platform: ANDROID }, order: [["build_number", "DESC"]], offset: KEEP });
        for (const r of old)
            await removeRelease(r);
        res.status(201).json({ message: `ອັບໂຫຼດເວີຊັນ ${info.versionName ?? info.versionCode} ແລ້ວ — ພະນັກງານເປີດແອັບຈະເຫັນແຖບອັບເດດ`, data: present(row) });
    }
    catch (error) {
        (0, hrHelpers_1.removeQuietly)(file.path);
        (0, bansiHelpers_1.sendError)(res, error, "Error uploading app release");
    }
};
exports.createAppRelease = createAppRelease;
/** DELETE /app-release/:id — ລຶບລຸ້ນທີ່ເກັບໄວ້ (ອັບໂຫຼດຜິດ) = ແອັບບໍ່ເຫັນແຖບອັບເດດ ຈົນກວ່າຈະອັບໂຫຼດລຸ້ນໃໝ່ */
const deleteAppRelease = async (req, res) => {
    try {
        const row = await appRelease_1.default.findByPk(Number((0, bansiHelpers_1.decodeId)(req)));
        if (!row) {
            res.status(404).json({ message: "ບໍ່ພົບລຸ້ນນີ້" });
            return;
        }
        await removeRelease(row);
        res.status(200).json({ message: "Successfully deleted app release" });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error deleting app release");
    }
};
exports.deleteAppRelease = deleteAppRelease;
/** GET /app/release — ລຸ້ນລ່າສຸດຂອງແອັບ Android (null = ຍັງບໍ່ມີ) ໃຫ້ແອັບທຽບກັບເລກ build ຂອງເຄື່ອງ */
const getLatestAppRelease = async (_req, res) => {
    try {
        const row = await appRelease_1.default.findOne({ where: { platform: ANDROID }, order: [["build_number", "DESC"]] });
        res.status(200).json({ data: row ? present(row) : null });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error fetching latest app release");
    }
};
exports.getLatestAppRelease = getLatestAppRelease;
