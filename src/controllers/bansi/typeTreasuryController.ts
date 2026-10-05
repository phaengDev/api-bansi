import { Request, Response } from "express";
import { maxid, codeType } from "../../utils";
import TypeTreasury from "../../models/typeTreasury";
import Currency from "../../models/currencyModel";
import TypeAcount from "../../models/typeAcount";
import TreasuryAccount from "../../models/treasuryAcount";
import { decodeId, sendError } from "./bansiHelpers";
interface QueryParams {
  limit?: string;
  skip?: string;
  orderBy?: string;
  order?: string;
}
// created typeTreasury
export const createTypeTreasury = async (req: Request, res: Response) => {
  const transaction = await TypeTreasury.sequelize?.transaction(); // Start transaction
  try {
    const code = await maxid(TypeTreasury, "_uuid");
    req.body._uuid = code;
    const typecode = await codeType(TypeTreasury, "treasury_code", req.body.treasury_code);
    req.body.treasury_code = typecode;
    req.body.createdAt = new Date();

    const typeTreasury = await TypeTreasury.create(req.body, { transaction });
    await transaction?.commit(); // Commit transaction
    res.status(200).json({ message: "Successfully created typeTreasury", typeTreasury });
  } catch (error) {
    await transaction?.rollback(); // ຢ່າປ່ອຍ transaction ຄ້າງ — ບໍ່ດັ່ງນັ້ນ connection ຈະຄ້າງຢູ່ pool
    console.error("Error creating typeTreasury:", error);
    // ສົ່ງເຫດຜົນຈິງ (ເຊັ່ນ SQL error) ກັບໄປໃຫ້ໜ້າຈໍສະແດງໄດ້
    res.status(500).json({ message: (error as any)?.parent?.sqlMessage ?? (error as Error)?.message ?? "Error creating typeTreasury", error });
  }
};
// updated typeTreasury
export const updateTypeTreasury = async (req: Request<{ id: string }>, res: Response) => {
  try {
    if (!req.body.createdAt) {
      req.body.createdAt = new Date();
    }
    const _uuid = atob(req.params.id);
    const type = await TypeTreasury.update(req.body, {
      where: { _uuid: _uuid },
    });
    res.status(200).json({ message: "Successfully updating typeTreasury", data: type });
  } catch (error) {
    // ສົ່ງເຫດຜົນຈິງ (ເຊັ່ນ SQL error) ກັບໄປໃຫ້ໜ້າຈໍສະແດງໄດ້
    res.status(500).json({ message: (error as any)?.parent?.sqlMessage ?? (error as Error)?.message ?? "Error updating typeTreasury", error });
  }
};
// delete typeTreasury — ລຶບບໍ່ໄດ້ຖ້າຍັງມີບັນຊີເງິນຄັງ (tbl_treasury_account) ໃຊ້ປະເພດນີ້ຢູ່
export const deleteTypeTreasury = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const id = decodeId(req);
    const row = await TypeTreasury.findByPk(id);
    if (!row) {
      res.status(404).json({ message: "ບໍ່ພົບປະເພດບັນຊີ" });
      return;
    }
    const used = await TreasuryAccount.count({ where: { type_treasuryid: id } });
    if (used) {
      res.status(400).json({ message: `ລຶບບໍ່ໄດ້ — ມີບັນຊີເງິນຄັງ ${used} ບັນຊີ ໃຊ້ປະເພດນີ້ຢູ່ (ປິດໃຊ້ງານແທນໄດ້)` });
      return;
    }
    await row.destroy();
    res.status(200).json({ message: "Successfully deleted typeTreasury" });
  } catch (error) {
    sendError(res, error, "Error deleting typeTreasury");
  }
};

// get typeTreasury
export const getTypeTreasury = async (
  req: Request<{}, {}, {}, QueryParams>,
  res: Response
): Promise<void> => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
    const skip = req.query.skip ? parseInt(req.query.skip, 10) : 0;
    const orderBy = req.query.orderBy || "_uuid";
    const order = (req.query.order || "ASC").toUpperCase() as "ASC" | "DESC";
    const { currencyId, typeId } = req.body as any;
    const whereCondition: any = {
      status: 1
    };
    if (currencyId) {
      whereCondition.currencyId = currencyId;
    }
    if (typeId) {
      whereCondition.typeId = typeId;
    }
    const { rows, count } = await TypeTreasury.findAndCountAll({
      where: whereCondition,
      limit,
      offset: skip,
      order: [[orderBy, order]],
      include: [
        {
          model: Currency,
          as: 'currency',
        },
        {
          model: TypeAcount,
          as: 'types',
        },
      ],
    });
    res.status(200).json({
      data: rows,
      total: count,
      limit,
      skip,
    });
  } catch (error) {
    res.status(500).json({ message: "Error getting typeTreasury", error });
  }
};
// get typeTreasury option
export const getTypeTreasurOption = async (
  req: Request<{}>,
  res: Response
): Promise<void> => {
  try {
    // ຮອງຮັບທັງ GET (query) ແລະ POST (body)
    const { typeId, currencyId } = { ...req.query, ...(req.body || {}) } as any;
    const whereCondition: any = { status: 1 };
    if (typeId) {
      whereCondition.typeId = typeId;
    }
    if (currencyId) {
      whereCondition.currencyId = currencyId;
    }
    const treasury = await TypeTreasury.findAll({
      where: whereCondition,
      include: [
        {
          model: Currency,
          as: 'currency',
        },
        {
          model: TypeAcount,
          as: 'types',
        },
      ],
    });
    res.json({
      data: treasury
    });
  } catch (error) {
    console.error("Error in getTypeTreasuryById:", error);
    res.status(500).json({ message: "Error fetching typeTreasury", error });
  }
};

export const getTreasurbytype = async (
  req: Request<{id: string}>,
  res: Response
): Promise<void> => {
  try {
    const typeId = parseInt(req.params.id, 10);
    const treasury = await TypeTreasury.findAll({
      where: { typeId: typeId  },
      include: [
        {
          model: Currency,
          as: 'currency',
        },
      ]
    });
    res.json({
      data: treasury
    });
  } catch (error) {
    console.error("Error in getTypeTreasuryById:", error);
    res.status(500).json({ message: "Error fetching typeTreasury", error });
  }
};

