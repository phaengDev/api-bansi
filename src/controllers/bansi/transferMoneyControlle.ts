import { Request, Response } from "express";
import { Op, fn, col } from "sequelize";
// import { createTransferHistory } from "../function/createTransferHistory";
import moment from "moment";
import TransferMoney from "../../models/transferMoney";
import TreasuryAcount from "../../models/treasuryAcount";
import TypeTreasury from "../../models/typeTreasury";
import Banks from "../../models/bankModel";
import Currency from "../../models/currencyModel";
import { actorOf, sendError } from "./bansiHelpers";
import { MOVE_IN, MOVE_OUT, moveBalance } from "./accountMovement";
import { replyGlError } from "./glCore";
import { postTransfer } from "./glPosting";
import { url } from "../../utils";
interface QueryParams {
    limit?: string;
    skip?: string;
    orderBy?: string;
    order?: string;
}
/**
 * POST /transfer-money/create { account_outid, account_inid, balance_transfer, description?, createby? }
 * ຍ້າຍເງິນ (ຍອດທີ່ໃຊ້ໄດ້ balance_treasury) ຈາກບັນຊີເງິນຄັງໜຶ່ງໄປອີກບັນຊີໜຶ່ງ ໃນ transaction ດຽວ.
 * ກວດ: ຄົນລະບັນຊີ, ທັງສອງມີຢູ່ ແລະ ໃຊ້ງານ, ສະກຸນເງິນດຽວກັນ (ຈຳນວນເທົ່າກັນທັງສອງຝັ່ງ — ບໍ່ມີອັດຕາແລກປ່ຽນ),
 * ຍອດໃຊ້ໄດ້ພໍ. balance_out / balance_in = ຍອດ "ກ່ອນໂອນ" ອ່ານຈາກ DB ເອງ (ລັອກແຖວໄວ້) — ບໍ່ເຊື່ອຄ່າຈາກໜ້າເວັບ
 */
export const createTransferMoney = async (req: Request, res: Response) => {
    const t = await TransferMoney.sequelize!.transaction();
    const fail = async (code: number, message: string) => {
        await t.rollback();
        res.status(code).json({ message });
    };
    try {
        const { description, createby } = req.body;
        const outId = Number(req.body.account_outid);
        const inId = Number(req.body.account_inid);
        const amount = Number(req.body.balance_transfer);
        if (!Number.isInteger(outId) || !Number.isInteger(inId)) return fail(400, "ກະລຸນາເລືອກບັນຊີໂອນອອກ ແລະ ບັນຊີຮັບ");
        if (outId === inId) return fail(400, "ບັນຊີໂອນອອກ ແລະ ບັນຊີຮັບ ຕ້ອງເປັນຄົນລະບັນຊີ");
        if (!Number.isFinite(amount) || amount <= 0) return fail(400, "ຈຳນວນເງິນຕ້ອງຫຼາຍກວ່າ 0");

        // ລັອກທັງສອງແຖວຕາມລຳດັບ _uuid (ກັນ deadlock ເມື່ອມີການໂອນສວນທາງກັນພ້ອມກັນ)
        const accounts = await TreasuryAcount.findAll({
            where: { _uuid: [outId, inId] },
            order: [["_uuid", "ASC"]],
            include: [{ model: TypeTreasury, as: "treasury", attributes: ["_uuid", "currencyId"] }],
            lock: t.LOCK.UPDATE,
            transaction: t,
        });
        const outAcc: any = accounts.find((a) => Number(a._uuid) === outId);
        const inAcc: any = accounts.find((a) => Number(a._uuid) === inId);
        if (!outAcc || !inAcc) return fail(404, "ບໍ່ພົບບັນຊີໂອນອອກ ຫຼື ບັນຊີຮັບ");
        if (Number(outAcc.status) !== 1 || Number(inAcc.status) !== 1) return fail(400, "ບັນຊີທີ່ປິດໃຊ້ງານແລ້ວ ໂອນເງິນບໍ່ໄດ້");
        if (Number(outAcc.treasury?.currencyId) !== Number(inAcc.treasury?.currencyId)) {
            return fail(400, "ໂອນໄດ້ສະເພາະບັນຊີສະກຸນເງິນດຽວກັນ");
        }
        const outBefore = Number(outAcc.balance_treasury) || 0;
        const inBefore = Number(inAcc.balance_treasury) || 0;
        if (amount > outBefore) return fail(400, "ຍອດເງິນທີ່ໃຊ້ໄດ້ຂອງບັນຊີໂອນອອກບໍ່ພໍ");

        const transferMoney = await TransferMoney.create(
            {
                account_outid: outId,
                balance_out: outBefore,
                account_inid: inId,
                balance_in: inBefore,
                balance_transfer: amount,
                description: description || null,
                createby: createby || null,
                status: 1,
            },
            { transaction: t }
        );
        // ປ່ຽນຍອດທັງສອງບັນຊີ + ບັນທຶກການເຄື່ອນໄຫວ (tbl_account_movement) ຄູ່ກັນ
        const transferId = transferMoney.get("_uuid") as number;
        const actorId = Number(actorOf(req));
        const note = description || null;
        await moveBalance(outAcc, {
            direction: MOVE_OUT, amount, source: "TRANSFER_OUT", sourceId: transferId,
            counterpartId: inId, description: note, actorId,
        }, t);
        await moveBalance(inAcc, {
            direction: MOVE_IN, amount, source: "TRANSFER_IN", sourceId: transferId,
            counterpartId: outId, description: note, actorId,
        }, t);
        // ລົງບັນຊີຄູ່ (ໜີ້ ບັນຊີຮັບ / ມີ ບັນຊີໂອນອອກ)
        await postTransfer(transferMoney, t, Number.isInteger(actorId) ? actorId : null);

        await t.commit();
        res.status(200).json({
            message: "Transfer money successfully",
            data: transferMoney,
        });
    } catch (error) {
        await t.rollback();
        if (replyGlError(res, error)) return;
        sendError(res, error, "Error creating transfer");
    }
};


export const getTransferMoney = async (
    req: Request<{}, {}, {}, QueryParams>,
    res: Response
): Promise<void> => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 25;
        const skip = req.query.skip ? parseInt(req.query.skip, 10) : 0;
        const orderBy = req.query.orderBy || "createdAt";
        const order = (req.query.order || "ASC").toUpperCase() as "ASC" | "DESC";
        const { start_date, end_date, account_outid, account_inid } = req.body as any;
        const whereCondition: any = { status: 1 };

        if (start_date && end_date) {
            whereCondition.createdAt = {
                [Op.between]: [
                    moment(start_date).startOf("day").toDate(),
                    moment(end_date).endOf("day").toDate(),
                ]
            };
        }

        if (account_outid) {
            whereCondition.account_outid = account_outid;
        }
        if (account_inid) {
            whereCondition.account_inid = account_inid;
        }

        const { rows, count } = await TransferMoney.findAndCountAll({
            where: whereCondition,
            limit,
            offset: skip,
            order: [[orderBy, order]],
            include: [
                {
                    model: TreasuryAcount,
                    as: "acounts",
                },
                {
                    model: TreasuryAcount,
                    as: "acounte",
                },
            ]
        });
        res.status(200).json({
            data: rows,
            total: count
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
};

/** ເວລາທຸລະກິດ (ລາວ, ບໍ່ມີ DST) — createdAt ເກັບເປັນ UTC; ຂອບເຂດປີ ແລະ ປີທີ່ມີການເຄື່ອນໄຫວ ຄິດຕາມເວລານີ້ */
const BUSINESS_OFFSET = "+07:00";

/** ບັນຊີຄູ່ໂອນ — ຊື່, ເລກ, ຕົວຫຍໍ້ທະນາຄານ, ສະກຸນເງິນ (ພໍສຳລັບສະແດງໃນປະຫວັດ) */
const counterpartInclude = (as: "acounts" | "acounte") => ({
    model: TreasuryAcount,
    as,
    attributes: ["_uuid", "acountName", "acount_number", "bankId"],
    include: [
        { model: Banks, as: "banks", attributes: ["_uuid", "abbr", "name_la", "logo"] },
        {
            model: TypeTreasury,
            as: "treasury",
            attributes: ["_uuid", "treasury_code", "treasury_name"],
            include: [{ model: Currency, as: "currency", attributes: ["_id", "name", "genus"] }],
        },
    ],
});

/**
 * POST /transfer-money/statement { account_id, year? } — ປະຫວັດເງິນເຂົ້າ-ອອກ ຂອງບັນຊີດຽວ (ໃໝ່ສຸດກ່ອນ) ໃນປີທີ່ເລືອກ.
 * ບໍ່ສົ່ງປີ = ປີລ່າສຸດທີ່ມີການເຄື່ອນໄຫວ. years = ທຸກປີຕັ້ງແຕ່ລາຍການທຳອິດຮອດປີນີ້ (ໃຫ້ໜ້າເວັບເລືອກ).
 * balance_out / balance_in ຂອງ tbl_transfer_money ຄືຍອດ "ກ່ອນໂອນ" ຂອງບັນຊີອອກ/ເຂົ້າ (ລາຍການເກົ່າອາດເປັນ NULL)
 */
export const getAccountStatement = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = Number((req.body as any)?.account_id);
        if (!Number.isInteger(id)) {
            res.status(400).json({ message: "account_id ບໍ່ຖືກຕ້ອງ" });
            return;
        }
        const ofAccount = { status: 1, [Op.or]: [{ account_outid: id }, { account_inid: id }] };

        const span = (await TransferMoney.findOne({
            attributes: [[fn("MIN", col("createdAt")), "first"], [fn("MAX", col("createdAt")), "last"]],
            where: ofAccount,
            raw: true,
        })) as unknown as { first: Date | null; last: Date | null } | null;
        const yearOf = (value: Date | moment.Moment) => moment(value).utcOffset(BUSINESS_OFFSET).year();
        const thisYear = yearOf(moment());
        const firstYear = span?.first ? yearOf(span.first) : thisYear;
        const lastYear = span?.last ? yearOf(span.last) : thisYear;
        const years = Array.from({ length: Math.max(thisYear, lastYear) - firstYear + 1 }, (_, i) => firstYear + i);

        const year = Number((req.body as any)?.year) || lastYear;
        const start = moment.parseZone(`${year}-01-01T00:00:00${BUSINESS_OFFSET}`);
        const end = start.clone().add(1, "year");

        const rows = await TransferMoney.findAll({
            where: { ...ofAccount, createdAt: { [Op.gte]: start.toDate(), [Op.lt]: end.toDate() } },
            order: [["createdAt", "DESC"]],
            include: [counterpartInclude("acounts"), counterpartInclude("acounte")],
        });

        const data = rows.map((row) => {
            const r: any = row.get({ plain: true });
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
                        bank_logo: other.banks?.logo ? `${url()}/logo/${other.banks.logo}` : null,
                        type_name: other.treasury?.treasury_name ?? null,
                        currency: other.treasury?.currency?.name ?? null,
                    }
                    : null,
            };
        });

        res.status(200).json({ year, years, data });
    } catch (error) {
        sendError(res, error, "Error getting account statement");
    }
};
