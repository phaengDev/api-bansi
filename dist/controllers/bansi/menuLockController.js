"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeMenuLock = exports.saveMenuLock = exports.verifyMenuLock = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const mainMenuModel_1 = __importDefault(require("../../models/mainMenuModel"));
const bansiHelpers_1 = require("./bansiHelpers");
/**
 * ລະຫັດຜ່ານເຂົ້າເມນູຂອງໜ້າ desktop ບັນຊີ — ເກັບເປັນ bcrypt hash ໃນ tbl_main_menu.password
 * ຂອງແຖວ types 2 (NULL = ບໍ່ລັອກ). ລາຍການເມນູ + ສະຖານະລັອກ ດຶງຈາກ GET /menu/main
 */
const MIN_LENGTH = 4;
const HASH_ROUNDS = 10;
/** ລັອກບໍ່ໄດ້: ຕັ້ງຄ່າບັນຊີ (ບ່ອນປົດລັອກ — ລັອກແລ້ວລືມລະຫັດ ຈະເຂົ້າໄປແກ້ບໍ່ໄດ້) ແລະ ປະຕິທິນ */
const UNLOCKABLE_PATHS = ["/account/setting", "/calendar"];
const badRequest = (res, message) => res.status(400).json({ message });
/** ແຖວເມນູບັນຊີທີ່ລັອກໄດ້ (ພ້ອມ password) — null ຖ້າ menu_id ບໍ່ຖືກ */
const findMenu = async (body) => {
    const id = Number(body?.menu_id);
    if (!Number.isInteger(id))
        return null;
    const row = await mainMenuModel_1.default.scope("withPassword").findOne({ where: { _uuid: id, types: 2 } });
    return row && !UNLOCKABLE_PATHS.includes(row.path) ? row : null;
};
const matches = async (password, hash) => !!hash && bcryptjs_1.default.compare(String(password ?? ""), hash);
/** POST /menu-lock/verify { menu_id, password } — 200 = ເຂົ້າໄດ້ (ຫຼື ເມນູບໍ່ໄດ້ລັອກ), 400 = ລະຫັດຜິດ */
const verifyMenuLock = async (req, res) => {
    try {
        const row = await findMenu(req.body);
        if (!row)
            return badRequest(res, "ເມນູບໍ່ຖືກຕ້ອງ");
        if (row.password && !(await matches(req.body.password, row.password))) {
            return badRequest(res, "ລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ");
        }
        res.status(200).json({ ok: true });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error verifying menu lock");
    }
};
exports.verifyMenuLock = verifyMenuLock;
/** POST /menu-lock/save { menu_id, password, current_password? } — ຕັ້ງໃໝ່ ຫຼື ປ່ຽນ (ປ່ຽນຕ້ອງໃສ່ລະຫັດເກົ່າຖືກ) */
const saveMenuLock = async (req, res) => {
    try {
        const row = await findMenu(req.body);
        if (!row)
            return badRequest(res, "ເມນູບໍ່ຖືກຕ້ອງ");
        const password = String(req.body.password ?? "");
        if (password.length < MIN_LENGTH)
            return badRequest(res, `ລະຫັດຜ່ານຕ້ອງມີຢ່າງໜ້ອຍ ${MIN_LENGTH} ຕົວ`);
        if (row.password && !(await matches(req.body.current_password, row.password))) {
            return badRequest(res, "ລະຫັດຜ່ານເກົ່າບໍ່ຖືກຕ້ອງ");
        }
        await row.update({ password: await bcryptjs_1.default.hash(password, HASH_ROUNDS) });
        res.status(200).json({ message: "Successfully saved menu lock" });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error saving menu lock");
    }
};
exports.saveMenuLock = saveMenuLock;
/** POST /menu-lock/remove { menu_id, current_password } — ຍົກເລີກການລັອກ (password → NULL) */
const removeMenuLock = async (req, res) => {
    try {
        const row = await findMenu(req.body);
        if (!row)
            return badRequest(res, "ເມນູບໍ່ຖືກຕ້ອງ");
        if (!row.password)
            return res.status(200).json({
                message: "Menu is not locked"
            });
        if (!(await matches(req.body.current_password, row.password))) {
            return badRequest(res, "ລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ");
        }
        await row.update({ password: null });
        res.status(200).json({ message: "Successfully removed menu lock" });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error removing menu lock");
    }
};
exports.removeMenuLock = removeMenuLock;
