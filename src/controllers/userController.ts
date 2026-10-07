import { Request, Response } from "express";
import { Op } from "sequelize";
import bcrypt from "bcryptjs";
import Users from "../models/userModel";
import TypeUser from "../models/typeUserModel";
import Employee from "../models/employee";
import Department from "../models/department";
import { maxid } from "../utils";
import { decodeId, sendError } from "./bansi/bansiHelpers";
import { currentUser, hasPermission } from "../middleware/permission";
import { profileUrl } from "./hr/hrHelpers";

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
const FLAGS = ["creates", "updates", "deletes"] as const;

const includeAll = [
  { model: TypeUser, as: "typeuser", attributes: ["_uuid", "names"] },
  {
    model: Employee,
    as: "employee",
    attributes: ["_uuid", "emp_code", "first_name", "last_name", "work_status", "profile"],
    include: [{ model: Department, as: "department", attributes: ["_uuid", "depart_name"] }],
  },
];

const present = (user: Users) => {
  const { password: _password, ...r } = user.get({ plain: true }) as any;
  return { ...r, employee: r.employee && { ...r.employee, profile_url: profileUrl(r.employee.profile) } };
};

const findFull = (id: number | string) => Users.findByPk(id, { include: includeAll });

const selfId = (req: Request) => Number(req.user?.sub);

type UserInput = Partial<{
  user_name: string;
  phones: string;
  type_user: number;
  employee_id: number | null;
  status: number;
  creates: number;
  updates: number;
  deletes: number;
}>;

/** ເອົາສະເພາະຖັນທີ່ແກ້ໄດ້ ແລະ ກວດຄ່າ — ລະຫັດຜ່ານບໍ່ຜ່ານທາງນີ້ (ໃຊ້ /user/password/:id) */
const parseInput = async (body: any, exceptId?: number): Promise<UserInput | { error: string }> => {
  const input: UserInput = {};
  if (body.user_name !== undefined) {
    const name = String(body.user_name ?? "").trim();
    if (!name) return { error: "ກະລຸນາປ້ອນຊື່ຜູ້ໃຊ້" };
    input.user_name = name.slice(0, 100);
  }
  if (body.phones !== undefined) {
    const phones = String(body.phones ?? "").replace(/[\s-]/g, "");
    if (!PHONE.test(phones)) return { error: "ເບີໂທບໍ່ຖືກຕ້ອງ (ຕົວເລກ 6–20 ຕົວ)" };
    const taken = await Users.count({
      where: { phones, ...(exceptId ? { user_uuid: { [Op.ne]: exceptId } } : {}) },
    });
    if (taken) return { error: `ເບີ ${phones} ມີບັນຊີແລ້ວ` };
    input.phones = phones;
  }
  if (body.type_user !== undefined) {
    const type = await TypeUser.findByPk(Number(body.type_user));
    if (!type) return { error: "ກະລຸນາເລືອກປະເພດຜູ້ໃຊ້" };
    input.type_user = Number(body.type_user);
  }
  if (body.employee_id !== undefined) {
    const employeeId = Number(body.employee_id) || null;
    if (employeeId) {
      const employee = await Employee.findByPk(employeeId, { attributes: ["_uuid"] });
      if (!employee) return { error: "ບໍ່ພົບພະນັກງານທີ່ເລືອກ" };
      const linked = await Users.findOne({
        where: { employee_id: employeeId, ...(exceptId ? { user_uuid: { [Op.ne]: exceptId } } : {}) },
        attributes: ["user_name"],
      });
      if (linked) return { error: `ພະນັກງານນີ້ມີບັນຊີແລ້ວ (${linked.user_name})` };
    }
    input.employee_id = employeeId;
  }
  if (body.status !== undefined) input.status = Number(body.status) === 1 ? 1 : 0;
  for (const flag of FLAGS) {
    if (body[flag] !== undefined) input[flag] = Number(body[flag]) === ALLOW ? ALLOW : DENY;
  }
  return input;
};

/** POST /user/fetch — ທຸກບັນຊີ (ບໍ່ມີລະຫັດຜ່ານ) + ປະເພດ + ພະນັກງານທີ່ຜູກ */
export const getUsers = async (_req: Request, res: Response) => {
  try {
    const rows = await Users.findAll({ include: includeAll, order: [["user_uuid", "ASC"]] });
    res.status(200).json({ data: rows.map(present), total: rows.length });
  } catch (error) {
    sendError(res, error, "Failed to fetch users");
  }
};

/** POST /user/create { user_name, phones, password, type_user, employee_id?, creates, updates, deletes, status? } */
export const createUser = async (req: Request, res: Response) => {
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
    const row = await Users.create({
      ...(input as Required<UserInput>),
      user_uuid: await maxid(Users, "user_uuid"),
      password: await bcrypt.hash(password, 10),
    });
    const saved = await findFull(row.user_uuid);
    res.status(200).json({ message: "User created successfully", data: saved && present(saved) });
  } catch (error) {
    sendError(res, error, "Failed to create user");
  }
};

/** GET /user/:id */
export const getUserById = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const user = await findFull(decodeId(req));
    if (!user) {
      res.status(404).json({ message: "ບໍ່ພົບຜູ້ໃຊ້" });
      return;
    }
    res.status(200).json({ data: present(user) });
  } catch (error) {
    sendError(res, error, "Failed to fetch user");
  }
};

/** PUT /user/:id — ຊື່, ເບີໂທ, ປະເພດ, ພະນັກງານ, ສິດ, ສະຖານະ (ສົ່ງສະເພາະຖັນທີ່ປ່ຽນກໍ່ໄດ້ ເຊັ່ນ { status }) */
export const updateUser = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const id = Number(decodeId(req));
    const row = await Users.findByPk(id);
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
    await row.update({ ...input, updatedAt: new Date() } as any);
    const saved = await findFull(id);
    res.status(200).json({ message: "User updated successfully", data: saved && present(saved) });
  } catch (error) {
    sendError(res, error, "Failed to update user");
  }
};

/**
 * PUT /user/password/:id { password, current_password? } — ປ່ຽນລະຫັດຂອງຕົນເອງ (ຕ້ອງໃສ່ລະຫັດປັດຈຸບັນ)
 * ຫຼື ຕັ້ງລະຫັດໃໝ່ໃຫ້ຄົນອື່ນ (ຕ້ອງມີສິດແກ້ໄຂ)
 */
export const updatePassword = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const id = Number(decodeId(req));
    const actor = await currentUser(req);
    if (!actor) {
      res.status(401).json({ message: "ກະລຸນາເຂົ້າລະບົບໃໝ່" });
      return;
    }
    const isSelf = Number(actor.user_uuid) === id;
    if (isSelf) {
      const ok = await bcrypt.compare(String(req.body?.current_password ?? ""), actor.password ?? "");
      if (!ok) {
        res.status(400).json({ message: "ລະຫັດຜ່ານປັດຈຸບັນບໍ່ຖືກຕ້ອງ" });
        return;
      }
    } else if (!hasPermission(actor, "updates")) {
      res.status(403).json({ message: "ທ່ານບໍ່ມີສິດປ່ຽນລະຫັດຜ່ານຂອງຜູ້ໃຊ້ອື່ນ" });
      return;
    }
    const password = String(req.body?.password ?? "");
    if (password.length < MIN_PASSWORD) {
      res.status(400).json({ message: `ລະຫັດຜ່ານຕ້ອງມີຢ່າງໜ້ອຍ ${MIN_PASSWORD} ຕົວ` });
      return;
    }
    const [count] = await Users.update(
      { password: await bcrypt.hash(password, 10), updatedAt: new Date() } as any,
      { where: { user_uuid: id } }
    );
    if (!count) {
      res.status(404).json({ message: "ບໍ່ພົບຜູ້ໃຊ້" });
      return;
    }
    res.status(200).json({ message: "Password updated successfully" });
  } catch (error) {
    sendError(res, error, "Failed to update password");
  }
};

/** DELETE /user/:id — ລຶບບັນຊີຂອງຕົນເອງບໍ່ໄດ້ */
export const deleteUser = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const id = Number(decodeId(req));
    if (id === selfId(req)) {
      res.status(400).json({ message: "ລຶບບັນຊີຂອງຕົນເອງບໍ່ໄດ້" });
      return;
    }
    const deleted = await Users.destroy({ where: { user_uuid: id } });
    if (!deleted) {
      res.status(404).json({ message: "ບໍ່ພົບຜູ້ໃຊ້" });
      return;
    }
    res.status(200).json({ message: "User deleted" });
  } catch (error) {
    sendError(res, error, "Failed to delete user");
  }
};

/** GET /user/type — ປະເພດຜູ້ໃຊ້ (ເປີດສາທາລະນະ) */
export const getTypeUser = async (_req: Request, res: Response) => {
  try {
    const data = await TypeUser.findAll({ order: [["_uuid", "ASC"]] });
    res.status(200).json({ message: "OK", data });
  } catch (error) {
    sendError(res, error, "Failed to get type user");
  }
};
