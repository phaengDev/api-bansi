"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireMenu = exports.hasMenu = void 0;
const mainMenuModel_1 = __importDefault(require("../models/mainMenuModel"));
const userModel_1 = __importDefault(require("../models/userModel"));
const menuController_1 = require("../controllers/menuController");
const auth_1 = require("./auth");
/**
 * ຜູ້ໃຊ້ລະບົບຄົນນີ້ມີສິດເຂົ້າເມນູ `path` ບໍ (tbl_users.menu_access; NULL = ທຸກເມນູ). token ພະນັກງານ / ບັນຊີປິດ = ບໍ່ມີ.
 * ບໍ່ມີແຖວເມນູນັ້ນໃນ DB (ລຸ້ນເກົ່າ) = ຈຳກັດຕາມເມນູບໍ່ໄດ້ ຈຶ່ງບໍ່ປິດ
 */
const hasMenu = async (req, path) => {
    if (req.user?.typ === auth_1.EMPLOYEE_TOKEN)
        return false;
    const user = await userModel_1.default.findByPk(Number(req.user?.sub), { attributes: ["user_uuid", "status", "menu_access"] });
    if (!user || Number(user.status) !== 1)
        return false;
    const allowed = (0, menuController_1.readMenuAccess)(user.menu_access);
    if (!allowed)
        return true;
    const menu = await mainMenuModel_1.default.findOne({ where: { types: 2, path }, attributes: ["_uuid"] });
    return !menu || allowed.includes(Number(menu._uuid));
};
exports.hasMenu = hasMenu;
/** route ທີ່ໃຊ້ໄດ້ສະເພາະຜູ້ມີສິດເມນູ `path` — ບໍ່ມີ = 403 `message` */
const requireMenu = (path, message) => async (req, res, next) => {
    try {
        if (!(await (0, exports.hasMenu)(req, path))) {
            res.status(403).json({ message });
            return;
        }
        next();
    }
    catch (error) {
        console.error("requireMenu", error);
        res.status(500).json({ message: "Error checking menu access" });
    }
};
exports.requireMenu = requireMenu;
