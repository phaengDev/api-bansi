"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hideSalaryFields = exports.requireSalaryAccess = exports.canSeeSalary = exports.PAYROLL_MENU_PATH = void 0;
const menuAccess_1 = require("./menuAccess");
/**
 * ໃຜເຫັນເງິນເດືອນໄດ້ — ຜູ້ໃຊ້ລະບົບທີ່ມີສິດເຂົ້າເມນູ "ເງິນເດືອນ" (tbl_users.menu_access ມີ /hr/payroll ຫຼື NULL = ທຸກເມນູ).
 * ບໍ່ມີ = ບໍ່ເຫັນເງິນເດືອນພື້ນຖານ / ເງິນເບີກ / ເງິນ OT ຂອງຄົນອື່ນ ແລະ ເຂົ້າ /payroll/*, /advance/* ບໍ່ໄດ້.
 * ຂໍ້ມູນຂອງຕົນເອງ (/…/me) ບໍ່ກ່ຽວ — ພະນັກງານເຫັນເງິນເດືອນຂອງຕົນເອງສະເໝີ
 */
exports.PAYROLL_MENU_PATH = "/hr/payroll";
const canSeeSalary = (req) => (0, menuAccess_1.hasMenu)(req, exports.PAYROLL_MENU_PATH);
exports.canSeeSalary = canSeeSalary;
/** route ຂອງເງິນເດືອນ / ເງິນເບີກ (HR) — ບໍ່ມີສິດເມນູເງິນເດືອນ = 403 */
exports.requireSalaryAccess = (0, menuAccess_1.requireMenu)(exports.PAYROLL_MENU_PATH, "ທ່ານບໍ່ມີສິດເບິ່ງຂໍ້ມູນເງິນເດືອນ (ຕ້ອງມີສິດເຂົ້າເມນູ ເງິນເດືອນ)");
/** ແທນຄ່າຂອງ key ທີ່ກຳນົດດ້ວຍ null ທຸກຊັ້ນ (object/array) */
const scrub = (value, keys) => {
    if (Array.isArray(value))
        return value.map((item) => scrub(item, keys));
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, keys.has(key) ? null : scrub(item, keys)]));
    }
    return value;
};
/**
 * ຜູ້ທີ່ບໍ່ມີສິດເງິນເດືອນ: ຕອບກັບໂດຍ key ເຫຼົ່ານີ້ເປັນ null (ເຊັ່ນ basic_salary ໃນຂໍ້ມູນພະນັກງານ) ແລະ ບໍ່ຮັບຄ່າ key ເຫຼົ່ານີ້
 * ທີ່ສົ່ງມາບັນທຶກ (ເງິນເດືອນເດີມຄົງໄວ້). ວາງໄວ້ກ່ອນ handler (ຫຼັງ multer) ເພື່ອໃຫ້ req.body ອ່ານແລ້ວ
 */
const hideSalaryFields = (...keys) => {
    const hidden = new Set(keys);
    return async (req, res, next) => {
        try {
            if (await (0, exports.canSeeSalary)(req)) {
                next();
                return;
            }
            if (req.body && typeof req.body === "object")
                hidden.forEach((key) => delete req.body[key]);
            const json = res.json.bind(res);
            // JSON ກ່ອນ — Sequelize instance ກາຍເປັນ object ທຳມະດາ (toJSON) ແລ້ວຈຶ່ງລຶບຄ່າ
            res.json = (body) => json(scrub(JSON.parse(JSON.stringify(body ?? null)), hidden));
            next();
        }
        catch (error) {
            console.error("hideSalaryFields", error);
            res.status(500).json({ message: "Error checking salary access" });
        }
    };
};
exports.hideSalaryFields = hideSalaryFields;
