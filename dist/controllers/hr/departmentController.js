"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProvinces = exports.deleteDepartment = exports.updateDepartment = exports.createDepartment = exports.getDepartmentOption = exports.getDepartments = void 0;
const sequelize_1 = require("sequelize");
const department_1 = __importDefault(require("../../models/department"));
const position_1 = __importDefault(require("../../models/position"));
const employee_1 = __importDefault(require("../../models/employee"));
const province_1 = __importDefault(require("../../models/province"));
const district_1 = __importDefault(require("../../models/district"));
const bansiHelpers_1 = require("../bansi/bansiHelpers");
/**
 * ພະແນກ + ຕຳແໜ່ງຂອງພະແນກ — ຕຳແໜ່ງບັນທຶກພ້ອມກັບພະແນກ (positions: [{ _uuid?, position_name, status? }]):
 * ແຖວທີ່ບໍ່ສົ່ງມາອີກ = ລຶບ, ແຕ່ຖ້າມີພະນັກງານໃຊ້ຢູ່ ຈະປິດ (status 0) ແທນ. ພະແນກທີ່ມີພະນັກງານ ລຶບບໍ່ໄດ້ (ປິດແທນ)
 */
const WORKING = 1;
/** ຈຳນວນພະນັກງານທີ່ເຮັດວຽກຢູ່ ຕໍ່ພະແນກ ແລະ ຕໍ່ຕຳແໜ່ງ */
const headcount = async () => {
    const rows = await employee_1.default.findAll({
        where: { work_status: WORKING },
        attributes: ["department_id", "position_id", [(0, sequelize_1.fn)("COUNT", (0, sequelize_1.col)("_uuid")), "n"]],
        group: ["department_id", "position_id"],
        raw: true,
    });
    const byDepartment = new Map();
    const byPosition = new Map();
    for (const r of rows) {
        const n = Number(r.n) || 0;
        byDepartment.set(Number(r.department_id), (byDepartment.get(Number(r.department_id)) ?? 0) + n);
        if (r.position_id)
            byPosition.set(Number(r.position_id), (byPosition.get(Number(r.position_id)) ?? 0) + n);
    }
    return { byDepartment, byPosition };
};
const positionOrder = [[{ model: position_1.default, as: "positions" }, "sort", "ASC"], [{ model: position_1.default, as: "positions" }, "_uuid", "ASC"]];
/** GET /department/fetch — ທຸກພະແນກ + ຕຳແໜ່ງ + ຈຳນວນພະນັກງານທີ່ເຮັດວຽກຢູ່ */
const getDepartments = async (_req, res) => {
    try {
        const [rows, counts] = await Promise.all([
            department_1.default.findAll({
                include: [{ model: position_1.default, as: "positions" }],
                order: [["sort", "ASC"], ["depart_code", "ASC"], ...positionOrder],
            }),
            headcount(),
        ]);
        const data = rows.map((row) => {
            const r = row.get({ plain: true });
            return {
                ...r,
                employees: counts.byDepartment.get(r._uuid) ?? 0,
                positions: (r.positions ?? []).map((p) => ({ ...p, employees: counts.byPosition.get(p._uuid) ?? 0 })),
            };
        });
        res.status(200).json({ data, total: data.length });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting departments");
    }
};
exports.getDepartments = getDepartments;
/** GET /department/option — ພະແນກທີ່ໃຊ້ງານ + ຕຳແໜ່ງທີ່ໃຊ້ງານ (ຟອມພະນັກງານ) */
const getDepartmentOption = async (_req, res) => {
    try {
        const data = await department_1.default.findAll({
            where: { status: 1 },
            include: [{ model: position_1.default, as: "positions", where: { status: 1 }, required: false }],
            order: [["sort", "ASC"], ["depart_code", "ASC"], ...positionOrder],
        });
        res.status(200).json({ data });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting department option");
    }
};
exports.getDepartmentOption = getDepartmentOption;
const parsePositions = (raw) => {
    if (raw === undefined || raw === null)
        return [];
    if (!Array.isArray(raw))
        return { error: "ຂໍ້ມູນຕຳແໜ່ງບໍ່ຖືກຕ້ອງ" };
    const list = [];
    const names = new Set();
    for (const item of raw) {
        const name = String(item?.position_name ?? "").trim().slice(0, 150);
        if (!name)
            continue;
        const key = name.toLowerCase();
        if (names.has(key))
            return { error: `ຕຳແໜ່ງ "${name}" ຊ້ຳກັນ` };
        names.add(key);
        const id = Number(item?._uuid);
        list.push({ ...(id > 0 ? { _uuid: id } : {}), position_name: name, status: Number(item?.status ?? 1) === 0 ? 0 : 1 });
    }
    return list;
};
/** ບັນທຶກຕຳແໜ່ງຂອງພະແນກໃຫ້ກົງກັບລາຍການທີ່ສົ່ງມາ — ອັນທີ່ຫາຍໄປ: ມີຄົນໃຊ້ = ປິດ, ບໍ່ມີ = ລຶບ */
const syncPositions = async (departmentId, positions, t) => {
    const existing = await position_1.default.findAll({ where: { department_id: departmentId }, transaction: t });
    const keep = new Set(positions.filter((p) => p._uuid).map((p) => p._uuid));
    for (const row of existing) {
        if (keep.has(row._uuid))
            continue;
        const used = await employee_1.default.count({ where: { position_id: row._uuid }, transaction: t });
        if (used)
            await row.update({ status: 0, updatedAt: new Date() }, { transaction: t });
        else
            await row.destroy({ transaction: t });
    }
    for (const [index, p] of positions.entries()) {
        const row = p._uuid ? existing.find((e) => e._uuid === p._uuid) : null;
        if (row) {
            await row.update({ position_name: p.position_name, status: p.status, sort: index + 1, updatedAt: new Date() }, { transaction: t });
        }
        else {
            await position_1.default.create({ department_id: departmentId, position_name: p.position_name, status: p.status, sort: index + 1 }, { transaction: t });
        }
    }
};
const codeTaken = async (code, exceptId) => (await department_1.default.count({ where: { depart_code: code, ...(exceptId ? { _uuid: { [sequelize_1.Op.ne]: exceptId } } : {}) } })) > 0;
/** POST /department/create { depart_code, depart_name, description?, sort?, positions? } */
const createDepartment = async (req, res) => {
    const t = await department_1.default.sequelize.transaction();
    const fail = async (message) => {
        await t.rollback();
        res.status(400).json({ message });
    };
    try {
        const body = req.body || {};
        const code = String(body.depart_code ?? "").trim().toUpperCase().slice(0, 30);
        const name = String(body.depart_name ?? "").trim().slice(0, 150);
        if (!code || !name)
            return fail("ກະລຸນາປ້ອນລະຫັດ ແລະ ຊື່ພະແນກ");
        if (await codeTaken(code))
            return fail(`ລະຫັດ ${code} ມີແລ້ວ`);
        const positions = parsePositions(body.positions);
        if ("error" in positions)
            return fail(positions.error);
        const row = await department_1.default.create({
            depart_code: code,
            depart_name: name,
            description: String(body.description ?? "").trim().slice(0, 255) || null,
            sort: Number(body.sort) || 0,
            status: Number(body.status ?? 1) === 0 ? 0 : 1,
        }, { transaction: t });
        await syncPositions(row._uuid, positions, t);
        await t.commit();
        res.status(200).json({ message: "Successfully created department", data: row });
    }
    catch (error) {
        await t.rollback();
        (0, bansiHelpers_1.sendError)(res, error, "Error creating department");
    }
};
exports.createDepartment = createDepartment;
/** PUT /department/:id — ສົ່ງສະເພາະຖັນທີ່ປ່ຽນ (ເຊັ່ນ { status }); ສົ່ງ positions = ບັນທຶກຕຳແໜ່ງທັງໝົດຄືນ */
const updateDepartment = async (req, res) => {
    const t = await department_1.default.sequelize.transaction();
    const fail = async (code, message) => {
        await t.rollback();
        res.status(code).json({ message });
    };
    try {
        const id = Number((0, bansiHelpers_1.decodeId)(req));
        const row = await department_1.default.findByPk(id, { transaction: t });
        if (!row)
            return fail(404, "ບໍ່ພົບພະແນກ");
        const body = req.body || {};
        const patch = {};
        if (body.depart_code !== undefined) {
            const code = String(body.depart_code ?? "").trim().toUpperCase().slice(0, 30);
            if (!code)
                return fail(400, "ກະລຸນາປ້ອນລະຫັດພະແນກ");
            if (await codeTaken(code, id))
                return fail(400, `ລະຫັດ ${code} ມີແລ້ວ`);
            patch.depart_code = code;
        }
        if (body.depart_name !== undefined) {
            const name = String(body.depart_name ?? "").trim().slice(0, 150);
            if (!name)
                return fail(400, "ກະລຸນາປ້ອນຊື່ພະແນກ");
            patch.depart_name = name;
        }
        if (body.description !== undefined)
            patch.description = String(body.description ?? "").trim().slice(0, 255) || null;
        if (body.sort !== undefined)
            patch.sort = Number(body.sort) || 0;
        if (body.status !== undefined)
            patch.status = Number(body.status) === 0 ? 0 : 1;
        await row.update({ ...patch, updatedAt: new Date() }, { transaction: t });
        if (body.positions !== undefined) {
            const positions = parsePositions(body.positions);
            if ("error" in positions)
                return fail(400, positions.error);
            await syncPositions(id, positions, t);
        }
        await t.commit();
        res.status(200).json({ message: "Successfully updated department", data: row });
    }
    catch (error) {
        await t.rollback();
        (0, bansiHelpers_1.sendError)(res, error, "Error updating department");
    }
};
exports.updateDepartment = updateDepartment;
/** DELETE /department/:id — ສະເພາະພະແນກທີ່ບໍ່ເຄີຍມີພະນັກງານ (ລວມຄົນລາອອກ) */
const deleteDepartment = async (req, res) => {
    const t = await department_1.default.sequelize.transaction();
    try {
        const id = Number((0, bansiHelpers_1.decodeId)(req));
        const row = await department_1.default.findByPk(id, { transaction: t });
        const used = row ? await employee_1.default.count({ where: { department_id: id }, transaction: t }) : 0;
        if (!row || used) {
            await t.rollback();
            res.status(row ? 400 : 404).json({ message: row ? `ລຶບບໍ່ໄດ້ — ມີພະນັກງານ ${used} ຄົນ (ປິດໃຊ້ງານແທນ)` : "ບໍ່ພົບພະແນກ" });
            return;
        }
        await position_1.default.destroy({ where: { department_id: id }, transaction: t });
        await row.destroy({ transaction: t });
        await t.commit();
        res.status(200).json({ message: "Successfully deleted department" });
    }
    catch (error) {
        await t.rollback();
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
