"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAuditLogs = void 0;
const sequelize_1 = require("sequelize");
const auditLog_1 = __importDefault(require("../models/auditLog"));
const userModel_1 = __importDefault(require("../models/userModel"));
const department_1 = __importDefault(require("../models/department"));
const position_1 = __importDefault(require("../models/position"));
const bankModel_1 = __importDefault(require("../models/bankModel"));
const partner_1 = __importDefault(require("../models/partner"));
const salaryAccess_1 = require("../middleware/salaryAccess");
const bansiHelpers_1 = require("./bansi/bansiHelpers");
/** ປະເພດທີ່ກ່ຽວກັບເງິນເດືອນ — ຜູ້ບໍ່ມີສິດເມນູເງິນເດືອນບໍ່ເຫັນ */
const SALARY_ENTITIES = new Set(["payroll", "payroll_line", "advance"]);
const SALARY_FIELDS = new Set(["basic_salary"]);
const MAX_ROWS = 1000;
/** id → ຊື່ ສຳລັບຊ່ອງທີ່ເປັນ id (ພະແນກ, ຕຳແໜ່ງ, ທະນາຄານ, ຄູ່ຄ້າ) */
const LOOKUPS = {
    department_id: async (ids) => new Map((await department_1.default.findAll({ where: { _uuid: ids }, attributes: ["_uuid", "depart_name"], raw: true })).map((r) => [Number(r._uuid), r.depart_name])),
    position_id: async (ids) => new Map((await position_1.default.findAll({ where: { _uuid: ids }, attributes: ["_uuid", "position_name"], raw: true })).map((r) => [Number(r._uuid), r.position_name])),
    bank_id: async (ids) => new Map((await bankModel_1.default.findAll({ where: { _uuid: ids }, attributes: ["_uuid", "abbr"], raw: true })).map((r) => [Number(r._uuid), r.abbr])),
    partner_id: async (ids) => new Map((await partner_1.default.findAll({ where: { _uuid: ids }, attributes: ["_uuid", "name"], raw: true })).map((r) => [Number(r._uuid), r.name])),
};
/**
 * GET /audit/fetch?month=YYYY-MM&entity=&user_id= — ປະຫວັດການແກ້ໄຂ/ຍົກເລີກ/ລຶບ ຂອງເດືອນ (ໃໝ່ສຸດກ່ອນ, ສູງສຸດ 1000 ແຖວ).
 * changes ທີ່ເປັນ id ສົ່ງຊື່ມານຳ (names); ຜູ້ບໍ່ມີສິດເງິນເດືອນ ບໍ່ເຫັນລາຍການເງິນເດືອນ/ເງິນເບີກ ແລະ ຄ່າເງິນເດືອນພື້ນຖານ
 */
const getAuditLogs = async (req, res) => {
    try {
        const month = /^\d{4}-\d{2}$/.test(String(req.query.month ?? "")) ? String(req.query.month) : new Date().toISOString().slice(0, 7);
        const start = new Date(`${month}-01T00:00:00`);
        const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
        const where = { at: { [sequelize_1.Op.gte]: start, [sequelize_1.Op.lt]: end } };
        if (req.query.entity)
            where.entity = String(req.query.entity);
        if (Number(req.query.user_id))
            where.user_id = Number(req.query.user_id);
        const salary = await (0, salaryAccess_1.canSeeSalary)(req);
        const rows = (await auditLog_1.default.findAll({ where, order: [["at", "DESC"], ["_uuid", "DESC"]], limit: MAX_ROWS, raw: true }));
        const list = rows.flatMap((row) => {
            if (!salary && SALARY_ENTITIES.has(row.entity))
                return [];
            let changes = null;
            try {
                changes = row.changes ? JSON.parse(row.changes) : null;
            }
            catch {
                changes = null;
            }
            if (changes && !salary) {
                changes = Object.fromEntries(Object.entries(changes).filter(([field]) => !SALARY_FIELDS.has(field)));
                if (!Object.keys(changes).length && row.action === "update")
                    return [];
            }
            return [{ ...row, changes }];
        });
        // ຊື່ຜູ້ໃຊ້ ແລະ ຊື່ຂອງຊ່ອງທີ່ເປັນ id
        const userIds = [...new Set(list.map((row) => Number(row.user_id)).filter(Boolean))];
        const users = new Map((await userModel_1.default.findAll({ where: { user_uuid: userIds }, attributes: ["user_uuid", "user_name"], raw: true }))
            .map((u) => [Number(u.user_uuid), u.user_name]));
        const names = {};
        await Promise.all(Object.entries(LOOKUPS).map(async ([field, lookup]) => {
            const ids = [...new Set(list.flatMap((row) => (row.changes?.[field] ?? []).map(Number).filter(Boolean)))];
            if (ids.length)
                names[field] = Object.fromEntries(await lookup(ids));
        }));
        const userList = (await userModel_1.default.findAll({ attributes: ["user_uuid", "user_name"], order: [["user_name", "ASC"]], raw: true }))
            .map((u) => ({ value: Number(u.user_uuid), label: u.user_name }));
        res.status(200).json({
            month,
            data: list.map((row) => ({ ...row, user_name: users.get(Number(row.user_id)) ?? null })),
            names,
            users: userList,
            limited: rows.length >= MAX_ROWS,
        });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting audit log");
    }
};
exports.getAuditLogs = getAuditLogs;
