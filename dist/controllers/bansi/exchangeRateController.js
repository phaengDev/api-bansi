"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteExchangeRate = exports.createExchangeRate = exports.getExchangeRates = void 0;
const utils_1 = require("../../utils");
const currencyModel_1 = __importDefault(require("../../models/currencyModel"));
const exchangeRate_1 = __importDefault(require("../../models/exchangeRate"));
const bansiHelpers_1 = require("./bansiHelpers");
/** ຂຽນອັດຕາຫຼ້າສຸດ (ຕາມ rate_date, ແລ້ວ createdAt) ກັບໄປ tbl_currency.reate — ໜ້າອື່ນອ່ານຖັນນີ້ຢູ່ */
const syncCurrencyRate = async (currencyId, t) => {
    const latest = await exchangeRate_1.default.findOne({
        where: { currencyId, status: 1 },
        order: [["rate_date", "DESC"], ["createdAt", "DESC"]],
        transaction: t,
    });
    if (latest) {
        await currencyModel_1.default.update({ reate: Number(latest.rate), updatedAt: new Date() }, { where: { _id: currencyId }, transaction: t });
    }
};
// ປະຫວັດອັດຕາ — body { currencyId? } ; ໃໝ່ສຸດຢູ່ເທິງ
const getExchangeRates = async (req, res) => {
    try {
        const { currencyId } = (req.body || {});
        const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 200;
        const data = await exchangeRate_1.default.findAll({
            where: { status: 1, ...(currencyId ? { currencyId } : {}) },
            include: [{ model: currencyModel_1.default, as: "currency" }],
            order: [["rate_date", "DESC"], ["createdAt", "DESC"]],
            limit,
        });
        res.status(200).json({ data, total: data.length });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting exchange rates");
    }
};
exports.getExchangeRates = getExchangeRates;
// ບັນທຶກອັດຕາໃໝ່ + ອັບເດດອັດຕາປັດຈຸບັນຂອງສະກຸນເງິນ
const createExchangeRate = async (req, res) => {
    const t = await exchangeRate_1.default.sequelize.transaction();
    try {
        const currencyId = Number(req.body.currencyId);
        const rate = Number(req.body.rate);
        const rate_date = (0, bansiHelpers_1.toDateOnly)(req.body.rate_date);
        if (!currencyId || !(rate > 0) || !rate_date) {
            await t.rollback();
            res.status(400).json({ message: "ກະລຸນາເລືອກສະກຸນເງິນ, ປ້ອນອັດຕາ (> 0) ແລະ ວັນທີ" });
            return;
        }
        const row = await exchangeRate_1.default.create({
            _uuid: await (0, utils_1.maxid)(exchangeRate_1.default, "_uuid"),
            currencyId,
            rate,
            rate_date,
            description: req.body.description || null,
            createby: (0, bansiHelpers_1.actorOf)(req),
            status: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
        }, { transaction: t });
        await syncCurrencyRate(currencyId, t);
        await t.commit();
        res.status(200).json({ message: "Successfully created exchange rate", data: row });
    }
    catch (error) {
        await t.rollback();
        (0, bansiHelpers_1.sendError)(res, error, "Error creating exchange rate");
    }
};
exports.createExchangeRate = createExchangeRate;
// ລຶບອັດຕາທີ່ປ້ອນຜິດ (soft delete) ແລ້ວຄຳນວນອັດຕາປັດຈຸບັນຄືນ
const deleteExchangeRate = async (req, res) => {
    const t = await exchangeRate_1.default.sequelize.transaction();
    try {
        const row = await exchangeRate_1.default.findByPk((0, bansiHelpers_1.decodeId)(req), { transaction: t });
        if (!row) {
            await t.rollback();
            res.status(404).json({ message: "ບໍ່ພົບອັດຕາແລກປ່ຽນ" });
            return;
        }
        await row.update({ status: 0, updatedAt: new Date() }, { transaction: t });
        await syncCurrencyRate(row.currencyId, t);
        await t.commit();
        res.status(200).json({ message: "Successfully deleted exchange rate" });
    }
    catch (error) {
        await t.rollback();
        (0, bansiHelpers_1.sendError)(res, error, "Error deleting exchange rate");
    }
};
exports.deleteExchangeRate = deleteExchangeRate;
