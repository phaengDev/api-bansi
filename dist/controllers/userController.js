"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTypeUser = exports.deleteUser = exports.updatePassword = exports.updateUser = exports.getUserById = exports.createUser = exports.getUsers = void 0;
const sequelize_1 = require("sequelize");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const userModel_1 = __importDefault(require("../models/userModel"));
const typeUserModel_1 = __importDefault(require("../models/typeUserModel"));
const employee_1 = __importDefault(require("../models/employee"));
const department_1 = __importDefault(require("../models/department"));
const utils_1 = require("../utils");
const bansiHelpers_1 = require("./bansi/bansiHelpers");
const permission_1 = require("../middleware/permission");
const hrHelpers_1 = require("./hr/hrHelpers");
/**
 * ບັນຊີຜູ້ໃຊ້ (tbl_users) — ເບີໂທ = ຊື່ເຂົ້າລະບົບ (ບໍ່ຊ້ຳ), ລະຫັດຜ່ານເກັບເປັນ bcrypt hash ແລະ ບໍ່ສົ່ງອອກຈາກ API.
 * ສິດ creates / updates / deletes: 1 = ອະນຸຍາດ, 2 = ບໍ່ອະນຸຍາດ; status 1 ໃຊ້ງານ, 0 ປິດ (login ບໍ່ໄດ້).
 * ຜູກກັບພະນັກງານໄດ້ (employee_id) — ໜຶ່ງພະນັກງານມີໄດ້ບັນຊີດຽວ. ສິດຂອງຜູ້ເອີ້ນກວດຢູ່ routes (requirePermission);
 * ຕົນເອງປິດບັນຊີ, ຖອນສິດແກ້ໄຂ ຫຼື ລຶບບັນຊີຂອງຕົນເອງບໍ່ໄດ້ (ກັນລັອກຕົວເອງອອກຈາກລະບົບ)
 */
const ALLOW = 1;
const DENY = 2;
const MIN_PASSWORD = 6;
const PHONE = /^\+?\d{6,20}$/;
const FLAGS = ["creates", "updates", "deletes"];
const includeAll = [
    { model: typeUserModel_1.default, as: "typeuser", attributes: ["_uuid", "names"] },
    {
        model: employee_1.default,
        as: "employee",
        attributes: ["_uuid", "emp_code", "first_name", "last_name", "work_status", "profile"],
        include: [{ model: department_1.default, as: "department", attributes: ["_uuid", "depart_name"] }],
    },
];
const present = (user) => {
    const { password: _password, ...r } = user.get({ plain: true });
    return { ...r, employee: r.employee && { ...r.employee, profile_url: (0, hrHelpers_1.profileUrl)(r.employee.profile) } };
};
const findFull = (id) => userModel_1.default.findByPk(id, { include: includeAll });
const selfId = (req) => Number(req.user?.sub);
/** ເອົາສະເພາະຖັນທີ່ແກ້ໄດ້ ແລະ ກວດຄ່າ — ລະຫັດຜ່ານບໍ່ຜ່ານທາງນີ້ (ໃຊ້ /user/password/:id) */
const parseInput = async (body, exceptId) => {
    const input = {};
    if (body.user_name !== undefined) {
        const name = String(body.user_name ?? "").trim();
        if (!name)
            return { error: "ກະລຸນາປ້ອນຊື່ຜູ້ໃຊ້" };
        input.user_name = name.slice(0, 100);
    }
    if (body.phones !== undefined) {
        const phones = String(body.phones ?? "").replace(/[\s-]/g, "");
        if (!PHONE.test(phones))
            return { error: "ເບີໂທບໍ່ຖືກຕ້ອງ (ຕົວເລກ 6–20 ຕົວ)" };
        const taken = await userModel_1.default.count({
            where: { phones, ...(exceptId ? { user_uuid: { [sequelize_1.Op.ne]: exceptId } } : {}) },
        });
        if (taken)
            return { error: `ເບີ ${phones} ມີບັນຊີແລ້ວ` };
        input.phones = phones;
    }
    if (body.type_user !== undefined) {
        const type = await typeUserModel_1.default.findByPk(Number(body.type_user));
        if (!type)
            return { error: "ກະລຸນາເລືອກປະເພດຜູ້ໃຊ້" };
        input.type_user = Number(body.type_user);
    }
    if (body.employee_id !== undefined) {
        const employeeId = Number(body.employee_id) || null;
        if (employeeId) {
            const employee = await employee_1.default.findByPk(employeeId, { attributes: ["_uuid"] });
            if (!employee)
                return { error: "ບໍ່ພົບພະນັກງານທີ່ເລືອກ" };
            const linked = await userModel_1.default.findOne({
                where: { employee_id: employeeId, ...(exceptId ? { user_uuid: { [sequelize_1.Op.ne]: exceptId } } : {}) },
                attributes: ["user_name"],
            });
            if (linked)
                return { error: `ພະນັກງານນີ້ມີບັນຊີແລ້ວ (${linked.user_name})` };
        }
        input.employee_id = employeeId;
    }
    if (body.status !== undefined)
        input.status = Number(body.status) === 1 ? 1 : 0;
    for (const flag of FLAGS) {
        if (body[flag] !== undefined)
            input[flag] = Number(body[flag]) === ALLOW ? ALLOW : DENY;
    }
    return input;
};
/** POST /user/fetch — ທຸກບັນຊີ (ບໍ່ມີລະຫັດຜ່ານ) + ປະເພດ + ພະນັກງານທີ່ຜູກ */
const getUsers = async (_req, res) => {
    try {
        const rows = await userModel_1.default.findAll({ include: includeAll, order: [["user_uuid", "ASC"]] });
        res.status(200).json({ data: rows.map(present), total: rows.length });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Failed to fetch users");
    }
};
exports.getUsers = getUsers;
/** POST /user/create { user_name, phones, password, type_user, employee_id?, creates, updates, deletes, status? } */
const createUser = async (req, res) => {
    try {
        const body = req.body || {};
        const password = String(body.password ?? "");
        if (password.length < MIN_PASSWORD) {
            res.status(400).json({ message: `ລະຫັດຜ່ານຕ້ອງມີຢ່າງໜ້ອຍ ${MIN_PASSWORD} ຕົວ` });
            return;
        }
        const input = await parseInput({ status: 1, creates: DENY, updates: DENY, deletes: DENY, ...body });
        if ("error" in input) {
            res.status(400).json({ message: input.error });
            return;
        }
        if (!input.user_name || !input.phones || !input.type_user) {
            res.status(400).json({ message: "ກະລຸນາປ້ອນຊື່, ເບີໂທ ແລະ ເລືອກປະເພດຜູ້ໃຊ້" });
            return;
        }
        const row = await userModel_1.default.create({
            ...input,
            user_uuid: await (0, utils_1.maxid)(userModel_1.default, "user_uuid"),
            password: await bcryptjs_1.default.hash(password, 10),
        });
        const saved = await findFull(row.user_uuid);
        res.status(200).json({ message: "User created successfully", data: saved && present(saved) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Failed to create user");
    }
};
exports.createUser = createUser;
/** GET /user/:id */
const getUserById = async (req, res) => {
    try {
        const user = await findFull((0, bansiHelpers_1.decodeId)(req));
        if (!user) {
            res.status(404).json({ message: "ບໍ່ພົບຜູ້ໃຊ້" });
            return;
        }
        res.status(200).json({ data: present(user) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Failed to fetch user");
    }
};
exports.getUserById = getUserById;
/** PUT /user/:id — ຊື່, ເບີໂທ, ປະເພດ, ພະນັກງານ, ສິດ, ສະຖານະ (ສົ່ງສະເພາະຖັນທີ່ປ່ຽນກໍ່ໄດ້ ເຊັ່ນ { status }) */
const updateUser = async (req, res) => {
    try {
        const id = Number((0, bansiHelpers_1.decodeId)(req));
        const row = await userModel_1.default.findByPk(id);
        if (!row) {
            res.status(404).json({ message: "ບໍ່ພົບຜູ້ໃຊ້" });
            return;
        }
        const input = await parseInput(req.body || {}, id);
        if ("error" in input) {
            res.status(400).json({ message: input.error });
            return;
        }
        if (id === selfId(req) && (input.status === 0 || input.updates === DENY)) {
            res.status(400).json({ message: "ປິດບັນຊີ ຫຼື ຖອນສິດແກ້ໄຂ ຂອງຕົນເອງບໍ່ໄດ້" });
            return;
        }
        await row.update({ ...input, updatedAt: new Date() });
        const saved = await findFull(id);
        res.status(200).json({ message: "User updated successfully", data: saved && present(saved) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Failed to update user");
    }
};
exports.updateUser = updateUser;
/**
 * PUT /user/password/:id { password, current_password? } — ປ່ຽນລະຫັດຂອງຕົນເອງ (ຕ້ອງໃສ່ລະຫັດປັດຈຸບັນ)
 * ຫຼື ຕັ້ງລະຫັດໃໝ່ໃຫ້ຄົນອື່ນ (ຕ້ອງມີສິດແກ້ໄຂ)
 */
const updatePassword = async (req, res) => {
    try {
        const id = Number((0, bansiHelpers_1.decodeId)(req));
        const actor = await (0, permission_1.currentUser)(req);
        if (!actor) {
            res.status(401).json({ message: "ກະລຸນາເຂົ້າລະບົບໃໝ່" });
            return;
        }
        const isSelf = Number(actor.user_uuid) === id;
        if (isSelf) {
            const ok = await bcryptjs_1.default.compare(String(req.body?.current_password ?? ""), actor.password ?? "");
            if (!ok) {
                res.status(400).json({ message: "ລະຫັດຜ່ານປັດຈຸບັນບໍ່ຖືກຕ້ອງ" });
                return;
            }
        }
        else if (!(0, permission_1.hasPermission)(actor, "updates")) {
            res.status(403).json({ message: "ທ່ານບໍ່ມີສິດປ່ຽນລະຫັດຜ່ານຂອງຜູ້ໃຊ້ອື່ນ" });
            return;
        }
        const password = String(req.body?.password ?? "");
        if (password.length < MIN_PASSWORD) {
            res.status(400).json({ message: `ລະຫັດຜ່ານຕ້ອງມີຢ່າງໜ້ອຍ ${MIN_PASSWORD} ຕົວ` });
            return;
        }
        const [count] = await userModel_1.default.update({ password: await bcryptjs_1.default.hash(password, 10), updatedAt: new Date() }, { where: { user_uuid: id } });
        if (!count) {
            res.status(404).json({ message: "ບໍ່ພົບຜູ້ໃຊ້" });
            return;
        }
        res.status(200).json({ message: "Password updated successfully" });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Failed to update password");
    }
};
exports.updatePassword = updatePassword;
/** DELETE /user/:id — ລຶບບັນຊີຂອງຕົນເອງບໍ່ໄດ້ */
const deleteUser = async (req, res) => {
    try {
        const id = Number((0, bansiHelpers_1.decodeId)(req));
        if (id === selfId(req)) {
            res.status(400).json({ message: "ລຶບບັນຊີຂອງຕົນເອງບໍ່ໄດ້" });
            return;
        }
        const deleted = await userModel_1.default.destroy({ where: { user_uuid: id } });
        if (!deleted) {
            res.status(404).json({ message: "ບໍ່ພົບຜູ້ໃຊ້" });
            return;
        }
        res.status(200).json({ message: "User deleted" });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Failed to delete user");
    }
};
exports.deleteUser = deleteUser;
/** GET /user/type — ປະເພດຜູ້ໃຊ້ (ເປີດສາທາລະນະ) */
const getTypeUser = async (_req, res) => {
    try {
        const data = await typeUserModel_1.default.findAll({ order: [["_uuid", "ASC"]] });
        res.status(200).json({ message: "OK", data });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Failed to get type user");
    }
};
exports.getTypeUser = getTypeUser;
