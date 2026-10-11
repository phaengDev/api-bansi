"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBankOption = exports.fetchBank = exports.deleteBank = exports.updateBank = exports.createBank = void 0;
const sequelize_1 = require("sequelize");
const utils_1 = require("../utils");
const bankModel_1 = __importDefault(require("../models/bankModel"));
const uploadFile_1 = require("../utils/uploadFile");
const getUploadFileName = (req) => {
    if (req.file)
        return req.file.filename;
    const files = req.files;
    if (!files)
        return undefined;
    if (Array.isArray(files)) {
        return files[0]?.filename;
    }
    return files.logo?.[0]?.filename || files.logos?.[0]?.filename;
};
// ========== create bank =======
const createBank = async (req, res) => {
    try {
        const new_uuid = await (0, utils_1.maxid)(bankModel_1.default, "_uuid");
        const logo = getUploadFileName(req);
        const bank = await bankModel_1.default.create({
            ...req.body,
            _uuid: new_uuid,
            logo: logo || req.body.logo || "",
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        res.status(200).json({ message: "Bank created successfully", data: bank });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to create bank" });
    }
};
exports.createBank = createBank;
// ========== update bank =======
const updateBank = async (req, res) => {
    try {
        const bank_uuid = atob(req.params.id);
        const bank = await bankModel_1.default.findByPk(bank_uuid);
        if (!bank) {
            return res.status(404).json({ error: "Bank not found" });
        }
        const logo = getUploadFileName(req);
        const payload = {
            ...req.body,
            updatedAt: new Date(),
        };
        if (logo) {
            if (bank.logo) {
                (0, uploadFile_1.deleteFile)("logo", bank.logo);
            }
            payload.logo = logo;
        }
        else {
            delete payload.logo;
        }
        const [updated] = await bankModel_1.default.update(payload, {
            where: { _uuid: bank_uuid },
        });
        if (!updated)
            return res.status(404).json({ error: "Bank not found" });
        const updatedBank = await bankModel_1.default.findByPk(bank_uuid);
        res.status(200).json({ message: "Bank updated successfully", data: updatedBank });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to update bank" });
    }
};
exports.updateBank = updateBank;
// ========== delete bank =======
const deleteBank = async (req, res) => {
    try {
        const bank_uuid = atob(req.params.id);
        const bank = await bankModel_1.default.findByPk(bank_uuid);
        if (!bank) {
            return res.status(404).json({ error: "Bank not found" });
        }
        if (bank.logo) {
            (0, uploadFile_1.deleteFile)("logo", bank.logo);
        }
        const deleted = await bankModel_1.default.destroy({
            where: { _uuid: bank_uuid },
        });
        if (!deleted)
            return res.status(404).json({ error: "Bank not found" });
        res.status(200).json({ message: "Bank deleted successfully", data: deleted });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to delete bank" });
    }
};
exports.deleteBank = deleteBank;
// ========== fetch bank =======
const fetchBank = async (req, res) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
        const skip = req.query.skip ? parseInt(req.query.skip, 10) : 0;
        const orderBy = req.query.orderBy || "_uuid";
        const order = (req.query.order || "ASC").toUpperCase();
        const { rows, count } = await bankModel_1.default.findAndCountAll({
            where: { status: 1 },
            limit,
            offset: skip,
            order: [[orderBy, order]],
            attributes: {
                include: [
                    [(0, sequelize_1.fn)("CONCAT", (0, sequelize_1.literal)(`'${(0, utils_1.url)()}/logo/'`), (0, sequelize_1.col)("logo")), "url"],
                ],
            },
        });
        res.status(200).json({
            data: rows,
            total: count,
            meta: {
                limit,
                skip,
                orderBy,
                order,
            },
        });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to fetch bank" });
    }
};
exports.fetchBank = fetchBank;
// ========== bank option =======
const getBankOption = async (req, res) => {
    try {
        const bank = await bankModel_1.default.findAll({
            where: { status: 1 },
            attributes: {
                include: [
                    [(0, sequelize_1.fn)("CONCAT", (0, sequelize_1.literal)(`'${(0, utils_1.url)()}/logo/'`), (0, sequelize_1.col)("logo")), "url"],
                ],
            },
        });
        res.status(200).json({ data: bank });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to fetch bank" });
    }
};
exports.getBankOption = getBankOption;
