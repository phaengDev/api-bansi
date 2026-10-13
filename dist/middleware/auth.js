"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyToken = exports.EMPLOYEE_TOKEN = exports.checkSession = exports.login = void 0;
const userModel_1 = __importDefault(require("../models/userModel"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const jwtConfig_1 = require("../config/jwtConfig");
/**
 * POST /auth/login
 * Body: { phones: string, password: string }
 */
const login = async (req, res) => {
    try {
        const { phones, password } = req.body;
        if (!phones || !password)
            return res.status(400).json({ message: "phones and password are required" });
        const user = await userModel_1.default.findOne({
            where: { phones, status: 1 },
        });
        if (!user)
            return res.status(401).json({ message: "Invalid phones or password-----" });
        const hash = user.getDataValue("password");
        const ok = await bcryptjs_1.default.compare(password, hash);
        if (!ok)
            return res.status(401).json({ message: "Invalid phones or password====1" });
        if (!jwtConfig_1.adminJwtConfig.secret)
            return res.status(500).json({ message: "JWT secret not configured" });
        const payload = {
            sub: String(user.getDataValue("user_uuid")), // <- avoid BigInt
            phones: user.getDataValue("phones"),
            // role: user.getDataValue("type_user"),        // optional
        };
        let token;
        try {
            token = jsonwebtoken_1.default.sign(payload, jwtConfig_1.adminJwtConfig.secret, {
                algorithm: "HS256",
                expiresIn: jwtConfig_1.adminJwtConfig.expiresIn,
                issuer: jwtConfig_1.adminJwtConfig.issuer,
            });
        }
        catch (e) {
            console.error("JWT sign error:", e?.name, e?.message);
            res.status(500).json({ message: "Failed to sign token" });
            return;
        }
        const plainUser = user.get({ plain: true });
        return res.status(200).json({
            message: "Login successful",
            token,
            user: {
                user_uuid: user.getDataValue("user_uuid"),
                user_name: user.getDataValue("user_name"),
                phones: user.getDataValue("phones"),
                type_user: user.getDataValue("type_user"),
                deletes: user.getDataValue("deletes"),
                updates: user.getDataValue("updates"),
                creates: user.getDataValue("creates"),
            },
        });
    }
    catch (e) {
        console.error("Error in login:", e);
        return res.status(500).json({ message: "Error logging in" });
    }
};
exports.login = login;
/**
 * GET /user/session — ເວັບ bansi ກວດ token ທຸກເທື່ອທີ່ເປີດເວັບ ກ່ອນສະແດງໜ້າໃດໆ: verifyToken ກວດລາຍເຊັນ / ອາຍຸແລ້ວ
 * (token ຂອງ app ພະນັກງານ = 403), ບ່ອນນີ້ກວດຕື່ມວ່າບັນຊີຍັງເປີດໃຊ້ຢູ່ (ຖືກລຶບ / ປິດ = 401 ກັບໄປ login)
 */
const checkSession = async (req, res) => {
    try {
        const user = await userModel_1.default.findOne({ where: { user_uuid: Number(req.user?.sub), status: 1 }, attributes: ["user_uuid"] });
        if (!user) {
            res.status(401).json({ status: "401", message: "ບັນຊີນີ້ຖືກປິດໃຊ້ງານ" });
            return;
        }
        res.status(200).json({ message: "ok", exp: req.user?.exp });
    }
    catch (e) {
        console.error("Error in checkSession:", e);
        res.status(500).json({ message: "Error checking session" });
    }
};
exports.checkSession = checkSession;
/** typ ຂອງ token ທີ່ app ພະນັກງານໄດ້ຈາກ POST /app/login (sub = employee _uuid) */
exports.EMPLOYEE_TOKEN = "employee";
/**
 * route ທີ່ token ຂອງ app ພະນັກງານເຂົ້າໄດ້ — ຂໍ້ມູນຂອງຕົນເອງ (/…/me, /…/me/…), ສະແກນເຂົ້າ-ອອກວຽກ ແລະ /app/…;
 * ນອກນັ້ນ (ຂໍ້ມູນພະນັກງານທຸກຄົນ, ບັນຊີ, ເງິນເດືອນ…) ສະເພາະຜູ້ໃຊ້ລະບົບ
 */
const SELF_SERVICE = /^\/(?:[\w-]+\/me(?:\/|$)|attendance\/scan$|app\/)/;
/**
 * Middleware: verifies Bearer token, attaches decoded payload to req.user
 */
const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        res.status(401).json({ status: "401", message: "No Authorization header provided" });
        return;
    }
    const [scheme, token] = authHeader.split(" ");
    if (scheme !== "Bearer" || !token) {
        res.status(401).json({ status: "401", message: "Invalid token format (Expected 'Bearer <token>')" });
        return;
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, jwtConfig_1.adminJwtConfig.secret, { issuer: jwtConfig_1.adminJwtConfig.issuer, });
        if (decoded.typ === exports.EMPLOYEE_TOKEN && !SELF_SERVICE.test(req.path)) {
            res.status(403).json({ message: "ບັນຊີ app ພະນັກງານ ໃຊ້ໄດ້ສະເພາະຂໍ້ມູນຂອງຕົນເອງ" });
            return;
        }
        req.user = decoded;
        next();
    }
    catch {
        res.status(401).json({ status: "401", message: "Invalid or expired token" });
    }
};
exports.verifyToken = verifyToken;
