import { Request, Response, NextFunction } from "express";
import MainMenu from "../models/mainMenuModel";
import Users from "../models/userModel";
import { readMenuAccess } from "../controllers/menuController";
import { EMPLOYEE_TOKEN } from "./auth";

/**
 * ໃຜເຫັນເງິນເດືອນໄດ້ — ຜູ້ໃຊ້ລະບົບທີ່ມີສິດເຂົ້າເມນູ "ເງິນເດືອນ" (tbl_users.menu_access ມີ /hr/payroll ຫຼື NULL = ທຸກເມນູ).
 * ບໍ່ມີ = ບໍ່ເຫັນເງິນເດືອນພື້ນຖານ / ເງິນເບີກ / ເງິນ OT ຂອງຄົນອື່ນ ແລະ ເຂົ້າ /payroll/*, /advance/* ບໍ່ໄດ້.
 * ຂໍ້ມູນຂອງຕົນເອງ (/…/me) ບໍ່ກ່ຽວ — ພະນັກງານເຫັນເງິນເດືອນຂອງຕົນເອງສະເໝີ
 */
export const PAYROLL_MENU_PATH = "/hr/payroll";

export const canSeeSalary = async (req: Request) => {
  if (req.user?.typ === EMPLOYEE_TOKEN) return false;
  const user = await Users.findByPk(Number(req.user?.sub), { attributes: ["user_uuid", "status", "menu_access"] });
  if (!user || Number(user.status) !== 1) return false;
  const allowed = readMenuAccess(user.menu_access);
  if (!allowed) return true;
  const menu = await MainMenu.findOne({ where: { types: 2, path: PAYROLL_MENU_PATH }, attributes: ["_uuid"] });
  // ບໍ່ມີແຖວເມນູເງິນເດືອນ (DB ເກົ່າ) — ຈຳກັດຕາມເມນູບໍ່ໄດ້ ຈຶ່ງບໍ່ປິດ
  return !menu || allowed.includes(Number(menu._uuid));
};

/** route ຂອງເງິນເດືອນ / ເງິນເບີກ (HR) — ບໍ່ມີສິດເມນູເງິນເດືອນ = 403 */
export const requireSalaryAccess = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!(await canSeeSalary(req))) {
      res.status(403).json({ message: "ທ່ານບໍ່ມີສິດເບິ່ງຂໍ້ມູນເງິນເດືອນ (ຕ້ອງມີສິດເຂົ້າເມນູ ເງິນເດືອນ)" });
      return;
    }
    next();
  } catch (error) {
    console.error("requireSalaryAccess", error);
    res.status(500).json({ message: "Error checking salary access" });
  }
};

/** ແທນຄ່າຂອງ key ທີ່ກຳນົດດ້ວຍ null ທຸກຊັ້ນ (object/array) */
const scrub = (value: unknown, keys: Set<string>): unknown => {
  if (Array.isArray(value)) return value.map((item) => scrub(item, keys));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, keys.has(key) ? null : scrub(item, keys)]));
  }
  return value;
};

/**
 * ຜູ້ທີ່ບໍ່ມີສິດເງິນເດືອນ: ຕອບກັບໂດຍ key ເຫຼົ່ານີ້ເປັນ null (ເຊັ່ນ basic_salary ໃນຂໍ້ມູນພະນັກງານ) ແລະ ບໍ່ຮັບຄ່າ key ເຫຼົ່ານີ້
 * ທີ່ສົ່ງມາບັນທຶກ (ເງິນເດືອນເດີມຄົງໄວ້). ວາງໄວ້ກ່ອນ handler (ຫຼັງ multer) ເພື່ອໃຫ້ req.body ອ່ານແລ້ວ
 */
export const hideSalaryFields = (...keys: string[]) => {
  const hidden = new Set(keys);
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (await canSeeSalary(req)) {
        next();
        return;
      }
      if (req.body && typeof req.body === "object") hidden.forEach((key) => delete req.body[key]);
      const json = res.json.bind(res);
      // JSON ກ່ອນ — Sequelize instance ກາຍເປັນ object ທຳມະດາ (toJSON) ແລ້ວຈຶ່ງລຶບຄ່າ
      res.json = (body: unknown) => json(scrub(JSON.parse(JSON.stringify(body ?? null)), hidden));
      next();
    } catch (error) {
      console.error("hideSalaryFields", error);
      res.status(500).json({ message: "Error checking salary access" });
    }
  };
};
