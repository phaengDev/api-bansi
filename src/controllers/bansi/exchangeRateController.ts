import { Request, Response } from "express";
import { Transaction } from "sequelize";
import { maxid } from "../../utils";
import Currency from "../../models/currencyModel";
import ExchangeRate from "../../models/exchangeRate";
import { actorOf, decodeId, sendError, toDateOnly } from "./bansiHelpers";

/** ຂຽນອັດຕາຫຼ້າສຸດ (ຕາມ rate_date, ແລ້ວ createdAt) ກັບໄປ tbl_currency.reate — ໜ້າອື່ນອ່ານຖັນນີ້ຢູ່ */
const syncCurrencyRate = async (currencyId: number, t: Transaction) => {
  const latest = await ExchangeRate.findOne({
    where: { currencyId, status: 1 },
    order: [["rate_date", "DESC"], ["createdAt", "DESC"]],
    transaction: t,
  });
  if (latest) {
    await Currency.update({ reate: Number(latest.rate), updatedAt: new Date() } as any, { where: { _id: currencyId }, transaction: t });
  }
};

// ປະຫວັດອັດຕາ — body { currencyId? } ; ໃໝ່ສຸດຢູ່ເທິງ
export const getExchangeRates = async (req: Request, res: Response) => {
  try {
    const { currencyId } = (req.body || {}) as any;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 200;
    const data = await ExchangeRate.findAll({
      where: { status: 1, ...(currencyId ? { currencyId } : {}) },
      include: [{ model: Currency, as: "currency" }],
      order: [["rate_date", "DESC"], ["createdAt", "DESC"]],
      limit,
    });
    res.status(200).json({ data, total: data.length });
  } catch (error) {
    sendError(res, error, "Error getting exchange rates");
  }
};

// ບັນທຶກອັດຕາໃໝ່ + ອັບເດດອັດຕາປັດຈຸບັນຂອງສະກຸນເງິນ
export const createExchangeRate = async (req: Request, res: Response) => {
  const t = await ExchangeRate.sequelize!.transaction();
  try {
    const currencyId = Number(req.body.currencyId);
    const rate = Number(req.body.rate);
    const rate_date = toDateOnly(req.body.rate_date);
    if (!currencyId || !(rate > 0) || !rate_date) {
      await t.rollback();
      res.status(400).json({ message: "ກະລຸນາເລືອກສະກຸນເງິນ, ປ້ອນອັດຕາ (> 0) ແລະ ວັນທີ" });
      return;
    }
    const row = await ExchangeRate.create(
      {
        _uuid: await maxid(ExchangeRate, "_uuid"),
        currencyId,
        rate,
        rate_date,
        description: req.body.description || null,
        createby: actorOf(req),
        status: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      { transaction: t }
    );
    await syncCurrencyRate(currencyId, t);
    await t.commit();
    res.status(200).json({ message: "Successfully created exchange rate", data: row });
  } catch (error) {
    await t.rollback();
    sendError(res, error, "Error creating exchange rate");
  }
};

// ລຶບອັດຕາທີ່ປ້ອນຜິດ (soft delete) ແລ້ວຄຳນວນອັດຕາປັດຈຸບັນຄືນ
export const deleteExchangeRate = async (req: Request<{ id: string }>, res: Response) => {
  const t = await ExchangeRate.sequelize!.transaction();
  try {
    const row = await ExchangeRate.findByPk(decodeId(req), { transaction: t });
    if (!row) {
      await t.rollback();
      res.status(404).json({ message: "ບໍ່ພົບອັດຕາແລກປ່ຽນ" });
      return;
    }
    await row.update({ status: 0, updatedAt: new Date() }, { transaction: t });
    await syncCurrencyRate(row.currencyId, t);
    await t.commit();
    res.status(200).json({ message: "Successfully deleted exchange rate" });
  } catch (error) {
    await t.rollback();
    sendError(res, error, "Error deleting exchange rate");
  }
};
