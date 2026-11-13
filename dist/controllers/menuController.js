"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllMainMenus = exports.getMainMenus = exports.userAdminMenuId = exports.parseMenuAccess = exports.readMenuAccess = exports.USER_ADMIN_MENU_PATH = void 0;
const mainMenuModel_1 = __importDefault(require("../models/mainMenuModel"));
const userModel_1 = __importDefault(require("../models/userModel"));
/**
 * ເມນູໜ້າ desktop ບັນຊີ (tbl_main_menu types 2) ແລະ ສິດເຂົ້າເມນູຂອງແຕ່ລະບັນຊີ (tbl_users.menu_access:
 * JSON array ຂອງ _uuid, NULL = ທຸກເມນູ). ບໍ່ສົ່ງ hash ລະຫັດເມນູອອກໄປ — ສົ່ງແຕ່ locked
 */
/** ເມນູ ຕັ້ງຄ່າຂໍ້ມູນພື້ນຖານ — ມີໜ້າຜູ້ໃຊ້ລະບົບ, ຖອນອອກຈາກບັນຊີຂອງຕົນເອງບໍ່ໄດ້ (ກັນລັອກຕົວເອງອອກ) */
exports.USER_ADMIN_MENU_PATH = "/hr";
const activeMenus = () => mainMenuModel_1.default.scope("withPassword").findAll({ where: { status: 1, types: 2 }, order: [["_uuid", "ASC"]] });
const present = (menu) => {
    const { password, ...rest } = menu.get({ plain: true });
    return { ...rest, locked: !!password };
};
/** ຄ່າໃນຖານຂໍ້ມູນ → ລາຍການ _uuid; NULL / ອ່ານບໍ່ໄດ້ = null (ທຸກເມນູ) */
const readMenuAccess = (value) => {
    if (value === null || value === undefined || value === "")
        return null;
    try {
        const list = typeof value === "string" ? JSON.parse(value) : value;
        return Array.isArray(list) ? list.map(Number).filter((id) => Number.isInteger(id) && id > 0) : null;
    }
    catch {
        return null;
    }
};
exports.readMenuAccess = readMenuAccess;
/**
 * ກວດ menu_access ຈາກຟອມ: null = ທຸກເມນູ; array = ສະເພາະ _uuid ທີ່ເປັນເມນູບັນຊີແທ້ (ອັນອື່ນຖືກຂ້າມ).
 * ຕິກຄົບທຸກເມນູ = ເກັບ NULL (ເມນູທີ່ເພີ່ມພາຍຫຼັງ ກໍ່ເຫັນ). ຄືນຄ່າທີ່ເກັບລົງຖັນ + ລາຍການ id (null = ທຸກເມນູ) ຫຼື error
 */
const parseMenuAccess = async (input) => {
    if (input === null)
        return { value: null, ids: null };
    if (!Array.isArray(input))
        return { error: "ຮູບແບບເມນູບໍ່ຖືກຕ້ອງ" };
    const menus = await mainMenuModel_1.default.findAll({ where: { status: 1, types: 2 }, attributes: ["_uuid"], raw: true });
    const valid = new Set(menus.map((m) => Number(m._uuid)));
    const ids = [...new Set(input.map(Number))].filter((id) => valid.has(id)).sort((a, b) => a - b);
    if (!ids.length)
        return { error: "ກະລຸນາເລືອກຢ່າງໜ້ອຍ 1 ເມນູ" };
    if (ids.length === valid.size)
        return { value: null, ids: null };
    return { value: JSON.stringify(ids), ids };
};
exports.parseMenuAccess = parseMenuAccess;
/** _uuid ຂອງເມນູ ຕັ້ງຄ່າຂໍ້ມູນພື້ນຖານ (null = ບໍ່ມີແຖວນີ້) */
const userAdminMenuId = async () => {
    const row = await mainMenuModel_1.default.findOne({ where: { types: 2, path: exports.USER_ADMIN_MENU_PATH }, attributes: ["_uuid"] });
    return row ? Number(row._uuid) : null;
};
exports.userAdminMenuId = userAdminMenuId;
/**
 * GET /menu/main — ເມນູທີ່ຜູ້ໃຊ້ຄົນນີ້ເຂົ້າໄດ້ (ຕາມ menu_access) ພ້ອມສະຖານະລັອກ.
 * all = true → ໄດ້ທຸກເມນູ (DB ຍັງບໍ່ມີແຖວເມນູ → ໜ້າເວັບໃຊ້ທຸກໜ້າຂອງຕົນເອງ); false + data ວ່າງ = ບໍ່ມີເມນູໃດເລີຍ
 */
const getMainMenus = async (req, res) => {
    try {
        const user = await userModel_1.default.findByPk(Number(req.user?.sub), { attributes: ["user_uuid", "menu_access"] });
        const allowed = (0, exports.readMenuAccess)(user?.menu_access);
        const menus = await activeMenus();
        const data = (allowed ? menus.filter((menu) => allowed.includes(Number(menu._uuid))) : menus).map(present);
        res.status(200).json({ data, all: !allowed });
    }
    catch (error) {
        console.error("GET MAIN MENUS ERROR:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
exports.getMainMenus = getMainMenus;
/** GET /menu/all — ທຸກເມນູ (ຟອມຜູ້ໃຊ້ໃຊ້ຕິກສິດເຂົ້າເມນູ) */
const getAllMainMenus = async (_req, res) => {
    try {
        const menus = await activeMenus();
        res.status(200).json({ data: menus.map(present) });
    }
    catch (error) {
        console.error("GET ALL MAIN MENUS ERROR:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
exports.getAllMainMenus = getAllMainMenus;
