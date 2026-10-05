import { Request, Response } from "express";
import { Op, Transaction, fn, literal } from "sequelize";
import moment from "moment";
import AccountMovement from "../../models/accountMovement";
import TypeTreasury from "../../models/typeTreasury";
import TreasuryAccount from "../../models/treasuryAcount";
import Banks from "../../models/bankModel";
import Users from "../../models/userModel";
import { url } from "../../utils";
import { sendError, toDateOnly } from "./bansiHelpers";

export const MOVE_IN = 1;
export const MOVE_OUT = 2;
/** ຍອດໃຊ້ໄດ້ (balance_treasury) / ຍອດຄ້າງ (balance_unable) */
export const KIND_USABLE = 1;
export const KIND_HELD = 2;

/** ທີ່ມາຂອງການເຄື່ອນໄຫວ — ເພີ່ມເມື່ອມີໂມດູນໃໝ່ */
export type MovementSource =
  | "OPENING"
  | "INCOME"
  | "INCOME_CANCEL"
  | "EXPENSE"
  | "EXPENSE_CANCEL"
  | "TRANSFER_IN"
  | "TRANSFER_OUT"
  | "AR_RECEIPT"
  | "AR_RECEIPT_CANCEL"
  | "AP_PAYMENT"
  | "AP_PAYMENT_CANCEL";

type MoveOptions = {
  direction: typeof MOVE_IN | typeof MOVE_OUT;
  amount: number;
  source: MovementSource;
  kind?: typeof KIND_USABLE | typeof KIND_HELD;
  sourceId?: string | number | null;
  docNumber?: string | null;
  counterpartId?: number | null;
  description?: string | null;
  /** ວັນທີທຸລະກິດ YYYY-MM-DD — ບໍ່ສົ່ງ = ມື້ນີ້ (ເວລາລາວ) */
  date?: string | null;
  actorId?: number | null;
};

/**
 * ປ່ຽນຍອດບັນຊີເງິນຄັງ ພ້ອມບັນທຶກແຖວໃນ tbl_account_movement (ຍອດກ່ອນ / ຈຳນວນ / ຍອດຫຼັງ) ໃນ transaction ດຽວກັນ.
 * ທຸກບ່ອນທີ່ປ່ຽນຍອດບັນຊີຕ້ອງຜ່ານນີ້ — ປະຫວັດຈຶ່ງຄົບ ແລະ ຍອດຫຼັງຂອງແຖວສຸດທ້າຍ = ຍອດໃນບັນຊີສະເໝີ.
 * account ຕ້ອງຖືກອ່ານແບບລັອກ (lock: t.LOCK.UPDATE) ໃນ t ກ່ອນ ເພື່ອບໍ່ໃຫ້ສອງລາຍການອ່ານຍອດກ່ອນຊ້ຳກັນ
 */
export const moveBalance = async (account: any, options: MoveOptions, t: Transaction) => {
  const kind = options.kind ?? KIND_USABLE;
  const field = kind === KIND_HELD ? "balance_unable" : "balance_treasury";
  const amount = Math.abs(Number(options.amount) || 0);
  const before = Number(account.get(field)) || 0;
  const after = options.direction === MOVE_IN ? before + amount : before - amount;

  await account.update({ [field]: after, updatedAt: new Date() }, { transaction: t });

  const currencyId =
    account.treasury?.currencyId ??
    ((await TypeTreasury.findByPk(account.type_treasuryid, { attributes: ["currencyId"], transaction: t })) as any)?.currencyId ??
    null;

  await AccountMovement.create(
    {
      account_id: account._uuid,
      movement_date: options.date || moment().utcOffset("+07:00").format("YYYY-MM-DD"),
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
    },
    { transaction: t }
  );
  return { before, after };
};

/**
 * POST /account-movement/fetch { account_id, start_date?, end_date? } — ການເຄື່ອນໄຫວຂອງບັນຊີດຽວ ໃໝ່ສຸດກ່ອນ
 * (ລຽງຕາມລຳດັບທີ່ບັນທຶກ ເພື່ອໃຫ້ ຍອດກ່ອນ → ຍອດຫຼັງ ຕໍ່ກັນ; ລາຍການບັນທຶກຍ້ອນຫຼັງ movement_date ເກົ່າ ແຕ່ຍອດເປັນຍອດຕອນບັນທຶກ).
 * ວັນທີກັ່ນຕາມ movement_date. summary ແຍກຕາມ balance_kind: opening = ຜົນລວມເຂົ້າ−ອອກ ກ່ອນ start_date,
 * in / out ໃນຊ່ວງ, closing = opening + in − out
 */
export const getAccountMovements = async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const accountId = Number(body.account_id);
    if (!Number.isInteger(accountId)) {
      res.status(400).json({ message: "account_id ບໍ່ຖືກຕ້ອງ" });
      return;
    }
    const where: any = { account_id: accountId, status: 1 };
    const start = toDateOnly(body.start_date);
    const end = toDateOnly(body.end_date);
    if (start || end) {
      where.movement_date = { ...(start ? { [Op.gte]: start } : {}), ...(end ? { [Op.lte]: end } : {}) };
    }
    const rows = await AccountMovement.findAll({
      where,
      order: [["_uuid", "DESC"]],
      include: [
        {
          model: TreasuryAccount,
          as: "counterpart",
          attributes: ["_uuid", "acountName", "acount_number"],
          include: [{ model: Banks, as: "banks", attributes: ["_uuid", "abbr", "name_la", "logo"] }],
        },
        { model: Users, as: "user", attributes: ["user_uuid", "user_name"] },
      ],
    });

    // ຍອດຍົກມາ = ຜົນລວມທຸກການເຄື່ອນໄຫວກ່ອນວັນເລີ່ມ (ແຍກ ຍອດໃຊ້ໄດ້ / ຍອດຄ້າງ)
    const signed = literal(`CASE WHEN direction = ${MOVE_IN} THEN amount ELSE -amount END`);
    const before = start
      ? ((await AccountMovement.findAll({
          attributes: ["balance_kind", [fn("SUM", signed), "total"]],
          where: { account_id: accountId, status: 1, movement_date: { [Op.lt]: start } },
          group: ["balance_kind"],
          raw: true,
        })) as unknown as { balance_kind: number; total: string }[])
      : [];

    const data = rows.map((row) => {
      const r: any = row.get({ plain: true });
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
          banks: r.counterpart.banks && { ...r.counterpart.banks, url: logo ? `${url()}/logo/${logo}` : null },
        },
      };
    });

    const summary = [KIND_USABLE, KIND_HELD].map((kind) => {
      const opening = Number(before.find((b) => Number(b.balance_kind) === kind)?.total) || 0;
      const ofKind = data.filter((r) => Number(r.balance_kind) === kind);
      const sumOf = (direction: number) =>
        ofKind.filter((r) => Number(r.direction) === direction).reduce((n, r) => n + r.amount, 0);
      const moneyIn = sumOf(MOVE_IN);
      const moneyOut = sumOf(MOVE_OUT);
      return { kind, opening, in: moneyIn, out: moneyOut, closing: opening + moneyIn - moneyOut, count: ofKind.length };
    });

    res.status(200).json({ data, summary });
  } catch (error) {
    sendError(res, error, "Error getting account movements");
  }
};
