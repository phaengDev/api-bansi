import { Request, Response } from "express";
import { col, fn, literal } from "sequelize";
import { maxid, url } from "../../utils";
import Banks from "../../models/bankModel";
import Currency from "../../models/currencyModel";
import FiscalYear from "../../models/fiscalYear";
import OpeningBalance from "../../models/openingBalance";
import TreasuryAccount from "../../models/treasuryAcount";
import TypeTreasury from "../../models/typeTreasury";
import { actorOf, sendError } from "./bansiHelpers";

// ຍອດຍົກມາຂອງປີໜຶ່ງ — body { fiscal_id } ; ຄືນທັງແຖວຍອດຍົກມາ ແລະ ຂໍ້ມູນປີ
export const getOpeningBalances = async (req: Request, res: Response) => {
  try {
    const fiscal_id = Number((req.body || {}).fiscal_id);
    if (!fiscal_id) {
      res.status(400).json({ message: "ກະລຸນາເລືອກປີການເງິນ" });
      return;
    }
    const [fiscal, data] = await Promise.all([
      FiscalYear.findByPk(fiscal_id),
      OpeningBalance.findAll({
        where: { fiscal_id, status: 1 },
        include: [
          {
            model: TreasuryAccount,
            as: "account",
            include: [
              {
                model: Banks,
                as: "banks",
                attributes: { include: [[fn("CONCAT", literal(`'${url()}/logo/'`), col("account->banks.logo")), "url"]] },
              },
              { model: TypeTreasury, as: "treasury", include: [{ model: Currency, as: "currency" }] },
            ],
          },
        ],
      }),
    ]);
    res.status(200).json({ fiscal, data, total: data.length });
  } catch (error) {
    sendError(res, error, "Error getting opening balances");
  }
};

/**
 * ບັນທຶກຍອດຍົກມາທັງປີເທື່ອດຽວ — body { fiscal_id, items: [{ account_id, balance_usable, balance_held, description? }] }.
 * ມີແຖວຢູ່ແລ້ວ → ແກ້, ບໍ່ມີ → ເພີ່ມ. ປີທີ່ປິດບັນຊີແລ້ວແກ້ບໍ່ໄດ້
 */
export const saveOpeningBalances = async (req: Request, res: Response) => {
  const t = await OpeningBalance.sequelize!.transaction();
  try {
    const fiscal_id = Number(req.body?.fiscal_id);
    const items: any[] = Array.isArray(req.body?.items) ? req.body.items : [];
    const fiscal = fiscal_id ? await FiscalYear.findByPk(fiscal_id, { transaction: t }) : null;
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
    let nextId = await maxid(OpeningBalance, "_uuid");
    const createby = actorOf(req);
    let saved = 0;
    for (const item of items) {
      const account_id = Number(item?.account_id);
      if (!account_id) continue;
      const values = {
        balance_usable: Number(item.balance_usable) || 0,
        balance_held: Number(item.balance_held) || 0,
        description: item.description || null,
        status: 1,
        updatedAt: new Date(),
      };
      const existing = await OpeningBalance.findOne({ where: { fiscal_id, account_id }, transaction: t });
      if (existing) await existing.update(values, { transaction: t });
      else await OpeningBalance.create({ ...values, _uuid: nextId++, fiscal_id, account_id, createby, createdAt: new Date() }, { transaction: t });
      saved++;
    }
    await t.commit();
    res.status(200).json({ message: "Successfully saved opening balances", saved });
  } catch (error) {
    await t.rollback();
    sendError(res, error, "Error saving opening balances");
  }
};
