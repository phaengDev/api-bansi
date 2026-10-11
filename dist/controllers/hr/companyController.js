"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveScanQr = exports.getScanQr = exports.qrPayload = exports.QR_PREFIX = exports.saveCompany = exports.getCompany = void 0;
const crypto_1 = require("crypto");
const company_1 = __importDefault(require("../../models/company"));
const district_1 = __importDefault(require("../../models/district"));
const uploadFile_1 = require("../../utils/uploadFile");
const bansiHelpers_1 = require("../bansi/bansiHelpers");
const hrHelpers_1 = require("./hrHelpers");
/**
 * ຂໍ້ມູນບໍລິສັດ (ແຖວດຽວ) — ຊື່ ລາວ/ອັງກິດ, ໂລໂກ້, ເບີໂທ 1/2, ທີ່ຢູ່, ພິກັດ + ໄລຍະສະແກນເຂົ້າ-ອອກວຽກ,
 * ເວລາເຂົ້າ-ອອກວຽກ ແລະ ວັນພັກປະຈຳອາທິດ
 */
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const MIN_RADIUS = 10;
const MAX_RADIUS = 1000;
const present = (row) => {
    if (!row)
        return null;
    // ລະຫັດລັບຂອງ QR ບໍ່ສົ່ງໃຫ້ທຸກຄົນ (ໃຜມີ token ກໍ່ສ້າງ QR ເອງໄດ້) — HR ອ່ານຜ່ານ GET /company/scan-qr
    const { scan_token: _token, ...r } = row.get({ plain: true });
    return {
        ...r,
        latitude: r.latitude === null ? null : Number(r.latitude),
        longitude: r.longitude === null ? null : Number(r.longitude),
        days_off: String(r.days_off ?? "").split(",").filter((d) => d !== "").map(Number),
        logo_url: (0, hrHelpers_1.companyLogoUrl)(r.logo),
    };
};
const findCompany = () => company_1.default.findOne({ include: [hrHelpers_1.districtInclude], order: [["_uuid", "ASC"]] });
/** GET /company — null = ຍັງບໍ່ໄດ້ຕັ້ງ */
const getCompany = async (_req, res) => {
    try {
        res.status(200).json({ data: present(await findCompany()) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting company");
    }
};
exports.getCompany = getCompany;
const text = (value, max) => String(value ?? "").trim().slice(0, max) || null;
/** ພິກັດ — ຫວ່າງ = null, ນອກຂອບເຂດ = NaN */
const coordinate = (value, limit) => {
    if (value === undefined || value === null || String(value).trim() === "")
        return null;
    const n = Number(value);
    return Number.isFinite(n) && Math.abs(n) <= limit ? Math.round(n * 1e7) / 1e7 : NaN;
};
const parseInput = async (body) => {
    const name = text(body.name_la, 200);
    if (!name)
        return { error: "ກະລຸນາປ້ອນຊື່ບໍລິສັດ (ພາສາລາວ)" };
    const districtId = Number(body.district_id) || null;
    if (districtId && !(await district_1.default.findByPk(districtId)))
        return { error: "ບໍ່ພົບເມືອງທີ່ເລືອກ" };
    const latitude = coordinate(body.latitude, 90);
    const longitude = coordinate(body.longitude, 180);
    if (Number.isNaN(latitude) || Number.isNaN(longitude))
        return { error: "ພິກັດບໍ່ຖືກຕ້ອງ" };
    if ((latitude === null) !== (longitude === null))
        return { error: "ກະລຸນາປ້ອນພິກັດໃຫ້ຄົບທັງ latitude ແລະ longitude" };
    const radius = Math.round(Number(body.scan_radius));
    if (!Number.isFinite(radius) || radius < MIN_RADIUS || radius > MAX_RADIUS) {
        return { error: `ໄລຍະສະແກນຕ້ອງຢູ່ລະຫວ່າງ ${MIN_RADIUS}–${MAX_RADIUS} ແມັດ` };
    }
    const start = String(body.work_start ?? "").trim();
    const end = String(body.work_end ?? "").trim();
    if (!TIME.test(start) || !TIME.test(end))
        return { error: "ເວລາເຂົ້າ-ອອກວຽກບໍ່ຖືກຕ້ອງ (HH:mm)" };
    if (end <= start)
        return { error: "ເວລາອອກວຽກຕ້ອງຫຼັງເວລາເຂົ້າວຽກ" };
    // ວັນພັກ "6,0" ຫຼື ["6","0"] — 0 ອາທິດ … 6 ເສົາ, ຕ້ອງເຫຼືອວັນເຮັດວຽກຢ່າງໜ້ອຍ 1 ວັນ
    const raw = Array.isArray(body.days_off) ? body.days_off : String(body.days_off ?? "").split(",");
    const days = [...new Set(raw.map((d) => String(d).trim()).filter((d) => d !== ""))].map(Number);
    if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 6))
        return { error: "ວັນພັກບໍ່ຖືກຕ້ອງ" };
    if (days.length >= 7)
        return { error: "ຕ້ອງມີວັນເຮັດວຽກຢ່າງໜ້ອຍ 1 ວັນ" };
    return {
        name_la: name,
        name_en: text(body.name_en, 200),
        phone1: text(body.phone1, 30),
        phone2: text(body.phone2, 30),
        district_id: districtId,
        village: text(body.village, 150),
        latitude,
        longitude,
        scan_radius: radius,
        work_start: start,
        work_end: end,
        days_off: days.join(","),
    };
};
const uploadedLogo = (req) => req.file?.filename;
const discardLogo = (req) => {
    const name = uploadedLogo(req);
    if (name)
        (0, uploadFile_1.deleteFile)(hrHelpers_1.COMPANY_FOLDER, name);
};
/** PUT /company (multipart) — ສ້າງແຖວທຳອິດ ຫຼື ແກ້ແຖວເດີມ; ໂລໂກ້ໃໝ່ field "logo", remove_logo=1 = ລຶບໂລໂກ້ */
const saveCompany = async (req, res) => {
    try {
        const input = await parseInput(req.body || {});
        if ("error" in input) {
            discardLogo(req);
            res.status(400).json({ message: input.error });
            return;
        }
        const uploaded = uploadedLogo(req);
        const removeLogo = Number(req.body?.remove_logo) === 1;
        const actor = Number((0, bansiHelpers_1.actorOf)(req)) || null;
        const row = await company_1.default.findOne({ order: [["_uuid", "ASC"]] });
        const oldLogo = row && (uploaded || removeLogo) ? row.logo : null;
        if (uploaded || removeLogo)
            input.logo = uploaded ?? null;
        if (row)
            await row.update({ ...input, updatedbyid: actor, updatedAt: new Date() });
        else
            await company_1.default.create({ ...input, updatedbyid: actor });
        if (oldLogo)
            (0, uploadFile_1.deleteFile)(hrHelpers_1.COMPANY_FOLDER, oldLogo);
        res.status(200).json({ message: "Successfully saved company", data: present(await findCompany()) });
    }
    catch (error) {
        discardLogo(req);
        (0, bansiHelpers_1.sendError)(res, error, "Error saving company");
    }
};
exports.saveCompany = saveCompany;
// ================= QR ສະແກນເຂົ້າ-ອອກວຽກ
/** ຂໍ້ຄວາມໃນ QR — app ມືຖືສົ່ງຂໍ້ຄວາມນີ້ທັງໝົດມາໃນ POST /attendance/scan { qr } */
exports.QR_PREFIX = "BANSI-ATT:";
const qrPayload = (token) => `${exports.QR_PREFIX}${token}`;
exports.qrPayload = qrPayload;
const newToken = () => (0, crypto_1.randomBytes)(16).toString("hex");
const presentQr = (row) => ({
    payload: row.scan_token ? (0, exports.qrPayload)(row.scan_token) : null,
    require_qr: Number(row.scan_require_qr) === 1,
    token_at: row.scan_token_at,
});
/** GET /company/scan-qr (HR) — ຂໍ້ຄວາມຂອງ QR + ຕ້ອງສະແກນ QR ຫຼືບໍ່; ຍັງບໍ່ເຄີຍສ້າງ = ສ້າງໃຫ້ເລີຍ */
const getScanQr = async (_req, res) => {
    try {
        const row = await company_1.default.findOne({ order: [["_uuid", "ASC"]] });
        if (!row) {
            res.status(400).json({ message: "ກະລຸນາບັນທຶກຂໍ້ມູນບໍລິສັດກ່ອນ" });
            return;
        }
        if (!row.scan_token)
            await row.update({ scan_token: newToken(), scan_token_at: new Date() });
        res.status(200).json({ data: presentQr(row) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting scan QR");
    }
};
exports.getScanQr = getScanQr;
/**
 * PUT /company/scan-qr { regenerate?: 1, require_qr?: 0 | 1 } (HR) — regenerate = ສ້າງ QR ໃໝ່ (QR ທີ່ພິມໄວ້ກ່ອນໃຊ້ບໍ່ໄດ້ອີກ),
 * require_qr = ບັງຄັບໃຫ້ສະແກນ QR ທຸກຄັ້ງ (ນອກຈາກ GPS)
 */
const saveScanQr = async (req, res) => {
    try {
        const row = await company_1.default.findOne({ order: [["_uuid", "ASC"]] });
        if (!row) {
            res.status(400).json({ message: "ກະລຸນາບັນທຶກຂໍ້ມູນບໍລິສັດກ່ອນ" });
            return;
        }
        const body = req.body || {};
        const patch = {};
        if (Number(body.regenerate) === 1 || !row.scan_token)
            Object.assign(patch, { scan_token: newToken(), scan_token_at: new Date() });
        if (body.require_qr !== undefined)
            patch.scan_require_qr = Number(body.require_qr) === 1 || body.require_qr === true ? 1 : 0;
        await row.update({ ...patch, updatedbyid: Number((0, bansiHelpers_1.actorOf)(req)) || null });
        res.status(200).json({ message: "Successfully saved scan QR", data: presentQr(row) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error saving scan QR");
    }
};
exports.saveScanQr = saveScanQr;
