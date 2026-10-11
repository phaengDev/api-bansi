import { Request, Response } from "express";
import moment from "moment";
import { Op, col, fn, where } from "sequelize";
import BirthdayWish from "../../models/birthdayWish";
import Employee from "../../models/employee";
import Department from "../../models/department";
import Position from "../../models/position";
import { sendError } from "../bansi/bansiHelpers";
import { profileUrl } from "./hrHelpers";
import { selfEmployee } from "./attendanceController";
import { WORKING, employedOn, todayLao } from "./workCalendar";

/**
 * ວັນເກີດຂອງພະນັກງານ (app ມືຖື — token ຂອງພະນັກງານ):
 * - GET /birthday/me — ເພື່ອນຮ່ວມງານທີ່ມີວັນເກີດມື້ນີ້ (ອວຍພອນແລ້ວບໍ່) + ວັນເກີດຂອງຕົນເອງ / ຄຳອວຍພອນໃໝ່ທີ່ຍັງບໍ່ເປີດເບິ່ງ
 * - POST /birthday/me/wish — ສົ່ງຄຳອວຍພອນ (ສະເພາະຄົນທີ່ມີວັນເກີດມື້ນີ້, ສົ່ງຊ້ຳ = ແກ້ຂໍ້ຄວາມ)
 * - GET /birthday/me/wishes — ຄຳອວຍພອນທີ່ຕົນເອງໄດ້ຮັບ (ເປີດເບິ່ງ = ໝາຍວ່າອ່ານແລ້ວ)
 * ວັນທີທັງໝົດເປັນເວລາລາວ
 */

const MAX_MESSAGE = 500;
const MAX_WISHES = 500;

const personInclude = [
  { model: Department, as: "department", attributes: ["_uuid", "depart_name"] },
  { model: Position, as: "position", attributes: ["_uuid", "position_name"] },
];

const personAttributes = ["_uuid", "emp_code", "first_name", "last_name", "profile", "birthday", "start_date", "end_date", "work_status"];

const personOf = (row: any) => {
  const e = row?.get ? row.get({ plain: true }) : row;
  if (!e) return null;
  return {
    _uuid: e._uuid,
    emp_code: e.emp_code,
    first_name: e.first_name,
    last_name: e.last_name,
    profile_url: profileUrl(e.profile),
    department: e.department ?? null,
    position: e.position ?? null,
  };
};

const fullName = (e: { first_name?: string | null; last_name?: string | null }) =>
  [e.first_name, e.last_name].filter(Boolean).join(" ");

/** "MM-DD" ທີ່ນັບເປັນວັນເກີດມື້ນີ້ — ເກີດ 29 ກຸມພາ: ປີທີ່ບໍ່ມີ 29 ກຸມພາ ນັບວັນທີ 28 */
const birthdayKeys = (today: string) => {
  const day = moment(today, "YYYY-MM-DD");
  const key = day.format("MM-DD");
  return key === "02-28" && !day.isLeapYear() ? [key, "02-29"] : [key];
};

const isBirthday = (birthday: string | null | undefined, today: string) =>
  !!birthday && birthdayKeys(today).includes(String(birthday).slice(5, 10));

/** ພະນັກງານທີ່ຍັງເຮັດວຽກຢູ່ ແລະ ມີວັນເກີດມື້ນີ້ */
const birthdaysOn = async (today: string) => {
  const rows = await Employee.findAll({
    attributes: personAttributes,
    include: personInclude,
    where: {
      work_status: WORKING,
      [Op.and]: [where(fn("DATE_FORMAT", col("Employee.birthday"), "%m-%d"), { [Op.in]: birthdayKeys(today) })],
    },
    order: [["first_name", "ASC"]],
  });
  return rows.filter((e) => employedOn(e, today));
};

/**
 * GET /birthday/me — data: ເພື່ອນທີ່ມີວັນເກີດມື້ນີ້ (ບໍ່ລວມຕົນເອງ) ພ້ອມ wished / my_message / wish_count;
 * me: birthday_today, received_today (ຄົນອວຍພອນມື້ນີ້), unread (ຄຳອວຍພອນທີ່ຍັງບໍ່ເປີດເບິ່ງ), latest (ໃໝ່ສຸດທີ່ຍັງບໍ່ເປີດ)
 */
export const getMyBirthdays = async (req: Request, res: Response) => {
  try {
    const self = await selfEmployee(req);
    if ("code" in self) {
      res.status(self.code).json({ message: self.message });
      return;
    }
    const me = self.employee;
    const today = todayLao();
    const people = (await birthdaysOn(today)).filter((e) => e._uuid !== me._uuid);
    const ids = people.map((e) => e._uuid);

    const [sent, counts, unread, latest, receivedToday] = await Promise.all([
      ids.length
        ? BirthdayWish.findAll({
            where: { sender_id: me._uuid, wish_date: today, employee_id: { [Op.in]: ids } },
            attributes: ["employee_id", "message"],
            raw: true,
          })
        : Promise.resolve([] as any[]),
      ids.length
        ? BirthdayWish.findAll({
            where: { wish_date: today, employee_id: { [Op.in]: ids } },
            attributes: ["employee_id", [fn("COUNT", col("_uuid")), "total"]],
            group: ["employee_id"],
            raw: true,
          })
        : Promise.resolve([] as any[]),
      BirthdayWish.count({ where: { employee_id: me._uuid, read_at: null } }),
      BirthdayWish.findOne({
        where: { employee_id: me._uuid, read_at: null },
        include: [{ model: Employee, as: "sender", attributes: ["_uuid", "first_name", "last_name"] }],
        order: [["updatedAt", "DESC"]],
      }),
      BirthdayWish.count({ where: { employee_id: me._uuid, wish_date: today } }),
    ]);

    const sentBy = new Map((sent as any[]).map((w) => [Number(w.employee_id), String(w.message)]));
    const countBy = new Map((counts as any[]).map((c) => [Number(c.employee_id), Number(c.total) || 0]));
    const latestRow: any = latest?.get({ plain: true });

    res.status(200).json({
      today,
      data: people.map((e) => ({
        ...personOf(e),
        wished: sentBy.has(e._uuid),
        my_message: sentBy.get(e._uuid) ?? null,
        wish_count: countBy.get(e._uuid) ?? 0,
      })),
      me: {
        birthday_today: isBirthday(me.birthday, today),
        received_today: receivedToday,
        unread,
        latest: latestRow
          ? { sender_name: latestRow.sender ? fullName(latestRow.sender) : null, message: latestRow.message }
          : null,
      },
    });
  } catch (error) {
    sendError(res, error, "Error getting birthdays");
  }
};

/** POST /birthday/me/wish { employee_id, message } — ອວຍພອນເພື່ອນທີ່ມີວັນເກີດມື້ນີ້ (ສົ່ງຊ້ຳ = ແກ້ຂໍ້ຄວາມ, ແຈ້ງເຈົ້າຂອງວັນເກີດຄືນໃໝ່) */
export const sendBirthdayWish = async (req: Request, res: Response) => {
  try {
    const self = await selfEmployee(req);
    if ("code" in self) {
      res.status(self.code).json({ message: self.message });
      return;
    }
    const me = self.employee;
    const body = req.body || {};
    const targetId = Number(body.employee_id);
    const message = String(body.message ?? "").trim();
    const fail = (text: string) => res.status(400).json({ message: text });

    if (!Number.isInteger(targetId) || targetId <= 0) return fail("ກະລຸນາເລືອກພະນັກງານ");
    if (targetId === me._uuid) return fail("ສົ່ງຄຳອວຍພອນໃຫ້ຕົນເອງບໍ່ໄດ້");
    if (!message) return fail("ກະລຸນາປ້ອນຄຳອວຍພອນ");
    if (message.length > MAX_MESSAGE) return fail(`ຄຳອວຍພອນຍາວໄດ້ບໍ່ເກີນ ${MAX_MESSAGE} ຕົວອັກສອນ`);

    const today = todayLao();
    const target = await Employee.findByPk(targetId, { attributes: personAttributes });
    if (!target || Number(target.work_status) !== WORKING || !employedOn(target, today)) {
      res.status(404).json({ message: "ບໍ່ພົບພະນັກງານ" });
      return;
    }
    if (!isBirthday(target.birthday, today)) {
      return fail(`ມື້ນີ້ບໍ່ແມ່ນວັນເກີດຂອງ ${fullName(target)} — ສົ່ງຄຳອວຍພອນໄດ້ສະເພາະມື້ວັນເກີດ`);
    }

    const existing = await BirthdayWish.findOne({ where: { employee_id: targetId, sender_id: me._uuid, wish_date: today } });
    const data = existing
      ? await existing.update({ message, read_at: null, updatedAt: new Date() })
      : await BirthdayWish.create({ employee_id: targetId, sender_id: me._uuid, wish_date: today, message });
    res.status(200).json({
      message: existing ? "ແກ້ໄຂຄຳອວຍພອນແລ້ວ" : `ສົ່ງຄຳອວຍພອນໃຫ້ ${fullName(target)} ແລ້ວ`,
      data,
    });
  } catch (error) {
    sendError(res, error, "Error sending birthday wish");
  }
};

/** GET /birthday/me/wishes — ຄຳອວຍພອນທີ່ໄດ້ຮັບ (ວັນເກີດລ່າສຸດກ່ອນ); is_new = ຍັງບໍ່ເຄີຍເປີດເບິ່ງ — ເປີດແລ້ວໝາຍວ່າອ່ານທັງໝົດ */
export const getMyBirthdayWishes = async (req: Request, res: Response) => {
  try {
    const self = await selfEmployee(req);
    if ("code" in self) {
      res.status(self.code).json({ message: self.message });
      return;
    }
    const me = self.employee;
    const rows = await BirthdayWish.findAll({
      where: { employee_id: me._uuid },
      include: [{ model: Employee, as: "sender", attributes: personAttributes, include: personInclude }],
      order: [["wish_date", "DESC"], ["updatedAt", "DESC"]],
      limit: MAX_WISHES,
    });
    const data = rows.map((row) => {
      const w: any = row.get({ plain: true });
      return {
        _uuid: w._uuid,
        wish_date: w.wish_date,
        message: w.message,
        is_new: !w.read_at,
        createdAt: w.createdAt,
        updatedAt: w.updatedAt,
        sender: personOf(w.sender),
      };
    });
    await BirthdayWish.update({ read_at: new Date() }, { where: { employee_id: me._uuid, read_at: null } });
    res.status(200).json({ data, total: data.length });
  } catch (error) {
    sendError(res, error, "Error getting birthday wishes");
  }
};
