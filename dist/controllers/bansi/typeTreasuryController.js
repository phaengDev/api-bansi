"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTreasurbytype = exports.getTypeTreasurOption = exports.getTypeTreasury = exports.deleteTypeTreasury = exports.updateTypeTreasury = exports.createTypeTreasury = void 0;
const utils_1 = require("../../utils");
const typeTreasury_1 = __importDefault(require("../../models/typeTreasury"));
const currencyModel_1 = __importDefault(require("../../models/currencyModel"));
const typeAcount_1 = __importDefault(require("../../models/typeAcount"));
const treasuryAcount_1 = __importDefault(require("../../models/treasuryAcount"));
const bansiHelpers_1 = require("./bansiHelpers");
// created typeTreasury
const createTypeTreasury = async (req, res) => {
    const transaction = await typeTreasury_1.default.sequelize?.transaction(); // Start transaction
    try {
        const code = await (0, utils_1.maxid)(typeTreasury_1.default, "_uuid");
        req.body._uuid = code;
        const typecode = await (0, utils_1.codeType)(typeTreasury_1.default, "treasury_code", req.body.treasury_code);
        req.body.treasury_code = typecode;
        req.body.createdAt = new Date();
        const typeTreasury = await typeTreasury_1.default.create(req.body, { transaction });
        await transaction?.commit(); // Commit transaction
        res.status(200).json({ message: "Successfully created typeTreasury", typeTreasury });
    }
    catch (error) {
        await transaction?.rollback(); // ຢ່າປ່ອຍ transaction ຄ້າງ — ບໍ່ດັ່ງນັ້ນ connection ຈະຄ້າງຢູ່ pool
        console.error("Error creating typeTreasury:", error);
        // ສົ່ງເຫດຜົນຈິງ (ເຊັ່ນ SQL error) ກັບໄປໃຫ້ໜ້າຈໍສະແດງໄດ້
        res.status(500).json({ message: error?.parent?.sqlMessage ?? error?.message ?? "Error creating typeTreasury", error });
    }
};
exports.createTypeTreasury = createTypeTreasury;
// updated typeTreasury
const updateTypeTreasury = async (req, res) => {
    try {
        if (!req.body.createdAt) {
            req.body.createdAt = new Date();
        }
        const _uuid = atob(req.params.id);
        const type = await typeTreasury_1.default.update(req.body, {
            where: { _uuid: _uuid },
        });
        res.status(200).json({ message: "Successfully updating typeTreasury", data: type });
    }
    catch (error) {
        // ສົ່ງເຫດຜົນຈິງ (ເຊັ່ນ SQL error) ກັບໄປໃຫ້ໜ້າຈໍສະແດງໄດ້
        res.status(500).json({ message: error?.parent?.sqlMessage ?? error?.message ?? "Error updating typeTreasury", error });
    }
};
exports.updateTypeTreasury = updateTypeTreasury;
// delete typeTreasury — ລຶບບໍ່ໄດ້ຖ້າຍັງມີບັນຊີເງິນຄັງ (tbl_treasury_account) ໃຊ້ປະເພດນີ້ຢູ່
const deleteTypeTreasury = async (req, res) => {
    try {
        const id = (0, bansiHelpers_1.decodeId)(req);
        const row = await typeTreasury_1.default.findByPk(id);
        if (!row) {
            res.status(404).json({ message: "ບໍ່ພົບປະເພດບັນຊີ" });
            return;
        }
        const used = await treasuryAcount_1.default.count({ where: { type_treasuryid: id } });
        if (used) {
            res.status(400).json({ message: `ລຶບບໍ່ໄດ້ — ມີບັນຊີເງິນຄັງ ${used} ບັນຊີ ໃຊ້ປະເພດນີ້ຢູ່ (ປິດໃຊ້ງານແທນໄດ້)` });
            return;
        }
        await row.destroy();
        res.status(200).json({ message: "Successfully deleted typeTreasury" });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error deleting typeTreasury");
    }
};
exports.deleteTypeTreasury = deleteTypeTreasury;
// get typeTreasury
const getTypeTreasury = async (req, res) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
        const skip = req.query.skip ? parseInt(req.query.skip, 10) : 0;
        const orderBy = req.query.orderBy || "_uuid";
        const order = (req.query.order || "ASC").toUpperCase();
        const { currencyId, typeId } = req.body;
        const whereCondition = {
            status: 1
        };
        if (currencyId) {
            whereCondition.currencyId = currencyId;
        }
        if (typeId) {
            whereCondition.typeId = typeId;
        }
        const { rows, count } = await typeTreasury_1.default.findAndCountAll({
            where: whereCondition,
            limit,
            offset: skip,
            order: [[orderBy, order]],
            include: [
                {
                    model: currencyModel_1.default,
                    as: 'currency',
                },
                {
                    model: typeAcount_1.default,
                    as: 'types',
                },
            ],
        });
        res.status(200).json({
            data: rows,
            total: count,
            limit,
            skip,
        });
    }
    catch (error) {
        res.status(500).json({ message: "Error getting typeTreasury", error });
    }
};
exports.getTypeTreasury = getTypeTreasury;
// get typeTreasury option
const getTypeTreasurOption = async (req, res) => {
    try {
        // ຮອງຮັບທັງ GET (query) ແລະ POST (body)
        const { typeId, currencyId } = { ...req.query, ...(req.body || {}) };
        const whereCondition = { status: 1 };
        if (typeId) {
            whereCondition.typeId = typeId;
        }
        if (currencyId) {
            whereCondition.currencyId = currencyId;
        }
        const treasury = await typeTreasury_1.default.findAll({
            where: whereCondition,
            include: [
                {
                    model: currencyModel_1.default,
                    as: 'currency',
                },
                {
                    model: typeAcount_1.default,
                    as: 'types',
                },
            ],
        });
        res.json({
            data: treasury
        });
    }
    catch (error) {
        console.error("Error in getTypeTreasuryById:", error);
        res.status(500).json({ message: "Error fetching typeTreasury", error });
    }
};
exports.getTypeTreasurOption = getTypeTreasurOption;
const getTreasurbytype = async (req, res) => {
    try {
        const typeId = parseInt(req.params.id, 10);
        const treasury = await typeTreasury_1.default.findAll({
            where: { typeId: typeId },
            include: [
                {
                    model: currencyModel_1.default,
                    as: 'currency',
                },
            ]
        });
        res.json({
            data: treasury
        });
    }
    catch (error) {
        console.error("Error in getTypeTreasuryById:", error);
        res.status(500).json({ message: "Error fetching typeTreasury", error });
    }
};
exports.getTreasurbytype = getTreasurbytype;
