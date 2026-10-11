"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTypeAcountOption = exports.getTypeAcount = exports.deleteTypeAcount = exports.updateTypeAcount = exports.createTypeAcount = void 0;
const utils_1 = require("../../utils");
const typeAcount_1 = __importDefault(require("../../models/typeAcount"));
// create typeAcount
const createTypeAcount = async (req, res) => {
    try {
        if (!req.body.createdAt) {
            req.body.createdAt = new Date();
        }
        const newid = await (0, utils_1.maxid)(typeAcount_1.default, "_uuid");
        req.body._uuid = newid;
        const typeAcount = await typeAcount_1.default.create(req.body);
        res.status(200).json({ message: "Successfully creating typeAcount", typeAcount });
    }
    catch (error) {
        res.status(500).json({ message: "Error creating typeAcount", error });
    }
};
exports.createTypeAcount = createTypeAcount;
// updated typeAcount
const updateTypeAcount = async (req, res) => {
    try {
        if (!req.body.createdAt) {
            req.body.createdAt = new Date();
        }
        const _uuid = atob(req.params.id);
        const typeAcount = await typeAcount_1.default.update(req.body, {
            where: { _uuid: _uuid },
        });
        res.status(200).json({ message: "Successfully updating typeAcount", data: typeAcount });
    }
    catch (error) {
        res.status(500).json({ message: "Error updating typeAcount", error });
    }
};
exports.updateTypeAcount = updateTypeAcount;
// delete typeAcount
const deleteTypeAcount = async (req, res) => {
    try {
        const _uuid = atob(req.params.id);
        const typeAcount = await typeAcount_1.default.destroy({
            where: { _uuid: _uuid },
        });
        res.status(200).json({ message: "Successfully deleting typeAcount", data: typeAcount });
    }
    catch (error) {
        res.status(500).json({ message: "Error deleting typeAcount", error });
    }
};
exports.deleteTypeAcount = deleteTypeAcount;
// get typeAcount
const getTypeAcount = async (req, res) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
        const skip = req.query.skip ? parseInt(req.query.skip, 10) : 0;
        const orderBy = req.query.orderBy || "_uuid";
        const order = (req.query.order || "ASC").toUpperCase();
        const { rows, count } = await typeAcount_1.default.findAndCountAll({
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
        res.status(500).json({ message: "Error getting typeAcount", error });
    }
};
exports.getTypeAcount = getTypeAcount;
// get option
const getTypeAcountOption = async (req, res) => {
    try {
        const typeAcount = await typeAcount_1.default.findAll({
            where: { status: 1 }
        });
        res.json({
            data: typeAcount
        });
    }
    catch (error) {
        console.error("Error in getTypeAcount:", error);
        res.status(500).json({ message: "Error fetching typeAcount", error });
    }
};
exports.getTypeAcountOption = getTypeAcountOption;
