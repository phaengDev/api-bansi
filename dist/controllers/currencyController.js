"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateCurrencyMt = exports.updateCurrency = exports.getcurrency = void 0;
const currencyModel_1 = __importDefault(require("../models/currencyModel"));
const getcurrency = async (req, res) => {
    try {
        const currency = await currencyModel_1.default.findAll();
        res.status(200).json({ data: currency });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to fetch currency" });
    }
};
exports.getcurrency = getcurrency;
const updateCurrency = async (req, res) => {
    try {
        const id = atob(req.params.id);
        req.body.updatedAt = new Date();
        const [updated] = await currencyModel_1.default.update(req.body, {
            where: { _id: id },
        });
        if (!updated)
            return res.status(404).json({ error: "Currency not found" });
        res.status(200).json({ message: "Currency updated successfully", data: updated });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to update currency" });
    }
};
exports.updateCurrency = updateCurrency;
const updateCurrencyMt = async (req, res) => {
    const t = await currencyModel_1.default.sequelize.transaction();
    const { items } = req.body;
    try {
        if (!Array.isArray(items) || items.length === 0) {
            await t.rollback();
            return res.status(400).json({ error: "No items to update." });
        }
        const results = [];
        for (const item of items) {
            // ✅ ກວດວ່າມີ _id ຫຼືບໍ່
            if (!item._id)
                continue;
            const [affectedRows] = await currencyModel_1.default.update({
                reate: item.reate,
                updatedAt: new Date(),
            }, {
                where: { _id: item._id },
                transaction: t,
            });
            if (affectedRows > 0) {
                const updated = await currencyModel_1.default.findByPk(item._id, { transaction: t });
                results.push(updated);
            }
        }
        await t.commit();
        res.status(200).json({
            message: "✅ Currency updated successfully",
            data: results,
        });
    }
    catch (error) {
        await t.rollback();
        console.error("❌ Update list error:", error.message || error);
        res.status(500).json({ error: "Failed to update currency list" });
    }
};
exports.updateCurrencyMt = updateCurrencyMt;
