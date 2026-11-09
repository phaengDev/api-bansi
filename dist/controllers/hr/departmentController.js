"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProvinces = exports.deleteDepartment = exports.updateDepartment = exports.createDepartment = exports.getDepartmentOption = exports.getDepartments = void 0;
const sequelize_1 = require("sequelize");
const department_1 = __importDefault(require("../../models/department"));
const employee_1 = __importDefault(require("../../models/employee"));
const province_1 = __importDefault(require("../../models/province"));
const district_1 = __importDefault(require("../../models/district"));
const bansiHelpers_1 = require("../bansi/bansiHelpers");
/**
 * ພະແນກ — ລະຫັດ, ຊື່, ລາຍລະອຽດ, ລຳດັບ ແລະ executive (ຂັ້ນບໍລິຫານ: ຢູ່ເທິງສຸດຂອງໂຄງຮ່າງ, ບໍ່ນັບເປັນພະແນກ).
 * ຕຳແໜ່ງເປັນລາຍຊື່ກາງ (positionController) ແລະ ສາຍບັງຄັບບັນຊາຢູ່ຝັ່ງພະນັກງານ (reports_to_id).
 * ພະແນກທີ່ເຄີຍມີພະນັກງານ ລຶບບໍ່ໄດ້ — ປິດແທນ
 */
const WORKING = 1;
/** ຈຳນວນພະນັກງານທີ່ເຮັດວຽກຢູ່ ຕໍ່ພະແນກ */
const headcount = async () => {
    const rows = await employee_1.default.findAll({
        where: { work_status: WORKING },
        attributes: ["department_id", [(0, sequelize_1.fn)("COUNT", (0, sequelize_1.col)("_uuid")), "n"]],
        group: ["department_id"],
        raw: true,
    });
    return new Map(rows.map((r) => [Number(r.department_id), Number(r.n) || 0]));
};
/** GET /department/fetch — ທຸກພະແນກ + ຈຳນວນພະນັກງານທີ່ເຮັດວຽກຢູ່ */
const getDepartments = async (_req, res) => {
    try {
        const [rows, counts] = await Promise.all([
            department_1.default.findAll({ order: [["sort", "ASC"], ["depart_code", "ASC"]], raw: true }),
            headcount(),
        ]);
        const data = rows.map((r) => ({ ...r, employees: counts.get(r._uuid) ?? 0 }));
        res.status(200).json({ data, total: data.length });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting departments");
    }
};
exports.getDepartments = getDepartments;
/** GET /department/option — ພະແນກທີ່ໃຊ້ງານ (ຟອມພະນັກງານ) */
const getDepartmentOption = async (_req, res) => {
    try {
        const data = await department_1.default.findAll({
            where: { status: 1 },
            attributes: ["_uuid", "depart_code", "depart_name", "executive"],
            order: [["sort", "ASC"], ["depart_code", "ASC"]],
        });
        res.status(200).json({ data });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting department option");
    }
};
exports.getDepartmentOption = getDepartmentOption;
const codeTaken = async (code, exceptId) => (await department_1.default.count({ where: { depart_code: code, ...(exceptId ? { _uuid: { [sequelize_1.Op.ne]: exceptId } } : {}) } })) > 0;
/** POST /department/create { depart_code, depart_name, description?, sort?, executive? } */
const createDepartment = async (req, res) => {
    try {
        const body = req.body || {};
        const code = String(body.depart_code ?? "").trim().toUpperCase().slice(0, 30);
        const name = String(body.depart_name ?? "").trim().slice(0, 150);
        if (!code || !name) {
            res.status(400).json({ message: "ກະລຸນາປ້ອນລະຫັດ ແລະ ຊື່ພະແນກ" });
            return;
        }
        if (await codeTaken(code)) {
            res.status(400).json({ message: `ລະຫັດ ${code} ມີແລ້ວ` });
            return;
        }
        const row = await department_1.default.create({
            depart_code: code,
            depart_name: name,
            description: String(body.description ?? "").trim().slice(0, 255) || null,
            sort: Number(body.sort) || 0,
            status: Number(body.status ?? 1) === 0 ? 0 : 1,
            executive: Number(body.executive) === 1 ? 1 : 0,
        });
        res.status(200).json({ message: "Successfully created department", data: row });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error creating department");
    }
};
exports.createDepartment = createDepartment;
/** PUT /department/:id — ສົ່ງສະເພາະຖັນທີ່ປ່ຽນ (ເຊັ່ນ { status }) */
const updateDepartment = async (req, res) => {
    try {
        const id = Number((0, bansiHelpers_1.decodeId)(req));
        const row = await department_1.default.findByPk(id);
        if (!row) {
            res.status(404).json({ message: "ບໍ່ພົບພະແນກ" });
            return;
        }
        const body = req.body || {};
        const patch = {};
        if (body.depart_code !== undefined) {
            const code = String(body.depart_code ?? "").trim().toUpperCase().slice(0, 30);
            if (!code) {
                res.status(400).json({ message: "ກະລຸນາປ້ອນລະຫັດພະແນກ" });
                return;
            }
            if (await codeTaken(code, id)) {
                res.status(400).json({ message: `ລະຫັດ ${code} ມີແລ້ວ` });
                return;
            }
            patch.depart_code = code;
        }
        if (body.depart_name !== undefined) {
            const name = String(body.depart_name ?? "").trim().slice(0, 150);
            if (!name) {
                res.status(400).json({ message: "ກະລຸນາປ້ອນຊື່ພະແນກ" });
                return;
            }
            patch.depart_name = name;
        }
        if (body.description !== undefined)
            patch.description = String(body.description ?? "").trim().slice(0, 255) || null;
        if (body.sort !== undefined)
            patch.sort = Number(body.sort) || 0;
        if (body.status !== undefined)
            patch.status = Number(body.status) === 0 ? 0 : 1;
        if (body.executive !== undefined)
            patch.executive = Number(body.executive) === 1 ? 1 : 0;
        await row.update({ ...patch, updatedAt: new Date() });
        res.status(200).json({ message: "Successfully updated department", data: row });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error updating department");
    }
};
exports.updateDepartment = updateDepartment;
/** DELETE /department/:id — ສະເພາະພະແນກທີ່ບໍ່ເຄີຍມີພະນັກງານ (ລວມຄົນລາອອກ) */
const deleteDepartment = async (req, res) => {
    try {
        const id = Number((0, bansiHelpers_1.decodeId)(req));
        const row = await department_1.default.findByPk(id);
        const used = row ? await employee_1.default.count({ where: { department_id: id } }) : 0;
        if (!row || used) {
            res.status(row ? 400 : 404).json({ message: row ? `ລຶບບໍ່ໄດ້ — ມີພະນັກງານ ${used} ຄົນ (ປິດໃຊ້ງານແທນ)` : "ບໍ່ພົບພະແນກ" });
            return;
        }
        await row.destroy();
        res.status(200).json({ message: "Successfully deleted department" });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error deleting department");
    }
};
exports.deleteDepartment = deleteDepartment;
/** GET /address/province — 18 ແຂວງ ພ້ອມເມືອງ (ຟອມທີ່ຢູ່ຂອງພະນັກງານ) */
const getProvinces = async (_req, res) => {
    try {
        const data = await province_1.default.findAll({
            include: [{ model: district_1.default, as: "districts", attributes: ["_uuid", "district_name"] }],
            order: [["_uuid", "ASC"], [{ model: district_1.default, as: "districts" }, "_uuid", "ASC"]],
        });
        res.status(200).json({ data });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting provinces");
    }
};
exports.getProvinces = getProvinces;
