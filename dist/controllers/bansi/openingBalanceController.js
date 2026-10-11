"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveOpeningBalances = exports.getOpeningBalances = void 0;
const sequelize_1 = require("sequelize");
const utils_1 = require("../../utils");
const bankModel_1 = __importDefault(require("../../models/bankModel"));
const currencyModel_1 = __importDefault(require("../../models/currencyModel"));
const fiscalYear_1 = __importDefault(require("../../models/fiscalYear"));
const openingBalance_1 = __importDefault(require("../../models/openingBalance"));
const treasuryAcount_1 = __importDefault(require("../../models/treasuryAcount"));
const typeTreasury_1 = __importDefault(require("../../models/typeTreasury"));
const bansiHelpers_1 = require("./bansiHelpers");
// ຍອດຍົກມາຂອງປີໜຶ່ງ — body { fiscal_id } ; ຄືນທັງແຖວຍອດຍົກມາ ແລະ ຂໍ້ມູນປີ
const getOpeningBalances = async (req, res) => {
    try {
        const fiscal_id = Number((req.body || {}).fiscal_id);
        if (!fiscal_id) {
            res.status(400).json({ message: "ກະລຸນາເລືອກປີການເງິນ" });
            return;
        }
        const [fiscal, data] = await Promise.all([
            fiscalYear_1.default.findByPk(fiscal_id),
            openingBalance_1.default.findAll({
                where: { fiscal_id, status: 1 },
                include: [
                    {
                        model: treasuryAcount_1.default,
                        as: "account",
                        include: [
                            {
                                model: bankModel_1.default,
                                as: "banks",
                                attributes: { include: [[(0, sequelize_1.fn)("CONCAT", (0, sequelize_1.literal)(`'${(0, utils_1.url)()}/logo/'`), (0, sequelize_1.col)("account->banks.logo")), "url"]] },
                            },
                            { model: typeTreasury_1.default, as: "treasury", include: [{ model: currencyModel_1.default, as: "currency" }] },
                        ],
                    },
                ],
            }),
        ]);
        res.status(200).json({ fiscal, data, total: data.length });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting opening balances");
    }
};
exports.getOpeningBalances = getOpeningBalances;
/**
 * ບັນທຶກຍອດຍົກມາທັງປີເທື່ອດຽວ — body { fiscal_id, items: [{ account_id, balance_usable, balance_held, description? }] }.
 * ມີແຖວຢູ່ແລ້ວ → ແກ້, ບໍ່ມີ → ເພີ່ມ. ປີທີ່ປິດບັນຊີແລ້ວແກ້ບໍ່ໄດ້
 */
const saveOpeningBalances = async (req, res) => {
    const t = await openingBalance_1.default.sequelize.transaction();
    try {
        const fiscal_id = Number(req.body?.fiscal_id);
        const items = Array.isArray(req.body?.items) ? req.body.items : [];
        const fiscal = fiscal_id ? await fiscalYear_1.default.findByPk(fiscal_id, { transaction: t }) : null;
        if (!fiscal) {
            await t.rollback();
            res.status(400).json({ message: "ບໍ່ພົບປີການເງິນ" });
            return;
        }
        if (fiscal.status === 2) {
            await t.rollback();
            res.status(400).json({ message: `ປີການເງິນ ${fiscal.fiscal_code} ປິດບັນຊີແລ້ວ — ແກ້ຍອດຍົກມາບໍ່ໄດ້` });
            return;
        }
        // maxid ອ່ານນອກ transaction ຈຶ່ງເຫັນແຕ່ແຖວທີ່ commit ແລ້ວ — ເອົາເລກເລີ່ມເທື່ອດຽວແລ້ວບວກເອງ
        let nextId = await (0, utils_1.maxid)(openingBalance_1.default, "_uuid");
        const createby = (0, bansiHelpers_1.actorOf)(req);
        let saved = 0;
        for (const item of items) {
            const account_id = Number(item?.account_id);
            if (!account_id)
                continue;
            const values = {
                balance_usable: Number(item.balance_usable) || 0,
                balance_held: Number(item.balance_held) || 0,
                description: item.description || null,
                status: 1,
                updatedAt: new Date(),
            };
            const existing = await openingBalance_1.default.findOne({ where: { fiscal_id, account_id }, transaction: t });
            if (existing)
                await existing.update(values, { transaction: t });
            else
                await openingBalance_1.default.create({ ...values, _uuid: nextId++, fiscal_id, account_id, createby, createdAt: new Date() }, { transaction: t });
            saved++;
        }
        await t.commit();
        res.status(200).json({ message: "Successfully saved opening balances", saved });
    }
    catch (error) {
        await t.rollback();
        (0, bansiHelpers_1.sendError)(res, error, "Error saving opening balances");
    }
};
exports.saveOpeningBalances = saveOpeningBalances;
