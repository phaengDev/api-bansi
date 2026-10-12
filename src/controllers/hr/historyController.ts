import { Request, Response } from "express";
import moment from "moment";
import { Op } from "sequelize";
import Overtime from "../../models/overtime";
import { sendError } from "../bansi/bansiHelpers";
import { profileUrl } from "./hrHelpers";
import { loadPayrollSettings } from "./payrollRules";
import { selfEmployee } from "./attendanceController";
import { attendanceByEmployee, findCompany, holidaysBetween, monthOf, monthStatsOf, todayLao, workRulesOf } from "./workCalendar";

/**
 * ປະຫວັດການເຮັດວຽກໃນບໍລິສັດຂອງຕົນເອງ (app ມືຖື) — ວັນເລີ່ມວຽກ, ອາຍຸງານ, ຕຳແໜ່ງ/ພະແນກປັດຈຸບັນ
 * ແລະ ສະຫຼຸບແຕ່ລະເດືອນຂອງປີ (ມາວຽກ, ມາຊ້າ, ຂາດ, ລາພັກ, ຊົ່ວໂມງ OT) ຄິດແບບດຽວກັບ GET /attendance/me
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

/** GET /employee/me/history?year=YYYY — ບໍ່ສົ່ງປີ = ປີນີ້; ປີທີ່ເລືອກໄດ້ = ປີເລີ່ມວຽກ … ປີນີ້ */
export const getMyWorkHistory = async (req: Request, res: Response) => {
  try {
    const self = await selfEmployee(req);
    if ("code" in self) {
      res.status(self.code).json({ message: self.message });
      return;
    }
    const me: any = self.employee;
    const e = me.get({ plain: true });
    const today = todayLao();
    const thisYear = Number(today.slice(0, 4));
    const startDate = e.start_date ? String(e.start_date) : null;
    const firstYear = Math.min(startDate ? Number(startDate.slice(0, 4)) : thisYear, thisYear);
    const asked = Number(req.query.year);
    const year = Number.isInteger(asked) && asked >= firstYear && asked <= thisYear ? asked : thisYear;

    // ເດືອນທີ່ນັບ: ຕັ້ງແຕ່ເດືອນເລີ່ມວຽກ (ປີທຳອິດ) ຫາ ເດືອນນີ້ (ປີນີ້)
    const firstMonth = startDate && startDate.slice(0, 4) === String(year) ? Number(startDate.slice(5, 7)) : 1;
    const lastMonth = year === thisYear ? Number(today.slice(5, 7)) : 12;
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    const [company, settings, holidays, rowsById, overtime] = await Promise.all([
      findCompany(),
      loadPayrollSettings(),
      holidaysBetween(yearStart, yearEnd),
      attendanceByEmployee([me._uuid], yearStart, yearEnd),
      Overtime.findAll({
        where: { employee_id: me._uuid, work_date: { [Op.between]: [yearStart, yearEnd] } },
        attributes: ["work_date", "hours"],
        raw: true,
      }),
    ]);
    const rules = workRulesOf(company);
    const rows = rowsById.get(me._uuid) ?? new Map();

    const months: any[] = [];
    if (!startDate || startDate <= today) {
      for (let m = lastMonth; m >= firstMonth; m--) {
        const period = `${year}-${String(m).padStart(2, "0")}`;
        const { dates } = monthOf(period);
        const { stats } = monthStatsOf(me, rows, dates, rules, holidays, today, settings.late_grace_minutes);
        const otHours = (overtime as any[])
          .filter((o) => String(o.work_date).startsWith(period))
          .reduce((n, o) => n + (Number(o.hours) || 0), 0);
        months.push({
          period,
          // ມື້ເຮັດວຽກທີ່ຜ່ານມາແລ້ວ (ບໍ່ນັບມື້ທີ່ຍັງບໍ່ຮອດ) — ໃຊ້ຄິດອັດຕາມາວຽກ
          workdays: stats.employed_days - stats.pending_days,
          present_days: stats.present_days,
          late_days: stats.late_days,
          late_minutes: stats.late_minutes,
          absent_days: stats.absent_days,
          leave_days: stats.leave_days,
          unpaid_days: stats.unpaid_days,
          offday_work_days: stats.offday_work_days,
          ot_hours: round2(otHours),
        });
      }
    }
    const sum = (key: string) => round2(months.reduce((n, m) => n + (Number(m[key]) || 0), 0));
    const totals = Object.fromEntries(
      ["workdays", "present_days", "late_days", "late_minutes", "absent_days", "leave_days", "unpaid_days", "offday_work_days", "ot_hours"].map((k) => [k, sum(k)]),
    );

    // ອາຍຸງານ ນັບຮອດມື້ນີ້ (ລາອອກແລ້ວ = ຮອດມື້ລາອອກ)
    const until = e.end_date && String(e.end_date) < today ? String(e.end_date) : today;
    const from = startDate ? moment(startDate, "YYYY-MM-DD") : null;
    const to = moment(until, "YYYY-MM-DD");
    const service = from && !from.isAfter(to)
      ? (() => {
          const totalMonths = to.diff(from, "months");
          const days = to.diff(from.clone().add(totalMonths, "months"), "days");
          return { years: Math.floor(totalMonths / 12), months: totalMonths % 12, days, total_days: to.diff(from, "days") };
        })()
      : null;

    res.status(200).json({
      employee: {
        _uuid: e._uuid,
        emp_code: e.emp_code,
        first_name: e.first_name,
        last_name: e.last_name,
        profile_url: profileUrl(e.profile),
        department: e.department ?? null,
        position: e.position ?? null,
        start_date: startDate,
        end_date: e.end_date ?? null,
        work_status: e.work_status,
      },
      today,
      service,
      year,
      years: Array.from({ length: thisYear - firstYear + 1 }, (_, i) => thisYear - i),
      months,
      totals,
    });
  } catch (error) {
    sendError(res, error, "Error getting my work history");
  }
};
