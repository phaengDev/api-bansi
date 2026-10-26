"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleCheckoutReminders = void 0;
const sequelize_1 = require("sequelize");
const attendance_1 = __importDefault(require("../../models/attendance"));
const employee_1 = __importDefault(require("../../models/employee"));
const notification_1 = __importDefault(require("../../models/notification"));
const notificationController_1 = require("./notificationController");
const workCalendar_1 = require("./workCalendar");
/** ເປີດ server ຊ້າກວ່າເວລາເລີກວຽກເກີນນີ້ (ນາທີ) = ບໍ່ເຕືອນຍ້ອນຫຼັງ */
const LATE_LIMIT = 60;
/**
 * ຮອດເວລາເລີກວຽກ (work_end ຂອງບໍລິສັດ) — ເຕືອນຄົນທີ່ສະແກນເຂົ້າມື້ນີ້ແລ້ວ ແຕ່ຍັງບໍ່ໄດ້ສະແກນອອກ ໃຫ້ກົດອອກວຽກ
 * (ສຽງເວົ້າພາສາລາວ "ຢ່າລືມກົດອອກວຽກ" — ເຄື່ອງທີ່ປິດສຽງເວົ້າໄດ້ສຽງທຳມະດາ). ref "checkout:<date>" ກັນເຕືອນຊ້ຳ
 */
const remindCheckout = async (today) => {
    const open = await attendance_1.default.findAll({
        where: { work_date: today, status: workCalendar_1.PRESENT, check_in: { [sequelize_1.Op.ne]: null }, check_out: null },
        attributes: ["employee_id"],
        raw: true,
    });
    const ids = [...new Set(open.map((a) => Number(a.employee_id)))];
    if (!ids.length)
        return;
    const ref = `checkout:${today}`;
    const [people, sent] = await Promise.all([
        employee_1.default.findAll({ attributes: ["_uuid", "start_date", "end_date", "work_status"], where: { _uuid: { [sequelize_1.Op.in]: ids }, work_status: workCalendar_1.WORKING } }),
        notification_1.default.findAll({ where: { ref, employee_id: { [sequelize_1.Op.in]: ids } }, attributes: ["employee_id"], raw: true }),
    ]);
    const already = new Set(sent.map((n) => Number(n.employee_id)));
    await (0, notificationController_1.notify)(people
        .filter((e) => (0, workCalendar_1.employedOn)(e, today) && !already.has(e._uuid))
        .map((e) => ({
        employee_id: e._uuid,
        type: "attendance",
        ref,
        title: "ຮອດເວລາເລີກວຽກແລ້ວ ⏰",
        body: "ຢ່າລືມກົດອອກວຽກເດີ ເພື່ອບັນທຶກການເຂົ້າ-ອອກວຽກ",
        push: true,
        voice: "checkout",
    })));
};
/**
 * ກວດທຸກນາທີ ທຽບກັບເວລາເລີກວຽກຂອງບໍລິສັດ (HR ປ່ຽນເວລາ = ໃຊ້ເວລາໃໝ່ທັນທີ) — ເອີ້ນເທື່ອດຽວຕອນເປີດ server (App.ts)
 */
const scheduleCheckoutReminders = () => {
    let doneFor = "";
    const tick = async () => {
        const now = (0, workCalendar_1.nowLao)();
        const today = now.format("YYYY-MM-DD");
        if (doneFor === today)
            return;
        const { end } = (0, workCalendar_1.workRulesOf)(await (0, workCalendar_1.findCompany)());
        const past = (0, workCalendar_1.minutesOf)(now.format("HH:mm")) - (0, workCalendar_1.minutesOf)(end);
        if (past < 0)
            return;
        doneFor = today;
        if (past <= LATE_LIMIT)
            await remindCheckout(today);
    };
    const run = () => tick().catch((error) => console.error("❌ checkout reminders:", error));
    run();
    setInterval(run, 60 * 1000);
};
exports.scheduleCheckoutReminders = scheduleCheckoutReminders;
