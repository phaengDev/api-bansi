import { Request, Response } from "express";
import { Op } from "sequelize";
import { maxid, url } from "../../utils";
import TreasuryAccount from "../../models/treasuryAcount";
import Banks from "../../models/bankModel";
import TypeAcount from "../../models/typeAcount";
import Currency from "../../models/currencyModel";
import TypeTreasury from "../../models/typeTreasury";
import { col, fn, literal } from "sequelize";
import { actorOf } from "./bansiHelpers";
import { KIND_HELD, KIND_USABLE, MOVE_IN, MOVE_OUT, moveBalance } from "./accountMovement";
import { replyGlError } from "./glCore";
import { postAccountOpening } from "./glPosting";
import { isCashAccount, todayLao } from "./journalHelpers";
// import HistoryTransfer from "../../models/historyTransfer";
interface QueryParams {
  limit?: string;
  skip?: string;
  orderBy?: string;
  order?: string;
}
// created TreasuryAcount
export const createTreasuryAcount = async (req: Request, res: Response) => {
  const transaction = await TreasuryAccount.sequelize!.transaction(); // Start transaction
  try {
    const code = await maxid(TreasuryAccount, "_uuid");
    req.body._uuid = code;
    req.body.createdAt = new Date();
    // ສ້າງດ້ວຍຍອດ 0 ແລ້ວໃສ່ຍອດເລີ່ມຕົ້ນຜ່ານ moveBalance — ໃຫ້ປະຫວັດເລີ່ມຈາກ 0 → ຍອດທີ່ປ້ອນ (OPENING)
    const usable = Number(req.body.balance_treasury) || 0;
    const held = Number(req.body.balance_unable) || 0;
    // ບັນຊີເງິນສົດ (ໝວດ 101) ບໍ່ຜູກທະນາຄານ
    if (await isCashAccount(req.body, transaction)) req.body.bankId = null;
    const result = await TreasuryAccount.create({ ...req.body, balance_treasury: 0, balance_unable: 0 }, { transaction });
    const actorId = Number(actorOf(req));
    const opening = [
      { kind: KIND_USABLE, value: usable },
      { kind: KIND_HELD, value: held },
    ] as const;
    for (const { kind, value } of opening) {
      if (!value) continue;
      await moveBalance(result, {
        direction: value > 0 ? MOVE_IN : MOVE_OUT, amount: value, kind, source: "OPENING",
        description: "ຍອດເລີ່ມຕົ້ນຕອນເປີດບັນຊີ", actorId,
      }, transaction);
    }
    // ລົງບັນຊີຄູ່ຂອງຍອດເລີ່ມຕົ້ນ (ໜີ້ ເງິນສົດ/ທະນາຄານ / ມີ ທຶນຍອດຍົກມາ)
    if (usable + held) await postAccountOpening(Number(result.get("_uuid")), usable + held, todayLao(), transaction, actorId || null);
    await transaction.commit(); // Commit transaction
    res.status(200).json({ message: "Successfully created TreasuryAcount", data: result });
  } catch (error) {
    await transaction.rollback(); // ຢ່າປ່ອຍ transaction ຄ້າງ — ບໍ່ດັ່ງນັ້ນ connection ຈະຄ້າງຢູ່ pool
    if (replyGlError(res, error)) return;
    console.error("Error creating TreasuryAcount:", error);
    res.status(500).json({ message: "Error creating TreasuryAcount", error });
  }
}

// updated TreasuryAcount
export const updateTreasuryAcount = async (req: Request<{ id: string }>, res: Response) => {
  try {
    if (!req.body.updatedAt) {
      req.body.updatedAt = new Date();
    }
    const _uuid = atob(req.params.id);
    // ຍອດເງິນປ່ຽນໄດ້ສະເພາະຜ່ານ moveBalance (ໂອນ, ລາຍຮັບ …) ທີ່ບັນທຶກປະຫວັດ — ບໍ່ຮັບຈາກການແກ້ໄຂບັນຊີ
    const body = { ...req.body };
    delete body.balance_treasury;
    delete body.balance_unable;
    delete body._uuid;
    // ບັນຊີເງິນສົດ (ໝວດ 101) ບໍ່ຜູກທະນາຄານ — ໝວດເບິ່ງຈາກປະເພດທີ່ບັນທຶກໄວ້ ບໍ່ເຊື່ອຄ່າທີ່ສົ່ງມາ
    const current = await TreasuryAccount.findByPk(_uuid, { attributes: ["type_treasuryid"] });
    if (current && (await isCashAccount(current.get({ plain: true })))) body.bankId = null;
    const result = await TreasuryAccount.update(body, {
      where: { _uuid: _uuid },
    });
    res.status(200).json({ message: "Successfully updating TreasuryAcount", data: result });
  } catch (error) {
    res.status(500).json({ message: "Error updating TreasuryAcount", error });
  }
};
// delete TreasuryAcount
export const deleteTreasuryAcount = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const _uuid = atob(req.params.id);
    const result = await TreasuryAccount.destroy({
      where: { _uuid: _uuid },
    });
    res.status(200).json({ message: "Successfully deleting TreasuryAcount", data: result });
  } catch (error) {
    res.status(500).json({ message: "Error deleting TreasuryAcount", error });
  }
};

// get TreasuryAcount
export const getTreasuryAcount = async (
  req: Request<{}, {}, {}, QueryParams>,
  res: Response
): Promise<void> => {
  try {
    const orderBy = req.query.orderBy || "_uuid";
    const order = (req.query.order || "ASC").toUpperCase() as "ASC" | "DESC";
    const { bankId, type_treasuryid } = req.body as any;
    const whereCondition: any = {};
    if (bankId) {
      whereCondition.bankId = bankId;
    }
    if (type_treasuryid) {
      whereCondition.type_treasuryid = type_treasuryid;
    }

    const result = await TreasuryAccount.findAll({
      order: [[orderBy, order]],
      where: whereCondition,
      include: [
        {
          model: Banks,
          as: 'banks',
          attributes: {
            include: [
              [
                fn(
                  "CONCAT",
                  literal(`'${url()}/logo/'`), // ✅ ต้องเรียก function
                  col("banks.logo")          // ✅ tbl_banks ມີແຕ່ຖັນ logo (ບໍ່ມີ logoBank)
                ),
                "url"
              ]
            ]
          }
        },
        {
          model: TypeTreasury,
          as: 'treasury',
          include: [
            {
              model: Currency,
              as: 'currency', // tbl_currency ບໍ່ມີຖັນ icon_wallet
            },
            {
              model: TypeAcount,
              as: 'types',
            },
          ],
        },
      ],
    });
    res.status(200).json({
      data: result,
    });
  } catch (error) {
    res.status(500).json({ message: "Error getting TreasuryAcount", error });
  }
};


// get TreasuryAcount
export const getAcountOption = async (
  req: Request<{}, {}, {}, QueryParams>,
  res: Response
): Promise<void> => {
  try {
    const orderBy = req.query.orderBy || "_uuid";
    const order = (req.query.order || "ASC").toUpperCase() as "ASC" | "DESC";
    const whereCondition: any = { status: 1 };
    const result = await TreasuryAccount.findAll({
      order: [[orderBy, order]],
      where: whereCondition,
      include: [
        {
          model: Banks,
          as: 'banks',
          attributes: {
            include: [
              [
                fn(
                  "CONCAT",
                  literal(`'${url()}/logo/'`), // ✅ ต้องเรียก function
                  col("banks.logo")          // ✅ tbl_banks ມີແຕ່ຖັນ logo (ບໍ່ມີ logoBank)
                ),
                "url"
              ]
            ]
          }
        },
        {
          model: TypeTreasury,
          as: 'treasury',
          include: [
            {
              model: Currency,
              as: 'currency', // tbl_currency ບໍ່ມີຖັນ icon_wallet
            },
            {
              model: TypeAcount,
              as: 'types',
            },
          ],
        },
      ],
    });
    res.status(200).json({
      data: result,
    });
  } catch (error) {
    res.status(500).json({ message: "Error getting TreasuryAcount", error });
  }
};

// get TreasuryAcount
export const getAcountOptionExcept = async (
  req: Request<{}, {}, {}, QueryParams>,
  res: Response
): Promise<void> => {
  try {
    const orderBy = req.query.orderBy || "_uuid";
    const order = (req.query.order || "ASC").toUpperCase() as "ASC" | "DESC";
    const { _uuid, currencyId } = req.body as any;
    const whereCondition: any = { status: 1 };
    if (_uuid) {
      whereCondition._uuid = {
        [Op.ne]: _uuid, // ✅ ไม่เท่ากับ
      };
    }
    if (currencyId) {
      whereCondition['$treasury.currencyId$'] = currencyId;
    }
    const result = await TreasuryAccount.findAll({
      order: [[orderBy, order]],
      where: whereCondition,
      include: [
        {
          model: Banks,
          as: 'banks',
          attributes: {
            include: [
              [
                fn(
                  "CONCAT",
                  literal(`'${url()}/logo/'`), // ✅ ต้องเรียก function
                  col("banks.logo")          // ✅ tbl_banks ມີແຕ່ຖັນ logo (ບໍ່ມີ logoBank)
                ),
                "url"
              ]
            ]
          }
        },
        {
          model: TypeTreasury,
          as: 'treasury',
          include: [
            {
              model: Currency,
              as: 'currency', // tbl_currency ບໍ່ມີຖັນ icon_wallet
            },
            {
              model: TypeAcount,
              as: 'types',
            },
          ],
        },
      ],
    });
    res.status(200).json({
      data: result,
    });
  } catch (error) {
    res.status(500).json({ message: "Error getting TreasuryAcount", error });
  }
};
// get one TreasuryAcount Option
export const getTreasuryAcountOption = async (req: Request<{}>, res: Response) => {
  try {
    const { bankId, type_acountId } = req.body as any;
    const whereCondition: any = {
      status: 1
    };
    if (bankId) {
      whereCondition.bankId = bankId;
    }
    if (type_acountId) {
      // ໝວດບັນຊີ ຢູ່ tbl_type_treasury.typeId — ຕ້ອງ join ຜ່ານ treasury
      whereCondition['$treasury.typeId$'] = type_acountId;
    }
    const result = await TreasuryAccount.findAll({
      where: whereCondition,
      include: [{ model: TypeTreasury, as: 'treasury', attributes: [] }],
    });
    res.status(200).json({ data: result });
  } catch (error) {
    res.status(500).json({ message: "Error getting one TreasuryAcount", error });
  }
};


export const getTreasurtypeone = async (
  req: Request<{ id: string }>,
  res: Response
): Promise<void> => {
  try {
    const typeId = parseInt(req.params.id, 10);
    const acount = await TreasuryAccount.findOne({
      order: [["_uuid", "ASC"]],
      where: { type_treasuryid: typeId, status: 1 },
      include: [
        {
          model: Banks,
          as: 'banks',
          attributes: {
            include: [
              [
                fn(
                  "CONCAT",
                  literal(`'${url()}/logo/'`), // ✅ ต้องเรียก function
                  col("banks.logo")          // ✅ tbl_banks ມີແຕ່ຖັນ logo (ບໍ່ມີ logoBank)
                ),
                "url"
              ]
            ]
          },
        },
        {
          model: TypeTreasury,
          as: 'treasury',
          include: [
            {
              model: Currency,
              as: 'currency', // tbl_currency ບໍ່ມີຖັນ icon_wallet
            },
          ],
        },
      ]
    });
    res.json({
      data: acount
    });
  } catch (error) {
    console.error("Error in getTypeTreasuryById:", error);
    res.status(500).json({ message: "Error fetching typeTreasury", error });
  }
};


// export const getHistoryTransfer = async (
//   req: Request<{ id: string }, {}, {}, QueryParams>,
//   res: Response
// ): Promise<void> => {
//   try {
//     const limit = req.query.limit ? parseInt(req.query.limit, 10) : 25;
//     const offset = req.query.skip ? parseInt(req.query.skip, 10) : 0;
//     const orderBy = req.query.orderBy || "createdAt";
//     const order = (req.query.order || "ASC").toUpperCase() as "ASC" | "DESC";
//     const id = parseInt(req.params.id, 10);
//     const { rows, count } = await HistoryTransfer.findAndCountAll({
//       limit,
//       offset,
//       order: [[orderBy, order]],
//       where: { accountid: id },
//       include: [
//         {
//           model: TreasuryAcount,
//           as: 'acount',
//           include: [
//             {
//               model: Banks,
//               as: 'banks',
//               required: false,
//               attributes: {
//                 include: [
//                   [
//                     fn(
//                       "CONCAT",
//                       literal(`'${url()}/logos/'`), // ✅ ต้องเรียก function
//                       col("logoBank")          // ✅ alias + column
//                     ),
//                     "logo"
//                   ]
//                 ]
//               },
//             },
//             {
//               model: TypeTreasury,
//               as: 'treasury',
//               include: [
//                 {
//                   model: Currency,
//                   as: 'currency',
//                   attributes: {
//                     include: [
//                       [
//                         fn(
//                           "CONCAT",
//                           literal(`'${url()}/logos/'`),
//                           col("icon_wallet")
//                         ),
//                         "wallet"
//                       ]
//                     ]
//                   },
//                 },
//               ],
//             },
//           ]
//         }
//       ]
//     });
//     res.json({
//       data: rows,
//       total: count
//     });
//   } catch (error) {
//     console.error("Error in getTypeTreasuryById:", error);
//     res.status(500).json({ message: "Error fetching typeTreasury", error });
//   }
// };