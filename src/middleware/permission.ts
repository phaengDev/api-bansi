import { Request, Response, NextFunction } from "express";
import Users from "../models/userModel";

/** ສິດຂອງຜູ້ໃຊ້ (tbl_users) — 1 = ອະນຸຍາດ (ຄືກັບ getPermission ຂອງໜ້າເວັບ) */
export type PermissionFlag = "creates" | "updates" | "deletes";

const ALLOWED = 1;

/** ຜູ້ໃຊ້ທີ່ login (sub ຂອງ JWT) ທີ່ຍັງເປີດໃຊ້ງານ — ບໍ່ພົບ = null */
export const currentUser = async (req: Request) => {
  const id = Number(req.user?.sub);
  if (!Number.isInteger(id) || id <= 0) return null;
  const user = await Users.findByPk(id, { attributes: ["user_uuid", "status", "creates", "updates", "deletes", "password"] });
  return user && Number(user.status) === 1 ? user : null;
};

export const hasPermission = (user: Users | null, flag: PermissionFlag) => !!user && Number(user[flag]) === ALLOWED;

const LABELS: Record<PermissionFlag, string> = { creates: "ເພີ່ມ", updates: "ແກ້ໄຂ", deletes: "ລຶບ" };

/**
 * ກວດສິດຂອງຜູ້ໃຊ້ຈາກຖານຂໍ້ມູນທຸກເທື່ອ (ບໍ່ເຊື່ອຄ່າໃນ localStorage ຂອງໜ້າເວັບ) — ໃຊ້ຫຼັງ verifyToken.
 * ບໍ່ມີສິດ = 403
 */
export const requirePermission = (flag: PermissionFlag) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await currentUser(req);
    if (!hasPermission(user, flag)) {
      res.status(403).json({ message: `ທ່ານບໍ່ມີສິດ${LABELS[flag]}ຂໍ້ມູນ` });
      return;
    }
    next();
  } catch (error) {
    console.error("requirePermission", error);
    res.status(500).json({ message: "Error checking permission" });
  }
};
