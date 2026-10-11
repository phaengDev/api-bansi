"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTypeInexpOption = exports.deleteTypeInexp = exports.updateTypeInexp = exports.createTypeInexp = exports.getTypeInexp = void 0;
const utils_1 = require("../../utils");
const typeIncomeModel_1 = __importDefault(require("../../models/typeIncomeModel"));
const getTypeInexp = async (req, res) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
        const skip = req.query.skip ? parseInt(req.query.skip, 10) : 0;
        const orderBy = req.query.orderBy || "_uuid";
        const order = (req.query.order || "ASC").toUpperCase();
        const typestatus = req.params.id;
        const { rows, count } = await typeIncomeModel_1.default.findAndCountAll({
            where: { typestatus: typestatus },
            limit,
            offset: skip,
            order: [[orderBy, order]],
        });
        res.status(200).json({
            data: rows,
            total: count,
            limit,
            skip,
            orderBy,
            order
        });
    }
    catch (error) {
        res.status(500).json({ message: "Error getting typeinexp", error });
    }
};
exports.getTypeInexp = getTypeInexp;
// =========create typeinexp
const createTypeInexp = async (req, res) => {
    try {
        const newid = await (0, utils_1.maxid)(typeIncomeModel_1.default, '_uuid');
        if (!req.body.createdAt) {
            req.body.createdAt = new Date();
        }
        req.body._uuid = newid;
        const typeinexp = await typeIncomeModel_1.default.create(req.body);
        if (!typeinexp) {
            res.status(400).json({ message: "Error creating typeinexp" });
            return;
        }
        res.status(200).json({ message: "Successfully creating typeinexp", data: typeinexp });
    }
    catch (error) {
        res.status(500).json({ message: "Error creating typeinexp", error });
    }
};
exports.createTypeInexp = createTypeInexp;
// ============ update typeinexp
const updateTypeInexp = async (req, res) => {
    try {
        const id = atob(req.params.id);
        const typeinexp = await typeIncomeModel_1.default.findByPk(id);
        if (!typeinexp) {
            res.status(404).json({ message: "typeinexp not found" });
            return;
        }
        // ໃຊ້ instance.update — FinanceCategories.update() ບໍ່ມີ where ຈະແກ້ທຸກແຖວ
        await typeinexp.update(req.body);
        res.status(200).json({
            message: "Successfully updating typeinexp",
            data: typeinexp
        });
    }
    catch (error) {
        res.status(500).json({ message: "Error updating typeinexp", error });
    }
};
exports.updateTypeInexp = updateTypeInexp;
// ========= delete typeinexp
const deleteTypeInexp = async (req, res) => {
    try {
        const id = atob(req.params.id);
        const typeinexp = await typeIncomeModel_1.default.findByPk(id);
        if (!typeinexp) {
            res.status(404).json({ message: 'TypeInexp not found' });
            return;
        }
        await typeinexp.destroy();
        res.status(200).json({
            message: 'Successfully deleted typeinexp',
        });
    }
    catch (error) {
        console.error('Delete typeinexp error:', error);
        res.status(500).json({
            message: 'Error deleting typeinexp',
            error,
        });
    }
};
exports.deleteTypeInexp = deleteTypeInexp;
// ========== get typeinexp by id
const getTypeInexpOption = async (req, res) => {
    try {
        const typestatus = req.params.id;
        const typeinexp = await typeIncomeModel_1.default.findAll({
            where: { typestatus: typestatus, status: 1 },
        });
        if (!typeinexp) {
            res.status(404).json({ message: "typeinexp not found" });
            return;
        }
        res.status(200).json({ message: "Successfully fetching typeinexp", data: typeinexp });
    }
    catch (error) {
        res.status(500).json({ message: "Error fetching typeinexp", error });
    }
};
exports.getTypeInexpOption = getTypeInexpOption;
