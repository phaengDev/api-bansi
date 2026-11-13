import { Request, Response } from "express";
import MainMenu from "../models/mainMenuModel";
import Users from "../models/userModel";

/**
 * ເມນູໜ້າ desktop ບັນຊີ (tbl_main_menu types 2) ແລະ ສິດເຂົ້າເມນູຂອງແຕ່ລະບັນຊີ (tbl_users.menu_access:
 * JSON array ຂອງ _uuid, NULL = ທຸກເມນູ). ບໍ່ສົ່ງ hash ລະຫັດເມນູອອກໄປ — ສົ່ງແຕ່ locked
 */

/** ເມນູ ຕັ້ງຄ່າຂໍ້ມູນພື້ນຖານ — ມີໜ້າຜູ້ໃຊ້ລະບົບ, ຖອນອອກຈາກບັນຊີຂອງຕົນເອງບໍ່ໄດ້ (ກັນລັອກຕົວເອງອອກ) */
export const USER_ADMIN_MENU_PATH = "/hr";

const activeMenus = () =>
  MainMenu.scope("withPassword").findAll({ where: { status: 1, types: 2 }, order: [["_uuid", "ASC"]] });

const present = (menu: MainMenu) => {
  const { password, ...rest } = menu.get({ plain: true });
  return { ...rest, locked: !!password };
};

/** ຄ່າໃນຖານຂໍ້ມູນ → ລາຍການ _uuid; NULL / ອ່ານບໍ່ໄດ້ = null (ທຸກເມນູ) */
export const readMenuAccess = (value: unknown): number[] | null => {
  if (value === null || value === undefined || value === "") return null;
  try {
    const list = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(list) ? list.map(Number).filter((id) => Number.isInteger(id) && id > 0) : null;
  } catch {
    return null;
  }
};

/**
 * ກວດ menu_access ຈາກຟອມ: null = ທຸກເມນູ; array = ສະເພາະ _uuid ທີ່ເປັນເມນູບັນຊີແທ້ (ອັນອື່ນຖືກຂ້າມ).
 * ຕິກຄົບທຸກເມນູ = ເກັບ NULL (ເມນູທີ່ເພີ່ມພາຍຫຼັງ ກໍ່ເຫັນ). ຄືນຄ່າທີ່ເກັບລົງຖັນ + ລາຍການ id (null = ທຸກເມນູ) ຫຼື error
 */
export const parseMenuAccess = async (
  input: unknown,
): Promise<{ value: string | null; ids: number[] | null } | { error: string }> => {
  if (input === null) return { value: null, ids: null };
  if (!Array.isArray(input)) return { error: "ຮູບແບບເມນູບໍ່ຖືກຕ້ອງ" };
  const menus = await MainMenu.findAll({ where: { status: 1, types: 2 }, attributes: ["_uuid"], raw: true });
  const valid = new Set(menus.map((m) => Number(m._uuid)));
  const ids = [...new Set(input.map(Number))].filter((id) => valid.has(id)).sort((a, b) => a - b);
  if (!ids.length) return { error: "ກະລຸນາເລືອກຢ່າງໜ້ອຍ 1 ເມນູ" };
  if (ids.length === valid.size) return { value: null, ids: null };
  return { value: JSON.stringify(ids), ids };
};

/** _uuid ຂອງເມນູ ຕັ້ງຄ່າຂໍ້ມູນພື້ນຖານ (null = ບໍ່ມີແຖວນີ້) */
export const userAdminMenuId = async () => {
  const row = await MainMenu.findOne({ where: { types: 2, path: USER_ADMIN_MENU_PATH }, attributes: ["_uuid"] });
  return row ? Number(row._uuid) : null;
};

/**
 * GET /menu/main — ເມນູທີ່ຜູ້ໃຊ້ຄົນນີ້ເຂົ້າໄດ້ (ຕາມ menu_access) ພ້ອມສະຖານະລັອກ.
 * all = true → ໄດ້ທຸກເມນູ (DB ຍັງບໍ່ມີແຖວເມນູ → ໜ້າເວັບໃຊ້ທຸກໜ້າຂອງຕົນເອງ); false + data ວ່າງ = ບໍ່ມີເມນູໃດເລີຍ
 */
export const getMainMenus = async (req: Request, res: Response) => {
  try {
    const user = await Users.findByPk(Number(req.user?.sub), { attributes: ["user_uuid", "menu_access"] });
    const allowed = readMenuAccess(user?.menu_access);
    const menus = await activeMenus();
    const data = (allowed ? menus.filter((menu) => allowed.includes(Number(menu._uuid))) : menus).map(present);
    res.status(200).json({ data, all: !allowed });
  } catch (error) {
    console.error("GET MAIN MENUS ERROR:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/** GET /menu/all — ທຸກເມນູ (ຟອມຜູ້ໃຊ້ໃຊ້ຕິກສິດເຂົ້າເມນູ) */
export const getAllMainMenus = async (_req: Request, res: Response) => {
  try {
    const menus = await activeMenus();
    res.status(200).json({ data: menus.map(present) });
  } catch (error) {
    console.error("GET ALL MAIN MENUS ERROR:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
