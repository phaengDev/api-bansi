import { Request, Response } from "express";
import { Op } from "sequelize";
import AuditLog from "../models/auditLog";
import Users from "../models/userModel";
import Department from "../models/department";
import Position from "../models/position";
import Banks from "../models/bankModel";
import Partner from "../models/partner";
import { canSeeSalary } from "../middleware/salaryAccess";
import { sendError } from "./bansi/bansiHelpers";

/** ປະເພດທີ່ກ່ຽວກັບເງິນເດືອນ — ຜູ້ບໍ່ມີສິດເມນູເງິນເດືອນບໍ່ເຫັນ */
const SALARY_ENTITIES = new Set(["payroll", "payroll_line", "advance"]);
const SALARY_FIELDS = new Set(["basic_salary"]);
const MAX_ROWS = 1000;

/** id → ຊື່ ສຳລັບຊ່ອງທີ່ເປັນ id (ພະແນກ, ຕຳແໜ່ງ, ທະນາຄານ, ຄູ່ຄ້າ) */
const LOOKUPS: Record<string, (ids: number[]) => Promise<Map<number, string>>> = {
  department_id: async (ids) => new Map((await Department.findAll({ where: { _uuid: ids }, attributes: ["_uuid", "depart_name"], raw: true }) as any[]).map((r) => [Number(r._uuid), r.depart_name])),
  position_id: async (ids) => new Map((await Position.findAll({ where: { _uuid: ids }, attributes: ["_uuid", "position_name"], raw: true }) as any[]).map((r) => [Number(r._uuid), r.position_name])),
  bank_id: async (ids) => new Map((await Banks.findAll({ where: { _uuid: ids }, attributes: ["_uuid", "abbr"], raw: true }) as any[]).map((r) => [Number(r._uuid), r.abbr])),
  partner_id: async (ids) => new Map((await Partner.findAll({ where: { _uuid: ids }, attributes: ["_uuid", "name"], raw: true }) as any[]).map((r) => [Number(r._uuid), r.name])),
};

/**
 * GET /audit/fetch?month=YYYY-MM&entity=&user_id= — ປະຫວັດການແກ້ໄຂ/ຍົກເລີກ/ລຶບ ຂອງເດືອນ (ໃໝ່ສຸດກ່ອນ, ສູງສຸດ 1000 ແຖວ).
 * changes ທີ່ເປັນ id ສົ່ງຊື່ມານຳ (names); ຜູ້ບໍ່ມີສິດເງິນເດືອນ ບໍ່ເຫັນລາຍການເງິນເດືອນ/ເງິນເບີກ ແລະ ຄ່າເງິນເດືອນພື້ນຖານ
 */
export const getAuditLogs = async (req: Request, res: Response) => {
  try {
    const month = /^\d{4}-\d{2}$/.test(String(req.query.month ?? "")) ? String(req.query.month) : new Date().toISOString().slice(0, 7);
    const start = new Date(`${month}-01T00:00:00`);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    const where: any = { at: { [Op.gte]: start, [Op.lt]: end } };
    if (req.query.entity) where.entity = String(req.query.entity);
    if (Number(req.query.user_id)) where.user_id = Number(req.query.user_id);

    const salary = await canSeeSalary(req);
    const rows = (await AuditLog.findAll({ where, order: [["at", "DESC"], ["_uuid", "DESC"]], limit: MAX_ROWS, raw: true })) as any[];
    const list = rows.flatMap((row) => {
      if (!salary && SALARY_ENTITIES.has(row.entity)) return [];
      let changes: Record<string, [unknown, unknown]> | null = null;
      try {
        changes = row.changes ? JSON.parse(row.changes) : null;
      } catch {
        changes = null;
      }
      if (changes && !salary) {
        changes = Object.fromEntries(Object.entries(changes).filter(([field]) => !SALARY_FIELDS.has(field)));
        if (!Object.keys(changes).length && row.action === "update") return [];
      }
      return [{ ...row, changes }];
    });

    // ຊື່ຜູ້ໃຊ້ ແລະ ຊື່ຂອງຊ່ອງທີ່ເປັນ id
    const userIds = [...new Set(list.map((row) => Number(row.user_id)).filter(Boolean))];
    const users = new Map((await Users.findAll({ where: { user_uuid: userIds }, attributes: ["user_uuid", "user_name"], raw: true }) as any[])
      .map((u) => [Number(u.user_uuid), u.user_name]));
    const names: Record<string, Record<number, string>> = {};
    await Promise.all(Object.entries(LOOKUPS).map(async ([field, lookup]) => {
      const ids = [...new Set(list.flatMap((row) => (row.changes?.[field] ?? []).map(Number).filter(Boolean)))] as number[];
      if (ids.length) names[field] = Object.fromEntries(await lookup(ids));
    }));

    const userList = (await Users.findAll({ attributes: ["user_uuid", "user_name"], order: [["user_name", "ASC"]], raw: true }) as any[])
      .map((u) => ({ value: Number(u.user_uuid), label: u.user_name }));
    res.status(200).json({
      month,
      data: list.map((row) => ({ ...row, user_name: users.get(Number(row.user_id)) ?? null })),
      names,
      users: userList,
      limited: rows.length >= MAX_ROWS,
    });
  } catch (error) {
    sendError(res, error, "Error getting audit log");
  }
};
