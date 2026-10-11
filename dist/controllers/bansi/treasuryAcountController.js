"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTreasurtypeone = exports.getTreasuryAcountOption = exports.getAcountOptionExcept = exports.getAcountOption = exports.getTreasuryAcount = exports.deleteTreasuryAcount = exports.updateTreasuryAcount = exports.createTreasuryAcount = void 0;
const sequelize_1 = require("sequelize");
const utils_1 = require("../../utils");
const treasuryAcount_1 = __importDefault(require("../../models/treasuryAcount"));
const bankModel_1 = __importDefault(require("../../models/bankModel"));
const typeAcount_1 = __importDefault(require("../../models/typeAcount"));
const currencyModel_1 = __importDefault(require("../../models/currencyModel"));
const typeTreasury_1 = __importDefault(require("../../models/typeTreasury"));
const sequelize_2 = require("sequelize");
const bansiHelpers_1 = require("./bansiHelpers");
const accountMovement_1 = require("./accountMovement");
const glCore_1 = require("./glCore");
const glPosting_1 = require("./glPosting");
const journalHelpers_1 = require("./journalHelpers");
// created TreasuryAcount
const createTreasuryAcount = async (req, res) => {
    const transaction = await treasuryAcount_1.default.sequelize.transaction(); // Start transaction
    try {
        const code = await (0, utils_1.maxid)(treasuryAcount_1.default, "_uuid");
        req.body._uuid = code;
        req.body.createdAt = new Date();
        // ສ້າງດ້ວຍຍອດ 0 ແລ້ວໃສ່ຍອດເລີ່ມຕົ້ນຜ່ານ moveBalance — ໃຫ້ປະຫວັດເລີ່ມຈາກ 0 → ຍອດທີ່ປ້ອນ (OPENING)
        const usable = Number(req.body.balance_treasury) || 0;
        const held = Number(req.body.balance_unable) || 0;
        // ບັນຊີເງິນສົດ (ໝວດ 101) ບໍ່ຜູກທະນາຄານ
        if (await (0, journalHelpers_1.isCashAccount)(req.body, transaction))
            req.body.bankId = null;
        const result = await treasuryAcount_1.default.create({ ...req.body, balance_treasury: 0, balance_unable: 0 }, { transaction });
        const actorId = Number((0, bansiHelpers_1.actorOf)(req));
        const opening = [
            { kind: accountMovement_1.KIND_USABLE, value: usable },
            { kind: accountMovement_1.KIND_HELD, value: held },
        ];
        for (const { kind, value } of opening) {
            if (!value)
                continue;
            await (0, accountMovement_1.moveBalance)(result, {
                direction: value > 0 ? accountMovement_1.MOVE_IN : accountMovement_1.MOVE_OUT, amount: value, kind, source: "OPENING",
                description: "ຍອດເລີ່ມຕົ້ນຕອນເປີດບັນຊີ", actorId,
            }, transaction);
        }
        // ລົງບັນຊີຄູ່ຂອງຍອດເລີ່ມຕົ້ນ (ໜີ້ ເງິນສົດ/ທະນາຄານ / ມີ ທຶນຍອດຍົກມາ)
        if (usable + held)
            await (0, glPosting_1.postAccountOpening)(Number(result.get("_uuid")), usable + held, (0, journalHelpers_1.todayLao)(), transaction, actorId || null);
        await transaction.commit(); // Commit transaction
        res.status(200).json({ message: "Successfully created TreasuryAcount", data: result });
    }
    catch (error) {
        await transaction.rollback(); // ຢ່າປ່ອຍ transaction ຄ້າງ — ບໍ່ດັ່ງນັ້ນ connection ຈະຄ້າງຢູ່ pool
        if ((0, glCore_1.replyGlError)(res, error))
            return;
        console.error("Error creating TreasuryAcount:", error);
        res.status(500).json({ message: "Error creating TreasuryAcount", error });
    }
};
exports.createTreasuryAcount = createTreasuryAcount;
// updated TreasuryAcount
const updateTreasuryAcount = async (req, res) => {
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
        const current = await treasuryAcount_1.default.findByPk(_uuid, { attributes: ["type_treasuryid"] });
        if (current && (await (0, journalHelpers_1.isCashAccount)(current.get({ plain: true }))))
            body.bankId = null;
        const result = await treasuryAcount_1.default.update(body, {
            where: { _uuid: _uuid },
        });
        res.status(200).json({ message: "Successfully updating TreasuryAcount", data: result });
    }
    catch (error) {
        res.status(500).json({ message: "Error updating TreasuryAcount", error });
    }
};
exports.updateTreasuryAcount = updateTreasuryAcount;
// delete TreasuryAcount
const deleteTreasuryAcount = async (req, res) => {
    try {
        const _uuid = atob(req.params.id);
        const result = await treasuryAcount_1.default.destroy({
            where: { _uuid: _uuid },
        });
        res.status(200).json({ message: "Successfully deleting TreasuryAcount", data: result });
    }
    catch (error) {
        res.status(500).json({ message: "Error deleting TreasuryAcount", error });
    }
};
exports.deleteTreasuryAcount = deleteTreasuryAcount;
// get TreasuryAcount
const getTreasuryAcount = async (req, res) => {
    try {
        const orderBy = req.query.orderBy || "_uuid";
        const order = (req.query.order || "ASC").toUpperCase();
        const { bankId, type_treasuryid } = req.body;
        const whereCondition = {};
        if (bankId) {
            whereCondition.bankId = bankId;
        }
        if (type_treasuryid) {
            whereCondition.type_treasuryid = type_treasuryid;
        }
        const result = await treasuryAcount_1.default.findAll({
            order: [[orderBy, order]],
            where: whereCondition,
            include: [
                {
                    model: bankModel_1.default,
                    as: 'banks',
                    attributes: {
                        include: [
                            [
                                (0, sequelize_2.fn)("CONCAT", (0, sequelize_2.literal)(`'${(0, utils_1.url)()}/logo/'`), // ✅ ต้องเรียก function
                                (0, sequelize_2.col)("banks.logo") // ✅ tbl_banks ມີແຕ່ຖັນ logo (ບໍ່ມີ logoBank)
                                ),
                                "url"
                            ]
                        ]
                    }
                },
                {
                    model: typeTreasury_1.default,
                    as: 'treasury',
                    include: [
                        {
                            model: currencyModel_1.default,
                            as: 'currency', // tbl_currency ບໍ່ມີຖັນ icon_wallet
                        },
                        {
                            model: typeAcount_1.default,
                            as: 'types',
                        },
                    ],
                },
            ],
        });
        res.status(200).json({
            data: result,
        });
    }
    catch (error) {
        res.status(500).json({ message: "Error getting TreasuryAcount", error });
    }
};
exports.getTreasuryAcount = getTreasuryAcount;
// get TreasuryAcount
const getAcountOption = async (req, res) => {
    try {
        const orderBy = req.query.orderBy || "_uuid";
        const order = (req.query.order || "ASC").toUpperCase();
        const whereCondition = { status: 1 };
        const result = await treasuryAcount_1.default.findAll({
            order: [[orderBy, order]],
            where: whereCondition,
            include: [
                {
                    model: bankModel_1.default,
                    as: 'banks',
                    attributes: {
                        include: [
                            [
                                (0, sequelize_2.fn)("CONCAT", (0, sequelize_2.literal)(`'${(0, utils_1.url)()}/logo/'`), // ✅ ต้องเรียก function
                                (0, sequelize_2.col)("banks.logo") // ✅ tbl_banks ມີແຕ່ຖັນ logo (ບໍ່ມີ logoBank)
                                ),
                                "url"
                            ]
                        ]
                    }
                },
                {
                    model: typeTreasury_1.default,
                    as: 'treasury',
                    include: [
                        {
                            model: currencyModel_1.default,
                            as: 'currency', // tbl_currency ບໍ່ມີຖັນ icon_wallet
                        },
                        {
                            model: typeAcount_1.default,
                            as: 'types',
                        },
                    ],
                },
            ],
        });
        res.status(200).json({
            data: result,
        });
    }
    catch (error) {
        res.status(500).json({ message: "Error getting TreasuryAcount", error });
    }
};
exports.getAcountOption = getAcountOption;
// get TreasuryAcount
const getAcountOptionExcept = async (req, res) => {
    try {
        const orderBy = req.query.orderBy || "_uuid";
        const order = (req.query.order || "ASC").toUpperCase();
        const { _uuid, currencyId } = req.body;
        const whereCondition = { status: 1 };
        if (_uuid) {
            whereCondition._uuid = {
                [sequelize_1.Op.ne]: _uuid, // ✅ ไม่เท่ากับ
            };
        }
        if (currencyId) {
            whereCondition['$treasury.currencyId$'] = currencyId;
        }
        const result = await treasuryAcount_1.default.findAll({
            order: [[orderBy, order]],
            where: whereCondition,
            include: [
                {
                    model: bankModel_1.default,
                    as: 'banks',
                    attributes: {
                        include: [
                            [
                                (0, sequelize_2.fn)("CONCAT", (0, sequelize_2.literal)(`'${(0, utils_1.url)()}/logo/'`), // ✅ ต้องเรียก function
                                (0, sequelize_2.col)("banks.logo") // ✅ tbl_banks ມີແຕ່ຖັນ logo (ບໍ່ມີ logoBank)
                                ),
                                "url"
                            ]
                        ]
                    }
                },
                {
                    model: typeTreasury_1.default,
                    as: 'treasury',
                    include: [
                        {
                            model: currencyModel_1.default,
                            as: 'currency', // tbl_currency ບໍ່ມີຖັນ icon_wallet
                        },
                        {
                            model: typeAcount_1.default,
                            as: 'types',
                        },
                    ],
                },
            ],
        });
        res.status(200).json({
            data: result,
        });
    }
    catch (error) {
        res.status(500).json({ message: "Error getting TreasuryAcount", error });
    }
};
exports.getAcountOptionExcept = getAcountOptionExcept;
// get one TreasuryAcount Option
const getTreasuryAcountOption = async (req, res) => {
    try {
        const { bankId, type_acountId } = req.body;
        const whereCondition = {
            status: 1
        };
        if (bankId) {
            whereCondition.bankId = bankId;
        }
        if (type_acountId) {
            // ໝວດບັນຊີ ຢູ່ tbl_type_treasury.typeId — ຕ້ອງ join ຜ່ານ treasury
            whereCondition['$treasury.typeId$'] = type_acountId;
        }
        const result = await treasuryAcount_1.default.findAll({
            where: whereCondition,
            include: [{ model: typeTreasury_1.default, as: 'treasury', attributes: [] }],
        });
        res.status(200).json({ data: result });
    }
    catch (error) {
        res.status(500).json({ message: "Error getting one TreasuryAcount", error });
    }
};
exports.getTreasuryAcountOption = getTreasuryAcountOption;
const getTreasurtypeone = async (req, res) => {
    try {
        const typeId = parseInt(req.params.id, 10);
        const acount = await treasuryAcount_1.default.findOne({
            order: [["_uuid", "ASC"]],
            where: { type_treasuryid: typeId, status: 1 },
            include: [
                {
                    model: bankModel_1.default,
                    as: 'banks',
                    attributes: {
                        include: [
                            [
                                (0, sequelize_2.fn)("CONCAT", (0, sequelize_2.literal)(`'${(0, utils_1.url)()}/logo/'`), // ✅ ต้องเรียก function
                                (0, sequelize_2.col)("banks.logo") // ✅ tbl_banks ມີແຕ່ຖັນ logo (ບໍ່ມີ logoBank)
                                ),
                                "url"
                            ]
                        ]
                    },
                },
                {
                    model: typeTreasury_1.default,
                    as: 'treasury',
                    include: [
                        {
                            model: currencyModel_1.default,
                            as: 'currency', // tbl_currency ບໍ່ມີຖັນ icon_wallet
                        },
                    ],
                },
            ]
        });
        res.json({
            data: acount
        });
    }
    catch (error) {
        console.error("Error in getTypeTreasuryById:", error);
        res.status(500).json({ message: "Error fetching typeTreasury", error });
    }
};
exports.getTreasurtypeone = getTreasurtypeone;
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
