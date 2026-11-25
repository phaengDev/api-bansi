"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSalaryHistory = exports.getEmployeeSummary = exports.getHrPending = exports.getExpiring = exports.expiringItems = void 0;
const employee_1 = __importDefault(require("../../models/employee"));
const leaveRequest_1 = __importDefault(require("../../models/leaveRequest"));
const attendanceRequest_1 = __importDefault(require("../../models/attendanceRequest"));
const payrollLine_1 = __importDefault(require("../../models/payrollLine"));
const payroll_1 = __importDefault(require("../../models/payroll"));
const auditLog_1 = __importDefault(require("../../models/auditLog"));
const userModel_1 = __importDefault(require("../../models/userModel"));
const bansiHelpers_1 = require("../bansi/bansiHelpers");
const advanceController_1 = require("./advanceController");
const sequelize_1 = require("sequelize");
const leaveController_1 = require("./leaveController");
const workCalendar_1 = require("./workCalendar");
const companyDocumentController_1 = require("./companyDocumentController");
/** ພາບລວມທີ່ດຶງຂໍ້ມູນຂ້າມໂມດູນ HR — ຄຳຮ້ອງທີ່ລໍຖ້າ HR ແລະ ສະຫຼຸບຂອງພະນັກງານ 1 ຄົນ */
const PENDING = 1;
const PAYROLL_PAID = 2;
/**
 * ເອກະສານ / ສັນຍາ ໃກ້ໝົດອາຍຸ ຂອງພະນັກງານທີ່ເຮັດວຽກຢູ່ — ບ່ອນດຽວທີ່ຄິດ (desktop "ຕ້ອງຕິດຕາມ" ແລະ ໜ້າພະນັກງານໃຊ້ຮ່ວມກັນ):
 * ສັນຍາມີກຳນົດ / ບັດປະຈຳຕົວ / passport: ໝົດແລ້ວ ຫຼື ໝົດພາຍໃນ 30 ມື້; ທົດລອງວຽກ: ຄົບພາຍໃນ 14 ມື້ (ຜ່ານແລ້ວບໍ່ນັບ — ບໍ່ຕ້ອງເຮັດຫຍັງ).
 * days = ມື້ທີ່ເຫຼືອ (ລົບ = ໝົດແລ້ວ), ລຽງໃກ້ສຸດກ່ອນ
 */
const EXPIRY_AHEAD_DAYS = 30;
const PROBATION_AHEAD_DAYS = 14;
const WORKING = 1;
const expiringItems = async () => {
    const today = (0, workCalendar_1.nowLao)().startOf("day");
    const todayKey = today.format("YYYY-MM-DD");
    const soon = today.clone().add(EXPIRY_AHEAD_DAYS, "days").format("YYYY-MM-DD");
    const probationSoon = today.clone().add(PROBATION_AHEAD_DAYS, "days").format("YYYY-MM-DD");
    const rows = (await employee_1.default.findAll({
        where: {
            work_status: WORKING,
            [sequelize_1.Op.or]: [
                { contract_fixed_term: 1, contract_end: { [sequelize_1.Op.lte]: soon } },
                { probation_end: { [sequelize_1.Op.between]: [todayKey, probationSoon] } },
                { id_card_expiry: { [sequelize_1.Op.lte]: soon } },
                { passport_expiry: { [sequelize_1.Op.lte]: soon } },
            ],
        },
        attributes: ["_uuid", "emp_code", "first_name", "last_name", "contract_fixed_term", "contract_end", "probation_end", "id_card_expiry", "passport_expiry"],
        raw: true,
    }));
    const items = [];
    const add = (row, kind, date, until, from) => {
        if (!date || date > until || (from && date < from))
            return;
        items.push({
            employee_id: Number(row._uuid), emp_code: row.emp_code, name: [row.first_name, row.last_name].filter(Boolean).join(" "),
            kind, date, days: Math.round((new Date(`${date}T00:00:00`).getTime() - new Date(`${todayKey}T00:00:00`).getTime()) / 86400000),
        });
    };
    for (const row of rows) {
        if (Number(row.contract_fixed_term) === 1)
            add(row, "contract", row.contract_end, soon);
        add(row, "probation", row.probation_end, probationSoon, todayKey);
        add(row, "id_card", row.id_card_expiry, soon);
        add(row, "passport", row.passport_expiry, soon);
    }
    return items.sort((a, b) => a.days - b.days || a.emp_code.localeCompare(b.emp_code));
};
exports.expiringItems = expiringItems;
/** GET /employee/expiring — ລາຍການໃກ້ໝົດອາຍຸ (ໜ້າພະນັກງານ: ແຖບ "ໃກ້ໝົດອາຍຸ" + ປ້າຍໃນແຖວ) */
const getExpiring = async (_req, res) => {
    try {
        res.status(200).json({ data: await (0, exports.expiringItems)() });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting expiring documents");
    }
};
exports.getExpiring = getExpiring;
/** GET /hr/pending — ຈຳນວນຄຳຮ້ອງທີ່ລໍຖ້າ HR (ໜ້າ desktop): ລາພັກ, ແຈ້ງລືມສະແກນ, ເບີກເງິນ (ລໍຖ້າອະນຸມັດ / ລໍຖ້າຈ່າຍ) */
const getHrPending = async (_req, res) => {
    try {
        const [leave, correction, advance, expiring, companyDocs] = await Promise.all([
            // ລໍຫົວໜ້າທີມຢູ່ = HR ຍັງເຮັດຫຍັງບໍ່ໄດ້ — ບໍ່ນັບ
            leaveRequest_1.default.count({ where: { status: PENDING, [sequelize_1.Op.or]: [{ lead_status: null }, { lead_status: { [sequelize_1.Op.ne]: leaveController_1.LEAD_WAITING } }] } }),
            attendanceRequest_1.default.count({ where: { status: PENDING } }),
            (0, advanceController_1.advancePendingCounts)(),
            (0, exports.expiringItems)(),
            (0, companyDocumentController_1.companyDocsDue)(),
        ]);
        res.status(200).json({
            data: {
                leave, correction, advance: advance.pending, advance_to_pay: advance.approved,
                // ຈຳນວນຄົນທີ່ມີເອກະສານ / ສັນຍາ ໃກ້ໝົດອາຍຸ
                expiring: new Set(expiring.map((item) => item.employee_id)).size,
                // ເອກະສານບໍລິສັດ ໝົດແລ້ວ / ໝົດພາຍໃນ 60 ມື້
                company_docs: companyDocs,
            },
        });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting pending HR requests");
    }
};
exports.getHrPending = getHrPending;
/**
 * GET /employee/summary/:id — ສະຫຼຸບຂ້າມໂມດູນຂອງພະນັກງານ (ໜ້າລາຍລະອຽດ): ຍອດເບີກຄ້າງ, ມື້ລາທີ່ເຫຼືອຂອງປີ,
 * ຄຳຮ້ອງທີ່ລໍຖ້າ, ເງິນເດືອນທີ່ຈ່າຍລ່າສຸດ
 */
const getEmployeeSummary = async (req, res) => {
    try {
        const id = Number((0, bansiHelpers_1.decodeId)(req));
        if (!(await employee_1.default.count({ where: { _uuid: id } }))) {
            res.status(404).json({ message: "ບໍ່ພົບພະນັກງານ" });
            return;
        }
        const year = (0, workCalendar_1.nowLao)().format("YYYY");
        const [advance_balance, leave, pendingLeave, pendingCorrection, lastLine] = await Promise.all([
            (0, advanceController_1.advanceBalanceOf)(id),
            (0, leaveController_1.balancesOf)(id, year),
            leaveRequest_1.default.count({ where: { employee_id: id, status: PENDING } }),
            attendanceRequest_1.default.count({ where: { employee_id: id, status: PENDING } }),
            payrollLine_1.default.findOne({
                where: { employee_id: id },
                attributes: ["net"],
                include: [{ model: payroll_1.default, as: "payroll", required: true, where: { status: PAYROLL_PAID }, attributes: ["period", "pay_date"] }],
                order: [[{ model: payroll_1.default, as: "payroll" }, "period", "DESC"]],
            }),
        ]);
        const last = lastLine?.get({ plain: true });
        res.status(200).json({
            data: {
                year,
                advance_balance,
                leave,
                pending: pendingLeave + pendingCorrection,
                last_payroll: last ? { period: last.payroll.period, pay_date: last.payroll.pay_date, net: Number(last.net) || 0 } : null,
            },
        });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting employee summary");
    }
};
exports.getEmployeeSummary = getEmployeeSummary;
/**
 * GET /employee/salary-history/:id — ປະຫວັດເງິນເດືອນພື້ນຖານ ໂດຍບໍ່ມີຕາຕະລາງໃໝ່:
 * - periods: ຈາກໃບເງິນເດືອນທີ່ຈ່າຍແລ້ວ (ແຕ່ລະເດືອນເກັບເງິນເດືອນພື້ນຖານຂອງເດືອນນັ້ນໄວ້) → ລວມເດືອນຕິດກັນທີ່ເທົ່າກັນເປັນຊ່ວງ
 * - changes: ຈາກປະຫວັດການແກ້ໄຂ (tbl_audit_log) — ໃຜປ່ຽນ ເມື່ອໃດ ຈາກເທົ່າໃດ ເປັນເທົ່າໃດ
 * ໃໝ່ສຸດກ່ອນທັງສອງລາຍການ. ສະເພາະຜູ້ມີສິດເມນູເງິນເດືອນ (route)
 */
const getSalaryHistory = async (req, res) => {
    try {
        const id = Number((0, bansiHelpers_1.decodeId)(req));
        const employee = await employee_1.default.findByPk(id, { attributes: ["_uuid", "basic_salary"] });
        if (!employee) {
            res.status(404).json({ message: "ບໍ່ພົບພະນັກງານ" });
            return;
        }
        const [lines, audits] = await Promise.all([
            payrollLine_1.default.findAll({
                where: { employee_id: id },
                attributes: ["basic_salary", "net"],
                include: [{ model: payroll_1.default, as: "payroll", required: true, where: { status: PAYROLL_PAID }, attributes: ["period"] }],
                order: [[{ model: payroll_1.default, as: "payroll" }, "period", "ASC"]],
            }),
            auditLog_1.default.findAll({ where: { entity: "employee", entity_id: id, action: "update" }, order: [["at", "DESC"]], limit: 100, raw: true }),
        ]);
        const periods = [];
        for (const line of lines.map((l) => l.get({ plain: true }))) {
            const salary = Number(line.basic_salary) || 0;
            const last = periods[periods.length - 1];
            if (last && last.basic_salary === salary) {
                last.to = line.payroll.period;
                last.months += 1;
            }
            else {
                periods.push({ from: line.payroll.period, to: line.payroll.period, basic_salary: salary, months: 1 });
            }
        }
        const changes = audits.flatMap((row) => {
            try {
                const diff = JSON.parse(row.changes ?? "{}");
                if (!diff.basic_salary)
                    return [];
                return [{ at: row.at, user_id: row.user_id, from: Number(diff.basic_salary[0]) || 0, to: Number(diff.basic_salary[1]) || 0 }];
            }
            catch {
                return [];
            }
        });
        const userIds = [...new Set(changes.map((c) => Number(c.user_id)).filter(Boolean))];
        const users = new Map((userIds.length ? await userModel_1.default.findAll({ where: { user_uuid: userIds }, attributes: ["user_uuid", "user_name"], raw: true }) : [])
            .map((u) => [Number(u.user_uuid), u.user_name]));
        res.status(200).json({
            data: {
                current: Number(employee.basic_salary) || 0,
                periods: periods.reverse(),
                changes: changes.map((c) => ({ ...c, user_name: users.get(Number(c.user_id)) ?? null })),
            },
        });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting salary history");
    }
};
exports.getSalaryHistory = getSalaryHistory;
