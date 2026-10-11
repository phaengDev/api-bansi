"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteEmployeeDocument = exports.downloadEmployeeDocument = exports.uploadEmployeeDocuments = exports.deleteEmployee = exports.updateEmployee = exports.resetAppPassword = exports.createEmployee = exports.getEmployeeOption = exports.getMyEmployee = exports.getEmployees = void 0;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const sequelize_1 = require("sequelize");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const employee_1 = __importDefault(require("../../models/employee"));
const employeeDocument_1 = __importDefault(require("../../models/employeeDocument"));
const department_1 = __importDefault(require("../../models/department"));
const position_1 = __importDefault(require("../../models/position"));
const district_1 = __importDefault(require("../../models/district"));
const userModel_1 = __importDefault(require("../../models/userModel"));
const bankModel_1 = __importDefault(require("../../models/bankModel"));
const utils_1 = require("../../utils");
const uploadFile_1 = require("../../utils/uploadFile");
const bansiHelpers_1 = require("../bansi/bansiHelpers");
const hrHelpers_1 = require("./hrHelpers");
const attendanceController_1 = require("./attendanceController");
/**
 * ພະນັກງານ — ຂໍ້ມູນສ່ວນຕົວ, ວຽກ (ພະແນກ / ຕຳແໜ່ງ / ວັນເຂົ້າວຽກ / ເງິນເດືອນ), ທີ່ຢູ່, ຮູບ ແລະ ເອກະສານຄັດຕິດ.
 * ລາອອກ (work_status 2) = ບັນຊີຜູ້ໃຊ້ທີ່ຜູກໄວ້ຖືກປິດໃຫ້ອັດຕະໂນມັດ. ລຶບໄດ້ສະເພາະຄົນທີ່ບໍ່ມີບັນຊີຜູ້ໃຊ້
 */
const WORKING = 1;
const RESIGNED = 2;
const CODE_PREFIX = "EMP-";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** ເລກບັນຊີທະນາຄານ — ຕົວເລກ ແລະ ຂີດ ເຊັ່ນ 010-12-00-01234567-001 */
const ACCOUNT_NO = /^\d[\d-]{3,48}\d$/;
const includeAll = [
    { model: department_1.default, as: "department", attributes: ["_uuid", "depart_code", "depart_name"] },
    { model: position_1.default, as: "position", attributes: ["_uuid", "position_name"] },
    hrHelpers_1.districtInclude,
    { model: bankModel_1.default, as: "bank", attributes: ["_uuid", "abbr", "name_la", "logo"] },
    { model: employeeDocument_1.default, as: "documents", attributes: ["_uuid", "original_name", "mime_type", "file_size", "createdAt"] },
];
const present = (row, users) => {
    const r = row.get({ plain: true });
    return {
        ...r,
        basic_salary: Number(r.basic_salary) || 0,
        profile_url: (0, hrHelpers_1.profileUrl)(r.profile),
        bank: r.bank && { ...r.bank, url: r.bank.logo ? `${(0, utils_1.url)()}/logo/${r.bank.logo}` : null },
        user: users.get(r._uuid) ?? null,
    };
};
/** ບັນຊີຜູ້ໃຊ້ທີ່ຜູກກັບພະນັກງານ (employee_id → ບັນຊີ) */
const linkedUsers = async (employeeIds) => {
    const rows = await userModel_1.default.findAll({
        where: { employee_id: employeeIds ? { [sequelize_1.Op.in]: employeeIds } : { [sequelize_1.Op.ne]: null } },
        attributes: ["user_uuid", "user_name", "phones", "status", "employee_id"],
        raw: true,
    });
    return new Map(rows.map((u) => [Number(u.employee_id), u]));
};
const findFull = async (id) => {
    const row = await employee_1.default.findByPk(id, {
        include: includeAll,
        order: [[{ model: employeeDocument_1.default, as: "documents" }, "_uuid", "ASC"]],
    });
    return row && present(row, await linkedUsers([id]));
};
/** ລະຫັດຕໍ່ໄປ EMP-0001, EMP-0002… (ເລກທ້າຍທີ່ໃຫຍ່ສຸດ + 1) */
const nextCode = async () => {
    const rows = await employee_1.default.findAll({
        where: { emp_code: { [sequelize_1.Op.like]: `${CODE_PREFIX}%` } },
        attributes: ["emp_code"],
        raw: true,
    });
    const max = rows.reduce((m, r) => Math.max(m, Number(String(r.emp_code).slice(CODE_PREFIX.length)) || 0), 0);
    return `${CODE_PREFIX}${String(max + 1).padStart(4, "0")}`;
};
/** GET /employee/fetch — ທຸກຄົນ (ລະຫັດນ້ອຍກ່ອນ) + ພະແນກ, ຕຳແໜ່ງ, ທີ່ຢູ່, ລາຍການເອກະສານ, ບັນຊີຜູ້ໃຊ້ */
const getEmployees = async (_req, res) => {
    try {
        const [rows, users] = await Promise.all([
            employee_1.default.findAll({
                include: includeAll,
                order: [["emp_code", "ASC"], [{ model: employeeDocument_1.default, as: "documents" }, "_uuid", "ASC"]],
            }),
            linkedUsers(),
        ]);
        const data = rows.map((r) => present(r, users));
        res.status(200).json({ data, total: data.length, next_code: await nextCode() });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting employees");
    }
};
exports.getEmployees = getEmployees;
/** GET /employee/me — ຂໍ້ມູນຂອງຕົນເອງ (app ມືຖື, ບັນຊີຕ້ອງຜູກກັບພະນັກງານ) */
const getMyEmployee = async (req, res) => {
    try {
        const self = await (0, attendanceController_1.selfEmployee)(req);
        if ("code" in self) {
            res.status(self.code).json({ message: self.message });
            return;
        }
        res.status(200).json({ data: await findFull(self.employee._uuid) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting my employee profile");
    }
};
exports.getMyEmployee = getMyEmployee;
/** GET /employee/option — ຄົນທີ່ເຮັດວຽກຢູ່ (ຟອມຜູ້ໃຊ້) + user_id ຂອງບັນຊີທີ່ຜູກແລ້ວ */
const getEmployeeOption = async (_req, res) => {
    try {
        const [rows, users] = await Promise.all([
            employee_1.default.findAll({
                where: { work_status: WORKING },
                attributes: ["_uuid", "emp_code", "first_name", "last_name", "phone", "profile"],
                include: [{ model: department_1.default, as: "department", attributes: ["_uuid", "depart_name"] }],
                order: [["emp_code", "ASC"]],
            }),
            linkedUsers(),
        ]);
        const data = rows.map((row) => {
            const r = row.get({ plain: true });
            return { ...r, profile_url: (0, hrHelpers_1.profileUrl)(r.profile), user_id: users.get(r._uuid)?.user_uuid ?? null };
        });
        res.status(200).json({ data });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting employee option");
    }
};
exports.getEmployeeOption = getEmployeeOption;
const text = (value, max) => String(value ?? "").trim().slice(0, max) || null;
/**
 * ຂໍ້ມູນຈາກ body (multipart — ທຸກຄ່າເປັນຂໍ້ຄວາມ). existing = ແຖວເດີມຕອນແກ້ໄຂ: ຖັນທີ່ບໍ່ສົ່ງມາ ໃຊ້ຄ່າເດີມກວດ
 * (ເຊັ່ນ ຕຳແໜ່ງຕ້ອງຢູ່ໃນພະແນກ, ເມືອງຕ້ອງຢູ່ໃນແຂວງ)
 */
const parseInput = async (body, existing) => {
    const input = {};
    const has = (key) => body[key] !== undefined;
    const merged = (key) => (has(key) ? body[key] : existing?.[key]);
    if (has("emp_code")) {
        const code = String(body.emp_code ?? "").trim().toUpperCase().slice(0, 30);
        if (code) {
            const taken = await employee_1.default.count({ where: { emp_code: code, ...(existing ? { _uuid: { [sequelize_1.Op.ne]: existing._uuid } } : {}) } });
            if (taken)
                return { error: `ລະຫັດ ${code} ມີແລ້ວ` };
            input.emp_code = code;
        }
        else if (existing) {
            return { error: "ກະລຸນາປ້ອນລະຫັດພະນັກງານ" };
        }
    }
    if (has("first_name") || !existing) {
        const name = text(body.first_name, 100);
        if (!name)
            return { error: "ກະລຸນາປ້ອນຊື່ພະນັກງານ" };
        input.first_name = name;
    }
    if (has("last_name"))
        input.last_name = text(body.last_name, 100);
    if (has("gender") || !existing)
        input.gender = Number(body.gender) === 2 ? 2 : 1;
    for (const key of ["birthday", "start_date", "end_date"]) {
        if (!has(key))
            continue;
        const raw = body[key];
        const date = (0, bansiHelpers_1.toDateOnly)(raw);
        if (raw && !date)
            return { error: "ວັນທີບໍ່ຖືກຕ້ອງ" };
        input[key] = date;
    }
    // ເບີໂທ = ຊື່ເຂົ້າ app ພະນັກງານ ແລະ ເບີຮັບ OTP — ບັງຄັບ 20 + 8 ຕົວເລກ, ບໍ່ຊ້ຳກັບພະນັກງານອື່ນ
    if (has("phone") || !existing) {
        const phone = (0, hrHelpers_1.phoneDigits)(body.phone);
        if (!hrHelpers_1.APP_PHONE.test(phone))
            return { error: "ເບີໂທຕ້ອງຂຶ້ນຕົ້ນດ້ວຍ 20 ແລ້ວຕາມດ້ວຍ 8 ຕົວເລກ (ເຊັ່ນ 2052160011)" };
        const taken = await employee_1.default.count({ where: { phone, ...(existing ? { _uuid: { [sequelize_1.Op.ne]: existing._uuid } } : {}) } });
        if (taken)
            return { error: `ເບີ ${phone} ມີພະນັກງານອື່ນໃຊ້ແລ້ວ` };
        input.phone = phone;
    }
    if (has("email")) {
        const email = text(body.email, 150);
        if (email && !EMAIL.test(email))
            return { error: "ອີເມວບໍ່ຖືກຕ້ອງ" };
        input.email = email;
    }
    const departmentId = Number(merged("department_id"));
    if (has("department_id") || !existing) {
        const department = departmentId > 0 ? await department_1.default.findByPk(departmentId) : null;
        if (!department)
            return { error: "ກະລຸນາເລືອກພະແນກ" };
        input.department_id = departmentId;
    }
    if (has("position_id") || has("department_id")) {
        const positionId = Number(merged("position_id")) || null;
        if (positionId) {
            const position = await position_1.default.findOne({ where: { _uuid: positionId, department_id: departmentId } });
            if (!position)
                return { error: "ຕຳແໜ່ງບໍ່ຢູ່ໃນພະແນກທີ່ເລືອກ" };
        }
        input.position_id = positionId;
    }
    if (has("work_status") || !existing)
        input.work_status = Number(body.work_status) === RESIGNED ? RESIGNED : WORKING;
    if (has("basic_salary")) {
        const salary = Math.round((Number(body.basic_salary) || 0) * 100) / 100;
        if (salary < 0)
            return { error: "ເງິນເດືອນຕ້ອງບໍ່ຕິດລົບ" };
        input.basic_salary = salary;
    }
    // ທີ່ຢູ່ເກັບແຕ່ເມືອງ (ແຂວງມາກັບເມືອງ)
    if (has("district_id")) {
        const districtId = Number(body.district_id) || null;
        if (districtId && !(await district_1.default.findByPk(districtId)))
            return { error: "ບໍ່ພົບເມືອງທີ່ເລືອກ" };
        input.district_id = districtId;
    }
    // ບັນຊີຮັບເງິນເດືອນ — ທະນາຄານ ແລະ ເລກບັນຊີ ຕ້ອງມີຄູ່ກັນ (ຫຼື ຫວ່າງທັງຄູ່)
    if (has("bank_id") || has("bank_account_no") || has("bank_account_name")) {
        const bankId = Number(merged("bank_id")) || null;
        const accountNo = String(merged("bank_account_no") ?? "").replace(/\s+/g, "");
        if (bankId && !(await bankModel_1.default.findByPk(bankId)))
            return { error: "ບໍ່ພົບທະນາຄານທີ່ເລືອກ" };
        if (accountNo && !ACCOUNT_NO.test(accountNo))
            return { error: "ເລກບັນຊີທະນາຄານບໍ່ຖືກຕ້ອງ (ຕົວເລກ ແລະ ຂີດ -)" };
        if (bankId && !accountNo)
            return { error: "ກະລຸນາປ້ອນເລກບັນຊີທະນາຄານ" };
        if (accountNo && !bankId)
            return { error: "ກະລຸນາເລືອກທະນາຄານຂອງບັນຊີ" };
        input.bank_id = bankId;
        input.bank_account_no = accountNo || null;
        input.bank_account_name = bankId ? text(merged("bank_account_name"), 150) : null;
    }
    if (has("village"))
        input.village = text(body.village, 150);
    if (has("description"))
        input.description = text(body.description, 500);
    const start = (input.start_date ?? existing?.start_date);
    const end = (input.end_date ?? existing?.end_date);
    if (start && end && end < start)
        return { error: "ວັນລາອອກຕ້ອງຫຼັງວັນເຂົ້າວຽກ" };
    return input;
};
const uploadedProfile = (req) => req.file?.filename;
const discardProfile = (req) => {
    const name = uploadedProfile(req);
    if (name)
        (0, uploadFile_1.deleteFile)(hrHelpers_1.PROFILE_FOLDER, name);
};
/** ລາອອກ → ປິດບັນຊີຜູ້ໃຊ້ທີ່ຜູກໄວ້ (login ບໍ່ໄດ້ອີກ) */
const closeAccountIfResigned = async (employeeId, status) => {
    if (Number(status) !== RESIGNED)
        return;
    await userModel_1.default.update({ status: 0, updatedAt: new Date() }, { where: { employee_id: employeeId, status: 1 } });
};
/** POST /employee/create (multipart, ຮູບ field "profile") — emp_code ບໍ່ປ້ອນ = ອອກເລກໃຫ້ */
const createEmployee = async (req, res) => {
    try {
        const input = await parseInput(req.body || {});
        if ("error" in input) {
            discardProfile(req);
            res.status(400).json({ message: input.error });
            return;
        }
        const row = await employee_1.default.create({
            ...input,
            emp_code: input.emp_code ?? (await nextCode()),
            // ເຂົ້າ app ພະນັກງານໄດ້ທັນທີ ດ້ວຍເບີໂທ + ລະຫັດເລີ່ມຕົ້ນ (ບໍ່ຕ້ອງມີບັນຊີຜູ້ໃຊ້ລະບົບ)
            app_password: bcryptjs_1.default.hashSync(hrHelpers_1.DEFAULT_APP_PASSWORD, 10),
            must_change_password: 1,
            profile: uploadedProfile(req) ?? null,
            createdbyid: Number((0, bansiHelpers_1.actorOf)(req)) || null,
        });
        await closeAccountIfResigned(row._uuid, row.work_status);
        res.status(200).json({ message: "Successfully created employee", data: await findFull(row._uuid) });
    }
    catch (error) {
        discardProfile(req);
        (0, bansiHelpers_1.sendError)(res, error, "Error creating employee");
    }
};
exports.createEmployee = createEmployee;
/** PUT /employee/app-password/:id — HR ຕັ້ງລະຫັດຜ່ານ app ຂອງພະນັກງານຄືນເປັນຄ່າເລີ່ມຕົ້ນ (ລືມລະຫັດ ແລະ ຍັງບໍ່ມີ OTP) */
const resetAppPassword = async (req, res) => {
    try {
        const row = await employee_1.default.findByPk(Number((0, bansiHelpers_1.decodeId)(req)));
        if (!row) {
            res.status(404).json({ message: "ບໍ່ພົບພະນັກງານ" });
            return;
        }
        await row.update({ app_password: bcryptjs_1.default.hashSync(hrHelpers_1.DEFAULT_APP_PASSWORD, 10), must_change_password: 1, updatedAt: new Date() });
        res.status(200).json({ message: "Successfully reset app password", data: await findFull(row._uuid) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error resetting app password");
    }
};
exports.resetAppPassword = resetAppPassword;
/** PUT /employee/:id (multipart) — ຮູບໃໝ່ field "profile", remove_profile=1 = ລຶບຮູບ */
const updateEmployee = async (req, res) => {
    try {
        const row = await employee_1.default.findByPk(Number((0, bansiHelpers_1.decodeId)(req)));
        if (!row) {
            discardProfile(req);
            res.status(404).json({ message: "ບໍ່ພົບພະນັກງານ" });
            return;
        }
        const input = await parseInput(req.body || {}, row);
        if ("error" in input) {
            discardProfile(req);
            res.status(400).json({ message: input.error });
            return;
        }
        const uploaded = uploadedProfile(req);
        const oldProfile = uploaded || Number(req.body?.remove_profile) === 1 ? row.profile : null;
        if (uploaded || Number(req.body?.remove_profile) === 1)
            input.profile = uploaded ?? null;
        await row.update({ ...input, updatedAt: new Date() });
        if (oldProfile)
            (0, uploadFile_1.deleteFile)(hrHelpers_1.PROFILE_FOLDER, oldProfile);
        await closeAccountIfResigned(row._uuid, row.work_status);
        res.status(200).json({ message: "Successfully updated employee", data: await findFull(row._uuid) });
    }
    catch (error) {
        discardProfile(req);
        (0, bansiHelpers_1.sendError)(res, error, "Error updating employee");
    }
};
exports.updateEmployee = updateEmployee;
/** DELETE /employee/:id — ຄົນທີ່ມີບັນຊີຜູ້ໃຊ້ລຶບບໍ່ໄດ້ (ລຶບບັນຊີກ່ອນ ຫຼື ຕັ້ງເປັນລາອອກ); ລຶບຮູບ ແລະ ເອກະສານນຳ */
const deleteEmployee = async (req, res) => {
    const t = await employee_1.default.sequelize.transaction();
    try {
        const id = Number((0, bansiHelpers_1.decodeId)(req));
        const row = await employee_1.default.findByPk(id, { transaction: t });
        const user = row ? await userModel_1.default.findOne({ where: { employee_id: id }, attributes: ["user_name"], transaction: t }) : null;
        if (!row || user) {
            await t.rollback();
            res.status(row ? 400 : 404).json({
                message: row ? `ລຶບບໍ່ໄດ້ — ຜູກກັບບັນຊີຜູ້ໃຊ້ ${user.user_name} (ຕັ້ງເປັນລາອອກແທນ)` : "ບໍ່ພົບພະນັກງານ",
            });
            return;
        }
        const documents = await employeeDocument_1.default.findAll({ where: { employee_id: id }, transaction: t });
        await employeeDocument_1.default.destroy({ where: { employee_id: id }, transaction: t });
        await row.destroy({ transaction: t });
        await t.commit();
        if (row.profile)
            (0, uploadFile_1.deleteFile)(hrHelpers_1.PROFILE_FOLDER, row.profile);
        documents.forEach((d) => (0, hrHelpers_1.removeQuietly)(path_1.default.join(hrHelpers_1.DOCUMENT_DIR, d.file_name)));
        res.status(200).json({ message: "Successfully deleted employee" });
    }
    catch (error) {
        await t.rollback();
        (0, bansiHelpers_1.sendError)(res, error, "Error deleting employee");
    }
};
exports.deleteEmployee = deleteEmployee;
/** POST /employee/document/:id (multipart "files", ສູງສຸດ 5 ໄຟລ໌ × 5MB) — :id = ພະນັກງານ */
const uploadEmployeeDocuments = async (req, res) => {
    const files = (req.files ?? []);
    const discard = () => files.forEach((f) => (0, hrHelpers_1.removeQuietly)(f.path));
    try {
        const employee = await employee_1.default.findByPk(Number((0, bansiHelpers_1.decodeId)(req)), { attributes: ["_uuid"] });
        if (!employee) {
            discard();
            res.status(404).json({ message: "ບໍ່ພົບພະນັກງານ" });
            return;
        }
        if (!files.length) {
            res.status(400).json({ message: "ກະລຸນາເລືອກໄຟລ໌" });
            return;
        }
        const actor = Number((0, bansiHelpers_1.actorOf)(req)) || null;
        await employeeDocument_1.default.bulkCreate(files.map((f) => ({
            employee_id: employee._uuid,
            file_name: f.filename,
            original_name: (0, hrHelpers_1.originalNameOf)(f).slice(0, 255),
            mime_type: f.mimetype?.slice(0, 100) ?? null,
            file_size: f.size,
            createdbyid: actor,
        })));
        res.status(200).json({ message: "Successfully uploaded documents", data: await findFull(employee._uuid) });
    }
    catch (error) {
        discard();
        (0, bansiHelpers_1.sendError)(res, error, "Error uploading employee documents");
    }
};
exports.uploadEmployeeDocuments = uploadEmployeeDocuments;
/** GET /employee/document/download/:id — :id = ເອກະສານ; ສົ່ງເປັນ attachment ຊື່ເດີມ */
const downloadEmployeeDocument = async (req, res) => {
    try {
        const doc = await employeeDocument_1.default.findByPk(Number((0, bansiHelpers_1.decodeId)(req)));
        const filePath = doc && path_1.default.join(hrHelpers_1.DOCUMENT_DIR, path_1.default.basename(doc.file_name));
        if (!doc || !filePath || !fs_1.default.existsSync(filePath)) {
            res.status(404).json({ message: "ບໍ່ພົບໄຟລ໌" });
            return;
        }
        res.download(filePath, doc.original_name);
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error downloading employee document");
    }
};
exports.downloadEmployeeDocument = downloadEmployeeDocument;
/** DELETE /employee/document/:id — :id = ເອກະສານ */
const deleteEmployeeDocument = async (req, res) => {
    try {
        const doc = await employeeDocument_1.default.findByPk(Number((0, bansiHelpers_1.decodeId)(req)));
        if (!doc) {
            res.status(404).json({ message: "ບໍ່ພົບເອກະສານ" });
            return;
        }
        await doc.destroy();
        (0, hrHelpers_1.removeQuietly)(path_1.default.join(hrHelpers_1.DOCUMENT_DIR, path_1.default.basename(doc.file_name)));
        res.status(200).json({ message: "Successfully deleted document", data: await findFull(doc.employee_id) });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error deleting employee document");
    }
};
exports.deleteEmployeeDocument = deleteEmployeeDocument;
