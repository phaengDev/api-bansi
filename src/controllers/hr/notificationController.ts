import { EventEmitter } from "events";
import { Request, Response } from "express";
import moment from "moment";
import { Op, col, fn, where } from "sequelize";
import Notification from "../../models/notification";
import Employee from "../../models/employee";
import { actorOf, decodeId, sendError } from "../bansi/bansiHelpers";
import { selfEmployee } from "./attendanceController";
import { WORKING, employedOn, todayLao } from "./workCalendar";

/**
 * ແຈ້ງເຕືອນ (ກະດິ່ງຢູ່ຫົວໜ້າຫຼັກຂອງ app ມືຖື):
 * - GET /notification/me — ແຈ້ງເຕືອນຂອງຕົນເອງ (ໃໝ່ສຸດກ່ອນ) + unread
 * - GET /notification/me/stream — Server-Sent Events: ສົ່ງແຈ້ງເຕືອນໃໝ່ໃຫ້ app ທັນທີທີ່ສ້າງ (ບໍ່ຕ້ອງລໍຖ້າ app ກວດເອງ)
 * - PUT /notification/me/read — ໝາຍວ່າອ່ານແລ້ວທັງໝົດ; PUT /notification/me/read/:id — ອ່ານແລ້ວອັນດຽວ
 * - POST /notification/announce { title, body } — HR ແຈ້ງການໃຫ້ພະນັກງານທຸກຄົນ (ເຊັ່ນ ແຈ້ງພັກແບບບໍ່ເປັນທາງການ)
 * ສ່ວນອື່ນຂອງລະບົບເອີ້ນ notify() / notifyAllWorking() ເມື່ອມີເຫດການ (ໂອນເງິນເດືອນ, ອະນຸມັດລາພັກ, ວັນພັກໃໝ່, ອວຍພອນ)
 */

const MAX_LIST = 100;
/** ສົ່ງ comment ທຸກ 25 ວິ ກັນ proxy / ເຄືອຂ່າຍມືຖືຕັດການເຊື່ອມຕໍ່ທີ່ງຽບ */
const PING_MS = 25_000;

/**
 * ຊ່ອງທາງແຈ້ງເຕືອນທັນທີ (ໃນ process ດຽວ) — event = employee_id. notify() ປ່ອຍ event ຫຼັງບັນທຶກລົງ DB,
 * /notification/me/stream ຂອງພະນັກງານຄົນນັ້ນ (ທຸກເຄື່ອງທີ່ເປີດແອັບຢູ່) ສົ່ງຕໍ່ໃຫ້ app
 */
const hub = new EventEmitter();
hub.setMaxListeners(0);

const presentOf = (row: any) => {
  const n = row?.get ? row.get({ plain: true }) : row;
  return { _uuid: n._uuid, type: n.type, title: n.title, body: n.body, ref: n.ref, is_new: !n.read_at, createdAt: n.createdAt };
};

export type NotifyInput = {
  employee_id: number;
  type: string;
  title: string;
  body?: string | null;
  ref?: string | null;
  createdbyid?: number | null;
};

/** ສ້າງແຈ້ງເຕືອນ — ບໍ່ສຳເລັດ ແຄ່ບັນທຶກ log (ບໍ່ໃຫ້ວຽກຫຼັກ ເຊັ່ນ ຈ່າຍເງິນເດືອນ ລົ້ມເພາະແຈ້ງເຕືອນ) */
export const notify = async (items: NotifyInput[]) => {
  if (!items.length) return;
  try {
    const rows = await Notification.bulkCreate(
      items.map((x) => ({
        employee_id: x.employee_id,
        type: x.type,
        title: x.title.slice(0, 150),
        body: x.body ? x.body.slice(0, 1000) : null,
        ref: x.ref ? x.ref.slice(0, 100) : null,
        createdbyid: x.createdbyid ?? null,
      })),
    );
    for (const row of rows) hub.emit(String(row.employee_id), presentOf(row));
  } catch (error) {
    console.error("❌ notify:", error);
  }
};

/** ແຈ້ງພະນັກງານທຸກຄົນທີ່ຍັງເຮັດວຽກຢູ່ມື້ນີ້ */
export const notifyAllWorking = async (input: Omit<NotifyInput, "employee_id">) => {
  try {
    const today = todayLao();
    const people = await Employee.findAll({
      attributes: ["_uuid", "start_date", "end_date", "work_status"],
      where: { work_status: WORKING },
    });
    await notify(people.filter((e) => employedOn(e, today)).map((e) => ({ ...input, employee_id: e._uuid })));
  } catch (error) {
    console.error("❌ notifyAllWorking:", error);
  }
};

/** "MM-DD" ທີ່ນັບເປັນວັນເກີດມື້ນີ້ (ຄືກັບ birthdayController — ເກີດ 29 ກຸມພາ ປີທີ່ບໍ່ມີ ນັບວັນທີ 28) */
const birthdayKeys = (today: string) => {
  const day = moment(today, "YYYY-MM-DD");
  const key = day.format("MM-DD");
  return key === "02-28" && !day.isLeapYear() ? [key, "02-29"] : [key];
};

/**
 * ແຈ້ງເຕືອນວັນເກີດຂອງມື້ນີ້ — ສ້າງຕອນພະນັກງານເປີດເບິ່ງ (ບໍ່ຕ້ອງມີ cron). ref ກັນສ້າງຊ້ຳ:
 * ວັນເກີດເພື່ອນ "birthday:<id>:<date>", ວັນເກີດຕົນເອງ "birthday:me:<date>"
 */
const ensureBirthdayNotifications = async (me: Employee) => {
  const today = todayLao();
  const people = await Employee.findAll({
    attributes: ["_uuid", "first_name", "last_name", "start_date", "end_date", "work_status"],
    where: {
      work_status: WORKING,
      [Op.and]: [where(fn("DATE_FORMAT", col("Employee.birthday"), "%m-%d"), { [Op.in]: birthdayKeys(today) })],
    },
  });
  const wanted = people
    .filter((e) => employedOn(e, today))
    .map((e) =>
      e._uuid === me._uuid
        ? { ref: `birthday:me:${today}`, title: "ສຸກສັນວັນເກີດ 🎂", body: "ຂໍໃຫ້ມີສຸຂະພາບແຂງແຮງ ແລະ ມີຄວາມສຸກຫຼາຍໆໃນວັນພິເສດນີ້" }
        : {
            ref: `birthday:${e._uuid}:${today}`,
            title: `ມື້ນີ້ວັນເກີດຂອງ ${[e.first_name, e.last_name].filter(Boolean).join(" ")} 🎉`,
            body: "ສົ່ງຄຳອວຍພອນໃຫ້ເພື່ອນຮ່ວມງານໄດ້ທີ່ໜ້າຫຼັກ",
          },
    );
  if (!wanted.length) return;
  const have = await Notification.findAll({
    where: { employee_id: me._uuid, ref: { [Op.in]: wanted.map((w) => w.ref) } },
    attributes: ["ref"],
    raw: true,
  });
  const exists = new Set(have.map((n: any) => String(n.ref)));
  await notify(wanted.filter((w) => !exists.has(w.ref)).map((w) => ({ ...w, employee_id: me._uuid, type: "birthday" })));
};

/** GET /notification/me — data (ໃໝ່ສຸດກ່ອນ ບໍ່ເກີນ 100) + unread */
export const getMyNotifications = async (req: Request, res: Response) => {
  try {
    const self = await selfEmployee(req);
    if ("code" in self) {
      res.status(self.code).json({ message: self.message });
      return;
    }
    const me = self.employee;
    await ensureBirthdayNotifications(me);
    const [rows, unread] = await Promise.all([
      Notification.findAll({
        where: { employee_id: me._uuid },
        attributes: ["_uuid", "type", "title", "body", "ref", "read_at", "createdAt"],
        order: [["createdAt", "DESC"], ["_uuid", "DESC"]],
        limit: MAX_LIST,
      }),
      Notification.count({ where: { employee_id: me._uuid, read_at: null } }),
    ]);
    res.status(200).json({ data: rows.map(presentOf), unread });
  } catch (error) {
    sendError(res, error, "Error getting notifications");
  }
};

/**
 * GET /notification/me/stream — Server-Sent Events. ແຕ່ລະແຈ້ງເຕືອນໃໝ່ = `event: notification` + data ເປັນ JSON
 * (ໂຄງດຽວກັບແຖວຂອງ GET /notification/me). app ເຊື່ອມຕໍ່ໃໝ່ເອງເມື່ອຫຼຸດ
 */
export const streamMyNotifications = async (req: Request, res: Response) => {
  try {
    const self = await selfEmployee(req);
    if ("code" in self) {
      res.status(self.code).json({ message: self.message });
      return;
    }
    const key = String(self.employee._uuid);
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // nginx: ບໍ່ເກັບ buffer
    });
    res.write(": connected\n\n");
    const send = (data: unknown) => res.write(`event: notification\ndata: ${JSON.stringify(data)}\n\n`);
    const ping = setInterval(() => res.write(": ping\n\n"), PING_MS);
    hub.on(key, send);
    req.on("close", () => {
      clearInterval(ping);
      hub.off(key, send);
    });
  } catch (error) {
    if (!res.headersSent) sendError(res, error, "Error streaming notifications");
  }
};

/** PUT /notification/me/read — ອ່ານແລ້ວທັງໝົດ */
export const readAllMyNotifications = async (req: Request, res: Response) => {
  try {
    const self = await selfEmployee(req);
    if ("code" in self) {
      res.status(self.code).json({ message: self.message });
      return;
    }
    await Notification.update({ read_at: new Date() }, { where: { employee_id: self.employee._uuid, read_at: null }, silent: true });
    res.status(200).json({ message: "ອ່ານແລ້ວທັງໝົດ" });
  } catch (error) {
    sendError(res, error, "Error reading notifications");
  }
};

/** PUT /notification/me/read/:id — ອ່ານແລ້ວອັນດຽວ (ສະເພາະຂອງຕົນເອງ) */
export const readMyNotification = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const self = await selfEmployee(req);
    if ("code" in self) {
      res.status(self.code).json({ message: self.message });
      return;
    }
    const id = Number(decodeId(req));
    if (Number.isInteger(id) && id > 0) {
      await Notification.update({ read_at: new Date() }, { where: { _uuid: id, employee_id: self.employee._uuid, read_at: null }, silent: true });
    }
    res.status(200).json({ message: "ອ່ານແລ້ວ" });
  } catch (error) {
    sendError(res, error, "Error reading notification");
  }
};

/** POST /notification/announce { title, body } — HR ແຈ້ງການໃຫ້ພະນັກງານທຸກຄົນທີ່ຍັງເຮັດວຽກຢູ່ */
export const announce = async (req: Request, res: Response) => {
  try {
    const title = String(req.body?.title ?? "").trim();
    const body = String(req.body?.body ?? "").trim();
    if (!title) {
      res.status(400).json({ message: "ກະລຸນາປ້ອນຫົວຂໍ້ແຈ້ງການ" });
      return;
    }
    if (title.length > 150) {
      res.status(400).json({ message: "ຫົວຂໍ້ຍາວໄດ້ບໍ່ເກີນ 150 ຕົວອັກສອນ" });
      return;
    }
    if (body.length > 1000) {
      res.status(400).json({ message: "ເນື້ອໃນຍາວໄດ້ບໍ່ເກີນ 1000 ຕົວອັກສອນ" });
      return;
    }
    await notifyAllWorking({ type: "announcement", title, body: body || null, createdbyid: Number(actorOf(req)) || null });
    res.status(200).json({ message: "ສົ່ງແຈ້ງການໃຫ້ພະນັກງານທຸກຄົນແລ້ວ" });
  } catch (error) {
    sendError(res, error, "Error sending announcement");
  }
};
