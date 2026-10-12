"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMyColleagues = void 0;
const moment_1 = __importDefault(require("moment"));
const sequelize_1 = require("sequelize");
const employee_1 = __importDefault(require("../../models/employee"));
const department_1 = __importDefault(require("../../models/department"));
const position_1 = __importDefault(require("../../models/position"));
const attendance_1 = __importDefault(require("../../models/attendance"));
const bansiHelpers_1 = require("../bansi/bansiHelpers");
const hrHelpers_1 = require("./hrHelpers");
const attendanceController_1 = require("./attendanceController");
const workCalendar_1 = require("./workCalendar");
/**
 * ລາຍຊື່ເພື່ອນຮ່ວມງານ (app ມືຖື — ແຖບ "ທີມງານ"): ສະເພາະຂໍ້ມູນຕິດຕໍ່ວຽກ (ຊື່, ຮູບ, ເບີໂທ, ພະແນກ, ຕຳແໜ່ງ)
 * + ມື້ນີ້ລາພັກ / ວັນເກີດ. ບໍ່ສົ່ງເງິນເດືອນ, ວັນເດືອນປີເກີດ, ທີ່ຢູ່ ຫຼື ຂໍ້ມູນສ່ວນຕົວອື່ນ
 */
/** "MM-DD" ທີ່ນັບເປັນວັນເກີດມື້ນີ້ (ເກີດ 29 ກຸມພາ ປີທີ່ບໍ່ມີ ນັບວັນທີ 28) */
const birthdayKeys = (today) => {
    const day = (0, moment_1.default)(today, "YYYY-MM-DD");
    const key = day.format("MM-DD");
    return key === "02-28" && !day.isLeapYear() ? [key, "02-29"] : [key];
};
/** GET /employee/me/colleagues — ພະນັກງານທີ່ເຮັດວຽກຢູ່ (ລວມຕົນເອງ is_me) ລຽງຕາມພະແນກ ແລ້ວຊື່ */
const getMyColleagues = async (req, res) => {
    try {
        const self = await (0, attendanceController_1.selfEmployee)(req);
        if ("code" in self) {
            res.status(self.code).json({ message: self.message });
            return;
        }
        const today = (0, workCalendar_1.todayLao)();
        const [rows, leaves] = await Promise.all([
            employee_1.default.findAll({
                attributes: ["_uuid", "emp_code", "first_name", "last_name", "phone", "profile", "birthday", "start_date", "end_date", "work_status"],
                include: [
                    { model: department_1.default, as: "department", attributes: ["_uuid", "depart_name"] },
                    { model: position_1.default, as: "position", attributes: ["_uuid", "position_name"] },
                ],
                where: { work_status: workCalendar_1.WORKING },
                order: [["first_name", "ASC"]],
            }),
            attendance_1.default.findAll({
                where: { work_date: today, status: { [sequelize_1.Op.in]: [workCalendar_1.PAID_LEAVE, workCalendar_1.UNPAID_LEAVE] } },
                attributes: ["employee_id"],
                raw: true,
            }),
        ]);
        const onLeave = new Set(leaves.map((a) => Number(a.employee_id)));
        const keys = birthdayKeys(today);
        const data = rows
            .filter((e) => (0, workCalendar_1.employedOn)(e, today))
            .map((row) => {
            const e = row.get({ plain: true });
            return {
                _uuid: e._uuid,
                emp_code: e.emp_code,
                first_name: e.first_name,
                last_name: e.last_name,
                phone: e.phone ?? null,
                profile_url: (0, hrHelpers_1.profileUrl)(e.profile),
                department: e.department ?? null,
                position: e.position ?? null,
                birthday_today: !!e.birthday && keys.includes(String(e.birthday).slice(5, 10)),
                on_leave_today: onLeave.has(e._uuid),
                is_me: e._uuid === self.employee._uuid,
            };
        })
            .sort((a, b) => String(a.department?.depart_name ?? "~").localeCompare(String(b.department?.depart_name ?? "~"))
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
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting colleagues");
    }
};
exports.getMyColleagues = getMyColleagues;
