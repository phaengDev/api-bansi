"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteHrOption = exports.updateHrOption = exports.createHrOption = exports.getHrOptionList = exports.getHrOptions = exports.optionError = exports.seedHrOptions = exports.OPTION_FIELDS = void 0;
const sequelize_1 = require("sequelize");
const hrOption_1 = __importDefault(require("../../models/hrOption"));
const employee_1 = __importDefault(require("../../models/employee"));
const bansiHelpers_1 = require("../bansi/bansiHelpers");
/**
 * ລາຍການຕັ້ງຄ່າຂອງຂໍ້ມູນພະນັກງານ (tbl_hr_option) — HR ເພີ່ມ / ປ່ຽນຊື່ / ປິດ ເອງໄດ້:
 * employee_type → tbl_employee.employee_type_id, education_level → tbl_employee.education_level_id
 */
exports.OPTION_FIELDS = {
    employee_type: "employee_type_id",
    education_level: "education_level_id",
};
const DEFAULTS = {
    employee_type: ["ພະນັກງານປະຈຳ", "ຜູ້ບໍລິຫານ", "ພະນັກງານສັນຍາ", "ພະນັກງານຊົ່ວຄາວ", "ນັກສຶກສາຝຶກງານ", "ພະນັກງານຕາມລະດູການ"],
    education_level: ["ມັດທະຍົມຕອນປາຍ", "ຊັ້ນກາງ", "ຊັ້ນສູງ", "ປະລິນຍາຕີ", "ປະລິນຍາໂທ", "ປະລິນຍາເອກ", "ອື່ນໆ"],
};
/** ຕອນເປີດ server: ໃສ່ຄ່າເລີ່ມຕົ້ນໃຫ້ kind ທີ່ຍັງບໍ່ມີຈັກແຖວ (ບໍ່ແຕະອັນທີ່ HR ແກ້ແລ້ວ) */
const seedHrOptions = async () => {
    for (const [kind, names] of Object.entries(DEFAULTS)) {
        if (await hrOption_1.default.count({ where: { kind } }))
            continue;
        await hrOption_1.default.bulkCreate(names.map((name, i) => ({ kind, name, sort: i + 1, status: 1 })));
        console.log(`🌱 tbl_hr_option: ${kind} ${names.length} rows`);
    }
};
exports.seedHrOptions = seedHrOptions;
/** ຕົວເລືອກໃນຟອມພະນັກງານ — ໃຊ້ໄດ້ສະເພາະ kind ຖືກ ແລະ ເປີດໃຊ້ (ຄ່າເດີມທີ່ຖືກປິດແລ້ວ ຮັກສາໄວ້ໄດ້) */
const optionError = async (kind, id, current) => {
    if (!id)
        return null;
    const row = await hrOption_1.default.findByPk(id, { attributes: ["_uuid", "kind", "status"] });
    if (!row || row.kind !== kind)
        return "ຕົວເລືອກບໍ່ຖືກຕ້ອງ";
    if (Number(row.status) !== 1 && id !== current)
        return "ຕົວເລືອກນີ້ຖືກປິດແລ້ວ";
    return null;
};
exports.optionError = optionError;
/** GET /hr-option/fetch — ທຸກລາຍການ + ຈຳນວນພະນັກງານທີ່ເຮັດວຽກຢູ່ ທີ່ໃຊ້ */
const getHrOptions = async (_req, res) => {
    try {
        const rows = await hrOption_1.default.findAll({ order: [["kind", "ASC"], ["sort", "ASC"], ["_uuid", "ASC"]], raw: true });
        const counts = new Map();
        for (const [kind, field] of Object.entries(exports.OPTION_FIELDS)) {
            const used = await employee_1.default.findAll({
                where: { work_status: 1, [field]: { [sequelize_1.Op.ne]: null } },
                attributes: [field, [(0, sequelize_1.fn)("COUNT", (0, sequelize_1.col)("_uuid")), "n"]],
                group: [field],
                raw: true,
            });
            for (const u of used)
                counts.set(`${kind}:${u[field]}`, Number(u.n) || 0);
        }
        res.status(200).json({ data: rows.map((r) => ({ ...r, employees: counts.get(`${r.kind}:${r._uuid}`) ?? 0 })) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting HR options");
    }
};
exports.getHrOptions = getHrOptions;
/** GET /hr-option/option — ທີ່ເປີດໃຊ້ ແຍກຕາມ kind */
const getHrOptionList = async (_req, res) => {
    try {
        const rows = await hrOption_1.default.findAll({ where: { status: 1 }, attributes: ["_uuid", "kind", "name"], order: [["sort", "ASC"], ["_uuid", "ASC"]], raw: true });
        const data = Object.fromEntries(Object.keys(exports.OPTION_FIELDS).map((k) => [k, rows.filter((r) => r.kind === k)]));
        res.status(200).json({ data });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting HR option list");
    }
};
exports.getHrOptionList = getHrOptionList;
const nameTaken = async (kind, name, exceptId) => (await hrOption_1.default.count({ where: { kind, name, ...(exceptId ? { _uuid: { [sequelize_1.Op.ne]: exceptId } } : {}) } })) > 0;
/** POST /hr-option/create { kind, name, sort? } */
const createHrOption = async (req, res) => {
    try {
        const kind = String(req.body?.kind ?? "");
        const name = String(req.body?.name ?? "").trim().slice(0, 150);
        if (!exports.OPTION_FIELDS[kind]) {
            res.status(400).json({ message: "ປະເພດລາຍການບໍ່ຖືກຕ້ອງ" });
            return;
        }
        if (!name) {
            res.status(400).json({ message: "ກະລຸນາປ້ອນຊື່" });
            return;
        }
        if (await nameTaken(kind, name)) {
            res.status(400).json({ message: `"${name}" ມີແລ້ວ` });
            return;
        }
        const sort = Number(req.body?.sort) || (await hrOption_1.default.count({ where: { kind } })) + 1;
        const row = await hrOption_1.default.create({ kind, name, sort, status: 1 });
        res.status(200).json({ message: "Successfully created option", data: row });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error creating HR option");
    }
};
exports.createHrOption = createHrOption;
/** PUT /hr-option/:id { name?, sort?, status? } */
const updateHrOption = async (req, res) => {
    try {
        const row = await hrOption_1.default.findByPk(Number((0, bansiHelpers_1.decodeId)(req)));
        if (!row) {
            res.status(404).json({ message: "ບໍ່ພົບລາຍການ" });
            return;
        }
        const body = req.body || {};
        const patch = {};
        if (body.name !== undefined) {
            const name = String(body.name ?? "").trim().slice(0, 150);
            if (!name) {
                res.status(400).json({ message: "ກະລຸນາປ້ອນຊື່" });
                return;
            }
            if (await nameTaken(row.kind, name, row._uuid)) {
                res.status(400).json({ message: `"${name}" ມີແລ້ວ` });
                return;
            }
            patch.name = name;
        }
        if (body.sort !== undefined)
            patch.sort = Number(body.sort) || 0;
        if (body.status !== undefined)
            patch.status = Number(body.status) === 0 ? 0 : 1;
        await row.update({ ...patch, updatedAt: new Date() });
        res.status(200).json({ message: "Successfully updated option", data: row });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error updating HR option");
    }
};
exports.updateHrOption = updateHrOption;
/** DELETE /hr-option/:id — ສະເພາະລາຍການທີ່ບໍ່ເຄີຍມີພະນັກງານໃຊ້ */
const deleteHrOption = async (req, res) => {
    try {
        const row = await hrOption_1.default.findByPk(Number((0, bansiHelpers_1.decodeId)(req)));
        if (!row) {
            res.status(404).json({ message: "ບໍ່ພົບລາຍການ" });
            return;
        }
        const used = await employee_1.default.count({ where: { [exports.OPTION_FIELDS[row.kind]]: row._uuid } });
        if (used) {
            res.status(400).json({ message: `ລຶບບໍ່ໄດ້ — ມີພະນັກງານ ${used} ຄົນໃຊ້ຢູ່ (ປິດໃຊ້ງານແທນ)` });
            return;
        }
        await row.destroy();
        res.status(200).json({ message: "Successfully deleted option" });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error deleting HR option");
    }
};
exports.deleteHrOption = deleteHrOption;
