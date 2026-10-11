"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWorkPlanByDate = exports.getWorkPlanById = exports.fetchWorkPlan = exports.deleteWorkPlan = exports.doneWorkPlan = exports.updateWorkPlan = exports.createWorkPlan = void 0;
const sequelize_1 = require("sequelize");
const utils_1 = require("../utils");
const workPlanModel_1 = __importDefault(require("../models/workPlanModel"));
const userModel_1 = __importDefault(require("../models/userModel"));
// ແປງວັນທີທີ່ຮັບມາ (DD/MM/YYYY, YYYY-MM-DD ຫຼື ISO) ໃຫ້ເປັນ YYYY-MM-DD
const toDateOnly = (value) => {
    if (!value)
        return null;
    if (value instanceof Date) {
        if (isNaN(value.getTime()))
            return null;
        return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
    }
    const text = String(value).trim();
    if (!text)
        return null;
    // DD/MM/YYYY (ຮູບແບບທີ່ frontend ສົ່ງມາຜ່ານ axios interceptor)
    const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slash) {
        const [, day, month, year] = slash;
        return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
    // YYYY-MM-DD ຫຼື ISO string
    const dash = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (dash) {
        const [, year, month, day] = dash;
        return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
    const parsed = new Date(text);
    if (isNaN(parsed.getTime()))
        return null;
    return toDateOnly(parsed);
};
// ດຶງ userid ຈາກ body ຫຼືຈາກ token ຖ້າບໍ່ໄດ້ສົ່ງມາ
const getUserId = (req) => {
    const fromBody = Number(req.body?.userid);
    if (fromBody)
        return fromBody;
    const fromToken = Number(req.user?.sub);
    return fromToken || 0;
};
const ownerInclude = [
    {
        model: userModel_1.default,
        as: "user",
        attributes: ["user_uuid", "user_name", "phones"],
        required: false,
    },
];
// ========== create work plan =======
const createWorkPlan = async (req, res) => {
    try {
        const userid = getUserId(req);
        const title = String(req.body?.title ?? "").trim();
        const startDate = toDateOnly(req.body?.start_date);
        const endDate = toDateOnly(req.body?.end_date) || startDate;
        if (!userid) {
            return res.status(400).json({ error: "userid is required" });
        }
        if (!title) {
            return res.status(400).json({ error: "title is required" });
        }
        if (!startDate || !endDate) {
            return res.status(400).json({ error: "start_date and end_date are required" });
        }
        if (startDate > endDate) {
            return res.status(400).json({ error: "start_date must be before end_date" });
        }
        const new_uuid = await (0, utils_1.maxid)(workPlanModel_1.default, "_uuid");
        const workPlan = await workPlanModel_1.default.create({
            _uuid: new_uuid,
            userid,
            title,
            note: String(req.body?.note ?? "").trim(),
            start_date: startDate,
            end_date: endDate,
            done: Number(req.body?.done) ? 1 : 0,
            status: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        res.status(200).json({ message: "Work plan created successfully", data: workPlan });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to create work plan" });
    }
};
exports.createWorkPlan = createWorkPlan;
// ========== update work plan =======
const updateWorkPlan = async (req, res) => {
    try {
        const uuid = atob(req.params.id);
        const workPlan = await workPlanModel_1.default.findByPk(uuid);
        if (!workPlan || workPlan.status !== 1) {
            return res.status(404).json({ error: "Work plan not found" });
        }
        const payload = { updatedAt: new Date() };
        if (req.body?.title !== undefined) {
            const title = String(req.body.title).trim();
            if (!title)
                return res.status(400).json({ error: "title is required" });
            payload.title = title;
        }
        if (req.body?.note !== undefined)
            payload.note = String(req.body.note ?? "").trim();
        if (req.body?.done !== undefined)
            payload.done = Number(req.body.done) ? 1 : 0;
        if (req.body?.start_date !== undefined) {
            const startDate = toDateOnly(req.body.start_date);
            if (!startDate)
                return res.status(400).json({ error: "start_date is invalid" });
            payload.start_date = startDate;
        }
        if (req.body?.end_date !== undefined) {
            const endDate = toDateOnly(req.body.end_date);
            if (!endDate)
                return res.status(400).json({ error: "end_date is invalid" });
            payload.end_date = endDate;
        }
        const nextStart = payload.start_date || workPlan.start_date;
        const nextEnd = payload.end_date || workPlan.end_date;
        if (nextStart > nextEnd) {
            return res.status(400).json({ error: "start_date must be before end_date" });
        }
        await workPlanModel_1.default.update(payload, { where: { _uuid: uuid } });
        const updatedWorkPlan = await workPlanModel_1.default.findByPk(uuid);
        res.status(200).json({ message: "Work plan updated successfully", data: updatedWorkPlan });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to update work plan" });
    }
};
exports.updateWorkPlan = updateWorkPlan;
// ========== ໝາຍວ່າສຳເລັດ / ເປີດຄືນ =======
const doneWorkPlan = async (req, res) => {
    try {
        const uuid = atob(req.params.id);
        const workPlan = await workPlanModel_1.default.findByPk(uuid);
        if (!workPlan || workPlan.status !== 1) {
            return res.status(404).json({ error: "Work plan not found" });
        }
        const done = req.body?.done !== undefined
            ? (Number(req.body.done) ? 1 : 0)
            : (workPlan.done ? 0 : 1);
        await workPlanModel_1.default.update({ done, updatedAt: new Date() }, { where: { _uuid: uuid } });
        const updatedWorkPlan = await workPlanModel_1.default.findByPk(uuid);
        res.status(200).json({ message: "Work plan updated successfully", data: updatedWorkPlan });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to update work plan" });
    }
};
exports.doneWorkPlan = doneWorkPlan;
// ========== delete work plan (soft delete) =======
const deleteWorkPlan = async (req, res) => {
    try {
        const uuid = atob(req.params.id);
        const workPlan = await workPlanModel_1.default.findByPk(uuid);
        if (!workPlan || workPlan.status !== 1) {
            return res.status(404).json({ error: "Work plan not found" });
        }
        const [deleted] = await workPlanModel_1.default.update({ status: 0, updatedAt: new Date() }, { where: { _uuid: uuid } });
        if (!deleted)
            return res.status(404).json({ error: "Work plan not found" });
        res.status(200).json({ message: "Work plan deleted successfully", data: deleted });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to delete work plan" });
    }
};
exports.deleteWorkPlan = deleteWorkPlan;
// ========== fetch work plan =======
// POST /workplan/fetch  body: { userid, start_date, end_date, done, search }
const fetchWorkPlan = async (req, res) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 500;
        const skip = req.query.skip ? parseInt(req.query.skip, 10) : 0;
        const orderBy = req.query.orderBy || "start_date";
        const order = (req.query.order || "ASC").toUpperCase();
        const whereCondition = { status: 1 };
        const userid = getUserId(req);
        if (userid)
            whereCondition.userid = userid;
        if (req.body?.done !== undefined && req.body?.done !== null && req.body?.done !== "") {
            whereCondition.done = Number(req.body.done) ? 1 : 0;
        }
        if (req.body?.search) {
            const search = `%${String(req.body.search).trim()}%`;
            whereCondition[sequelize_1.Op.or] = [
                { title: { [sequelize_1.Op.like]: search } },
                { note: { [sequelize_1.Op.like]: search } },
            ];
        }
        // ຊ່ວງວັນທີ: ເອົາແຜນວຽກທີ່ຊ້ອນທັບກັບຊ່ວງທີ່ຖາມມາ
        const startDate = toDateOnly(req.body?.start_date);
        const endDate = toDateOnly(req.body?.end_date);
        if (startDate)
            whereCondition.end_date = { [sequelize_1.Op.gte]: startDate };
        if (endDate)
            whereCondition.start_date = { [sequelize_1.Op.lte]: endDate };
        const { rows, count } = await workPlanModel_1.default.findAndCountAll({
            where: whereCondition,
            include: ownerInclude,
            limit,
            offset: skip,
            order: [[orderBy, order], ["_uuid", "ASC"]],
        });
        res.status(200).json({
            data: rows,
            total: count,
            limit,
            skip,
            meta: { limit, skip, orderBy, order },
        });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to fetch work plan" });
    }
};
exports.fetchWorkPlan = fetchWorkPlan;
// ========== fetch work plan by id =======
const getWorkPlanById = async (req, res) => {
    try {
        const uuid = atob(req.params.id);
        const workPlan = await workPlanModel_1.default.findOne({
            where: { _uuid: uuid, status: 1 },
            include: ownerInclude,
        });
        if (!workPlan) {
            return res.status(404).json({ error: "Work plan not found" });
        }
        res.status(200).json({ data: workPlan });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to fetch work plan" });
    }
};
exports.getWorkPlanById = getWorkPlanById;
// ========== ແຜນວຽກຂອງວັນໃດວັນໜຶ່ງ =======
// GET /workplan/date/:id  (id = base64 ຂອງວັນທີ ເຊັ່ນ btoa('2026-08-25'))
const getWorkPlanByDate = async (req, res) => {
    try {
        const dateKey = toDateOnly(atob(req.params.id));
        if (!dateKey) {
            return res.status(400).json({ error: "date is invalid" });
        }
        const whereCondition = {
            status: 1,
            start_date: { [sequelize_1.Op.lte]: dateKey },
            end_date: { [sequelize_1.Op.gte]: dateKey },
        };
        const userid = getUserId(req);
        if (userid)
            whereCondition.userid = userid;
        const workPlans = await workPlanModel_1.default.findAll({
            where: whereCondition,
            include: ownerInclude,
            order: [["createdAt", "ASC"]],
        });
        res.status(200).json({ data: workPlans, total: workPlans.length });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to fetch work plan" });
    }
};
exports.getWorkPlanByDate = getWorkPlanByDate;
