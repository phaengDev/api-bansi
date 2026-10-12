import { Request, Response } from "express";
import moment from "moment";
import { Op } from "sequelize";
import Employee from "../../models/employee";
import Department from "../../models/department";
import Position from "../../models/position";
import Attendance from "../../models/attendance";
import { sendError } from "../bansi/bansiHelpers";
import { profileUrl } from "./hrHelpers";
import { selfEmployee } from "./attendanceController";
import { PAID_LEAVE, UNPAID_LEAVE, WORKING, employedOn, todayLao } from "./workCalendar";

/**
 * ລາຍຊື່ເພື່ອນຮ່ວມງານ (app ມືຖື — ແຖບ "ທີມງານ"): ສະເພາະຂໍ້ມູນຕິດຕໍ່ວຽກ (ຊື່, ຮູບ, ເບີໂທ, ພະແນກ, ຕຳແໜ່ງ)
 * + ມື້ນີ້ລາພັກ / ວັນເກີດ. ບໍ່ສົ່ງເງິນເດືອນ, ວັນເດືອນປີເກີດ, ທີ່ຢູ່ ຫຼື ຂໍ້ມູນສ່ວນຕົວອື່ນ
 */

/** "MM-DD" ທີ່ນັບເປັນວັນເກີດມື້ນີ້ (ເກີດ 29 ກຸມພາ ປີທີ່ບໍ່ມີ ນັບວັນທີ 28) */
const birthdayKeys = (today: string) => {
  const day = moment(today, "YYYY-MM-DD");
  const key = day.format("MM-DD");
  return key === "02-28" && !day.isLeapYear() ? [key, "02-29"] : [key];
};

/** GET /employee/me/colleagues — ພະນັກງານທີ່ເຮັດວຽກຢູ່ (ລວມຕົນເອງ is_me) ລຽງຕາມພະແນກ ແລ້ວຊື່ */
export const getMyColleagues = async (req: Request, res: Response) => {
  try {
    const self = await selfEmployee(req);
    if ("code" in self) {
      res.status(self.code).json({ message: self.message });
      return;
    }
    const today = todayLao();
    const [rows, leaves] = await Promise.all([
      Employee.findAll({
        attributes: ["_uuid", "emp_code", "first_name", "last_name", "phone", "profile", "birthday", "start_date", "end_date", "work_status"],
        include: [
          { model: Department, as: "department", attributes: ["_uuid", "depart_name"] },
          { model: Position, as: "position", attributes: ["_uuid", "position_name"] },
        ],
        where: { work_status: WORKING },
        order: [["first_name", "ASC"]],
      }),
      Attendance.findAll({
        where: { work_date: today, status: { [Op.in]: [PAID_LEAVE, UNPAID_LEAVE] } },
        attributes: ["employee_id"],
        raw: true,
      }),
    ]);
    const onLeave = new Set((leaves as any[]).map((a) => Number(a.employee_id)));
    const keys = birthdayKeys(today);
    const data = rows
      .filter((e) => employedOn(e, today))
      .map((row) => {
        const e: any = row.get({ plain: true });
        return {
          _uuid: e._uuid,
          emp_code: e.emp_code,
          first_name: e.first_name,
          last_name: e.last_name,
          phone: e.phone ?? null,
          profile_url: profileUrl(e.profile),
          department: e.department ?? null,
          position: e.position ?? null,
          birthday_today: !!e.birthday && keys.includes(String(e.birthday).slice(5, 10)),
          on_leave_today: onLeave.has(e._uuid),
          is_me: e._uuid === self.employee._uuid,
        };
      })
      .sort((a, b) =>
        String(a.department?.depart_name ?? "~").localeCompare(String(b.department?.depart_name ?? "~"))
        || String(a.first_name ?? "").localeCompare(String(b.first_name ?? "")));
    res.status(200).json({
      today,
      data,
      summary: {
        total: data.length,
        on_leave: data.filter((d) => d.on_leave_today).length,
        birthdays: data.filter((d) => d.birthday_today).length,
      },
    });
  } catch (error) {
    sendError(res, error, "Error getting colleagues");
  }
};
