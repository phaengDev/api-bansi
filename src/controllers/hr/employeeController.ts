import { Request, Response } from "express";
import path from "path";
import fs from "fs";
import { Op } from "sequelize";
import Employee from "../../models/employee";
import EmployeeDocument from "../../models/employeeDocument";
import Department from "../../models/department";
import Position from "../../models/position";
import Province from "../../models/province";
import District from "../../models/district";
import Users from "../../models/userModel";
import Banks from "../../models/bankModel";
import { url } from "../../utils";
import { deleteFile } from "../../utils/uploadFile";
import { actorOf, decodeId, sendError, toDateOnly } from "../bansi/bansiHelpers";
import { DOCUMENT_DIR, PROFILE_FOLDER, originalNameOf, profileUrl, removeQuietly } from "./hrHelpers";

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
  { model: Department, as: "department", attributes: ["_uuid", "depart_code", "depart_name"] },
  { model: Position, as: "position", attributes: ["_uuid", "position_name"] },
  { model: Province, as: "province", attributes: ["_uuid", "province_name"] },
  { model: District, as: "district", attributes: ["_uuid", "district_name"] },
  { model: Banks, as: "bank", attributes: ["_uuid", "abbr", "name_la", "logo"] },
  { model: EmployeeDocument, as: "documents", attributes: ["_uuid", "original_name", "mime_type", "file_size", "createdAt"] },
];

const present = (row: any, users: Map<number, any>) => {
  const r = row.get({ plain: true });
  return {
    ...r,
    basic_salary: Number(r.basic_salary) || 0,
    profile_url: profileUrl(r.profile),
    bank: r.bank && { ...r.bank, url: r.bank.logo ? `${url()}/logo/${r.bank.logo}` : null },
    user: users.get(r._uuid) ?? null,
  };
};

/** ບັນຊີຜູ້ໃຊ້ທີ່ຜູກກັບພະນັກງານ (employee_id → ບັນຊີ) */
const linkedUsers = async (employeeIds?: number[]) => {
  const rows: any[] = await Users.findAll({
    where: { employee_id: employeeIds ? { [Op.in]: employeeIds } : { [Op.ne]: null } },
    attributes: ["user_uuid", "user_name", "phones", "status", "employee_id"],
    raw: true,
  });
  return new Map(rows.map((u) => [Number(u.employee_id), u]));
};

const findFull = async (id: number) => {
  const row = await Employee.findByPk(id, {
    include: includeAll,
    order: [[{ model: EmployeeDocument, as: "documents" }, "_uuid", "ASC"]],
  });
  return row && present(row, await linkedUsers([id]));
};

/** ລະຫັດຕໍ່ໄປ EMP-0001, EMP-0002… (ເລກທ້າຍທີ່ໃຫຍ່ສຸດ + 1) */
const nextCode = async () => {
  const rows: any[] = await Employee.findAll({
    where: { emp_code: { [Op.like]: `${CODE_PREFIX}%` } },
    attributes: ["emp_code"],
    raw: true,
  });
  const max = rows.reduce((m, r) => Math.max(m, Number(String(r.emp_code).slice(CODE_PREFIX.length)) || 0), 0);
  return `${CODE_PREFIX}${String(max + 1).padStart(4, "0")}`;
};

/** GET /employee/fetch — ທຸກຄົນ (ລະຫັດນ້ອຍກ່ອນ) + ພະແນກ, ຕຳແໜ່ງ, ທີ່ຢູ່, ລາຍການເອກະສານ, ບັນຊີຜູ້ໃຊ້ */
export const getEmployees = async (_req: Request, res: Response) => {
  try {
    const [rows, users] = await Promise.all([
      Employee.findAll({
        include: includeAll,
        order: [["emp_code", "ASC"], [{ model: EmployeeDocument, as: "documents" }, "_uuid", "ASC"]],
      }),
      linkedUsers(),
    ]);
    const data = rows.map((r) => present(r, users));
    res.status(200).json({ data, total: data.length, next_code: await nextCode() });
  } catch (error) {
    sendError(res, error, "Error getting employees");
  }
};

/** GET /employee/option — ຄົນທີ່ເຮັດວຽກຢູ່ (ຟອມຜູ້ໃຊ້) + user_id ຂອງບັນຊີທີ່ຜູກແລ້ວ */
export const getEmployeeOption = async (_req: Request, res: Response) => {
  try {
    const [rows, users] = await Promise.all([
      Employee.findAll({
        where: { work_status: WORKING },
        attributes: ["_uuid", "emp_code", "first_name", "last_name", "phone", "profile"],
        include: [{ model: Department, as: "department", attributes: ["_uuid", "depart_name"] }],
        order: [["emp_code", "ASC"]],
      }),
      linkedUsers(),
    ]);
    const data = rows.map((row) => {
      const r: any = row.get({ plain: true });
      return { ...r, profile_url: profileUrl(r.profile), user_id: users.get(r._uuid)?.user_uuid ?? null };
    });
    res.status(200).json({ data });
  } catch (error) {
    sendError(res, error, "Error getting employee option");
  }
};

type EmployeeInput = Record<string, unknown>;

const text = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max) || null;

/**
 * ຂໍ້ມູນຈາກ body (multipart — ທຸກຄ່າເປັນຂໍ້ຄວາມ). existing = ແຖວເດີມຕອນແກ້ໄຂ: ຖັນທີ່ບໍ່ສົ່ງມາ ໃຊ້ຄ່າເດີມກວດ
 * (ເຊັ່ນ ຕຳແໜ່ງຕ້ອງຢູ່ໃນພະແນກ, ເມືອງຕ້ອງຢູ່ໃນແຂວງ)
 */
const parseInput = async (body: any, existing?: Employee): Promise<EmployeeInput | { error: string }> => {
  const input: EmployeeInput = {};
  const has = (key: string) => body[key] !== undefined;
  const merged = (key: string) => (has(key) ? body[key] : (existing as any)?.[key]);

  if (has("emp_code")) {
    const code = String(body.emp_code ?? "").trim().toUpperCase().slice(0, 30);
    if (code) {
      const taken = await Employee.count({ where: { emp_code: code, ...(existing ? { _uuid: { [Op.ne]: existing._uuid } } : {}) } });
      if (taken) return { error: `ລະຫັດ ${code} ມີແລ້ວ` };
      input.emp_code = code;
    } else if (existing) {
      return { error: "ກະລຸນາປ້ອນລະຫັດພະນັກງານ" };
    }
  }
  if (has("first_name") || !existing) {
    const name = text(body.first_name, 100);
    if (!name) return { error: "ກະລຸນາປ້ອນຊື່ພະນັກງານ" };
    input.first_name = name;
  }
  if (has("last_name")) input.last_name = text(body.last_name, 100);
  if (has("gender") || !existing) input.gender = Number(body.gender) === 2 ? 2 : 1;
  for (const key of ["birthday", "start_date", "end_date"]) {
    if (!has(key)) continue;
    const raw = body[key];
    const date = toDateOnly(raw);
    if (raw && !date) return { error: "ວັນທີບໍ່ຖືກຕ້ອງ" };
    input[key] = date;
  }
  if (has("phone")) input.phone = text(body.phone, 30);
  if (has("email")) {
    const email = text(body.email, 150);
    if (email && !EMAIL.test(email)) return { error: "ອີເມວບໍ່ຖືກຕ້ອງ" };
    input.email = email;
  }

  const departmentId = Number(merged("department_id"));
  if (has("department_id") || !existing) {
    const department = departmentId > 0 ? await Department.findByPk(departmentId) : null;
    if (!department) return { error: "ກະລຸນາເລືອກພະແນກ" };
    input.department_id = departmentId;
  }
  if (has("position_id") || has("department_id")) {
    const positionId = Number(merged("position_id")) || null;
    if (positionId) {
      const position = await Position.findOne({ where: { _uuid: positionId, department_id: departmentId } });
      if (!position) return { error: "ຕຳແໜ່ງບໍ່ຢູ່ໃນພະແນກທີ່ເລືອກ" };
    }
    input.position_id = positionId;
  }
  if (has("work_status") || !existing) input.work_status = Number(body.work_status) === RESIGNED ? RESIGNED : WORKING;
  if (has("basic_salary")) {
    const salary = Math.round((Number(body.basic_salary) || 0) * 100) / 100;
    if (salary < 0) return { error: "ເງິນເດືອນຕ້ອງບໍ່ຕິດລົບ" };
    input.basic_salary = salary;
  }

  if (has("province_id") || has("district_id")) {
    const provinceId = Number(merged("province_id")) || null;
    const districtId = Number(merged("district_id")) || null;
    if (provinceId && !(await Province.findByPk(provinceId))) return { error: "ບໍ່ພົບແຂວງທີ່ເລືອກ" };
    if (districtId) {
      const district = await District.findByPk(districtId);
      if (!district || Number(district.province_id) !== provinceId) return { error: "ເມືອງບໍ່ຢູ່ໃນແຂວງທີ່ເລືອກ" };
    }
    input.province_id = provinceId;
    input.district_id = districtId;
  }
  // ບັນຊີຮັບເງິນເດືອນ — ທະນາຄານ ແລະ ເລກບັນຊີ ຕ້ອງມີຄູ່ກັນ (ຫຼື ຫວ່າງທັງຄູ່)
  if (has("bank_id") || has("bank_account_no") || has("bank_account_name")) {
    const bankId = Number(merged("bank_id")) || null;
    const accountNo = String(merged("bank_account_no") ?? "").replace(/\s+/g, "");
    if (bankId && !(await Banks.findByPk(bankId))) return { error: "ບໍ່ພົບທະນາຄານທີ່ເລືອກ" };
    if (accountNo && !ACCOUNT_NO.test(accountNo)) return { error: "ເລກບັນຊີທະນາຄານບໍ່ຖືກຕ້ອງ (ຕົວເລກ ແລະ ຂີດ -)" };
    if (bankId && !accountNo) return { error: "ກະລຸນາປ້ອນເລກບັນຊີທະນາຄານ" };
    if (accountNo && !bankId) return { error: "ກະລຸນາເລືອກທະນາຄານຂອງບັນຊີ" };
    input.bank_id = bankId;
    input.bank_account_no = accountNo || null;
    input.bank_account_name = bankId ? text(merged("bank_account_name"), 150) : null;
  }
  if (has("village")) input.village = text(body.village, 150);
  if (has("description")) input.description = text(body.description, 500);

  const start = (input.start_date ?? existing?.start_date) as string | null;
  const end = (input.end_date ?? existing?.end_date) as string | null;
  if (start && end && end < start) return { error: "ວັນລາອອກຕ້ອງຫຼັງວັນເຂົ້າວຽກ" };
  return input;
};

const uploadedProfile = (req: Request) => (req as any).file?.filename as string | undefined;
const discardProfile = (req: Request) => {
  const name = uploadedProfile(req);
  if (name) deleteFile(PROFILE_FOLDER, name);
};

/** ລາອອກ → ປິດບັນຊີຜູ້ໃຊ້ທີ່ຜູກໄວ້ (login ບໍ່ໄດ້ອີກ) */
const closeAccountIfResigned = async (employeeId: number, status: unknown) => {
  if (Number(status) !== RESIGNED) return;
  await Users.update({ status: 0, updatedAt: new Date() } as any, { where: { employee_id: employeeId, status: 1 } });
};

/** POST /employee/create (multipart, ຮູບ field "profile") — emp_code ບໍ່ປ້ອນ = ອອກເລກໃຫ້ */
export const createEmployee = async (req: Request, res: Response) => {
  try {
    const input = await parseInput(req.body || {});
    if ("error" in input) {
      discardProfile(req);
      res.status(400).json({ message: input.error });
      return;
    }
    const row = await Employee.create({
      ...input,
      emp_code: input.emp_code ?? (await nextCode()),
      profile: uploadedProfile(req) ?? null,
      createdbyid: Number(actorOf(req)) || null,
    });
    await closeAccountIfResigned(row._uuid, row.work_status);
    res.status(200).json({ message: "Successfully created employee", data: await findFull(row._uuid) });
  } catch (error) {
    discardProfile(req);
    sendError(res, error, "Error creating employee");
  }
};

/** PUT /employee/:id (multipart) — ຮູບໃໝ່ field "profile", remove_profile=1 = ລຶບຮູບ */
export const updateEmployee = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const row = await Employee.findByPk(Number(decodeId(req)));
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
    if (uploaded || Number(req.body?.remove_profile) === 1) input.profile = uploaded ?? null;
    await row.update({ ...input, updatedAt: new Date() });
    if (oldProfile) deleteFile(PROFILE_FOLDER, oldProfile);
    await closeAccountIfResigned(row._uuid, row.work_status);
    res.status(200).json({ message: "Successfully updated employee", data: await findFull(row._uuid) });
  } catch (error) {
    discardProfile(req);
    sendError(res, error, "Error updating employee");
  }
};

/** DELETE /employee/:id — ຄົນທີ່ມີບັນຊີຜູ້ໃຊ້ລຶບບໍ່ໄດ້ (ລຶບບັນຊີກ່ອນ ຫຼື ຕັ້ງເປັນລາອອກ); ລຶບຮູບ ແລະ ເອກະສານນຳ */
export const deleteEmployee = async (req: Request<{ id: string }>, res: Response) => {
  const t = await Employee.sequelize!.transaction();
  try {
    const id = Number(decodeId(req));
    const row = await Employee.findByPk(id, { transaction: t });
    const user = row ? await Users.findOne({ where: { employee_id: id }, attributes: ["user_name"], transaction: t }) : null;
    if (!row || user) {
      await t.rollback();
      res.status(row ? 400 : 404).json({
        message: row ? `ລຶບບໍ່ໄດ້ — ຜູກກັບບັນຊີຜູ້ໃຊ້ ${user!.user_name} (ຕັ້ງເປັນລາອອກແທນ)` : "ບໍ່ພົບພະນັກງານ",
      });
      return;
    }
    const documents = await EmployeeDocument.findAll({ where: { employee_id: id }, transaction: t });
    await EmployeeDocument.destroy({ where: { employee_id: id }, transaction: t });
    await row.destroy({ transaction: t });
    await t.commit();
    if (row.profile) deleteFile(PROFILE_FOLDER, row.profile);
    documents.forEach((d) => removeQuietly(path.join(DOCUMENT_DIR, d.file_name)));
    res.status(200).json({ message: "Successfully deleted employee" });
  } catch (error) {
    await t.rollback();
    sendError(res, error, "Error deleting employee");
  }
};

/** POST /employee/document/:id (multipart "files", ສູງສຸດ 5 ໄຟລ໌ × 5MB) — :id = ພະນັກງານ */
export const uploadEmployeeDocuments = async (req: Request<{ id: string }>, res: Response) => {
  const files = ((req as any).files ?? []) as Express.Multer.File[];
  const discard = () => files.forEach((f) => removeQuietly(f.path));
  try {
    const employee = await Employee.findByPk(Number(decodeId(req)), { attributes: ["_uuid"] });
    if (!employee) {
      discard();
      res.status(404).json({ message: "ບໍ່ພົບພະນັກງານ" });
      return;
    }
    if (!files.length) {
      res.status(400).json({ message: "ກະລຸນາເລືອກໄຟລ໌" });
      return;
    }
    const actor = Number(actorOf(req)) || null;
    await EmployeeDocument.bulkCreate(files.map((f) => ({
      employee_id: employee._uuid,
      file_name: f.filename,
      original_name: originalNameOf(f).slice(0, 255),
      mime_type: f.mimetype?.slice(0, 100) ?? null,
      file_size: f.size,
      createdbyid: actor,
    })));
    res.status(200).json({ message: "Successfully uploaded documents", data: await findFull(employee._uuid) });
  } catch (error) {
    discard();
    sendError(res, error, "Error uploading employee documents");
  }
};

/** GET /employee/document/download/:id — :id = ເອກະສານ; ສົ່ງເປັນ attachment ຊື່ເດີມ */
export const downloadEmployeeDocument = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const doc = await EmployeeDocument.findByPk(Number(decodeId(req)));
    const filePath = doc && path.join(DOCUMENT_DIR, path.basename(doc.file_name));
    if (!doc || !filePath || !fs.existsSync(filePath)) {
      res.status(404).json({ message: "ບໍ່ພົບໄຟລ໌" });
      return;
    }
    res.download(filePath, doc.original_name);
  } catch (error) {
    sendError(res, error, "Error downloading employee document");
  }
};

/** DELETE /employee/document/:id — :id = ເອກະສານ */
export const deleteEmployeeDocument = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const doc = await EmployeeDocument.findByPk(Number(decodeId(req)));
    if (!doc) {
      res.status(404).json({ message: "ບໍ່ພົບເອກະສານ" });
      return;
    }
    await doc.destroy();
    removeQuietly(path.join(DOCUMENT_DIR, path.basename(doc.file_name)));
    res.status(200).json({ message: "Successfully deleted document", data: await findFull(doc.employee_id) });
  } catch (error) {
    sendError(res, error, "Error deleting employee document");
  }
};
