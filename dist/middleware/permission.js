"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requirePermission = exports.hasPermission = exports.currentUser = void 0;
const userModel_1 = __importDefault(require("../models/userModel"));
const ALLOWED = 1;
/** ຜູ້ໃຊ້ທີ່ login (sub ຂອງ JWT) ທີ່ຍັງເປີດໃຊ້ງານ — ບໍ່ພົບ = null */
const currentUser = async (req) => {
    const id = Number(req.user?.sub);
    if (!Number.isInteger(id) || id <= 0)
        return null;
    const user = await userModel_1.default.findByPk(id, { attributes: ["user_uuid", "status", "creates", "updates", "deletes", "password"] });
    return user && Number(user.status) === 1 ? user : null;
};
exports.currentUser = currentUser;
const hasPermission = (user, flag) => !!user && Number(user[flag]) === ALLOWED;
exports.hasPermission = hasPermission;
const LABELS = { creates: "ເພີ່ມ", updates: "ແກ້ໄຂ", deletes: "ລຶບ" };
/**
 * ກວດສິດຂອງຜູ້ໃຊ້ຈາກຖານຂໍ້ມູນທຸກເທື່ອ (ບໍ່ເຊື່ອຄ່າໃນ localStorage ຂອງໜ້າເວັບ) — ໃຊ້ຫຼັງ verifyToken.
 * ບໍ່ມີສິດ = 403
 */
const requirePermission = (flag) => async (req, res, next) => {
    try {
        const user = await (0, exports.currentUser)(req);
        if (!(0, exports.hasPermission)(user, flag)) {
            res.status(403).json({ message: `ທ່ານບໍ່ມີສິດ${LABELS[flag]}ຂໍ້ມູນ` });
            return;
        }
        next();
    }
    catch (error) {
        console.error("requirePermission", error);
        res.status(500).json({ message: "Error checking permission" });
    }
};
exports.requirePermission = requirePermission;
