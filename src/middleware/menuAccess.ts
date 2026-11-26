import { Request, Response, NextFunction } from "express";
import MainMenu from "../models/mainMenuModel";
import Users from "../models/userModel";
import { readMenuAccess } from "../controllers/menuController";
import { EMPLOYEE_TOKEN } from "./auth";

/**
 * ຜູ້ໃຊ້ລະບົບຄົນນີ້ມີສິດເຂົ້າເມນູ `path` ບໍ (tbl_users.menu_access; NULL = ທຸກເມນູ). token ພະນັກງານ / ບັນຊີປິດ = ບໍ່ມີ.
 * ບໍ່ມີແຖວເມນູນັ້ນໃນ DB (ລຸ້ນເກົ່າ) = ຈຳກັດຕາມເມນູບໍ່ໄດ້ ຈຶ່ງບໍ່ປິດ
 */
export const hasMenu = async (req: Request, path: string) => {
  if (req.user?.typ === EMPLOYEE_TOKEN) return false;
  const user = await Users.findByPk(Number(req.user?.sub), { attributes: ["user_uuid", "status", "menu_access"] });
  if (!user || Number(user.status) !== 1) return false;
  const allowed = readMenuAccess(user.menu_access);
  if (!allowed) return true;
  const menu = await MainMenu.findOne({ where: { types: 2, path }, attributes: ["_uuid"], order: [["_uuid", "ASC"]] });
  return !menu || allowed.includes(Number(menu._uuid));
};

/** route ທີ່ໃຊ້ໄດ້ສະເພາະຜູ້ມີສິດເມນູ `path` — ບໍ່ມີ = 403 `message` */
export const requireMenu = (path: string, message: string) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!(await hasMenu(req, path))) {
      res.status(403).json({ message });
      return;
    }
    next();
  } catch (error) {
    console.error("requireMenu", error);
    res.status(500).json({ message: "Error checking menu access" });
  }
};
