import { Request, Response } from "express";
import path from "path";
import fs from "fs";
import { Op } from "sequelize";
import bcrypt from "bcryptjs";
import Employee from "../../models/employee";
import EmployeeDocument from "../../models/employeeDocument";
import Attendance from "../../models/attendance";
import AttendanceRequest from "../../models/attendanceRequest";
import LeaveRequest from "../../models/leaveRequest";
import Overtime from "../../models/overtime";
import Payroll from "../../models/payroll";
import PayrollLine from "../../models/payrollLine";
import SalaryAdvance from "../../models/salaryAdvance";
import Department from "../../models/department";
import Position from "../../models/position";
import HrOption from "../../models/hrOption";
import { EmployeeSkill, Skill, SkillType } from "../../models/skill";
import EmployeeResume from "../../models/employeeResume";
import { optionError } from "./hrOptionController";
import { levelsOf } from "./skillController";
import { bossError, releaseReports } from "./orgController";
import District from "../../models/district";
import Users from "../../models/userModel";
import Banks from "../../models/bankModel";
import { url } from "../../utils";
import { deleteFile } from "../../utils/uploadFile";
import { actorOf, decodeId, sendError, toDateOnly } from "../bansi/bansiHelpers";
import {
  APP_PHONE, DEFAULT_APP_PASSWORD, DOCUMENT_DIR, PROFILE_FOLDER, districtInclude, originalNameOf, phoneDigits, profileUrl,
  removeQuietly,
} from "./hrHelpers";
import { selfEmployee } from "./attendanceController";
import { advanceBalanceOf, closeAdvancesOfResigned } from "./advanceController";
import { syncDraftPayrolls } from "./payrollController";

/**
 * ພະນັກງານ — ຂໍ້ມູນສ່ວນຕົວ, ວຽກ (ພະແນກ / ຕຳແໜ່ງ / ວັນເຂົ້າວຽກ / ເງິນເດືອນ), ທີ່ຢູ່, ຮູບ ແລະ ເອກະສານຄັດຕິດ.
 * ລາອອກ (work_status 2) = ປິດບັນຊີຜູ້ໃຊ້ທີ່ຜູກໄວ້ ແລະ ຍົກເລີກຄຳຮ້ອງທີ່ຍັງຄ້າງ (ລາພັກ, ແຈ້ງລືມສະແກນ, ເບີກເງິນທີ່ຍັງບໍ່ໄດ້ຈ່າຍ) ໃຫ້ອັດຕະໂນມັດ;
 * ຍອດເບີກທີ່ຄ້າງ ຫັກໃນເງິນເດືອນງວດສຸດທ້າຍ. ລຶບໄດ້ສະເພາະຄົນທີ່ບໍ່ມີບັນຊີຜູ້ໃຊ້ ແລະ ບໍ່ມີປະຫວັດ (ການເຂົ້າວຽກ, ລາພັກ, OT, ເງິນເດືອນ, ເບີກເງິນ)
 */

const WORKING = 1;
const RESIGNED = 2;
/** status ຂອງ tbl_leave_request / tbl_attendance_request */
const REQUEST_PENDING = 1;
const REQUEST_CANCELLED = 4;
const PAYROLL_PAID = 2;
const CODE_PREFIX = "EMP-";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** ເລກບັນຊີທະນາຄານ — ຕົວເລກ ແລະ ຂີດ ເຊັ່ນ 010-12-00-01234567-001 */
const ACCOUNT_NO = /^\d[\d-]{3,48}\d$/;

const includeAll = [
  { model: Department, as: "department", attributes: ["_uuid", "depart_code", "depart_name"] },
  { model: Position, as: "position", attributes: ["_uuid", "position_name"] },
  {
    model: Employee,
    as: "reportsTo",
    attributes: ["_uuid", "emp_code", "first_name", "last_name", "profile", "work_status"],
    include: [{ model: Position, as: "position", attributes: ["_uuid", "position_name"] }],
  },
  { model: HrOption, as: "employeeType", attributes: ["_uuid", "name"] },
  { model: HrOption, as: "educationLevel", attributes: ["_uuid", "name"] },
  {
    model: EmployeeSkill,
    as: "skills",
    attributes: ["_uuid", "skill_id", "level"],
    include: [{ model: Skill, as: "skill", attributes: ["_uuid", "name", "type_id"], include: [{ model: SkillType, as: "type", attributes: ["_uuid", "name", "levels", "sort"] }] }],
  },
  {
    model: EmployeeResume,
    as: "resumes",
    attributes: ["_uuid", "kind", "title", "subtitle", "start_date", "end_date", "description", "original_name", "mime_type", "file_size"],
  },
  districtInclude,
  { model: Banks, as: "bank", attributes: ["_uuid", "abbr", "name_la", "logo"] },
  { model: EmployeeDocument, as: "documents", attributes: ["_uuid", "original_name", "mime_type", "file_size", "doc_type", "createdAt"] },
];

const present = (row: any, users: Map<number, any>) => {
  const r = row.get({ plain: true });
  return {
    ...r,
    basic_salary: Number(r.basic_salary) || 0,
    profile_url: profileUrl(r.profile),
    reportsTo: r.reportsTo ? { ...r.reportsTo, profile_url: profileUrl(r.reportsTo.profile) } : null,
    home_distance_km: r.home_distance_km === null || r.home_distance_km === undefined ? null : Number(r.home_distance_km),
    // ເອກະສານເກົ່າທີ່ຍັງບໍ່ມີປະເພດ: ຊື່ມີຄຳວ່າ CV = cv, ນອກນັ້ນ = other
    documents: (r.documents ?? []).map((d: any) => ({ ...d, doc_type: d.doc_type ?? (/(^|[^a-z])cv([^a-z]|$)/i.test(d.original_name ?? '') ? "cv" : "other") })),
    skills: (r.skills ?? [])
      .filter((s: any) => s.skill)
      .map((s: any) => ({
        _uuid: s._uuid,
        skill_id: s.skill_id,
        level: s.level,
        name: s.skill.name,
        type_id: s.skill.type_id,
        type_name: s.skill.type?.name ?? "",
        type_sort: s.skill.type?.sort ?? 0,
        levels: levelsOf(s.skill.type?.levels),
      })),
    resumes: [...(r.resumes ?? [])].sort((a: any, b: any) => String(b.start_date ?? "").localeCompare(String(a.start_date ?? ""))),
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

export const findFull = async (id: number) => {
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

/** GET /employee/me — ຂໍ້ມູນຂອງຕົນເອງ (app ມືຖື, ບັນຊີຕ້ອງຜູກກັບພະນັກງານ) */
export const getMyEmployee = async (req: Request, res: Response) => {
  try {
    const self = await selfEmployee(req);
    if ("code" in self) {
      res.status(self.code).json({ message: self.message });
      return;
    }
    res.status(200).json({ data: await findFull(self.employee._uuid) });
  } catch (error) {
    sendError(res, error, "Error getting my employee profile");
  }
};

/**
 * PUT /employee/me/profile (multipart "profile" — JPG/PNG/WEBP ບໍ່ເກີນ 5MB) — ພະນັກງານປ່ຽນຮູບໂປຣໄຟລ໌ຂອງຕົນເອງ (app ມືຖື).
 * ລຶບຮູບເກົ່າອອກ, ຄືນ profile_url ໃໝ່
 */
export const updateMyProfilePhoto = async (req: Request, res: Response) => {
  try {
    const self = await selfEmployee(req);
    if ("code" in self) {
      discardProfile(req);
      res.status(self.code).json({ message: self.message });
      return;
    }
    const uploaded = uploadedProfile(req);
    if (!uploaded) {
      res.status(400).json({ message: "ກະລຸນາເລືອກຮູບ" });
      return;
    }
    const row = self.employee;
    const oldProfile = row.profile;
    await row.update({ profile: uploaded, updatedAt: new Date() });
    if (oldProfile && oldProfile !== uploaded) deleteFile(PROFILE_FOLDER, oldProfile);
    res.status(200).json({ message: "ປ່ຽນຮູບໂປຣໄຟລ໌ແລ້ວ", profile_url: profileUrl(uploaded) });
  } catch (error) {
    discardProfile(req);
    sendError(res, error, "Error updating my profile photo");
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
  for (const key of ["birthday", "start_date", "end_date", "id_card_expiry", "passport_expiry", "spouse_birthday", "contract_end", "probation_end"]) {
    if (!has(key)) continue;
    const raw = body[key];
    const date = toDateOnly(raw);
    if (raw && !date) return { error: "ວັນທີບໍ່ຖືກຕ້ອງ" };
    input[key] = date;
  }
  // ເບີໂທ = ຊື່ເຂົ້າ app ພະນັກງານ ແລະ ເບີຮັບ OTP — ບັງຄັບ 20 + 8 ຕົວເລກ, ບໍ່ຊ້ຳກັບພະນັກງານອື່ນ
  if (has("phone") || !existing) {
    const phone = phoneDigits(body.phone);
    if (!APP_PHONE.test(phone)) return { error: "ເບີໂທຕ້ອງຂຶ້ນຕົ້ນດ້ວຍ 20 ແລ້ວຕາມດ້ວຍ 8 ຕົວເລກ (ເຊັ່ນ 2052160011)" };
    const taken = await Employee.count({ where: { phone, ...(existing ? { _uuid: { [Op.ne]: existing._uuid } } : {}) } });
    if (taken) return { error: `ເບີ ${phone} ມີພະນັກງານອື່ນໃຊ້ແລ້ວ` };
    input.phone = phone;
  }
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
  // ຕຳແໜ່ງ = ລາຍຊື່ກາງ (ບໍ່ຂຶ້ນກັບພະແນກ) — ຕຳແໜ່ງທີ່ປິດແລ້ວ ໃຊ້ໄດ້ສະເພາະຄົນທີ່ມີຢູ່ແລ້ວ
  if (has("position_id")) {
    const positionId = Number(body.position_id) || null;
    if (positionId) {
      const position = await Position.findByPk(positionId, { attributes: ["_uuid", "status"] });
      if (!position) return { error: "ບໍ່ພົບຕຳແໜ່ງ" };
      if (Number(position.status) !== 1 && positionId !== existing?.position_id) return { error: "ຕຳແໜ່ງນີ້ຖືກປິດແລ້ວ" };
    }
    input.position_id = positionId;
  }
  // ລາຍງານຕໍ່ (ຫົວໜ້າ) — ໂຄງຮ່າງການຈັດຕັ້ງ
  if (has("reports_to_id")) {
    const bossId = Number(body.reports_to_id) || null;
    const error = await bossError(existing?._uuid ?? null, bossId);
    if (error) return { error };
    input.reports_to_id = bossId;
  }

  // ---- ຂໍ້ມູນເພີ່ມເຕີມ (ບໍ່ບັງຄັບ) ----
  const texts: [string, number][] = [
    ["nationality", 60], ["ethnicity", 60], ["religion", 60], ["birth_place", 150], ["blood_type", 5], ["id_card_no", 50],
    ["passport_no", 50], ["sso_no", 50], ["spouse_name", 150], ["spouse_phone", 30], ["education_field", 150], ["education_school", 150],
    ["emergency_name", 150], ["emergency_relation", 60], ["emergency_phone", 30], ["contract_no", 50],
  ];
  for (const [key, max] of texts) if (has(key)) input[key] = text(body[key], max);
  const whole = (key: string, min: number, max: number, label: string): string | null => {
    if (!has(key)) return null;
    const raw = body[key];
    if (raw === null || raw === "" || raw === undefined) {
      input[key] = null;
      return null;
    }
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min || n > max) return `${label}ບໍ່ຖືກຕ້ອງ`;
    input[key] = n;
    return null;
  };
  const wrong = whole("marital_status", 1, 4, "ສະຖານະຄອບຄົວ") || whole("children", 0, 30, "ຈຳນວນລູກ")
    || whole("graduation_year", 1950, 2100, "ປີຮຽນຈົບ") || whole("wage_type", 1, 2, "ປະເພດຄ່າຈ້າງ");
  if (wrong) return { error: wrong };
  if (input.wage_type === null) input.wage_type = 1;
  if (has("home_distance_km")) {
    const raw = body.home_distance_km;
    const km = raw === null || raw === "" ? null : Math.round(Number(raw) * 10) / 10;
    if (km !== null && (!Number.isFinite(km) || km < 0 || km > 99999)) return { error: "ໄລຍະທາງບໍ່ຖືກຕ້ອງ" };
    input.home_distance_km = km;
  }
  if (has("contract_fixed_term")) input.contract_fixed_term = Number(body.contract_fixed_term) === 1 ? 1 : 0;
  // ບໍ່ແມ່ນສັນຍາມີກຳນົດ = ບໍ່ມີວັນສິ້ນສຸດສັນຍາ; ບໍ່ແມ່ນແຕ່ງງານ = ລ້າງຂໍ້ມູນຄູ່ສົມລົດ
  if (input.contract_fixed_term === 0) input.contract_end = null;
  if (has("marital_status") && input.marital_status !== 2) Object.assign(input, { spouse_name: null, spouse_birthday: null, spouse_phone: null });
  for (const [kind, field] of [["employee_type", "employee_type_id"], ["education_level", "education_level_id"]] as const) {
    if (!has(field)) continue;
    const id = Number(body[field]) || null;
    const error = await optionError(kind, id, (existing as any)?.[field]);
    if (error) return { error };
    input[field] = id;
  }
  if (has("work_status") || !existing) input.work_status = Number(body.work_status) === RESIGNED ? RESIGNED : WORKING;
  if (has("basic_salary")) {
    const salary = Math.round((Number(body.basic_salary) || 0) * 100) / 100;
    if (salary < 0) return { error: "ເງິນເດືອນຕ້ອງບໍ່ຕິດລົບ" };
    input.basic_salary = salary;
  }

  // ທີ່ຢູ່ເກັບແຕ່ເມືອງ (ແຂວງມາກັບເມືອງ)
  if (has("district_id")) {
    const districtId = Number(body.district_id) || null;
    if (districtId && !(await District.findByPk(districtId))) return { error: "ບໍ່ພົບເມືອງທີ່ເລືອກ" };
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

/** ລາອອກ → ປິດບັນຊີຜູ້ໃຊ້ທີ່ຜູກໄວ້ (login ບໍ່ໄດ້ອີກ) + ຍົກເລີກຄຳຮ້ອງທີ່ຍັງຄ້າງ (ບໍ່ມີໃຜມາອະນຸມັດໃຫ້ຄົນທີ່ອອກແລ້ວ) */
const closeAccountIfResigned = async (employeeId: number, status: unknown) => {
  if (Number(status) !== RESIGNED) return;
  // ລູກທີມຂອງຄົນທີ່ອອກ ໄປລາຍງານຕໍ່ຫົວໜ້າຂອງເຂົາແທນ
  await releaseReports(employeeId);
  await Users.update({ status: 0, updatedAt: new Date() } as any, { where: { employee_id: employeeId, status: 1 } });
  const closed = { status: REQUEST_CANCELLED, review_note: "ພະນັກງານລາອອກ", updatedAt: new Date() } as any;
  const pending = { where: { employee_id: employeeId, status: REQUEST_PENDING } };
  await LeaveRequest.update(closed, pending);
  await AttendanceRequest.update(closed, pending);
  await closeAdvancesOfResigned(employeeId);
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
      // ເຂົ້າ app ພະນັກງານໄດ້ທັນທີ ດ້ວຍເບີໂທ + ລະຫັດເລີ່ມຕົ້ນ (ບໍ່ຕ້ອງມີບັນຊີຜູ້ໃຊ້ລະບົບ)
      app_password: bcrypt.hashSync(DEFAULT_APP_PASSWORD, 10),
      must_change_password: 1,
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

/** PUT /employee/app-password/:id — HR ຕັ້ງລະຫັດຜ່ານ app ຂອງພະນັກງານຄືນເປັນຄ່າເລີ່ມຕົ້ນ (ລືມລະຫັດ ແລະ ຍັງບໍ່ມີ OTP) */
export const resetAppPassword = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const row = await Employee.findByPk(Number(decodeId(req)));
    if (!row) {
      res.status(404).json({ message: "ບໍ່ພົບພະນັກງານ" });
      return;
    }
    await row.update({ app_password: bcrypt.hashSync(DEFAULT_APP_PASSWORD, 10), must_change_password: 1, updatedAt: new Date() });
    res.status(200).json({ message: "Successfully reset app password", data: await findFull(row._uuid) });
  } catch (error) {
    sendError(res, error, "Error resetting app password");
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
    // ເງິນເດືອນພື້ນຖານ / ບັນຊີທະນາຄານ / ວັນເຂົ້າ-ອອກ ປ່ຽນ = ໃບເງິນເດືອນຮ່າງຂອງຄົນນີ້ຕາມທັນທີ
    await syncDraftPayrolls([row._uuid]);
    const advanceBalance = Number(row.work_status) === RESIGNED ? await advanceBalanceOf(row._uuid) : 0;
    res.status(200).json({
      message: "Successfully updated employee",
      data: await findFull(row._uuid),
      ...(advanceBalance > 0 ? { warning: `ຍັງມີເງິນເບີກຄ້າງ ₭ ${advanceBalance.toLocaleString("en-US")} — ຈະຫັກໃນເງິນເດືອນງວດສຸດທ້າຍ, ສ່ວນທີ່ຫັກບໍ່ໝົດ ຮັບຄືນເປັນເງິນສົດ` } : {}),
    });
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
    // ມີປະຫວັດແລ້ວ ຫ້າມລຶບ — ບໍ່ດັ່ງນັ້ນເງິນເດືອນ / ການເຂົ້າວຽກ / ເງິນເບີກ ຈະກາຍເປັນຂໍ້ມູນທີ່ບໍ່ມີເຈົ້າຂອງ
    const history = [
      [Attendance, "ການເຂົ້າວຽກ"], [LeaveRequest, "ລາພັກ"], [AttendanceRequest, "ແຈ້ງລືມສະແກນ"], [Overtime, "OT"], [SalaryAdvance, "ເງິນເບີກ"],
    ] as const;
    const used: string[] = [];
    for (const [model, label] of history) {
      if (await (model as any).count({ where: { employee_id: id }, transaction: t })) used.push(label);
    }
    const paidLines = await PayrollLine.count({
      where: { employee_id: id },
      include: [{ model: Payroll, as: "payroll", required: true, where: { status: PAYROLL_PAID }, attributes: [] }],
      transaction: t,
    });
    if (paidLines) used.push("ເງິນເດືອນ");
    if (used.length) {
      await t.rollback();
      res.status(400).json({ message: `ລຶບບໍ່ໄດ້ — ມີປະຫວັດ${used.join(", ")}ແລ້ວ (ຕັ້ງເປັນລາອອກແທນ)` });
      return;
    }
    const documents = await EmployeeDocument.findAll({ where: { employee_id: id }, transaction: t });
    await EmployeeDocument.destroy({ where: { employee_id: id }, transaction: t });
    // ເຫຼືອແຕ່ແຖວຂອງໃບເງິນເດືອນຮ່າງ (ຍັງບໍ່ໄດ້ຈ່າຍ) — ເອົາອອກພ້ອມກັນ ແລ້ວຄິດຍອດລວມຂອງໃບໃໝ່ຂ້າງລຸ່ມ
    await PayrollLine.destroy({ where: { employee_id: id }, transaction: t });
    await releaseReports(id, t);
    await row.destroy({ transaction: t });
    await t.commit();
    await syncDraftPayrolls();
    if (row.profile) deleteFile(PROFILE_FOLDER, row.profile);
    documents.forEach((d) => removeQuietly(path.join(DOCUMENT_DIR, d.file_name)));
    res.status(200).json({ message: "Successfully deleted employee" });
  } catch (error) {
    await t.rollback();
    sendError(res, error, "Error deleting employee");
  }
};

/** POST /employee/document/:id (multipart "files", ສູງສຸດ 5 ໄຟລ໌ × 5MB) — :id = ພະນັກງານ */
/** ປະເພດເອກະສານ — ບໍ່ຮູ້ຈັກ = ອື່ນໆ */
export const DOC_TYPES = ["id_card", "driving_license", "cv", "contract", "certificate", "other"];
const docType = (raw: unknown) => (DOC_TYPES.includes(String(raw)) ? String(raw) : "other");

/** PUT /employee/document/:id { doc_type } — ປ່ຽນປະເພດຂອງເອກະສານ (ເຊັ່ນ ເອກະສານເກົ່າທີ່ຍັງບໍ່ມີປະເພດ) */
export const updateEmployeeDocument = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const doc = await EmployeeDocument.findByPk(Number(decodeId(req)));
    if (!doc) {
      res.status(404).json({ message: "ບໍ່ພົບເອກະສານ" });
      return;
    }
    await doc.update({ doc_type: docType(req.body?.doc_type), updatedAt: new Date() });
    res.status(200).json({ message: "Successfully updated document", data: await findFull(doc.employee_id) });
  } catch (error) {
    sendError(res, error, "Error updating employee document");
  }
};

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
      doc_type: docType(req.body?.doc_type),
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
