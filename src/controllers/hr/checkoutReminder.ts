import { Op } from "sequelize";
import Attendance from "../../models/attendance";
import Employee from "../../models/employee";
import Notification from "../../models/notification";
import { notify } from "./notificationController";
import { PRESENT, WORKING, employedOn, findCompany, minutesOf, nowLao, workRulesOf } from "./workCalendar";

/** ເປີດ server ຊ້າກວ່າເວລາເລີກວຽກເກີນນີ້ (ນາທີ) = ບໍ່ເຕືອນຍ້ອນຫຼັງ */
const LATE_LIMIT = 60;

/**
 * ຮອດເວລາເລີກວຽກ (work_end ຂອງບໍລິສັດ) — ເຕືອນຄົນທີ່ສະແກນເຂົ້າມື້ນີ້ແລ້ວ ແຕ່ຍັງບໍ່ໄດ້ສະແກນອອກ ໃຫ້ກົດອອກວຽກ
 * (ສຽງເວົ້າພາສາລາວ "ຢ່າລືມກົດອອກວຽກ" — ເຄື່ອງທີ່ປິດສຽງເວົ້າໄດ້ສຽງທຳມະດາ). ref "checkout:<date>" ກັນເຕືອນຊ້ຳ
 */
const remindCheckout = async (today: string) => {
  const open = await Attendance.findAll({
    where: { work_date: today, status: PRESENT, check_in: { [Op.ne]: null }, check_out: null },
    attributes: ["employee_id"],
    raw: true,
  });
  const ids = [...new Set(open.map((a) => Number(a.employee_id)))];
  if (!ids.length) return;
  const ref = `checkout:${today}`;
  const [people, sent] = await Promise.all([
    Employee.findAll({ attributes: ["_uuid", "start_date", "end_date", "work_status"], where: { _uuid: { [Op.in]: ids }, work_status: WORKING } }),
    Notification.findAll({ where: { ref, employee_id: { [Op.in]: ids } }, attributes: ["employee_id"], raw: true }),
  ]);
  const already = new Set((sent as any[]).map((n) => Number(n.employee_id)));
  await notify(
    people
      .filter((e) => employedOn(e, today) && !already.has(e._uuid))
      .map((e) => ({
        employee_id: e._uuid,
        type: "attendance",
        ref,
        title: "ຮອດເວລາເລີກວຽກແລ້ວ ⏰",
        body: "ຢ່າລືມກົດອອກວຽກເດີ ເພື່ອບັນທຶກການເຂົ້າ-ອອກວຽກ",
        push: true,
        voice: "checkout" as const,
      })),
  );
};

/**
 * ກວດທຸກນາທີ ທຽບກັບເວລາເລີກວຽກຂອງບໍລິສັດ (HR ປ່ຽນເວລາ = ໃຊ້ເວລາໃໝ່ທັນທີ) — ເອີ້ນເທື່ອດຽວຕອນເປີດ server (App.ts)
 */
export const scheduleCheckoutReminders = () => {
  let doneFor = "";
  const tick = async () => {
    const now = nowLao();
    const today = now.format("YYYY-MM-DD");
    if (doneFor === today) return;
    const { end } = workRulesOf(await findCompany());
    const past = minutesOf(now.format("HH:mm")) - minutesOf(end);
    if (past < 0) return;
    doneFor = today;
    if (past <= LATE_LIMIT) await remindCheckout(today);
  };
  const run = () => tick().catch((error) => console.error("❌ checkout reminders:", error));
  run();
  setInterval(run, 60 * 1000);
};
