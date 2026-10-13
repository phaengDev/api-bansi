"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMyBirthdayReplies = exports.replyBirthdayWish = exports.getMyBirthdayWishes = exports.sendBirthdayWish = exports.getBirthdayWall = exports.getMyBirthdays = void 0;
const moment_1 = __importDefault(require("moment"));
const sequelize_1 = require("sequelize");
const birthdayWish_1 = __importDefault(require("../../models/birthdayWish"));
const employee_1 = __importDefault(require("../../models/employee"));
const department_1 = __importDefault(require("../../models/department"));
const position_1 = __importDefault(require("../../models/position"));
const bansiHelpers_1 = require("../bansi/bansiHelpers");
const hrHelpers_1 = require("./hrHelpers");
const attendanceController_1 = require("./attendanceController");
const notificationController_1 = require("./notificationController");
const workCalendar_1 = require("./workCalendar");
/**
 * ວັນເກີດຂອງພະນັກງານ (app ມືຖື — token ຂອງພະນັກງານ):
 * - GET /birthday/me — ເພື່ອນຮ່ວມງານທີ່ມີວັນເກີດມື້ນີ້ (ອວຍພອນແລ້ວບໍ່) + ວັນເກີດຂອງຕົນເອງ / ຄຳອວຍພອນໃໝ່ທີ່ຍັງບໍ່ເປີດເບິ່ງ
 * - POST /birthday/me/wish — ສົ່ງຄຳອວຍພອນ (ສະເພາະຄົນທີ່ມີວັນເກີດມື້ນີ້, ສົ່ງຊ້ຳ = ແກ້ຂໍ້ຄວາມ)
 * - GET /birthday/me/wishes — ຄຳອວຍພອນທີ່ຕົນເອງໄດ້ຮັບ (ເປີດເບິ່ງ = ໝາຍວ່າອ່ານແລ້ວ)
 * - POST /birthday/me/wishes/:id/reply — ເຈົ້າຂອງວັນເກີດຕອບກັບຄຳອວຍພອນ (ຕອບຊ້ຳ = ແກ້ຂໍ້ຄວາມ)
 * - GET /birthday/me/replies — ຄຳຕອບກັບທີ່ຕົນເອງໄດ້ຮັບ ຈາກຄົນທີ່ເຄີຍອວຍພອນ (ເປີດເບິ່ງ = ໝາຍວ່າອ່ານແລ້ວ)
 * - GET /birthday/me/wall?date= — ຄຳອວຍພອນຂອງທີມງານ ຕໍ່ຄົນທີ່ມີວັນເກີດມື້ນັ້ນ (ມື້ນີ້ ຫຼື 7 ມື້ຫຼ້າສຸດ)
 * ວັນທີທັງໝົດເປັນເວລາລາວ
 */
const MAX_MESSAGE = 500;
const MAX_WISHES = 500;
const MAX_REPLY = 500;
const personInclude = [
    { model: department_1.default, as: "department", attributes: ["_uuid", "depart_name"] },
    { model: position_1.default, as: "position", attributes: ["_uuid", "position_name"] },
];
const personAttributes = ["_uuid", "emp_code", "first_name", "last_name", "profile", "birthday", "start_date", "end_date", "work_status"];
const personOf = (row) => {
    const e = row?.get ? row.get({ plain: true }) : row;
    if (!e)
        return null;
    return {
        _uuid: e._uuid,
        emp_code: e.emp_code,
        first_name: e.first_name,
        last_name: e.last_name,
        profile_url: (0, hrHelpers_1.profileUrl)(e.profile),
        department: e.department ?? null,
        position: e.position ?? null,
    };
};
const fullName = (e) => [e.first_name, e.last_name].filter(Boolean).join(" ");
/** "MM-DD" ທີ່ນັບເປັນວັນເກີດມື້ນີ້ — ເກີດ 29 ກຸມພາ: ປີທີ່ບໍ່ມີ 29 ກຸມພາ ນັບວັນທີ 28 */
const birthdayKeys = (today) => {
    const day = (0, moment_1.default)(today, "YYYY-MM-DD");
    const key = day.format("MM-DD");
    return key === "02-28" && !day.isLeapYear() ? [key, "02-29"] : [key];
};
const isBirthday = (birthday, today) => !!birthday && birthdayKeys(today).includes(String(birthday).slice(5, 10));
/** ພະນັກງານທີ່ຍັງເຮັດວຽກຢູ່ ແລະ ມີວັນເກີດມື້ນີ້ */
const birthdaysOn = async (today) => {
    const rows = await employee_1.default.findAll({
        attributes: personAttributes,
        include: personInclude,
        where: {
            work_status: workCalendar_1.WORKING,
            [sequelize_1.Op.and]: [(0, sequelize_1.where)((0, sequelize_1.fn)("DATE_FORMAT", (0, sequelize_1.col)("Employee.birthday"), "%m-%d"), { [sequelize_1.Op.in]: birthdayKeys(today) })],
        },
        order: [["first_name", "ASC"]],
    });
    return rows.filter((e) => (0, workCalendar_1.employedOn)(e, today));
};
/** ຄຳອວຍພອນທີ່ຂ້ອຍສົ່ງ ແລະ ເຈົ້າຂອງວັນເກີດຕອບກັບແລ້ວ ແຕ່ຂ້ອຍຍັງບໍ່ເປີດເບິ່ງ */
const unreadReplies = (me) => ({ sender_id: me, reply: { [sequelize_1.Op.ne]: null }, reply_read_at: null });
/**
 * GET /birthday/me — data: ເພື່ອນທີ່ມີວັນເກີດມື້ນີ້ (ບໍ່ລວມຕົນເອງ) ພ້ອມ wished / my_message / reply / wish_count;
 * me: birthday_today, received_today (ຄົນອວຍພອນມື້ນີ້), unread (ຄຳອວຍພອນທີ່ຍັງບໍ່ເປີດເບິ່ງ), latest (ໃໝ່ສຸດທີ່ຍັງບໍ່ເປີດ),
 * reply_unread (ຄຳຕອບກັບທີ່ຍັງບໍ່ເປີດເບິ່ງ), latest_reply (ໃໝ່ສຸດທີ່ຍັງບໍ່ເປີດ)
 */
const getMyBirthdays = async (req, res) => {
    try {
        const self = await (0, attendanceController_1.selfEmployee)(req);
        if ("code" in self) {
            res.status(self.code).json({ message: self.message });
            return;
        }
        const me = self.employee;
        const today = (0, workCalendar_1.todayLao)();
        const people = (await birthdaysOn(today)).filter((e) => e._uuid !== me._uuid);
        const ids = people.map((e) => e._uuid);
        const [sent, counts, unread, latest, receivedToday, replyUnread, latestReply] = await Promise.all([
            ids.length
                ? birthdayWish_1.default.findAll({
                    where: { sender_id: me._uuid, wish_date: today, employee_id: { [sequelize_1.Op.in]: ids } },
                    attributes: ["employee_id", "message", "reply"],
                    raw: true,
                })
                : Promise.resolve([]),
            ids.length
                ? birthdayWish_1.default.findAll({
                    where: { wish_date: today, employee_id: { [sequelize_1.Op.in]: ids } },
                    attributes: ["employee_id", [(0, sequelize_1.fn)("COUNT", (0, sequelize_1.col)("_uuid")), "total"]],
                    group: ["employee_id"],
                    raw: true,
                })
                : Promise.resolve([]),
            birthdayWish_1.default.count({ where: { employee_id: me._uuid, read_at: null } }),
            birthdayWish_1.default.findOne({
                where: { employee_id: me._uuid, read_at: null },
                include: [{ model: employee_1.default, as: "sender", attributes: ["_uuid", "first_name", "last_name"] }],
                order: [["updatedAt", "DESC"]],
            }),
            birthdayWish_1.default.count({ where: { employee_id: me._uuid, wish_date: today } }),
            birthdayWish_1.default.count({ where: unreadReplies(me._uuid) }),
            birthdayWish_1.default.findOne({
                where: unreadReplies(me._uuid),
                include: [{ model: employee_1.default, as: "employee", attributes: ["_uuid", "first_name", "last_name"] }],
                order: [["replied_at", "DESC"]],
            }),
        ]);
        const sentBy = new Map(sent.map((w) => [Number(w.employee_id), w]));
        const countBy = new Map(counts.map((c) => [Number(c.employee_id), Number(c.total) || 0]));
        const latestRow = latest?.get({ plain: true });
        const latestReplyRow = latestReply?.get({ plain: true });
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
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting birthdays");
    }
};
exports.getMyBirthdays = getMyBirthdays;
/** ເບິ່ງຄຳອວຍພອນຍ້ອນຫຼັງໄດ້ກີ່ມື້ — ສະເພາະວັນເກີດທີ່ແຈ້ງທຸກຄົນແລ້ວ (ບໍ່ໃຫ້ໄລ່ຫາວັນເກີດຂອງທຸກຄົນທີລະມື້) */
const WALL_DAYS = 7;
/**
 * GET /birthday/me/wall?date=YYYY-MM-DD (ບໍ່ສົ່ງ = ມື້ນີ້) — ເພື່ອນທີ່ມີວັນເກີດມື້ນັ້ນ (ລວມຕົນເອງ is_me) ພ້ອມຄຳອວຍພອນ
 * ທັງໝົດຈາກທີມງານ (ຜູ້ສົ່ງ + ຂໍ້ຄວາມ); ຄຳຕອບກັບຂອງເຈົ້າຂອງວັນເກີດ ເຫັນສະເພາະອັນທີ່ຕອບຂ້ອຍ. ໄດ້ສະເພາະ WALL_DAYS ມື້ຫຼ້າສຸດ
 */
const getBirthdayWall = async (req, res) => {
    try {
        const self = await (0, attendanceController_1.selfEmployee)(req);
        if ("code" in self) {
            res.status(self.code).json({ message: self.message });
            return;
        }
        const me = self.employee;
        const today = (0, workCalendar_1.todayLao)();
        const date = String(req.query.date ?? "").trim() || today;
        const oldest = (0, moment_1.default)(today, "YYYY-MM-DD").subtract(WALL_DAYS, "days").format("YYYY-MM-DD");
        if (!(0, moment_1.default)(date, "YYYY-MM-DD", true).isValid() || date > today || date < oldest) {
            res.status(400).json({ message: `ເບິ່ງໄດ້ສະເພາະວັນເກີດ ${WALL_DAYS} ມື້ຫຼ້າສຸດ` });
            return;
        }
        const people = await birthdaysOn(date);
        const ids = people.map((e) => e._uuid);
        const wishes = ids.length
            ? await birthdayWish_1.default.findAll({
                where: { wish_date: date, employee_id: { [sequelize_1.Op.in]: ids } },
                include: [{ model: employee_1.default, as: "sender", attributes: personAttributes, include: personInclude }],
                order: [["createdAt", "ASC"]],
                limit: MAX_WISHES,
            })
            : [];
        const wishesOf = new Map();
        for (const row of wishes) {
            const w = row.get({ plain: true });
            const list = wishesOf.get(Number(w.employee_id)) ?? [];
            list.push(w);
            wishesOf.set(Number(w.employee_id), list);
        }
        res.status(200).json({
            date,
            today,
            data: people.map((e) => {
                const list = wishesOf.get(e._uuid) ?? [];
                const mine = list.find((w) => w.sender_id === me._uuid);
                return {
                    ...personOf(e),
                    is_me: e._uuid === me._uuid,
                    wished: !!mine,
                    my_message: mine?.message ?? null,
                    reply: mine?.reply ?? null,
                    wish_count: list.length,
                    wishes: list.map((w) => ({
                        _uuid: w._uuid,
                        message: w.message,
                        createdAt: w.createdAt,
                        updatedAt: w.updatedAt,
                        is_mine: w.sender_id === me._uuid,
                        reply: w.sender_id === me._uuid ? w.reply ?? null : null,
                        sender: personOf(w.sender),
                    })),
                };
            }),
        });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting birthday wall");
    }
};
exports.getBirthdayWall = getBirthdayWall;
/** POST /birthday/me/wish { employee_id, message } — ອວຍພອນເພື່ອນທີ່ມີວັນເກີດມື້ນີ້ (ສົ່ງຊ້ຳ = ແກ້ຂໍ້ຄວາມ, ແຈ້ງເຈົ້າຂອງວັນເກີດຄືນໃໝ່) */
const sendBirthdayWish = async (req, res) => {
    try {
        const self = await (0, attendanceController_1.selfEmployee)(req);
        if ("code" in self) {
            res.status(self.code).json({ message: self.message });
            return;
        }
        const me = self.employee;
        const body = req.body || {};
        const targetId = Number(body.employee_id);
        const message = String(body.message ?? "").trim();
        const fail = (text) => res.status(400).json({ message: text });
        if (!Number.isInteger(targetId) || targetId <= 0)
            return fail("ກະລຸນາເລືອກພະນັກງານ");
        if (targetId === me._uuid)
            return fail("ສົ່ງຄຳອວຍພອນໃຫ້ຕົນເອງບໍ່ໄດ້");
        if (!message)
            return fail("ກະລຸນາປ້ອນຄຳອວຍພອນ");
        if (message.length > MAX_MESSAGE)
            return fail(`ຄຳອວຍພອນຍາວໄດ້ບໍ່ເກີນ ${MAX_MESSAGE} ຕົວອັກສອນ`);
        const today = (0, workCalendar_1.todayLao)();
        const target = await employee_1.default.findByPk(targetId, { attributes: personAttributes });
        if (!target || Number(target.work_status) !== workCalendar_1.WORKING || !(0, workCalendar_1.employedOn)(target, today)) {
            res.status(404).json({ message: "ບໍ່ພົບພະນັກງານ" });
            return;
        }
        if (!isBirthday(target.birthday, today)) {
            return fail(`ມື້ນີ້ບໍ່ແມ່ນວັນເກີດຂອງ ${fullName(target)} — ສົ່ງຄຳອວຍພອນໄດ້ສະເພາະມື້ວັນເກີດ`);
        }
        const existing = await birthdayWish_1.default.findOne({ where: { employee_id: targetId, sender_id: me._uuid, wish_date: today } });
        const data = existing
            ? await existing.update({ message, read_at: null, updatedAt: new Date() })
            : await birthdayWish_1.default.create({ employee_id: targetId, sender_id: me._uuid, wish_date: today, message });
        // ແຈ້ງເຈົ້າຂອງວັນເກີດ ສະເພາະຄຳອວຍພອນໃໝ່ (ແກ້ຂໍ້ຄວາມ ບໍ່ແຈ້ງຊ້ຳ)
        if (!existing) {
            await (0, notificationController_1.notify)([{ employee_id: targetId, type: "birthday_wish", title: `${fullName(me)} ອວຍພອນວັນເກີດທ່ານ 🎁`, body: message, ref: `wish:${data._uuid}` }]);
        }
        res.status(200).json({
            message: existing ? "ແກ້ໄຂຄຳອວຍພອນແລ້ວ" : `ສົ່ງຄຳອວຍພອນໃຫ້ ${fullName(target)} ແລ້ວ`,
            data,
        });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error sending birthday wish");
    }
};
exports.sendBirthdayWish = sendBirthdayWish;
/** GET /birthday/me/wishes — ຄຳອວຍພອນທີ່ໄດ້ຮັບ (ວັນເກີດລ່າສຸດກ່ອນ); is_new = ຍັງບໍ່ເຄີຍເປີດເບິ່ງ — ເປີດແລ້ວໝາຍວ່າອ່ານທັງໝົດ */
const getMyBirthdayWishes = async (req, res) => {
    try {
        const self = await (0, attendanceController_1.selfEmployee)(req);
        if ("code" in self) {
            res.status(self.code).json({ message: self.message });
            return;
        }
        const me = self.employee;
        const rows = await birthdayWish_1.default.findAll({
            where: { employee_id: me._uuid },
            include: [{ model: employee_1.default, as: "sender", attributes: personAttributes, include: personInclude }],
            order: [["wish_date", "DESC"], ["updatedAt", "DESC"]],
            limit: MAX_WISHES,
        });
        const data = rows.map((row) => {
            const w = row.get({ plain: true });
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
        await birthdayWish_1.default.update({ read_at: new Date() }, { where: { employee_id: me._uuid, read_at: null } });
        res.status(200).json({ data, total: data.length });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting birthday wishes");
    }
};
exports.getMyBirthdayWishes = getMyBirthdayWishes;
/**
 * POST /birthday/me/wishes/:id/reply { message } — ເຈົ້າຂອງວັນເກີດຕອບກັບຄຳອວຍພອນທີ່ໄດ້ຮັບ
 * (ຕອບໄດ້ທຸກເວລາ ບໍ່ຈຳກັດມື້ວັນເກີດ; ຕອບຊ້ຳ = ແກ້ຂໍ້ຄວາມ ແລະ ແຈ້ງຜູ້ອວຍພອນຄືນໃໝ່)
 */
const replyBirthdayWish = async (req, res) => {
    try {
        const self = await (0, attendanceController_1.selfEmployee)(req);
        if ("code" in self) {
            res.status(self.code).json({ message: self.message });
            return;
        }
        const me = self.employee;
        const id = Number((0, bansiHelpers_1.decodeId)(req)); // app ສົ່ງ id ເປັນ base64 ຄື API ອື່ນ
        const message = String(req.body?.message ?? "").trim();
        const fail = (text) => res.status(400).json({ message: text });
        if (!message)
            return fail("ກະລຸນາປ້ອນຂໍ້ຄວາມຕອບກັບ");
        if (message.length > MAX_REPLY)
            return fail(`ຂໍ້ຄວາມຕອບກັບຍາວໄດ້ບໍ່ເກີນ ${MAX_REPLY} ຕົວອັກສອນ`);
        // ຕອບໄດ້ສະເພາະຄຳອວຍພອນທີ່ສົ່ງຫາຕົນເອງ
        const wish = Number.isInteger(id) && id > 0 ? await birthdayWish_1.default.findOne({ where: { _uuid: id, employee_id: me._uuid } }) : null;
        if (!wish) {
            res.status(404).json({ message: "ບໍ່ພົບຄຳອວຍພອນ" });
            return;
        }
        const editing = !!wish.reply;
        // silent: ບໍ່ແຕະ updatedAt — ມັນເປັນເວລາທີ່ຜູ້ອວຍພອນສົ່ງ/ແກ້ຄຳອວຍພອນ
        await wish.update({ reply: message, replied_at: new Date(), reply_read_at: null }, { silent: true });
        // ແຈ້ງຜູ້ອວຍພອນ ສະເພາະຄຳຕອບໃໝ່ (ແກ້ຂໍ້ຄວາມ ບໍ່ແຈ້ງຊ້ຳ)
        if (!editing) {
            await (0, notificationController_1.notify)([{ employee_id: wish.sender_id, type: "birthday_reply", title: `${fullName(me)} ຕອບກັບຄຳອວຍພອນຂອງທ່ານ 💬`, body: message, ref: `wish:${wish._uuid}` }]);
        }
        res.status(200).json({ message: editing ? "ແກ້ໄຂຄຳຕອບກັບແລ້ວ" : "ຕອບກັບແລ້ວ", data: wish });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error replying birthday wish");
    }
};
exports.replyBirthdayWish = replyBirthdayWish;
/** GET /birthday/me/replies — ຄຳອວຍພອນທີ່ຂ້ອຍສົ່ງ ແລະ ເຈົ້າຂອງວັນເກີດຕອບກັບແລ້ວ (ຕອບລ່າສຸດກ່ອນ); is_new = ຍັງບໍ່ເຄີຍເປີດເບິ່ງ */
const getMyBirthdayReplies = async (req, res) => {
    try {
        const self = await (0, attendanceController_1.selfEmployee)(req);
        if ("code" in self) {
            res.status(self.code).json({ message: self.message });
            return;
        }
        const me = self.employee;
        const rows = await birthdayWish_1.default.findAll({
            where: { sender_id: me._uuid, reply: { [sequelize_1.Op.ne]: null } },
            include: [{ model: employee_1.default, as: "employee", attributes: personAttributes, include: personInclude }],
            order: [["replied_at", "DESC"]],
            limit: MAX_WISHES,
        });
        const data = rows.map((row) => {
            const w = row.get({ plain: true });
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
        await birthdayWish_1.default.update({ reply_read_at: new Date() }, { where: unreadReplies(me._uuid) });
        res.status(200).json({ data, total: data.length });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting birthday replies");
    }
};
exports.getMyBirthdayReplies = getMyBirthdayReplies;
