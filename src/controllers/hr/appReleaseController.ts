import path from "path";
import multer from "multer";
import { timingSafeEqual } from "crypto";
import { NextFunction, Request, Response } from "express";
import { Op } from "sequelize";
import AppRelease from "../../models/appRelease";
import Users from "../../models/userModel";
import { url } from "../../utils";
import { readApkInfo } from "../../utils/apkInfo";
import { actorOf, decodeId, sendError } from "../bansi/bansiHelpers";
import { asJson, removeQuietly, storageIn } from "./hrHelpers";

/**
 * ອັບເດດແອັບພະນັກງານ Android ໂດຍບໍ່ຕ້ອງສົ່ງໄຟລ໌ໃຫ້ທຸກຄົນ — HR ອັບໂຫຼດ app-release.apk ໃນເວັບ,
 * ແອັບກວດ GET /app/release ຕອນເປີດ: ເລກ build ສູງກວ່າຂອງເຄື່ອງ = ຂຶ້ນແຖບ "ມີເວີຊັນໃໝ່" → ກົດດາວໂຫຼດ + ຕິດຕັ້ງເອງ
 */

/** ໄຟລ໌ຢູ່ uploads/app — ເປີດຜ່ານ /image/app/<file_name> */
export const APP_FOLDER = "app";
const ANDROID = "android";
/** applicationId ຂອງແອັບ oacbroker — ກັນອັບໂຫຼດ APK ຂອງແອັບອື່ນຜິດ */
const APP_PACKAGE = "com.oacbroker.oacbroker";
/** Cloudflare (ທາງເຂົ້າ api) ຮັບໄຟລ໌ບໍ່ເກີນ 100MB ຕໍ່ເທື່ອ */
const MAX_APK = 100 * 1024 * 1024;
/** ເກັບໄວ້ສະເພາະລຸ້ນລ່າສຸດ — APK ລະ 50–80MB, ອັບເດດເລື້ອຍ ດິສກ໌ເຕັມໄວ */
const KEEP = 5;

const APP_DIR = path.join(__dirname, "..", "..", "uploads", APP_FOLDER);

/** ໄຟລ໌ .apk 1 ໄຟລ໌ field "apk" */
export const apkUpload = asJson(
  multer({
    storage: storageIn(APP_DIR),
    limits: { fileSize: MAX_APK },
    fileFilter: (_req, file, cb) => (/\.apk$/i.test(file.originalname) ? cb(null, true) : cb(new Error("ກະລຸນາເລືອກໄຟລ໌ .apk"))),
  }).single("apk"),
  "ໄຟລ໌ໃຫຍ່ເກີນ 100MB",
);

/**
 * POST /app-release/publish — Mac ທີ່ build ແອັບອັບໂຫຼດເອງຫຼັງ build (tool/release_android.sh ຂອງ oacbroker) ໂດຍບໍ່ຕ້ອງ
 * login ເວັບ: header X-Release-Key ຕ້ອງກົງກັບ APP_RELEASE_KEY ໃນ .env (ບໍ່ຕັ້ງ = ປິດທາງນີ້). ກວດກ່ອນ multer ຮັບໄຟລ໌.
 * ຄົນທີ່ໄດ້ກະແຈໄປ ກໍ່ສົ່ງໄດ້ແຕ່ APK ຂອງ OAC HR ທີ່ເລກ build ສູງກວ່າ — ລາຍເຊັນບໍ່ກົງ ໂທລະສັບບໍ່ຍອມຕິດຕັ້ງທັບ
 */
export const requireReleaseKey = (req: Request, res: Response, next: NextFunction) => {
  const expected = Buffer.from(process.env.APP_RELEASE_KEY ?? "");
  const given = Buffer.from(String(req.get("x-release-key") ?? ""));
  if (expected.length < 32) {
    res.status(404).json({ message: "ບໍ່ໄດ້ເປີດການອັບໂຫຼດອັດຕະໂນມັດ (APP_RELEASE_KEY)" });
    return;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    res.status(401).json({ message: "X-Release-Key ບໍ່ຖືກຕ້ອງ" });
    return;
  }
  next();
};

const present = (row: AppRelease, uploader?: string | null) => ({
  ...row.get({ plain: true }),
  url: `${url()}/${APP_FOLDER}/${row.file_name}`,
  ...(uploader !== undefined ? { createdby_name: uploader } : {}),
});

const removeRelease = async (row: AppRelease) => {
  removeQuietly(path.join(APP_DIR, row.file_name));
  await row.destroy();
};

/** GET /app-release/fetch — ທຸກລຸ້ນທີ່ເກັບໄວ້ (ໃໝ່ສຸດກ່ອນ) + ຊື່ຜູ້ອັບໂຫຼດ */
export const getAppReleases = async (_req: Request, res: Response) => {
  try {
    const rows = await AppRelease.findAll({ where: { platform: ANDROID }, order: [["build_number", "DESC"]] });
    const ids = [...new Set(rows.map((r) => Number(r.createdbyid)).filter(Boolean))];
    const users = ids.length ? await Users.findAll({ where: { user_uuid: { [Op.in]: ids } }, attributes: ["user_uuid", "user_name"] }) : [];
    const nameOf = new Map(users.map((u) => [Number(u.user_uuid), u.user_name]));
    res.status(200).json({ data: rows.map((r) => present(r, nameOf.get(Number(r.createdbyid)) ?? null)), keep: KEEP });
  } catch (error) {
    sendError(res, error, "Error fetching app releases");
  }
};

/**
 * POST /app-release/create (multipart: apk, notes) — ອ່ານເລກ build / ເວີຊັນຈາກ APK ເອງ; ຕ້ອງເປັນແອັບ OAC HR ແລະ
 * ເລກ build ສູງກວ່າລຸ້ນລ່າສຸດ (ບໍ່ດັ່ງນັ້ນ ແອັບບໍ່ເຫັນວ່າເປັນລຸ້ນໃໝ່). ລຸ້ນເກົ່າກວ່າ KEEP ລຸ້ນ ລຶບອອກເອງ
 */
export const createAppRelease = async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ message: "ກະລຸນາເລືອກໄຟລ໌ .apk" });
    return;
  }
  const reject = (message: string) => {
    removeQuietly(file.path);
    res.status(400).json({ message });
  };
  try {
    const info = await readApkInfo(file.path);
    if (!info) return reject("ອ່ານໄຟລ໌ນີ້ບໍ່ໄດ້ — ຕ້ອງເປັນໄຟລ໌ APK ຂອງແອັບ (app-release.apk)");
    if (info.packageName !== APP_PACKAGE) return reject(`ໄຟລ໌ນີ້ບໍ່ແມ່ນແອັບ OAC HR (${info.packageName})`);
    const notes = String(req.body?.notes ?? "").trim();
    if (notes.length > 1000) return reject("ມີຫຍັງໃໝ່ ຍາວໄດ້ບໍ່ເກີນ 1000 ຕົວອັກສອນ");
    const latest = Number(await AppRelease.max("build_number", { where: { platform: ANDROID } })) || 0;
    if (info.versionCode <= latest) {
      return reject(`ເລກ build ຂອງໄຟລ໌ນີ້ (${info.versionCode}) ຕ້ອງສູງກວ່າລຸ້ນລ່າສຸດ (${latest}) — ເພີ່ມເລກຫຼັງ + ຂອງ version ໃນ pubspec.yaml ແລ້ວ build ໃໝ່`);
    }

    const row = await AppRelease.create({
      platform: ANDROID,
      version_name: info.versionName?.slice(0, 30) ?? null,
      build_number: info.versionCode,
      file_name: file.filename,
      file_size: file.size,
      notes: notes || null,
      createdbyid: Number(actorOf(req)) || null,
    });
    const old = await AppRelease.findAll({ where: { platform: ANDROID }, order: [["build_number", "DESC"]], offset: KEEP });
    for (const r of old) await removeRelease(r);
    res.status(201).json({ message: `ອັບໂຫຼດເວີຊັນ ${info.versionName ?? info.versionCode} ແລ້ວ — ພະນັກງານເປີດແອັບຈະເຫັນແຖບອັບເດດ`, data: present(row) });
  } catch (error) {
    removeQuietly(file.path);
    sendError(res, error, "Error uploading app release");
  }
};

/** DELETE /app-release/:id — ລຶບລຸ້ນລ່າສຸດ = ແອັບກັບໄປທຽບກັບລຸ້ນກ່ອນໜ້າ (ໃຊ້ຕອນອັບໂຫຼດຜິດ) */
export const deleteAppRelease = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const row = await AppRelease.findByPk(Number(decodeId(req)));
    if (!row) {
      res.status(404).json({ message: "ບໍ່ພົບລຸ້ນນີ້" });
      return;
    }
    await removeRelease(row);
    res.status(200).json({ message: "Successfully deleted app release" });
  } catch (error) {
    sendError(res, error, "Error deleting app release");
  }
};

/** GET /app/release — ລຸ້ນລ່າສຸດຂອງແອັບ Android (null = ຍັງບໍ່ມີ) ໃຫ້ແອັບທຽບກັບເລກ build ຂອງເຄື່ອງ */
export const getLatestAppRelease = async (_req: Request, res: Response) => {
  try {
    const row = await AppRelease.findOne({ where: { platform: ANDROID }, order: [["build_number", "DESC"]] });
    res.status(200).json({ data: row ? present(row) : null });
  } catch (error) {
    sendError(res, error, "Error fetching latest app release");
  }
};
