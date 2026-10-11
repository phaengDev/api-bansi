"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadIncomeFile = exports.cancelIncome = exports.updateIncome = exports.createIncome = exports.getIncomes = void 0;
const moment_1 = __importDefault(require("moment"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const sequelize_1 = require("sequelize");
const incomeModel_1 = __importDefault(require("../../models/incomeModel"));
const typeIncomeModel_1 = __importDefault(require("../../models/typeIncomeModel"));
const treasuryAcount_1 = __importDefault(require("../../models/treasuryAcount"));
const bankModel_1 = __importDefault(require("../../models/bankModel"));
const userModel_1 = __importDefault(require("../../models/userModel"));
const utils_1 = require("../../utils");
const uploadFile_1 = require("../../utils/uploadFile");
const bansiHelpers_1 = require("./bansiHelpers");
const docNumberingController_1 = require("./docNumberingController");
const accountMovement_1 = require("./accountMovement");
const journalHelpers_1 = require("./journalHelpers");
const glCore_1 = require("./glCore");
const glPosting_1 = require("./glPosting");
/**
 * ລາຍຮັບ (tbl_incomes) — ບັນທຶກແລ້ວເງິນເຂົ້າ "ຍອດໃຊ້ໄດ້" (balance_treasury) ຂອງບັນຊີເງິນຄັງທັນທີ,
 * ຍົກເລີກ (status 2) = ຫັກຄືນ. ຖັນເງິນ: balances = ຈຳນວນທີ່ປ້ອນ, tax = ອາກອນ, balance_income = ຍອດເຂົ້າບັນຊີ.
 * ບັນທຶກແລ້ວ ບັນຊີ/ຈຳນວນ/ອາກອນ ແກ້ບໍ່ໄດ້ (ຍອດບັນຊີຜູກກັບມັນແລ້ວ) — ຕ້ອງຍົກເລີກແລ້ວບັນທຶກໃໝ່.
 * ໄຟລ໌ເອກະສານ (file_doct) ເກັບຢູ່ uploads/income
 */
/** ປະເພດລາຍຮັບ = tbl_finance_categories.typestatus 1 */
const INCOME_KIND = 1;
const FILE_FOLDER = "income";
/** ເລກທີຈາກ ຕັ້ງຄ່າ → ເລກທີເອກະສານ; ຍັງບໍ່ຕັ້ງກໍ່ໃຊ້ເລກສຳຮອງ RV-YYYY-00001 */
const DOC_CODE = "RECEIPT";
/** ວັນທີຂອງລາຍຮັບ = income_date; ແຖວເກົ່າທີ່ຍັງບໍ່ມີ ໃຊ້ວັນທີ (ເວລາລາວ) ຂອງ createdAt */
const EFFECTIVE_DATE = "COALESCE(`Incomes`.`income_date`, DATE(DATE_ADD(`Incomes`.`createdAt`, INTERVAL 7 HOUR)))";
/** ວັນທີຮັບເງິນຈາກ body — ບໍ່ສົ່ງ = ມື້ນີ້; ຜິດຮູບແບບ ຫຼື ເກີນມື້ນີ້ = error */
const incomeDateOf = (value) => (0, journalHelpers_1.entryDateOf)(value, "ວັນທີຮັບເງິນ");
const includeAll = [
    { model: typeIncomeModel_1.default, as: "typein", attributes: ["_uuid", "type_code", "type_name"] },
    journalHelpers_1.accountInclude,
    { model: userModel_1.default, as: "user", attributes: ["user_uuid", "user_name"] },
    { model: bankModel_1.default, as: "payerBank", attributes: ["_uuid", "abbr", "name_la", "logo"] },
    journalHelpers_1.partnerInclude,
];
/**
 * ວິທີຮັບເງິນ — 1 ເງິນສົດ (ລ້າງຂໍ້ມູນຜູ້ໂອນ), 2 ເງິນໂອນ (ທະນາຄານ / ຊື່ບັນຊີ / ເລກບັນຊີ ຂອງຜູ້ໂອນ ບໍ່ບັງຄັບ).
 * ຄືນ null ຖ້າ body ບໍ່ໄດ້ສົ່ງ receive_type ມາ (ຕອນແກ້ໄຂ = ບໍ່ປ່ຽນ)
 */
const receiveFields = (body) => {
    if (body.receive_type === undefined)
        return null;
    const isTransfer = Number(body.receive_type) === journalHelpers_1.TRANSFER;
    const text = (value) => String(value ?? "").trim() || null;
    const bankId = Number(body.payer_bank_id);
    return {
        receive_type: isTransfer ? journalHelpers_1.TRANSFER : journalHelpers_1.CASH,
        payer_bank_id: isTransfer && Number.isInteger(bankId) && bankId > 0 ? bankId : null,
        payer_account_name: isTransfer ? text(body.payer_account_name) : null,
        payer_account_number: isTransfer ? text(body.payer_account_number) : null,
    };
};
/** ແປງແຖວໃຫ້ພ້ອມສະແດງ — URL ເຕັມຂອງໄຟລ໌ ແລະ ໂລໂກ້ທະນາຄານ */
const present = (row) => {
    const r = row.get({ plain: true });
    const logo = r.acount?.banks?.logo;
    const payerLogo = r.payerBank?.logo;
    return {
        ...r,
        file_url: r.file_doct ? `${(0, utils_1.url)()}/${FILE_FOLDER}/${r.file_doct}` : null,
        payerBank: r.payerBank && { ...r.payerBank, url: payerLogo ? `${(0, utils_1.url)()}/logo/${payerLogo}` : null },
        acount: r.acount && {
            ...r.acount,
            banks: r.acount.banks && { ...r.acount.banks, url: logo ? `${(0, utils_1.url)()}/logo/${logo}` : null },
        },
    };
};
const uploadedName = (req) => req.file?.filename;
/** ໄຟລ໌ທີ່ multer ບັນທຶກໄວ້ແລ້ວ ແຕ່ການບັນທຶກລົ້ມເຫຼວ — ລຶບຖິ້ມ ບໍ່ໃຫ້ຄ້າງ */
const discardUpload = (req) => {
    const name = uploadedName(req);
    if (name)
        (0, uploadFile_1.deleteFile)(FILE_FOLDER, name);
};
/**
 * POST /income/fetch { start_date?, end_date?, status?, partner_id? } — ລາຍຮັບຕາມວັນທີຮັບເງິນ ໃໝ່ສຸດກ່ອນ + ສະຫຼຸບຍອດຕາມສະກຸນເງິນ (ສະເພາະທີ່ໃຊ້ງານ).
 * ວັນທີ "YYYY-MM-DD" ຫຼື "DD/MM/YYYY"; ນັບຕາມເວລາລາວ
 */
const getIncomes = async (req, res) => {
    try {
        const body = req.body || {};
        const where = {};
        const start = (0, bansiHelpers_1.toDateOnly)(body.start_date);
        const end = (0, bansiHelpers_1.toDateOnly)(body.end_date);
        // ກັ່ນຕາມວັນທີຮັບເງິນ (income_date) — ແຖວເກົ່າທີ່ບໍ່ມີ ໃຊ້ createdAt (ເວລາລາວ) ແທນ
        if (start || end) {
            where[sequelize_1.Op.or] = [
                {
                    income_date: {
                        ...(start ? { [sequelize_1.Op.gte]: start } : {}),
                        ...(end ? { [sequelize_1.Op.lte]: end } : {}),
                    },
                },
                {
                    income_date: null,
                    createdAt: {
                        ...(start ? { [sequelize_1.Op.gte]: moment_1.default.parseZone(`${start}T00:00:00${journalHelpers_1.BUSINESS_OFFSET}`).toDate() } : {}),
                        ...(end ? { [sequelize_1.Op.lt]: moment_1.default.parseZone(`${end}T00:00:00${journalHelpers_1.BUSINESS_OFFSET}`).add(1, "day").toDate() } : {}),
                    },
                },
            ];
        }
        if ([journalHelpers_1.ACTIVE, journalHelpers_1.CANCELLED].includes(Number(body.status)))
            where.status = Number(body.status);
        if (Number.isInteger(Number(body.partner_id)) && Number(body.partner_id) > 0)
            where.partner_id = Number(body.partner_id);
        const rows = await incomeModel_1.default.findAll({
            where,
            order: [[(0, sequelize_1.literal)(EFFECTIVE_DATE), "DESC"], ["createdAt", "DESC"]],
            include: includeAll,
        });
        const data = rows.map(present);
        const totals = new Map();
        data.filter((r) => Number(r.status) === journalHelpers_1.ACTIVE).forEach((r) => {
            const cur = r.acount?.treasury?.currency;
            const key = cur?.name ?? "—";
            const item = totals.get(key) ?? { currency: key, genus: cur?.genus ?? null, total: 0, tax: 0, count: 0 };
            item.total += Number(r.balance_income) || 0;
            item.tax += Number(r.tax) || 0;
            item.count += 1;
            totals.set(key, item);
        });
        res.status(200).json({ data, summary: [...totals.values()] });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting incomes");
    }
};
exports.getIncomes = getIncomes;
/**
 * POST /income/create (multipart, ໄຟລ໌ field "file_doct")
 * { income_date? (YYYY-MM-DD, ບໍ່ສົ່ງ = ມື້ນີ້, ບໍ່ເກີນມື້ນີ້), incom_title, type_incom_fk, acount_id_fk, balances, tax_id? | (tax, calc_method)?, description?,
 *   payer_bank_id?, payer_account_name?, payer_account_number?, partner_id?, payer_name? } — receive_type ຄິດຈາກໝວດຂອງບັນຊີເອງ
 */
const createIncome = async (req, res) => {
    const t = await incomeModel_1.default.sequelize.transaction();
    const fail = async (code, message) => {
        await t.rollback();
        discardUpload(req);
        res.status(code).json({ message });
    };
    try {
        const body = req.body || {};
        const title = String(body.incom_title ?? "").trim();
        const categoryId = Number(body.type_incom_fk);
        const accountId = Number(body.acount_id_fk);
        const amount = Math.round(Number(body.balances));
        if (!title)
            return fail(400, "ກະລຸນາປ້ອນລາຍການ");
        if (!Number.isInteger(categoryId))
            return fail(400, "ກະລຸນາເລືອກປະເພດລາຍຮັບ");
        if (!Number.isInteger(accountId))
            return fail(400, "ກະລຸນາເລືອກບັນຊີຮັບເງິນ");
        if (!Number.isFinite(amount) || amount <= 0)
            return fail(400, "ຈຳນວນເງິນຕ້ອງຫຼາຍກວ່າ 0");
        const incomeDate = incomeDateOf(body.income_date);
        if ("error" in incomeDate)
            return fail(400, incomeDate.error);
        const partner = await (0, journalHelpers_1.partnerIdOf)(body.partner_id, journalHelpers_1.INCOME_PARTNER_TYPES);
        if ("error" in partner)
            return fail(400, partner.error);
        const category = await typeIncomeModel_1.default.findOne({
            where: { _uuid: categoryId, typestatus: INCOME_KIND, status: 1 },
            transaction: t,
        });
        if (!category)
            return fail(400, "ບໍ່ພົບປະເພດລາຍຮັບທີ່ເລືອກ");
        const account = await treasuryAcount_1.default.findByPk(accountId, { transaction: t, lock: t.LOCK.UPDATE });
        if (!account || Number(account.status) !== 1)
            return fail(400, "ບັນຊີຮັບເງິນບໍ່ມີ ຫຼື ປິດໃຊ້ງານແລ້ວ");
        // ວິທີຮັບເງິນມາຈາກໝວດຂອງບັນຊີຮັບເງິນ (ໜ້າເວັບເລືອກໝວດກ່ອນເລືອກບັນຊີ): ໝວດເງິນສົດ = ເງິນສົດ (ລ້າງຂໍ້ມູນຜູ້ໂອນ),
        // ໝວດອື່ນ = ເງິນໂອນ — ບໍ່ເຊື່ອ receive_type ທີ່ສົ່ງມາ ໃຫ້ຄ່າກົງກັບບັນຊີສະເໝີ
        const isCash = await (0, journalHelpers_1.isCashAccount)(account, t);
        const receive = receiveFields({ ...body, receive_type: isCash ? journalHelpers_1.CASH : journalHelpers_1.TRANSFER });
        const taxed = await (0, journalHelpers_1.computeTax)(body, amount, t);
        if ("error" in taxed)
            return fail(400, taxed.error);
        const issued = await (0, docNumberingController_1.issueDocNumber)(DOC_CODE, t);
        let number = issued?.number;
        if (!number) {
            const prefix = `RV-${(0, moment_1.default)().utcOffset(journalHelpers_1.BUSINESS_OFFSET).format("YYYY")}-`;
            const count = await incomeModel_1.default.count({ where: { number: { [sequelize_1.Op.like]: `${prefix}%` } }, transaction: t });
            number = `${prefix}${String(count + 1).padStart(5, "0")}`;
        }
        const actor = Number((0, bansiHelpers_1.actorOf)(req));
        const row = await incomeModel_1.default.create({
            number,
            income_date: incomeDate.date,
            incom_title: title,
            type_incom_fk: categoryId,
            type_acountid: account.type_treasuryid,
            acount_id_fk: accountId,
            ...receive,
            partner_id: "id" in partner ? partner.id : null,
            payer_name: String(body.payer_name ?? "").trim() || null,
            balances: amount,
            tax: taxed.tax,
            balance_income: taxed.total,
            description: String(body.description ?? "").trim() || null,
            file_doct: uploadedName(req) ?? null,
            close: 1,
            status: journalHelpers_1.ACTIVE,
            createdbyid: Number.isInteger(actor) ? actor : null,
        }, { transaction: t });
        await (0, accountMovement_1.moveBalance)(account, {
            direction: accountMovement_1.MOVE_IN, amount: taxed.total, source: "INCOME", sourceId: row.get("_uuid"),
            docNumber: number, date: incomeDate.date, description: title, actorId: actor,
        }, t);
        // ລົງບັນຊີຄູ່ (ໜີ້ ເງິນສົດ/ທະນາຄານ / ມີ ລາຍຮັບ + ອາກອນ) — ບໍ່ສຳເລັດ = ບໍ່ບັນທຶກລາຍຮັບ
        await (0, glPosting_1.postIncome)(row, t, Number.isInteger(actor) ? actor : null);
        await t.commit();
        const saved = await incomeModel_1.default.findByPk(row.get("_uuid"), { include: includeAll });
        res.status(200).json({ message: "Successfully created income", data: saved && present(saved) });
    }
    catch (error) {
        await t.rollback();
        discardUpload(req);
        if ((0, glCore_1.replyGlError)(res, error))
            return;
        (0, bansiHelpers_1.sendError)(res, error, "Error creating income");
    }
};
exports.createIncome = createIncome;
/**
 * PUT /income/:id (multipart) — ແກ້ໄດ້ສະເພາະ ວັນທີຮັບເງິນ, ລາຍການ, ປະເພດ, ລາຍລະອຽດ, ລູກຄ້າ, ຂໍ້ມູນຜູ້ໂອນ (ເງິນໂອນ),
 * ໄຟລ໌ (ສົ່ງ remove_file=1 ເພື່ອລຶບໄຟລ໌).
 * ບັນຊີ / ຈຳນວນ / ອາກອນ ບໍ່ປ່ຽນ — ຍອດບັນຊີຜູກກັບມັນແລ້ວ
 */
const updateIncome = async (req, res) => {
    try {
        const row = await incomeModel_1.default.findByPk((0, bansiHelpers_1.decodeId)(req));
        if (!row) {
            discardUpload(req);
            res.status(404).json({ message: "ບໍ່ພົບລາຍຮັບ" });
            return;
        }
        if (Number(row.status) !== journalHelpers_1.ACTIVE) {
            discardUpload(req);
            res.status(400).json({ message: "ລາຍຮັບທີ່ຍົກເລີກແລ້ວ ແກ້ໄຂບໍ່ໄດ້" });
            return;
        }
        const body = req.body || {};
        const patch = {};
        if (body.incom_title !== undefined) {
            const title = String(body.incom_title).trim();
            if (!title) {
                discardUpload(req);
                res.status(400).json({ message: "ກະລຸນາປ້ອນລາຍການ" });
                return;
            }
            patch.incom_title = title;
        }
        if (body.type_incom_fk !== undefined) {
            const category = await typeIncomeModel_1.default.findOne({
                where: { _uuid: Number(body.type_incom_fk), typestatus: INCOME_KIND, status: 1 },
            });
            if (!category) {
                discardUpload(req);
                res.status(400).json({ message: "ບໍ່ພົບປະເພດລາຍຮັບທີ່ເລືອກ" });
                return;
            }
            patch.type_incom_fk = Number(body.type_incom_fk);
        }
        if (body.description !== undefined)
            patch.description = String(body.description).trim() || null;
        // ລູກຄ້າແກ້ໄດ້ (ບໍ່ກະທົບຍອດບັນຊີ ແລະ ບັນຊີຄູ່)
        const partner = await (0, journalHelpers_1.partnerIdOf)(body.partner_id, journalHelpers_1.INCOME_PARTNER_TYPES, row.partner_id ?? null);
        if ("error" in partner) {
            discardUpload(req);
            res.status(400).json({ message: partner.error });
            return;
        }
        if ("id" in partner)
            patch.partner_id = partner.id;
        if (body.payer_name !== undefined)
            patch.payer_name = String(body.payer_name).trim() || null;
        // ວັນທີຮັບເງິນແກ້ໄດ້ (ບໍ່ກະທົບຍອດບັນຊີ)
        if (body.income_date !== undefined) {
            const incomeDate = incomeDateOf(body.income_date);
            if ("error" in incomeDate) {
                discardUpload(req);
                res.status(400).json({ message: incomeDate.error });
                return;
            }
            patch.income_date = incomeDate.date;
        }
        // ວິທີຮັບເງິນລັອກຕາມບັນຊີທີ່ບັນທຶກແລ້ວ — ແກ້ໄດ້ແຕ່ຂໍ້ມູນຜູ້ໂອນ (ຖ້າເປັນເງິນໂອນ)
        Object.assign(patch, receiveFields({ ...body, receive_type: row.receive_type }) ?? {});
        const uploaded = uploadedName(req);
        const replacesFile = !!uploaded || Number(body.remove_file) === 1;
        const oldFile = replacesFile ? row.file_doct : null;
        if (replacesFile)
            patch.file_doct = uploaded ?? null;
        // ປ່ຽນວັນທີ/ປະເພດ/ລາຍການ → ລົງບັນຊີໃໝ່ໃນ transaction ດຽວກັນ (ປີການເງິນປິດແລ້ວ = ແກ້ບໍ່ໄດ້)
        const affectsGl = ["income_date", "type_incom_fk", "incom_title"].some((key) => patch[key] !== undefined && String(patch[key]) !== String(row[key]));
        const t = await incomeModel_1.default.sequelize.transaction();
        try {
            await row.update({ ...patch, updatedAt: new Date() }, { transaction: t });
            if (affectsGl)
                await (0, glPosting_1.postIncome)(row, t, Number((0, bansiHelpers_1.actorOf)(req)) || null);
            await t.commit();
        }
        catch (error) {
            await t.rollback();
            throw error;
        }
        if (oldFile)
            (0, uploadFile_1.deleteFile)(FILE_FOLDER, oldFile);
        const saved = await incomeModel_1.default.findByPk(row._uuid, { include: includeAll });
        res.status(200).json({ message: "Successfully updated income", data: saved && present(saved) });
    }
    catch (error) {
        discardUpload(req);
        if ((0, glCore_1.replyGlError)(res, error))
            return;
        (0, bansiHelpers_1.sendError)(res, error, "Error updating income");
    }
};
exports.updateIncome = updateIncome;
/** PUT /income/cancel/:id — ຍົກເລີກ (status 2) ແລະ ຫັກເງິນອອກຈາກບັນຊີຄືນ; ຍອດໃຊ້ໄດ້ບໍ່ພໍ = ຍົກເລີກບໍ່ໄດ້ */
const cancelIncome = async (req, res) => {
    const t = await incomeModel_1.default.sequelize.transaction();
    const fail = async (code, message) => {
        await t.rollback();
        res.status(code).json({ message });
    };
    try {
        const row = await incomeModel_1.default.findByPk((0, bansiHelpers_1.decodeId)(req), { transaction: t, lock: t.LOCK.UPDATE });
        if (!row)
            return fail(404, "ບໍ່ພົບລາຍຮັບ");
        if (Number(row.status) !== journalHelpers_1.ACTIVE)
            return fail(400, "ລາຍຮັບນີ້ຖືກຍົກເລີກແລ້ວ");
        const amount = Number(row.balance_income) || 0;
        const account = await treasuryAcount_1.default.findByPk(row.acount_id_fk, { transaction: t, lock: t.LOCK.UPDATE });
        if (account) {
            if ((Number(account.balance_treasury) || 0) < amount) {
                return fail(400, "ຍອດເງິນທີ່ໃຊ້ໄດ້ຂອງບັນຊີບໍ່ພໍ ຈຶ່ງຫັກຄືນ ແລະ ຍົກເລີກບໍ່ໄດ້");
            }
            await (0, accountMovement_1.moveBalance)(account, {
                direction: accountMovement_1.MOVE_OUT, amount, source: "INCOME_CANCEL", sourceId: row._uuid,
                docNumber: row.number, description: row.incom_title, actorId: Number((0, bansiHelpers_1.actorOf)(req)),
            }, t);
        }
        // ກັບລາຍການໃບບັນທຶກບັນຊີຂອງລາຍຮັບນີ້
        await (0, glCore_1.reverseSource)("INCOME", row._uuid, t, Number((0, bansiHelpers_1.actorOf)(req)) || null);
        await row.update({ status: journalHelpers_1.CANCELLED, updatedAt: new Date() }, { transaction: t });
        await t.commit();
        res.status(200).json({ message: "Successfully cancelled income" });
    }
    catch (error) {
        await t.rollback();
        if ((0, glCore_1.replyGlError)(res, error))
            return;
        (0, bansiHelpers_1.sendError)(res, error, "Error cancelling income");
    }
};
exports.cancelIncome = cancelIncome;
/**
 * GET /income/download/:id — ສົ່ງໄຟລ໌ຄັດຕິດເປັນ attachment (ຊື່ = ເລກທີ + ນາມສະກຸນໄຟລ໌).
 * ໜ້າເວັບດາວໂຫຼດຜ່ານ API ໄດ້ທັນທີ — ລິ້ງ /image ຢູ່ຄົນລະໂດເມນ browser ຈຶ່ງເປີດແທັບແທນການດາວໂຫຼດ
 */
const downloadIncomeFile = async (req, res) => {
    try {
        const row = await incomeModel_1.default.findByPk((0, bansiHelpers_1.decodeId)(req));
        if (!row?.file_doct) {
            res.status(404).json({ message: "ລາຍຮັບນີ້ບໍ່ມີໄຟລ໌ຄັດຕິດ" });
            return;
        }
        // ບ່ອນດຽວກັບທີ່ createUploadFile("income") ບັນທຶກ (src/uploads/income)
        const filePath = path_1.default.join(__dirname, "..", "..", "uploads", FILE_FOLDER, path_1.default.basename(row.file_doct));
        if (!fs_1.default.existsSync(filePath)) {
            res.status(404).json({ message: "ບໍ່ພົບໄຟລ໌ໃນ server" });
            return;
        }
        res.download(filePath, `${row.number}${path_1.default.extname(row.file_doct)}`);
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error downloading income file");
    }
};
exports.downloadIncomeFile = downloadIncomeFile;
