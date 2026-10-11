"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAccountMovements = exports.moveBalance = exports.KIND_HELD = exports.KIND_USABLE = exports.MOVE_OUT = exports.MOVE_IN = void 0;
const sequelize_1 = require("sequelize");
const moment_1 = __importDefault(require("moment"));
const accountMovement_1 = __importDefault(require("../../models/accountMovement"));
const typeTreasury_1 = __importDefault(require("../../models/typeTreasury"));
const treasuryAcount_1 = __importDefault(require("../../models/treasuryAcount"));
const bankModel_1 = __importDefault(require("../../models/bankModel"));
const userModel_1 = __importDefault(require("../../models/userModel"));
const utils_1 = require("../../utils");
const bansiHelpers_1 = require("./bansiHelpers");
exports.MOVE_IN = 1;
exports.MOVE_OUT = 2;
/** ຍອດໃຊ້ໄດ້ (balance_treasury) / ຍອດຄ້າງ (balance_unable) */
exports.KIND_USABLE = 1;
exports.KIND_HELD = 2;
/**
 * ປ່ຽນຍອດບັນຊີເງິນຄັງ ພ້ອມບັນທຶກແຖວໃນ tbl_account_movement (ຍອດກ່ອນ / ຈຳນວນ / ຍອດຫຼັງ) ໃນ transaction ດຽວກັນ.
 * ທຸກບ່ອນທີ່ປ່ຽນຍອດບັນຊີຕ້ອງຜ່ານນີ້ — ປະຫວັດຈຶ່ງຄົບ ແລະ ຍອດຫຼັງຂອງແຖວສຸດທ້າຍ = ຍອດໃນບັນຊີສະເໝີ.
 * account ຕ້ອງຖືກອ່ານແບບລັອກ (lock: t.LOCK.UPDATE) ໃນ t ກ່ອນ ເພື່ອບໍ່ໃຫ້ສອງລາຍການອ່ານຍອດກ່ອນຊ້ຳກັນ
 */
const moveBalance = async (account, options, t) => {
    const kind = options.kind ?? exports.KIND_USABLE;
    const field = kind === exports.KIND_HELD ? "balance_unable" : "balance_treasury";
    const amount = Math.abs(Number(options.amount) || 0);
    const before = Number(account.get(field)) || 0;
    const after = options.direction === exports.MOVE_IN ? before + amount : before - amount;
    await account.update({ [field]: after, updatedAt: new Date() }, { transaction: t });
    const currencyId = account.treasury?.currencyId ??
        (await typeTreasury_1.default.findByPk(account.type_treasuryid, { attributes: ["currencyId"], transaction: t }))?.currencyId ??
        null;
    await accountMovement_1.default.create({
        account_id: account._uuid,
        movement_date: options.date || (0, moment_1.default)().utcOffset("+07:00").format("YYYY-MM-DD"),
        direction: options.direction,
        balance_kind: kind,
        amount,
        balance_before: before,
        balance_after: after,
        currency_id: currencyId,
        source_type: options.source,
        source_id: options.sourceId == null ? null : String(options.sourceId),
        doc_number: options.docNumber ?? null,
        counterpart_account_id: options.counterpartId ?? null,
        description: options.description ?? null,
        created_by: Number.isInteger(options.actorId) ? options.actorId : null,
        status: 1,
    }, { transaction: t });
    return { before, after };
};
exports.moveBalance = moveBalance;
/**
 * POST /account-movement/fetch { account_id, start_date?, end_date? } — ການເຄື່ອນໄຫວຂອງບັນຊີດຽວ ໃໝ່ສຸດກ່ອນ
 * (ລຽງຕາມລຳດັບທີ່ບັນທຶກ ເພື່ອໃຫ້ ຍອດກ່ອນ → ຍອດຫຼັງ ຕໍ່ກັນ; ລາຍການບັນທຶກຍ້ອນຫຼັງ movement_date ເກົ່າ ແຕ່ຍອດເປັນຍອດຕອນບັນທຶກ).
 * ວັນທີກັ່ນຕາມ movement_date. summary ແຍກຕາມ balance_kind: opening = ຜົນລວມເຂົ້າ−ອອກ ກ່ອນ start_date,
 * in / out ໃນຊ່ວງ, closing = opening + in − out
 */
const getAccountMovements = async (req, res) => {
    try {
        const body = req.body || {};
        const accountId = Number(body.account_id);
        if (!Number.isInteger(accountId)) {
            res.status(400).json({ message: "account_id ບໍ່ຖືກຕ້ອງ" });
            return;
        }
        const where = { account_id: accountId, status: 1 };
        const start = (0, bansiHelpers_1.toDateOnly)(body.start_date);
        const end = (0, bansiHelpers_1.toDateOnly)(body.end_date);
        if (start || end) {
            where.movement_date = { ...(start ? { [sequelize_1.Op.gte]: start } : {}), ...(end ? { [sequelize_1.Op.lte]: end } : {}) };
        }
        const rows = await accountMovement_1.default.findAll({
            where,
            order: [["_uuid", "DESC"]],
            include: [
                {
                    model: treasuryAcount_1.default,
                    as: "counterpart",
                    attributes: ["_uuid", "acountName", "acount_number"],
                    include: [{ model: bankModel_1.default, as: "banks", attributes: ["_uuid", "abbr", "name_la", "logo"] }],
                },
                { model: userModel_1.default, as: "user", attributes: ["user_uuid", "user_name"] },
            ],
        });
        // ຍອດຍົກມາ = ຜົນລວມທຸກການເຄື່ອນໄຫວກ່ອນວັນເລີ່ມ (ແຍກ ຍອດໃຊ້ໄດ້ / ຍອດຄ້າງ)
        const signed = (0, sequelize_1.literal)(`CASE WHEN direction = ${exports.MOVE_IN} THEN amount ELSE -amount END`);
        const before = start
            ? (await accountMovement_1.default.findAll({
                attributes: ["balance_kind", [(0, sequelize_1.fn)("SUM", signed), "total"]],
                where: { account_id: accountId, status: 1, movement_date: { [sequelize_1.Op.lt]: start } },
                group: ["balance_kind"],
                raw: true,
            }))
            : [];
        const data = rows.map((row) => {
            const r = row.get({ plain: true });
            const logo = r.counterpart?.banks?.logo;
            return {
                ...r,
                amount: Number(r.amount),
                balance_before: Number(r.balance_before),
                balance_after: Number(r.balance_after),
                created_by_name: r.user?.user_name ?? null,
                user: undefined,
                counterpart: r.counterpart && {
                    ...r.counterpart,
                    banks: r.counterpart.banks && { ...r.counterpart.banks, url: logo ? `${(0, utils_1.url)()}/logo/${logo}` : null },
                },
            };
        });
        const summary = [exports.KIND_USABLE, exports.KIND_HELD].map((kind) => {
            const opening = Number(before.find((b) => Number(b.balance_kind) === kind)?.total) || 0;
            const ofKind = data.filter((r) => Number(r.balance_kind) === kind);
            const sumOf = (direction) => ofKind.filter((r) => Number(r.direction) === direction).reduce((n, r) => n + r.amount, 0);
            const moneyIn = sumOf(exports.MOVE_IN);
            const moneyOut = sumOf(exports.MOVE_OUT);
            return { kind, opening, in: moneyIn, out: moneyOut, closing: opening + moneyIn - moneyOut, count: ofKind.length };
        });
        res.status(200).json({ data, summary });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting account movements");
    }
};
exports.getAccountMovements = getAccountMovements;
