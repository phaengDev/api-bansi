import { Request, Response } from "express";
import Currency from "../models/currencyModel";

export const getcurrency = async (req: Request, res: Response) => {
    try {
        const currency = await Currency.findAll();
        res.status(200).json({ data: currency });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch currency" });
    }
};

export const updateCurrency = async (req: Request<{ id: string }>, res: Response) => {
    try {
        const id = atob(req.params.id);
        req.body.updatedAt = new Date();
        const [updated] = await Currency.update(req.body, {
            where: { _id: id },
        });
        if (!updated) return res.status(404).json({ error: "Currency not found" });
        res.status(200).json({ message: "Currency updated successfully", data: updated });
    } catch (error) {
        res.status(500).json({ error: "Failed to update currency" });
    }
};

export const updateCurrencyMt = async (req: Request, res: Response) => {
  const t = await Currency.sequelize!.transaction();
  const { items } = req.body as any;

  try {
    if (!Array.isArray(items) || items.length === 0) {
      await t.rollback();
      return res.status(400).json({ error: "No items to update." });
    }

    const results: any[] = [];
    for (const item of items) {
      // ✅ ກວດວ່າມີ _id ຫຼືບໍ່
      if (!item._id) continue;

      const [affectedRows] = await Currency.update(
        {
          reate: item.reate,
          updatedAt: new Date(),
        },
        {
          where: { _id: item._id },
          transaction: t,
        }
      );

      if (affectedRows > 0) {
        const updated = await Currency.findByPk(item._id, { transaction: t });
        results.push(updated);
      }
    }

    await t.commit();
    res.status(200).json({
      message: "✅ Currency updated successfully",
      data: results,
    });
  } catch (error: any) {
    await t.rollback();
    console.error("❌ Update list error:", error.message || error);
    res.status(500).json({ error: "Failed to update currency list" });
  }
};
