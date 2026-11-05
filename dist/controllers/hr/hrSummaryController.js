"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEmployeeSummary = exports.getHrPending = void 0;
const employee_1 = __importDefault(require("../../models/employee"));
const leaveRequest_1 = __importDefault(require("../../models/leaveRequest"));
const attendanceRequest_1 = __importDefault(require("../../models/attendanceRequest"));
const payrollLine_1 = __importDefault(require("../../models/payrollLine"));
const payroll_1 = __importDefault(require("../../models/payroll"));
const bansiHelpers_1 = require("../bansi/bansiHelpers");
const advanceController_1 = require("./advanceController");
const leaveController_1 = require("./leaveController");
const workCalendar_1 = require("./workCalendar");
/** ພາບລວມທີ່ດຶງຂໍ້ມູນຂ້າມໂມດູນ HR — ຄຳຮ້ອງທີ່ລໍຖ້າ HR ແລະ ສະຫຼຸບຂອງພະນັກງານ 1 ຄົນ */
const PENDING = 1;
const PAYROLL_PAID = 2;
/** GET /hr/pending — ຈຳນວນຄຳຮ້ອງທີ່ລໍຖ້າ HR (ໜ້າ desktop): ລາພັກ, ແຈ້ງລືມສະແກນ, ເບີກເງິນ (ລໍຖ້າອະນຸມັດ / ລໍຖ້າຈ່າຍ) */
const getHrPending = async (_req, res) => {
    try {
        const [leave, correction, advance] = await Promise.all([
            leaveRequest_1.default.count({ where: { status: PENDING } }),
            attendanceRequest_1.default.count({ where: { status: PENDING } }),
            (0, advanceController_1.advancePendingCounts)(),
        ]);
        res.status(200).json({ data: { leave, correction, advance: advance.pending, advance_to_pay: advance.approved } });
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
