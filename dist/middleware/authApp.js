"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyToken = exports.verifyOTP = exports.requestOTP = exports.updatePassword = exports.login = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const sequelize_1 = require("sequelize");
const helper_1 = require("../utils/helper");
const jwtConfig_1 = require("../config/jwtConfig");
const database_1 = __importDefault(require("../config/database"));
const employee_1 = __importDefault(require("../models/employee"));
const otpModel_1 = __importDefault(require("../models/otpModel"));
const Telbiz = require("telbiz");
// ============================================================
//  Config
// ============================================================
const OTP_EXPIRES_MIN = 5; // OTP valid 5 ນາທີ
const OTP_RESEND_COOLDOWN_SEC = 60; // ລໍຖ້າ 60 ວິກ່ອນຂໍໃໝ່
const OTP_DAILY_LIMIT = 3; // ຂໍ OTP ໄດ້ບໍ່ເກີນ 3 ຄັ້ງ/ມື້
const OTP_HASH_ROUNDS = 10;
const LAOS_UTC_OFFSET_MIN = 7 * 60;
// types: 1=login, 2=register, 3=reset_password, 4=verify_phone
const ALLOWED_OTP_TYPES = [1, 2, 3, 4];
// const tb = new Telbiz Codes
const tb = new Telbiz('17433007685151078', '8199dfd3-f15a-4a57-905a-eff561a1d414');
const BCRYPT_HASH_RE = /^\$2[aby]\$\d{2}\$/;
const normalizePhone = (phone) => String(phone ?? "").trim().replace(/[\s-]/g, "");
const normalizePassword = (password) => String(password ?? "").trim();
const parseOTPType = (types) => {
    const value = typeof types === "number"
        ? types
        : typeof types === "string"
            ? Number(types)
            : NaN;
    if (!Number.isInteger(value) || !ALLOWED_OTP_TYPES.includes(value)) {
        return null;
    }
    return value;
};
const getLaoDayRange = (date = new Date()) => {
    const laosTime = date.getTime() + LAOS_UTC_OFFSET_MIN * 60 * 1000;
    const laosDate = new Date(laosTime);
    const startUtc = Date.UTC(laosDate.getUTCFullYear(), laosDate.getUTCMonth(), laosDate.getUTCDate()) -
        LAOS_UTC_OFFSET_MIN * 60 * 1000;
    return {
        start: new Date(startUtc),
        end: new Date(startUtc + 24 * 60 * 60 * 1000),
    };
};
const verifyEmployeePassword = async (user, password) => {
    const storedPassword = String(user.getDataValue("password") ?? "");
    if (!storedPassword) {
        return false;
    }
    if (BCRYPT_HASH_RE.test(storedPassword)) {
        return bcryptjs_1.default.compare(password, storedPassword);
    }
    const ok = storedPassword.trim() === password;
    if (ok) {
        const passwordHash = await bcryptjs_1.default.hash(password, OTP_HASH_ROUNDS);
        await user.update({ password: passwordHash });
    }
    return ok;
};
/** ✅ Sign JWT — ໃຊ້ຮ່ວມໃນ login + verifyOTP */
const signUserToken = (user) => jsonwebtoken_1.default.sign({
    _uuid: String(user.getDataValue("customer_uuid")),
    phone: user.getDataValue("phone"),
    createAt: new Date(),
}, jwtConfig_1.appJwtConfig.secret, {
    algorithm: "HS256",
    issuer: jwtConfig_1.appJwtConfig.issuer,
});
// ============================================================
//  POST /auth/login
//  Body: { phone: string, password: string }
// ============================================================
const login = async (req, res) => {
    try {
        const { phone, password } = req.body;
        const normalizedPhone = normalizePhone(phone);
        const normalizedPassword = normalizePassword(password);
        if (!normalizedPhone || !normalizedPassword) {
            return res
                .status(400)
                .json({ message: "phone and password are required" });
        }
        const user = await employee_1.default.findOne({
            where: { phone: normalizedPhone, status: 1 },
        });
        if (!user) {
            return res.status(401).json({ message: "Invalid phone or password" });
        }
        const ok = await verifyEmployeePassword(user, normalizedPassword);
        if (!ok) {
            return res.status(401).json({ message: "Invalid phone or password" });
        }
        if (!jwtConfig_1.appJwtConfig.secret) {
            return res.status(500).json({ message: "JWT secret not configured" });
        }
        let token;
        try {
            token = signUserToken(user);
        }
        catch (e) {
            console.error("JWT sign error:", e?.name, e?.message);
            return res.status(500).json({ message: "Failed to sign token" });
        }
        return res.status(200).json({
            message: "Login successful",
            token,
            user: {
                customer_uuid: user.getDataValue("customer_uuid"),
                idcode: user.getDataValue("idcode"),
                profile: user.getDataValue("profile"),
                first_name: user.getDataValue("first_name"),
                last_name: user.getDataValue("last_name"),
                phone: user.getDataValue("phone"),
            },
        });
    }
    catch (e) {
        console.error("Error in login:", e);
        return res.status(500).json({ message: "Error logging in" });
    }
};
exports.login = login;
// ======= exit password login, only OTP login is allowed =======
const updatePassword = async (req, res) => {
    try {
        const { phone, password, newPassword } = req.body;
        const normalizedPhone = normalizePhone(phone);
        const currentPassword = normalizePassword(password);
        const nextPassword = normalizePassword(newPassword);
        if (!normalizedPhone || !currentPassword || !nextPassword) {
            return res
                .status(400)
                .json({ message: "phone, password, and newPassword are required" });
        }
        if (currentPassword === nextPassword) {
            return res.status(400).json({ message: "newPassword must be different from password" });
        }
        const user = await employee_1.default.findOne({ where: { phone: normalizedPhone, status: 1 } });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        const passwordOk = await verifyEmployeePassword(user, currentPassword);
        if (!passwordOk) {
            return res.status(401).json({ message: "Invalid current password" });
        }
        const newHash = await bcryptjs_1.default.hash(nextPassword, OTP_HASH_ROUNDS);
        await user.update({ password: newHash });
        return res.status(200).json({ message: "Password updated successfully" });
    }
    catch (e) {
        console.error("Error in updatePassword:", e);
        return res.status(500).json({ message: "Error updating password" });
    }
};
exports.updatePassword = updatePassword;
// ============================================================
//  POST /auth/otp/request
//  Body: { phone: string, types: number }
// ============================================================
const requestOTP = async (req, res) => {
    try {
        const { phone, types } = req.body;
        const normalizedPhone = normalizePhone(phone);
        const otpType = parseOTPType(types);
        // ---------- Validate ----------
        if (!normalizedPhone) {
            res.status(400).json({ message: "phone is required" });
            return;
        }
        if (!otpType) {
            res.status(400).json({ message: "Invalid types" });
            return;
        }
        if (!/^\+?[0-9]{8,15}$/.test(normalizedPhone)) {
            res.status(400).json({ message: "Invalid phone format" });
            return;
        }
        // ---------- ເບີໂທຕ້ອງມີຢູ່ໃນ Employees ກ່ອນຈຶ່ງສ້າງ OTP ----------
        const employee = await employee_1.default.findOne({
            where: { phone: normalizedPhone, status: 1 },
        });
        if (!employee) {
            return res.status(404).json({ message: "Employee not found" });
        }
        // ---------- Daily limit (max 3 OTP requests per phone per Lao day) ----------
        const { start: startOfDay, end: endOfDay } = getLaoDayRange();
        const todayRequestCount = await otpModel_1.default.count({
            where: {
                phone: normalizedPhone,
                createdAt: {
                    [sequelize_1.Op.gte]: startOfDay,
                    [sequelize_1.Op.lt]: endOfDay,
                },
            },
        });
        if (todayRequestCount >= OTP_DAILY_LIMIT) {
            return res.status(429).json({
                message: `You can request OTP only ${OTP_DAILY_LIMIT} times per day`,
            });
        }
        // ---------- Rate limit (cooldown 60s) ----------
        const recent = await otpModel_1.default.findOne({
            where: {
                phone: normalizedPhone,
                types: otpType,
                createdAt: {
                    [sequelize_1.Op.gt]: new Date(Date.now() - OTP_RESEND_COOLDOWN_SEC * 1000),
                },
            },
            order: [["createdAt", "DESC"]],
        });
        if (recent) {
            const elapsed = Math.floor((Date.now() - recent.createdAt.getTime()) / 1000);
            const wait = OTP_RESEND_COOLDOWN_SEC - elapsed;
            return res.status(429).json({
                message: `Please wait ${wait}s before requesting a new OTP`,
            });
        }
        // ---------- Generate + hash + save ----------
        const otpCode = (0, helper_1.generateOTP)();
        const otpHash = await bcryptjs_1.default.hash(otpCode, OTP_HASH_ROUNDS);
        const expiresAt = new Date(Date.now() + OTP_EXPIRES_MIN * 60 * 1000);
        const otpMessage = `${otpCode} is your OAC verification code.`;
        const transaction = await database_1.default.transaction();
        try {
            // ---------- Invalidate OTP ເກົ່າທີ່ຍັງ active ----------
            await otpModel_1.default.update({ status: 3 }, // 3 = revoked
            { where: { phone: normalizedPhone, types: otpType, status: 1 }, transaction });
            await otpModel_1.default.create({
                phone: normalizedPhone,
                otp: otpHash,
                types: otpType,
                expiresAt,
            }, { transaction });
            await tb.SendSMSAsync("OAC", normalizedPhone, otpMessage);
            await transaction.commit();
        }
        catch (e) {
            await transaction.rollback();
            throw e;
        }
        if (process.env.NODE_ENV !== "production") {
            console.log(`[OTP] phone=${normalizedPhone} `);
        }
        return res.status(200).json({
            message: "OTP sent successfully",
            expiresAt,
        });
    }
    catch (e) {
        console.error("requestOTP error:", e);
        return res.status(500).json({ message: "Failed to send OTP" });
    }
};
exports.requestOTP = requestOTP;
// ============================================================
//  POST /auth/otp/verify
//  Body: { phone: string, otp: string, types: number }
//
//  ສຳເລັດ:
//    - types === 1 (login): ອອກ JWT ຄືນ
//    - types ອື່ນ: ຄືນ verified=true ໃຫ້ frontend ດຳເນີນຕໍ່
// ============================================================
const verifyOTP = async (req, res) => {
    try {
        const { phone, otp, types } = req.body;
        const normalizedPhone = normalizePhone(phone);
        const otpCode = String(otp ?? "").trim();
        const otpType = parseOTPType(types);
        if (!normalizedPhone || !otpCode || !otpType) {
            return res
                .status(400)
                .json({ message: "phone, otp, and types are required" });
        }
        // ---------- ຫາ OTP active ໃໝ່ສຸດ ----------
        const record = await otpModel_1.default.findOne({
            where: {
                phone: normalizedPhone,
                types: otpType,
                status: 1,
            },
            order: [["createdAt", "DESC"]],
        });
        if (!record) {
            return res.status(400).json({ message: "OTP not found" });
        }
        if (record.expiresAt.getTime() <= Date.now()) {
            await record.update({ status: 3 }); // 3 = expired/revoked
            return res.status(400).json({ message: "OTP expired" });
        }
        // ---------- ປຽບທຽບ hash ----------
        const ok = await bcryptjs_1.default.compare(otpCode, record.otp);
        if (!ok) {
            return res.status(400).json({ message: "Invalid OTP" });
        }
        // ---------- Login flow → ສ້າງ password ໃໝ່ສຳລັບ login ----------
        if (otpType === 1) {
            const user = await employee_1.default.findOne({ where: { phone: normalizedPhone, status: 1 } });
            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }
            const password = (0, helper_1.generatePass)();
            const passwordHash = await bcryptjs_1.default.hash(password, OTP_HASH_ROUNDS);
            const passwordMessage = `ລະຫັດຜ່ານ OAC ສຳລັບເຂົ້າລະບົບ: ${password}`;
            const transaction = await database_1.default.transaction();
            try {
                await record.update({ status: 2 }, { transaction }); // 2 = used
                await user.update({ password: passwordHash }, { transaction });
                await tb.SendSMSAsync("OAC", normalizedPhone, passwordMessage);
                await transaction.commit();
            }
            catch (e) {
                await transaction.rollback();
                throw e;
            }
            let token;
            try {
                token = signUserToken(user);
            }
            catch (e) {
                console.error("JWT sign error:", e?.name, e?.message);
                return res.status(500).json({ message: "Failed to sign token" });
            }
            return res.status(200).json({
                message: "OTP verified, login successful",
                token,
                password,
                user: {
                    employee_uuid: user.getDataValue("_uuid"),
                    first_name: user.getDataValue("first_name"),
                    last_name: user.getDataValue("last_name"),
                    phone: user.getDataValue("phone"),
                },
            });
        }
        // ---------- Mark used ----------
        await record.update({ status: 2 }); // 2 = used
        // ---------- Flows ອື່ນ (register / reset / verify) ----------
        return res.status(200).json({
            message: "OTP verified successfully",
            verified: true,
            phone: normalizedPhone,
            types: otpType,
        });
    }
    catch (e) {
        console.error("verifyOTP error:", e);
        return res.status(500).json({ message: "Failed to verify OTP" });
    }
};
exports.verifyOTP = verifyOTP;
// ============================================================
//  Middleware: verify Bearer token, attach decoded payload to req.user
// ============================================================
const verifyToken = (req, res, next) => {
    const rawAuthHeader = req.headers.authorization;
    const authHeader = Array.isArray(rawAuthHeader)
        ? rawAuthHeader[0]
        : rawAuthHeader;
    if (!authHeader) {
        res.status(401).json({
            status: "401",
            message: "No Authorization header provided",
        });
        return;
    }
    const match = String(authHeader).trim().match(/^Bearer\s+(.+)$/i);
    const token = match?.[1]
        ?.trim()
        .replace(/^["']|["']$/g, "")
        .replace(/[\u0000-\u001F\u007F\s]/g, "");
    if (!token) {
        res.status(401).json({
            status: "401",
            message: "Invalid token format (Expected 'Bearer <token>')",
        });
        return;
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, jwtConfig_1.appJwtConfig.secret, {
            issuer: jwtConfig_1.appJwtConfig.issuer,
            ignoreExpiration: true,
        });
        req.user = decoded;
        next();
    }
    catch {
        res.status(401).json({
            status: "401",
            message: "Invalid or expired token",
        });
    }
};
exports.verifyToken = verifyToken;
