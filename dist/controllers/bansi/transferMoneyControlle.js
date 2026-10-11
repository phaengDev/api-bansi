"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAccountStatement = exports.getTransferMoney = exports.createTransferMoney = void 0;
const sequelize_1 = require("sequelize");
// import { createTransferHistory } from "../function/createTransferHistory";
const moment_1 = __importDefault(require("moment"));
const transferMoney_1 = __importDefault(require("../../models/transferMoney"));
const treasuryAcount_1 = __importDefault(require("../../models/treasuryAcount"));
const typeTreasury_1 = __importDefault(require("../../models/typeTreasury"));
const bankModel_1 = __importDefault(require("../../models/bankModel"));
const currencyModel_1 = __importDefault(require("../../models/currencyModel"));
const bansiHelpers_1 = require("./bansiHelpers");
const accountMovement_1 = require("./accountMovement");
const glCore_1 = require("./glCore");
const glPosting_1 = require("./glPosting");
const utils_1 = require("../../utils");
/**
 * POST /transfer-money/create { account_outid, account_inid, balance_transfer, description?, createby? }
 * ຍ້າຍເງິນ (ຍອດທີ່ໃຊ້ໄດ້ balance_treasury) ຈາກບັນຊີເງິນຄັງໜຶ່ງໄປອີກບັນຊີໜຶ່ງ ໃນ transaction ດຽວ.
 * ກວດ: ຄົນລະບັນຊີ, ທັງສອງມີຢູ່ ແລະ ໃຊ້ງານ, ສະກຸນເງິນດຽວກັນ (ຈຳນວນເທົ່າກັນທັງສອງຝັ່ງ — ບໍ່ມີອັດຕາແລກປ່ຽນ),
 * ຍອດໃຊ້ໄດ້ພໍ. balance_out / balance_in = ຍອດ "ກ່ອນໂອນ" ອ່ານຈາກ DB ເອງ (ລັອກແຖວໄວ້) — ບໍ່ເຊື່ອຄ່າຈາກໜ້າເວັບ
 */
const createTransferMoney = async (req, res) => {
    const t = await transferMoney_1.default.sequelize.transaction();
    const fail = async (code, message) => {
        await t.rollback();
        res.status(code).json({ message });
    };
    try {
        const { description, createby } = req.body;
        const outId = Number(req.body.account_outid);
        const inId = Number(req.body.account_inid);
        const amount = Number(req.body.balance_transfer);
        if (!Number.isInteger(outId) || !Number.isInteger(inId))
            return fail(400, "ກະລຸນາເລືອກບັນຊີໂອນອອກ ແລະ ບັນຊີຮັບ");
        if (outId === inId)
            return fail(400, "ບັນຊີໂອນອອກ ແລະ ບັນຊີຮັບ ຕ້ອງເປັນຄົນລະບັນຊີ");
        if (!Number.isFinite(amount) || amount <= 0)
            return fail(400, "ຈຳນວນເງິນຕ້ອງຫຼາຍກວ່າ 0");
        // ລັອກທັງສອງແຖວຕາມລຳດັບ _uuid (ກັນ deadlock ເມື່ອມີການໂອນສວນທາງກັນພ້ອມກັນ)
        const accounts = await treasuryAcount_1.default.findAll({
            where: { _uuid: [outId, inId] },
            order: [["_uuid", "ASC"]],
            include: [{ model: typeTreasury_1.default, as: "treasury", attributes: ["_uuid", "currencyId"] }],
            lock: t.LOCK.UPDATE,
            transaction: t,
        });
        const outAcc = accounts.find((a) => Number(a._uuid) === outId);
        const inAcc = accounts.find((a) => Number(a._uuid) === inId);
        if (!outAcc || !inAcc)
            return fail(404, "ບໍ່ພົບບັນຊີໂອນອອກ ຫຼື ບັນຊີຮັບ");
        if (Number(outAcc.status) !== 1 || Number(inAcc.status) !== 1)
            return fail(400, "ບັນຊີທີ່ປິດໃຊ້ງານແລ້ວ ໂອນເງິນບໍ່ໄດ້");
        if (Number(outAcc.treasury?.currencyId) !== Number(inAcc.treasury?.currencyId)) {
            return fail(400, "ໂອນໄດ້ສະເພາະບັນຊີສະກຸນເງິນດຽວກັນ");
        }
        const outBefore = Number(outAcc.balance_treasury) || 0;
        const inBefore = Number(inAcc.balance_treasury) || 0;
        if (amount > outBefore)
            return fail(400, "ຍອດເງິນທີ່ໃຊ້ໄດ້ຂອງບັນຊີໂອນອອກບໍ່ພໍ");
        const transferMoney = await transferMoney_1.default.create({
            account_outid: outId,
            balance_out: outBefore,
            account_inid: inId,
            balance_in: inBefore,
            balance_transfer: amount,
            description: description || null,
            createby: createby || null,
            status: 1,
        }, { transaction: t });
        // ປ່ຽນຍອດທັງສອງບັນຊີ + ບັນທຶກການເຄື່ອນໄຫວ (tbl_account_movement) ຄູ່ກັນ
        const transferId = transferMoney.get("_uuid");
        const actorId = Number((0, bansiHelpers_1.actorOf)(req));
        const note = description || null;
        await (0, accountMovement_1.moveBalance)(outAcc, {
            direction: accountMovement_1.MOVE_OUT, amount, source: "TRANSFER_OUT", sourceId: transferId,
            counterpartId: inId, description: note, actorId,
        }, t);
        await (0, accountMovement_1.moveBalance)(inAcc, {
            direction: accountMovement_1.MOVE_IN, amount, source: "TRANSFER_IN", sourceId: transferId,
            counterpartId: outId, description: note, actorId,
        }, t);
        // ລົງບັນຊີຄູ່ (ໜີ້ ບັນຊີຮັບ / ມີ ບັນຊີໂອນອອກ)
        await (0, glPosting_1.postTransfer)(transferMoney, t, Number.isInteger(actorId) ? actorId : null);
        await t.commit();
        res.status(200).json({
            message: "Transfer money successfully",
            data: transferMoney,
        });
    }
    catch (error) {
        await t.rollback();
        if ((0, glCore_1.replyGlError)(res, error))
            return;
        (0, bansiHelpers_1.sendError)(res, error, "Error creating transfer");
    }
};
exports.createTransferMoney = createTransferMoney;
const getTransferMoney = async (req, res) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 25;
        const skip = req.query.skip ? parseInt(req.query.skip, 10) : 0;
        const orderBy = req.query.orderBy || "createdAt";
        const order = (req.query.order || "ASC").toUpperCase();
        const { start_date, end_date, account_outid, account_inid } = req.body;
        const whereCondition = { status: 1 };
        if (start_date && end_date) {
            whereCondition.createdAt = {
                [sequelize_1.Op.between]: [
                    (0, moment_1.default)(start_date).startOf("day").toDate(),
                    (0, moment_1.default)(end_date).endOf("day").toDate(),
                ]
            };
        }
        if (account_outid) {
            whereCondition.account_outid = account_outid;
        }
        if (account_inid) {
            whereCondition.account_inid = account_inid;
        }
        const { rows, count } = await transferMoney_1.default.findAndCountAll({
            where: whereCondition,
            limit,
            offset: skip,
            order: [[orderBy, order]],
            include: [
                {
                    model: treasuryAcount_1.default,
                    as: "acounts",
                },
                {
                    model: treasuryAcount_1.default,
                    as: "acounte",
                },
            ]
        });
        res.status(200).json({
            data: rows,
            total: count
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
};
exports.getTransferMoney = getTransferMoney;
/** ເວລາທຸລະກິດ (ລາວ, ບໍ່ມີ DST) — createdAt ເກັບເປັນ UTC; ຂອບເຂດປີ ແລະ ປີທີ່ມີການເຄື່ອນໄຫວ ຄິດຕາມເວລານີ້ */
const BUSINESS_OFFSET = "+07:00";
/** ບັນຊີຄູ່ໂອນ — ຊື່, ເລກ, ຕົວຫຍໍ້ທະນາຄານ, ສະກຸນເງິນ (ພໍສຳລັບສະແດງໃນປະຫວັດ) */
const counterpartInclude = (as) => ({
    model: treasuryAcount_1.default,
    as,
    attributes: ["_uuid", "acountName", "acount_number", "bankId"],
    include: [
        { model: bankModel_1.default, as: "banks", attributes: ["_uuid", "abbr", "name_la", "logo"] },
        {
            model: typeTreasury_1.default,
            as: "treasury",
            attributes: ["_uuid", "treasury_code", "treasury_name"],
            include: [{ model: currencyModel_1.default, as: "currency", attributes: ["_id", "name", "genus"] }],
        },
    ],
});
/**
 * POST /transfer-money/statement { account_id, year? } — ປະຫວັດເງິນເຂົ້າ-ອອກ ຂອງບັນຊີດຽວ (ໃໝ່ສຸດກ່ອນ) ໃນປີທີ່ເລືອກ.
 * ບໍ່ສົ່ງປີ = ປີລ່າສຸດທີ່ມີການເຄື່ອນໄຫວ. years = ທຸກປີຕັ້ງແຕ່ລາຍການທຳອິດຮອດປີນີ້ (ໃຫ້ໜ້າເວັບເລືອກ).
 * balance_out / balance_in ຂອງ tbl_transfer_money ຄືຍອດ "ກ່ອນໂອນ" ຂອງບັນຊີອອກ/ເຂົ້າ (ລາຍການເກົ່າອາດເປັນ NULL)
 */
const getAccountStatement = async (req, res) => {
    try {
        const id = Number(req.body?.account_id);
        if (!Number.isInteger(id)) {
            res.status(400).json({ message: "account_id ບໍ່ຖືກຕ້ອງ" });
            return;
        }
        const ofAccount = { status: 1, [sequelize_1.Op.or]: [{ account_outid: id }, { account_inid: id }] };
        const span = (await transferMoney_1.default.findOne({
            attributes: [[(0, sequelize_1.fn)("MIN", (0, sequelize_1.col)("createdAt")), "first"], [(0, sequelize_1.fn)("MAX", (0, sequelize_1.col)("createdAt")), "last"]],
            where: ofAccount,
            raw: true,
        }));
        const yearOf = (value) => (0, moment_1.default)(value).utcOffset(BUSINESS_OFFSET).year();
        const thisYear = yearOf((0, moment_1.default)());
        const firstYear = span?.first ? yearOf(span.first) : thisYear;
        const lastYear = span?.last ? yearOf(span.last) : thisYear;
        const years = Array.from({ length: Math.max(thisYear, lastYear) - firstYear + 1 }, (_, i) => firstYear + i);
        const year = Number(req.body?.year) || lastYear;
        const start = moment_1.default.parseZone(`${year}-01-01T00:00:00${BUSINESS_OFFSET}`);
        const end = start.clone().add(1, "year");
        const rows = await transferMoney_1.default.findAll({
            where: { ...ofAccount, createdAt: { [sequelize_1.Op.gte]: start.toDate(), [sequelize_1.Op.lt]: end.toDate() } },
            order: [["createdAt", "DESC"]],
            include: [counterpartInclude("acounts"), counterpartInclude("acounte")],
        });
        const data = rows.map((row) => {
            const r = row.get({ plain: true });
            const isOut = Number(r.account_outid) === id;
            const other = isOut ? r.acounte : r.acounts;
            const amount = Number(r.balance_transfer) || 0;
            const beforeRaw = isOut ? r.balance_out : r.balance_in;
            const before = beforeRaw == null ? null : Number(beforeRaw);
            return {
                _uuid: r._uuid,
                createdAt: r.createdAt,
                direction: isOut ? "out" : "in",
                amount,
                balance_before: before,
                balance_after: before == null ? null : isOut ? before - amount : before + amount,
                description: r.description || null,
                createby: r.createby || null,
                counterpart: other
                    ? {
                        _uuid: other._uuid,
                        acountName: other.acountName,
                        acount_number: other.acount_number,
                        bank: other.banks?.abbr ?? other.banks?.name_la ?? null,
                        bank_name: other.banks?.name_la ?? null,
                        // URL ເຕັມຂອງໂລໂກ້ ແບບດຽວກັບ /treasury-account/fetch (banks.url)
                        bank_logo: other.banks?.logo ? `${(0, utils_1.url)()}/logo/${other.banks.logo}` : null,
                        type_name: other.treasury?.treasury_name ?? null,
                        currency: other.treasury?.currency?.name ?? null,
                    }
                    : null,
            };
        });
        res.status(200).json({ year, years, data });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting account statement");
    }
};
exports.getAccountStatement = getAccountStatement;
