import { Request, Response } from "express";
import Employee from "../../models/employee";
import LeaveRequest from "../../models/leaveRequest";
import AttendanceRequest from "../../models/attendanceRequest";
import PayrollLine from "../../models/payrollLine";
import Payroll from "../../models/payroll";
import { decodeId, sendError } from "../bansi/bansiHelpers";
import { advanceBalanceOf, advancePendingCounts } from "./advanceController";
import { balancesOf } from "./leaveController";
import { nowLao } from "./workCalendar";

/** ພາບລວມທີ່ດຶງຂໍ້ມູນຂ້າມໂມດູນ HR — ຄຳຮ້ອງທີ່ລໍຖ້າ HR ແລະ ສະຫຼຸບຂອງພະນັກງານ 1 ຄົນ */

const PENDING = 1;
const PAYROLL_PAID = 2;

/** GET /hr/pending — ຈຳນວນຄຳຮ້ອງທີ່ລໍຖ້າ HR (ໜ້າ desktop): ລາພັກ, ແຈ້ງລືມສະແກນ, ເບີກເງິນ (ລໍຖ້າອະນຸມັດ / ລໍຖ້າຈ່າຍ) */
export const getHrPending = async (_req: Request, res: Response) => {
  try {
    const [leave, correction, advance] = await Promise.all([
      LeaveRequest.count({ where: { status: PENDING } }),
      AttendanceRequest.count({ where: { status: PENDING } }),
      advancePendingCounts(),
    ]);
    res.status(200).json({ data: { leave, correction, advance: advance.pending, advance_to_pay: advance.approved } });
  } catch (error) {
    sendError(res, error, "Error getting pending HR requests");
  }
};

/**
 * GET /employee/summary/:id — ສະຫຼຸບຂ້າມໂມດູນຂອງພະນັກງານ (ໜ້າລາຍລະອຽດ): ຍອດເບີກຄ້າງ, ມື້ລາທີ່ເຫຼືອຂອງປີ,
 * ຄຳຮ້ອງທີ່ລໍຖ້າ, ເງິນເດືອນທີ່ຈ່າຍລ່າສຸດ
 */
export const getEmployeeSummary = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const id = Number(decodeId(req));
    if (!(await Employee.count({ where: { _uuid: id } }))) {
      res.status(404).json({ message: "ບໍ່ພົບພະນັກງານ" });
      return;
    }
    const year = nowLao().format("YYYY");
    const [advance_balance, leave, pendingLeave, pendingCorrection, lastLine] = await Promise.all([
      advanceBalanceOf(id),
      balancesOf(id, year),
      LeaveRequest.count({ where: { employee_id: id, status: PENDING } }),
      AttendanceRequest.count({ where: { employee_id: id, status: PENDING } }),
      PayrollLine.findOne({
        where: { employee_id: id },
        attributes: ["net"],
        include: [{ model: Payroll, as: "payroll", required: true, where: { status: PAYROLL_PAID }, attributes: ["period", "pay_date"] }],
        order: [[{ model: Payroll, as: "payroll" }, "period", "DESC"]],
      }),
    ]);
    const last: any = lastLine?.get({ plain: true });
    res.status(200).json({
      data: {
        year,
        advance_balance,
        leave,
        pending: pendingLeave + pendingCorrection,
        last_payroll: last ? { period: last.payroll.period, pay_date: last.payroll.pay_date, net: Number(last.net) || 0 } : null,
      },
    });
  } catch (error) {
    sendError(res, error, "Error getting employee summary");
  }
};
