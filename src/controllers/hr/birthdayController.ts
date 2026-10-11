import { Request, Response } from "express";
import moment from "moment";
import { Op, col, fn, where } from "sequelize";
import BirthdayWish from "../../models/birthdayWish";
import Employee from "../../models/employee";
import Department from "../../models/department";
import Position from "../../models/position";
import { decodeId, sendError } from "../bansi/bansiHelpers";
import { profileUrl } from "./hrHelpers";
import { selfEmployee } from "./attendanceController";
import { notify } from "./notificationController";
import { WORKING, employedOn, todayLao } from "./workCalendar";

/**
 * ວັນເກີດຂອງພະນັກງານ (app ມືຖື — token ຂອງພະນັກງານ):
 * - GET /birthday/me — ເພື່ອນຮ່ວມງານທີ່ມີວັນເກີດມື້ນີ້ (ອວຍພອນແລ້ວບໍ່) + ວັນເກີດຂອງຕົນເອງ / ຄຳອວຍພອນໃໝ່ທີ່ຍັງບໍ່ເປີດເບິ່ງ
 * - POST /birthday/me/wish — ສົ່ງຄຳອວຍພອນ (ສະເພາະຄົນທີ່ມີວັນເກີດມື້ນີ້, ສົ່ງຊ້ຳ = ແກ້ຂໍ້ຄວາມ)
 * - GET /birthday/me/wishes — ຄຳອວຍພອນທີ່ຕົນເອງໄດ້ຮັບ (ເປີດເບິ່ງ = ໝາຍວ່າອ່ານແລ້ວ)
 * - POST /birthday/me/wishes/:id/reply — ເຈົ້າຂອງວັນເກີດຕອບກັບຄຳອວຍພອນ (ຕອບຊ້ຳ = ແກ້ຂໍ້ຄວາມ)
 * - GET /birthday/me/replies — ຄຳຕອບກັບທີ່ຕົນເອງໄດ້ຮັບ ຈາກຄົນທີ່ເຄີຍອວຍພອນ (ເປີດເບິ່ງ = ໝາຍວ່າອ່ານແລ້ວ)
 * ວັນທີທັງໝົດເປັນເວລາລາວ
 */

const MAX_MESSAGE = 500;
const MAX_WISHES = 500;
const MAX_REPLY = 500;

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

/** ຄຳອວຍພອນທີ່ຂ້ອຍສົ່ງ ແລະ ເຈົ້າຂອງວັນເກີດຕອບກັບແລ້ວ ແຕ່ຂ້ອຍຍັງບໍ່ເປີດເບິ່ງ */
const unreadReplies = (me: number) => ({ sender_id: me, reply: { [Op.ne]: null }, reply_read_at: null });

/**
 * GET /birthday/me — data: ເພື່ອນທີ່ມີວັນເກີດມື້ນີ້ (ບໍ່ລວມຕົນເອງ) ພ້ອມ wished / my_message / reply / wish_count;
 * me: birthday_today, received_today (ຄົນອວຍພອນມື້ນີ້), unread (ຄຳອວຍພອນທີ່ຍັງບໍ່ເປີດເບິ່ງ), latest (ໃໝ່ສຸດທີ່ຍັງບໍ່ເປີດ),
 * reply_unread (ຄຳຕອບກັບທີ່ຍັງບໍ່ເປີດເບິ່ງ), latest_reply (ໃໝ່ສຸດທີ່ຍັງບໍ່ເປີດ)
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

    const [sent, counts, unread, latest, receivedToday, replyUnread, latestReply] = await Promise.all([
      ids.length
        ? BirthdayWish.findAll({
            where: { sender_id: me._uuid, wish_date: today, employee_id: { [Op.in]: ids } },
            attributes: ["employee_id", "message", "reply"],
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
      BirthdayWish.count({ where: unreadReplies(me._uuid) }),
      BirthdayWish.findOne({
        where: unreadReplies(me._uuid),
        include: [{ model: Employee, as: "employee", attributes: ["_uuid", "first_name", "last_name"] }],
        order: [["replied_at", "DESC"]],
      }),
    ]);

    const sentBy = new Map((sent as any[]).map((w) => [Number(w.employee_id), w]));
    const countBy = new Map((counts as any[]).map((c) => [Number(c.employee_id), Number(c.total) || 0]));
    const latestRow: any = latest?.get({ plain: true });
    const latestReplyRow: any = latestReply?.get({ plain: true });

    res.status(200).json({
      today,
      data: people.map((e) => ({
        ...personOf(e),
        wished: sentBy.has(e._uuid),
        my_message: sentBy.get(e._uuid)?.message ?? null,
        reply: sentBy.get(e._uuid)?.reply ?? null,
        wish_count: countBy.get(e._uuid) ?? 0,
      })),
      me: {
        birthday_today: isBirthday(me.birthday, today),
        received_today: receivedToday,
        unread,
        latest: latestRow
          ? { sender_name: latestRow.sender ? fullName(latestRow.sender) : null, message: latestRow.message }
          : null,
        reply_unread: replyUnread,
        latest_reply: latestReplyRow
          ? { from_name: latestReplyRow.employee ? fullName(latestReplyRow.employee) : null, message: latestReplyRow.reply }
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
    // ແຈ້ງເຈົ້າຂອງວັນເກີດ ສະເພາະຄຳອວຍພອນໃໝ່ (ແກ້ຂໍ້ຄວາມ ບໍ່ແຈ້ງຊ້ຳ)
    if (!existing) {
      await notify([{ employee_id: targetId, type: "birthday_wish", title: `${fullName(me)} ອວຍພອນວັນເກີດທ່ານ 🎁`, body: message, ref: `wish:${data._uuid}` }]);
    }
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
        reply: w.reply ?? null,
        replied_at: w.replied_at ?? null,
        sender: personOf(w.sender),
      };
    });
    await BirthdayWish.update({ read_at: new Date() }, { where: { employee_id: me._uuid, read_at: null } });
    res.status(200).json({ data, total: data.length });
  } catch (error) {
    sendError(res, error, "Error getting birthday wishes");
  }
};

/**
 * POST /birthday/me/wishes/:id/reply { message } — ເຈົ້າຂອງວັນເກີດຕອບກັບຄຳອວຍພອນທີ່ໄດ້ຮັບ
 * (ຕອບໄດ້ທຸກເວລາ ບໍ່ຈຳກັດມື້ວັນເກີດ; ຕອບຊ້ຳ = ແກ້ຂໍ້ຄວາມ ແລະ ແຈ້ງຜູ້ອວຍພອນຄືນໃໝ່)
 */
export const replyBirthdayWish = async (req: Request, res: Response) => {
  try {
    const self = await selfEmployee(req);
    if ("code" in self) {
      res.status(self.code).json({ message: self.message });
      return;
    }
    const me = self.employee;
    const id = Number(decodeId(req as Request<{ id: string }>)); // app ສົ່ງ id ເປັນ base64 ຄື API ອື່ນ
    const message = String(req.body?.message ?? "").trim();
    const fail = (text: string) => res.status(400).json({ message: text });

    if (!message) return fail("ກະລຸນາປ້ອນຂໍ້ຄວາມຕອບກັບ");
    if (message.length > MAX_REPLY) return fail(`ຂໍ້ຄວາມຕອບກັບຍາວໄດ້ບໍ່ເກີນ ${MAX_REPLY} ຕົວອັກສອນ`);

    // ຕອບໄດ້ສະເພາະຄຳອວຍພອນທີ່ສົ່ງຫາຕົນເອງ
    const wish = Number.isInteger(id) && id > 0 ? await BirthdayWish.findOne({ where: { _uuid: id, employee_id: me._uuid } }) : null;
    if (!wish) {
      res.status(404).json({ message: "ບໍ່ພົບຄຳອວຍພອນ" });
      return;
    }
    const editing = !!wish.reply;
    // silent: ບໍ່ແຕະ updatedAt — ມັນເປັນເວລາທີ່ຜູ້ອວຍພອນສົ່ງ/ແກ້ຄຳອວຍພອນ
    await wish.update({ reply: message, replied_at: new Date(), reply_read_at: null }, { silent: true });
    // ແຈ້ງຜູ້ອວຍພອນ ສະເພາະຄຳຕອບໃໝ່ (ແກ້ຂໍ້ຄວາມ ບໍ່ແຈ້ງຊ້ຳ)
    if (!editing) {
      await notify([{ employee_id: wish.sender_id, type: "birthday_reply", title: `${fullName(me)} ຕອບກັບຄຳອວຍພອນຂອງທ່ານ 💬`, body: message, ref: `wish:${wish._uuid}` }]);
    }
    res.status(200).json({ message: editing ? "ແກ້ໄຂຄຳຕອບກັບແລ້ວ" : "ຕອບກັບແລ້ວ", data: wish });
  } catch (error) {
    sendError(res, error, "Error replying birthday wish");
  }
};

/** GET /birthday/me/replies — ຄຳອວຍພອນທີ່ຂ້ອຍສົ່ງ ແລະ ເຈົ້າຂອງວັນເກີດຕອບກັບແລ້ວ (ຕອບລ່າສຸດກ່ອນ); is_new = ຍັງບໍ່ເຄີຍເປີດເບິ່ງ */
export const getMyBirthdayReplies = async (req: Request, res: Response) => {
  try {
    const self = await selfEmployee(req);
    if ("code" in self) {
      res.status(self.code).json({ message: self.message });
      return;
    }
    const me = self.employee;
    const rows = await BirthdayWish.findAll({
      where: { sender_id: me._uuid, reply: { [Op.ne]: null } },
      include: [{ model: Employee, as: "employee", attributes: personAttributes, include: personInclude }],
      order: [["replied_at", "DESC"]],
      limit: MAX_WISHES,
    });
    const data = rows.map((row) => {
      const w: any = row.get({ plain: true });
      return {
        _uuid: w._uuid,
        wish_date: w.wish_date,
        message: w.message,
        reply: w.reply,
        replied_at: w.replied_at,
        is_new: !w.reply_read_at,
        employee: personOf(w.employee),
      };
    });
    await BirthdayWish.update({ reply_read_at: new Date() }, { where: unreadReplies(me._uuid) });
    res.status(200).json({ data, total: data.length });
  } catch (error) {
    sendError(res, error, "Error getting birthday replies");
  }
};
