"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerDeviceToken = exports.announce = exports.readMyNotification = exports.readAllMyNotifications = exports.streamMyNotifications = exports.getMyNotifications = exports.scheduleBirthdayNotifications = exports.notifyAllWorking = exports.notify = void 0;
const events_1 = require("events");
const moment_1 = __importDefault(require("moment"));
const sequelize_1 = require("sequelize");
const notification_1 = __importDefault(require("../../models/notification"));
const employee_1 = __importDefault(require("../../models/employee"));
const deviceToken_1 = __importDefault(require("../../models/deviceToken"));
const push_1 = require("../../utils/push");
const bansiHelpers_1 = require("../bansi/bansiHelpers");
const attendanceController_1 = require("./attendanceController");
const workCalendar_1 = require("./workCalendar");
/**
 * ແຈ້ງເຕືອນ (ກະດິ່ງຢູ່ຫົວໜ້າຫຼັກຂອງ app ມືຖື):
 * - GET /notification/me — ແຈ້ງເຕືອນຂອງຕົນເອງ (ໃໝ່ສຸດກ່ອນ) + unread
 * - GET /notification/me/stream — Server-Sent Events: ສົ່ງແຈ້ງເຕືອນໃໝ່ໃຫ້ app ທັນທີທີ່ສ້າງ (ບໍ່ຕ້ອງລໍຖ້າ app ກວດເອງ)
 * - PUT /notification/me/read — ໝາຍວ່າອ່ານແລ້ວທັງໝົດ; PUT /notification/me/read/:id — ອ່ານແລ້ວອັນດຽວ
 * - POST /notification/announce { title, body } — HR ແຈ້ງການໃຫ້ພະນັກງານທຸກຄົນ (ເຊັ່ນ ແຈ້ງພັກແບບບໍ່ເປັນທາງການ)
 * - POST /app/device-token { token, platform } — ເຄື່ອງຮັບແຈ້ງເຕືອນເດັ້ງຂຶ້ນຈໍ (FCM); ອອກຈາກລະບົບ app ລຶບ token ໃນເຄື່ອງ
 *   → FCM ຕອບວ່າ token ໃຊ້ບໍ່ໄດ້ ແລ້ວ utils/push ລຶບອອກເອງ
 * ສ່ວນອື່ນຂອງລະບົບເອີ້ນ notify() / notifyAllWorking() ເມື່ອມີເຫດການ (ໂອນເງິນເດືອນ, ອະນຸມັດລາພັກ, ວັນພັກໃໝ່, ອວຍພອນ).
 * push: true = ສົ່ງເດັ້ງຂຶ້ນຈໍມືຖືນຳ (ແອັບປິດຢູ່ກໍ່ເຫັນ): ເງິນເດືອນ, ຜົນຄຳຂໍລາ, ພັກບໍ່ເປັນທາງການ, ວັນເກີດ
 */
const MAX_LIST = 100;
/** ສົ່ງ comment ທຸກ 25 ວິ ກັນ proxy / ເຄືອຂ່າຍມືຖືຕັດການເຊື່ອມຕໍ່ທີ່ງຽບ */
const PING_MS = 25000;
/**
 * ຊ່ອງທາງແຈ້ງເຕືອນທັນທີ (ໃນ process ດຽວ) — event = employee_id. notify() ປ່ອຍ event ຫຼັງບັນທຶກລົງ DB,
 * /notification/me/stream ຂອງພະນັກງານຄົນນັ້ນ (ທຸກເຄື່ອງທີ່ເປີດແອັບຢູ່) ສົ່ງຕໍ່ໃຫ້ app
 */
const hub = new events_1.EventEmitter();
hub.setMaxListeners(0);
const presentOf = (row) => {
    const n = row?.get ? row.get({ plain: true }) : row;
    return { _uuid: n._uuid, type: n.type, title: n.title, body: n.body, ref: n.ref, is_new: !n.read_at, createdAt: n.createdAt };
};
/** ສ້າງແຈ້ງເຕືອນ — ບໍ່ສຳເລັດ ແຄ່ບັນທຶກ log (ບໍ່ໃຫ້ວຽກຫຼັກ ເຊັ່ນ ຈ່າຍເງິນເດືອນ ລົ້ມເພາະແຈ້ງເຕືອນ) */
const notify = async (items) => {
    if (!items.length)
        return;
    try {
        const rows = await notification_1.default.bulkCreate(items.map((x) => ({
            employee_id: x.employee_id,
            type: x.type,
            title: x.title.slice(0, 150),
            body: x.body ? x.body.slice(0, 1000) : null,
            ref: x.ref ? x.ref.slice(0, 100) : null,
            createdbyid: x.createdbyid ?? null,
        })));
        // push: app ທີ່ເປີດຢູ່ສະແດງແຈ້ງເຕືອນນີ້ເດັ້ງຂຶ້ນຈໍແລ້ວ (Firebase) — ບໍ່ຕ້ອງ toast ຊ້ຳ
        rows.forEach((row, index) => hub.emit(String(row.employee_id), { ...presentOf(row), push: !!items[index].push }));
        // ບໍ່ await — ການສົ່ງຫາ Firebase ບໍ່ໃຫ້ວຽກຫຼັກ (ເຊັ່ນ ຈ່າຍເງິນເດືອນ) ລໍຖ້າ; bulkCreate ຄືນແຖວຕາມລຳດັບ items
        void (0, push_1.sendPush)(rows.flatMap((row, index) => (items[index].push ? [{
                employee_id: Number(row.employee_id),
                title: row.title,
                body: row.body,
                data: { id: String(row._uuid), type: row.type, ref: row.ref ?? "" },
                voice: items[index].voice,
            }] : [])));
    }
    catch (error) {
        console.error("❌ notify:", error);
    }
};
exports.notify = notify;
/** ແຈ້ງພະນັກງານທຸກຄົນທີ່ຍັງເຮັດວຽກຢູ່ມື້ນີ້ */
const notifyAllWorking = async (input) => {
    try {
        const today = (0, workCalendar_1.todayLao)();
        const people = await employee_1.default.findAll({
            attributes: ["_uuid", "start_date", "end_date", "work_status"],
            where: { work_status: workCalendar_1.WORKING },
        });
        await (0, exports.notify)(people.filter((e) => (0, workCalendar_1.employedOn)(e, today)).map((e) => ({ ...input, employee_id: e._uuid })));
    }
    catch (error) {
        console.error("❌ notifyAllWorking:", error);
    }
};
exports.notifyAllWorking = notifyAllWorking;
/** "MM-DD" ທີ່ນັບເປັນວັນເກີດມື້ນີ້ (ຄືກັບ birthdayController — ເກີດ 29 ກຸມພາ ປີທີ່ບໍ່ມີ ນັບວັນທີ 28) */
const birthdayKeys = (today) => {
    const day = (0, moment_1.default)(today, "YYYY-MM-DD");
    const key = day.format("MM-DD");
    return key === "02-28" && !day.isLeapYear() ? [key, "02-29"] : [key];
};
/**
 * ແຈ້ງເຕືອນວັນເກີດຂອງມື້ນີ້ໃຫ້ recipients — ເອີ້ນຈາກ scheduleBirthdayNotifications (ທຸກຄົນ ທຸກມື້ 08:00, ເດັ້ງຂຶ້ນຈໍ)
 * ແລະ ຕອນພະນັກງານເປີດເບິ່ງແຈ້ງເຕືອນ (ກໍລະນີເປີດກ່ອນ 08:00 / server ປິດຢູ່). ref ກັນສ້າງຊ້ຳ:
 * ວັນເກີດເພື່ອນ "birthday:<id>:<date>", ວັນເກີດຕົນເອງ "birthday:me:<date>"
 */
const notifyBirthdays = async (recipients) => {
    if (!recipients.length)
        return;
    const today = (0, workCalendar_1.todayLao)();
    const people = await employee_1.default.findAll({
        attributes: ["_uuid", "first_name", "last_name", "start_date", "end_date", "work_status"],
        where: {
            work_status: workCalendar_1.WORKING,
            [sequelize_1.Op.and]: [(0, sequelize_1.where)((0, sequelize_1.fn)("DATE_FORMAT", (0, sequelize_1.col)("Employee.birthday"), "%m-%d"), { [sequelize_1.Op.in]: birthdayKeys(today) })],
        },
    });
    const born = people.filter((e) => (0, workCalendar_1.employedOn)(e, today));
    if (!born.length)
        return;
    const wanted = recipients.flatMap((me) => born.map((e) => ({
        employee_id: me._uuid,
        ...(e._uuid === me._uuid
            ? { ref: `birthday:me:${today}`, title: "ສຸກສັນວັນເກີດ 🎂", body: "ຂໍໃຫ້ມີສຸຂະພາບແຂງແຮງ ແລະ ມີຄວາມສຸກຫຼາຍໆໃນວັນພິເສດນີ້" }
            : {
                ref: `birthday:${e._uuid}:${today}`,
                title: `ມື້ນີ້ວັນເກີດຂອງ ${[e.first_name, e.last_name].filter(Boolean).join(" ")} 🎉`,
                body: "ສົ່ງຄຳອວຍພອນໃຫ້ເພື່ອນຮ່ວມງານໄດ້ທີ່ໜ້າຫຼັກ",
            }),
    })));
    const have = await notification_1.default.findAll({
        where: { employee_id: { [sequelize_1.Op.in]: recipients.map((r) => r._uuid) }, ref: { [sequelize_1.Op.in]: [...new Set(wanted.map((w) => w.ref))] } },
        attributes: ["employee_id", "ref"],
        raw: true,
    });
    const exists = new Set(have.map((n) => `${n.employee_id}|${n.ref}`));
    await (0, exports.notify)(wanted.filter((w) => !exists.has(`${w.employee_id}|${w.ref}`)).map((w) => ({ ...w, type: "birthday", push: true })));
};
/** ເວລາແຈ້ງວັນເກີດປະຈຳວັນ (ເວລາລາວ) */
const BIRTHDAY_HOUR = 8;
/** ແຈ້ງວັນເກີດຂອງມື້ນີ້ໃຫ້ພະນັກງານທຸກຄົນທີ່ຍັງເຮັດວຽກຢູ່ */
const notifyTodaysBirthdays = async () => {
    const today = (0, workCalendar_1.todayLao)();
    const people = await employee_1.default.findAll({ attributes: ["_uuid", "start_date", "end_date", "work_status"], where: { work_status: workCalendar_1.WORKING } });
    await notifyBirthdays(people.filter((e) => (0, workCalendar_1.employedOn)(e, today)));
};
/**
 * ຕັ້ງເວລາແຈ້ງວັນເກີດທຸກມື້ 08:00 (ເວລາລາວ) — ເອີ້ນເທື່ອດຽວຕອນເປີດ server (App.ts). ເປີດ server ຫຼັງ 08:00
 * = ແຈ້ງຂອງມື້ນີ້ທັນທີ (ref ກັນຊ້ຳ ເປີດຄືນຫຼາຍເທື່ອກໍ່ບໍ່ສົ່ງຊ້ຳ)
 */
const scheduleBirthdayNotifications = () => {
    const run = () => notifyTodaysBirthdays().catch((error) => console.error("❌ birthday notifications:", error));
    const next = () => {
        const now = (0, workCalendar_1.nowLao)();
        const at = now.clone().startOf("day").hour(BIRTHDAY_HOUR);
        if (!at.isAfter(now))
            at.add(1, "day");
        setTimeout(() => {
            run();
            next();
        }, at.diff(now));
    };
    if ((0, workCalendar_1.nowLao)().hour() >= BIRTHDAY_HOUR)
        run();
    next();
};
exports.scheduleBirthdayNotifications = scheduleBirthdayNotifications;
/** GET /notification/me — data (ໃໝ່ສຸດກ່ອນ ບໍ່ເກີນ 100) + unread */
const getMyNotifications = async (req, res) => {
    try {
        const self = await (0, attendanceController_1.selfEmployee)(req);
        if ("code" in self) {
            res.status(self.code).json({ message: self.message });
            return;
        }
        const me = self.employee;
        await notifyBirthdays([me]);
        const [rows, unread] = await Promise.all([
            notification_1.default.findAll({
                where: { employee_id: me._uuid },
                attributes: ["_uuid", "type", "title", "body", "ref", "read_at", "createdAt"],
                order: [["createdAt", "DESC"], ["_uuid", "DESC"]],
                limit: MAX_LIST,
            }),
            notification_1.default.count({ where: { employee_id: me._uuid, read_at: null } }),
        ]);
        res.status(200).json({ data: rows.map(presentOf), unread });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting notifications");
    }
};
exports.getMyNotifications = getMyNotifications;
/**
 * GET /notification/me/stream — Server-Sent Events. ແຕ່ລະແຈ້ງເຕືອນໃໝ່ = `event: notification` + data ເປັນ JSON
 * (ໂຄງດຽວກັບແຖວຂອງ GET /notification/me + push = ສົ່ງເດັ້ງຂຶ້ນຈໍນຳ). app ເຊື່ອມຕໍ່ໃໝ່ເອງເມື່ອຫຼຸດ
 */
const streamMyNotifications = async (req, res) => {
    try {
        const self = await (0, attendanceController_1.selfEmployee)(req);
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
        const send = (data) => res.write(`event: notification\ndata: ${JSON.stringify(data)}\n\n`);
        const ping = setInterval(() => res.write(": ping\n\n"), PING_MS);
        hub.on(key, send);
        req.on("close", () => {
            clearInterval(ping);
            hub.off(key, send);
        });
    }
    catch (error) {
        if (!res.headersSent)
            (0, bansiHelpers_1.sendError)(res, error, "Error streaming notifications");
    }
};
exports.streamMyNotifications = streamMyNotifications;
/** PUT /notification/me/read — ອ່ານແລ້ວທັງໝົດ */
const readAllMyNotifications = async (req, res) => {
    try {
        const self = await (0, attendanceController_1.selfEmployee)(req);
        if ("code" in self) {
            res.status(self.code).json({ message: self.message });
            return;
        }
        await notification_1.default.update({ read_at: new Date() }, { where: { employee_id: self.employee._uuid, read_at: null }, silent: true });
        res.status(200).json({ message: "ອ່ານແລ້ວທັງໝົດ" });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error reading notifications");
    }
};
exports.readAllMyNotifications = readAllMyNotifications;
/** PUT /notification/me/read/:id — ອ່ານແລ້ວອັນດຽວ (ສະເພາະຂອງຕົນເອງ) */
const readMyNotification = async (req, res) => {
    try {
        const self = await (0, attendanceController_1.selfEmployee)(req);
        if ("code" in self) {
            res.status(self.code).json({ message: self.message });
            return;
        }
        const id = Number((0, bansiHelpers_1.decodeId)(req));
        if (Number.isInteger(id) && id > 0) {
            await notification_1.default.update({ read_at: new Date() }, { where: { _uuid: id, employee_id: self.employee._uuid, read_at: null }, silent: true });
        }
        res.status(200).json({ message: "ອ່ານແລ້ວ" });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error reading notification");
    }
};
exports.readMyNotification = readMyNotification;
/** POST /notification/announce { title, body } — HR ແຈ້ງການໃຫ້ພະນັກງານທຸກຄົນທີ່ຍັງເຮັດວຽກຢູ່ */
const announce = async (req, res) => {
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
        await (0, exports.notifyAllWorking)({ type: "announcement", title, body: body || null, createdbyid: Number((0, bansiHelpers_1.actorOf)(req)) || null });
        res.status(200).json({ message: "ສົ່ງແຈ້ງການໃຫ້ພະນັກງານທຸກຄົນແລ້ວ" });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error sending announcement");
    }
};
exports.announce = announce;
/**
 * POST /app/device-token { token, platform: "android" | "ios", voice: 1 | 0 } — ລົງທະບຽນເຄື່ອງຮັບແຈ້ງເຕືອນເດັ້ງຂຶ້ນຈໍ (FCM token).
 * app ເອີ້ນທຸກເທື່ອທີ່ເຂົ້າລະບົບ / ເປີດແອັບ / token ປ່ຽນ / ເປີດ-ປິດສຽງເວົ້າ; token ຂອງຄົນອື່ນ (ເຄື່ອງດຽວກັນ ປ່ຽນຄົນເຂົ້າລະບົບ)
 * = ຍ້າຍມາຫາຄົນນີ້. ແອັບລຸ້ນເກົ່າບໍ່ສົ່ງ voice = ເປີດ
 */
const registerDeviceToken = async (req, res) => {
    try {
        const self = await (0, attendanceController_1.selfEmployee)(req);
        if ("code" in self) {
            res.status(self.code).json({ message: self.message });
            return;
        }
        const token = String(req.body?.token ?? "").trim();
        if (!token || token.length > 255) {
            res.status(400).json({ message: "token ບໍ່ຖືກຕ້ອງ" });
            return;
        }
        const platform = ["android", "ios"].includes(String(req.body?.platform)) ? String(req.body.platform) : null;
        const voice = ["0", "false"].includes(String(req.body?.voice)) ? 0 : 1;
        const [row, created] = await deviceToken_1.default.findOrCreate({ where: { token }, defaults: { employee_id: self.employee._uuid, platform, voice } });
        if (!created)
            await row.update({ employee_id: self.employee._uuid, platform, voice, updatedAt: new Date() });
        res.status(200).json({ message: "ລົງທະບຽນເຄື່ອງຮັບແຈ້ງເຕືອນແລ້ວ" });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error registering device token");
    }
};
exports.registerDeviceToken = registerDeviceToken;
