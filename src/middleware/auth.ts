// src/middleware/auth.ts
import { Request, Response, NextFunction } from "express";
import Users from "../models/userModel";
import bcrypt from "bcryptjs";
import jwt, { JwtPayload } from "jsonwebtoken";
import { adminJwtConfig } from "../config/jwtConfig";
// import TypeUser from "../models/typeUserModel";
// import * as jwt,{ JwtPayload } from "jsonwebtoken"; // if NO esModuleInterop

// Extend Express.Request to carry our decoded user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload & {
        sub?: string;         // standard subject — user_uuid (ລະບົບ) ຫຼື employee _uuid (typ "employee")
        phones?: string;
        role?: string;
        typ?: string;         // "employee" = token ຂອງ app ພະນັກງານ (appAuthController)
      };
    }
  }
}
/**
 * POST /auth/login
 * Body: { phones: string, password: string }
 */

export const login = async (req: Request, res: Response) => {
  try {
    const { phones, password } = req.body as any;
    if (!phones || !password) return res.status(400).json({ message: "phones and password are required" });

    const user = await Users.findOne({
        where: { phones, status: 1 },
      });
    if (!user) return res.status(401).json({ message: "Invalid phones or password-----" });

    const hash: string = user.getDataValue("password");
    const ok = await bcrypt.compare(password, hash);
    if (!ok) return res.status(401).json({ message: "Invalid phones or password====1" });

    if (!adminJwtConfig.secret) return res.status(500).json({ message: "JWT secret not configured" });
    const payload = {
      sub: String(user.getDataValue("user_uuid")),   // <- avoid BigInt
      phones: user.getDataValue("phones"),
      // role: user.getDataValue("type_user"),        // optional
    };
    let token: string;
    try {
      token = jwt.sign(payload, adminJwtConfig.secret, {
        algorithm: "HS256",
        expiresIn: adminJwtConfig.expiresIn as any,
        issuer: adminJwtConfig.issuer,
      });
    } catch (e: any) {
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
  } catch (e) {
    console.error("Error in login:", e);
    return res.status(500).json({ message: "Error logging in" });
  }
};
/**
 * GET /user/session — ເວັບ bansi ກວດ token ທຸກເທື່ອທີ່ເປີດເວັບ ກ່ອນສະແດງໜ້າໃດໆ: verifyToken ກວດລາຍເຊັນ / ອາຍຸແລ້ວ
 * (token ຂອງ app ພະນັກງານ = 403), ບ່ອນນີ້ກວດຕື່ມວ່າບັນຊີຍັງເປີດໃຊ້ຢູ່ (ຖືກລຶບ / ປິດ = 401 ກັບໄປ login)
 */
export const checkSession = async (req: Request, res: Response) => {
  try {
    const user = await Users.findOne({ where: { user_uuid: Number(req.user?.sub), status: 1 }, attributes: ["user_uuid"] });
    if (!user) {
      res.status(401).json({ status: "401", message: "ບັນຊີນີ້ຖືກປິດໃຊ້ງານ" });
      return;
    }
    res.status(200).json({ message: "ok", exp: req.user?.exp });
  } catch (e) {
    console.error("Error in checkSession:", e);
    res.status(500).json({ message: "Error checking session" });
  }
};

/** typ ຂອງ token ທີ່ app ພະນັກງານໄດ້ຈາກ POST /app/login (sub = employee _uuid) */
export const EMPLOYEE_TOKEN = "employee";

/**
 * route ທີ່ token ຂອງ app ພະນັກງານເຂົ້າໄດ້ — ຂໍ້ມູນຂອງຕົນເອງ (/…/me, /…/me/…), ສະແກນເຂົ້າ-ອອກວຽກ ແລະ /app/…;
 * ນອກນັ້ນ (ຂໍ້ມູນພະນັກງານທຸກຄົນ, ບັນຊີ, ເງິນເດືອນ…) ສະເພາະຜູ້ໃຊ້ລະບົບ
 */
const SELF_SERVICE = /^\/(?:[\w-]+\/me(?:\/|$)|attendance\/scan$|app\/)/;

/**
 * Middleware: verifies Bearer token, attaches decoded payload to req.user
 */
export const verifyToken = (req: Request, res: Response, next: NextFunction) => {
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
    const decoded = jwt.verify(token, adminJwtConfig.secret, { issuer: adminJwtConfig.issuer, }) as JwtPayload;
    if (decoded.typ === EMPLOYEE_TOKEN && !SELF_SERVICE.test(req.path)) {
      res.status(403).json({ message: "ບັນຊີ app ພະນັກງານ ໃຊ້ໄດ້ສະເພາະຂໍ້ມູນຂອງຕົນເອງ" });
      return;
    }
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ status: "401", message: "Invalid or expired token" });
  }
};
