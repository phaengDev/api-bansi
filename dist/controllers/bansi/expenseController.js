"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadExpenseFile = exports.cancelExpense = exports.updateExpense = exports.createExpense = exports.getExpenses = exports.removePayrollExpense = exports.recordPayrollExpense = void 0;
const moment_1 = __importDefault(require("moment"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const sequelize_1 = require("sequelize");
const expenseModel_1 = __importDefault(require("../../models/expenseModel"));
const expenseItemModel_1 = __importDefault(require("../../models/expenseItemModel"));
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
 * ລາຍຈ່າຍ — ຫົວ (tbl_expenses) + ລາຍການຍ່ອຍ (tbl_expense_items). ບັນທຶກແລ້ວເງິນອອກຈາກ "ຍອດໃຊ້ໄດ້" ຂອງບັນຊີທີ່ຈ່າຍທັນທີ
 * (ຍອດບໍ່ພໍ = ບັນທຶກບໍ່ໄດ້), ຍົກເລີກ (status 2) = ຄືນເງິນເຂົ້າບັນຊີ.
 * ບັນທຶກແລ້ວ ລາຍການຍ່ອຍ / ບັນຊີ / ອາກອນ ແກ້ບໍ່ໄດ້ (ຍອດບັນຊີຜູກກັບມັນແລ້ວ) — ຕ້ອງຍົກເລີກແລ້ວບັນທຶກໃໝ່.
 * ໄຟລ໌ເອກະສານ (ໃບບິນ) ເກັບຢູ່ uploads/expense
 */
/** ປະເພດລາຍຈ່າຍ = tbl_finance_categories.typestatus 2 */
const EXPENSE_KIND = 2;
const FILE_FOLDER = "expense";
/** ເລກທີຈາກ ຕັ້ງຄ່າ → ເລກທີເອກະສານ (ລະຫັດ PAYMENT); ຍັງບໍ່ຕັ້ງກໍ່ໃຊ້ເລກສຳຮອງ PV-YYYY-00001 */
const DOC_CODE = "PAYMENT";
const MAX_ITEMS = 200;
const expenseDateOf = (value) => (0, journalHelpers_1.entryDateOf)(value, "ວັນທີຈ່າຍເງິນ");
const text = (value) => String(value ?? "").trim() || null;
const includeAll = [
    journalHelpers_1.subInclude,
    journalHelpers_1.accountInclude,
    { model: userModel_1.default, as: "user", attributes: ["user_uuid", "user_name"] },
    { model: bankModel_1.default, as: "payeeBank", attributes: ["_uuid", "abbr", "name_la", "logo"] },
    journalHelpers_1.partnerInclude,
    { model: expenseItemModel_1.default, as: "items" },
];
const itemOrder = [[{ model: expenseItemModel_1.default, as: "items" }, "line_no", "ASC"]];
/** ຜູ້ຮັບເງິນ — ທະນາຄານ / ເລກບັນຊີ ສະເພາະເງິນໂອນ (ບໍ່ບັງຄັບ); pay_type ມາຈາກຜູ້ເອີ້ນ */
const payeeBankFields = (body, payType) => {
    const isTransfer = payType === journalHelpers_1.TRANSFER;
    const bankId = Number(body.payee_bank_id);
    return {
        payee_bank_id: isTransfer && Number.isInteger(bankId) && bankId > 0 ? bankId : null,
        payee_account_number: isTransfer ? text(body.payee_account_number) : null,
    };
};
/**
 * ລາຍການຍ່ອຍຈາກ body.items (JSON string ໃນ multipart ຫຼື array) — ກວດ ແລະ ຄິດ amount ເອງ:
 * ຊື່ບໍ່ວ່າງ, ຈຳນວນ > 0, ລາຄາ ≥ 0, 0 ≤ ສ່ວນຫຼຸດ ≤ ຈຳນວນ × ລາຄາ
 */
const parseItems = (raw) => {
    let list;
    try {
        list = typeof raw === "string" ? JSON.parse(raw) : raw;
    }
    catch {
        return { error: "ຂໍ້ມູນລາຍການບໍ່ຖືກຕ້ອງ" };
    }
    if (!Array.isArray(list) || !list.length)
        return { error: "ກະລຸນາປ້ອນລາຍການຢ່າງໜ້ອຍ 1 ລາຍການ" };
    if (list.length > MAX_ITEMS)
        return { error: `ລາຍການຫຼາຍເກີນ ${MAX_ITEMS} ແຖວ` };
    const items = [];
    for (const [index, row] of list.entries()) {
        const no = index + 1;
        const name = String(row?.item_name ?? "").trim();
        const quantity = Number(row?.quantity);
        const price = Number(row?.unit_price);
        const discount = Number(row?.discount ?? 0) || 0;
        if (!name)
            return { error: `ລາຍການທີ ${no}: ກະລຸນາປ້ອນຊື່ລາຍການ` };
        if (!Number.isFinite(quantity) || quantity <= 0)
            return { error: `ລາຍການທີ ${no}: ຈຳນວນຕ້ອງຫຼາຍກວ່າ 0` };
        if (!Number.isFinite(price) || price < 0)
            return { error: `ລາຍການທີ ${no}: ລາຄາບໍ່ຖືກຕ້ອງ` };
        const gross = quantity * price;
        if (discount < 0 || discount > gross)
            return { error: `ລາຍການທີ ${no}: ສ່ວນຫຼຸດຕ້ອງບໍ່ເກີນລາຄາລວມ` };
        items.push({
            item_name: name.slice(0, 255),
            quantity: Math.round(quantity * 1000) / 1000,
            unit: text(row?.unit)?.slice(0, 50) ?? null,
            unit_price: Math.round(price * 100) / 100,
            discount: Math.round(discount * 100) / 100,
            amount: Math.round(gross - discount),
        });
    }
    return { items };
};
/** ແປງແຖວໃຫ້ພ້ອມສະແດງ — ຕົວເລກ, URL ເຕັມຂອງໄຟລ໌ ແລະ ໂລໂກ້ທະນາຄານ */
const present = (row) => {
    const r = row.get({ plain: true });
    const logo = r.acount?.banks?.logo;
    const payeeLogo = r.payeeBank?.logo;
    return {
        ...r,
        subtotal: Number(r.subtotal) || 0,
        tax: Number(r.tax) || 0,
        balance_expense: Number(r.balance_expense) || 0,
        items: (r.items ?? []).map((item) => ({
            ...item,
            quantity: Number(item.quantity) || 0,
            unit_price: Number(item.unit_price) || 0,
            discount: Number(item.discount) || 0,
            amount: Number(item.amount) || 0,
        })),
        file_url: r.file_doct ? `${(0, utils_1.url)()}/${FILE_FOLDER}/${r.file_doct}` : null,
        payeeBank: r.payeeBank && { ...r.payeeBank, url: payeeLogo ? `${(0, utils_1.url)()}/logo/${payeeLogo}` : null },
        acount: r.acount && {
            ...r.acount,
            banks: r.acount.banks && { ...r.acount.banks, url: logo ? `${(0, utils_1.url)()}/logo/${logo}` : null },
        },
    };
};
const findFull = (id) => expenseModel_1.default.findByPk(id, { include: includeAll, order: itemOrder });
/** ເລກທີໃບຈ່າຍຈາກ ຕັ້ງຄ່າ → ເລກທີເອກະສານ (PAYMENT); ຍັງບໍ່ຕັ້ງ = ເລກສຳຮອງ PV-YYYY-00001 */
const nextExpenseNumber = async (t) => {
    const issued = await (0, docNumberingController_1.issueDocNumber)(DOC_CODE, t);
    if (issued?.number)
        return issued.number;
    const prefix = `PV-${(0, moment_1.default)().utcOffset(journalHelpers_1.BUSINESS_OFFSET).format("YYYY")}-`;
    const count = await expenseModel_1.default.count({ where: { number: { [sequelize_1.Op.like]: `${prefix}%` } }, transaction: t });
    return `${prefix}${String(count + 1).padStart(5, "0")}`;
};
/** ລາຍຈ່າຍທີ່ມາຈາກໃບເງິນເດືອນ ແກ້ / ຍົກເລີກຢູ່ໜ້ານີ້ບໍ່ໄດ້ (ເງິນ ແລະ ບັນຊີຄູ່ເປັນຂອງໃບເງິນເດືອນ) */
const PAYROLL_LOCKED = "ລາຍຈ່າຍນີ້ມາຈາກການຈ່າຍເງິນເດືອນ — ຍົກເລີກຢູ່ໜ້າເງິນເດືອນ";
/**
 * ບັນທຶກການຈ່າຍເງິນເດືອນເປັນລາຍຈ່າຍ (ເອີ້ນຈາກ payPayroll ໃນ transaction ດຽວກັນ) — ຍອດ = ເງິນເດືອນສຸດທິທີ່ອອກຈາກບັນຊີ,
 * ບໍ່ຫັກເງິນ ແລະ ບໍ່ລົງບັນຊີຄູ່ຊ້ຳ (ໃບເງິນເດືອນເຮັດແລ້ວ)
 */
const recordPayrollExpense = async (input, t) => {
    const amount = Math.round(input.amount);
    const row = await expenseModel_1.default.create({
        number: await nextExpenseNumber(t),
        expense_date: input.date,
        expense_title: input.sub.name,
        sub_category_id: input.sub._uuid,
        payee_name: `ພະນັກງານ ${input.people} ຄົນ`,
        bill_no: input.payroll.number,
        type_acountid: input.account.type_treasuryid,
        acount_id_fk: input.account._uuid,
        pay_type: (await (0, journalHelpers_1.isCashAccount)(input.account, t)) ? journalHelpers_1.CASH : journalHelpers_1.TRANSFER,
        subtotal: amount,
        tax: 0,
        balance_expense: amount,
        description: input.description,
        status: journalHelpers_1.ACTIVE,
        createdbyid: input.actorId,
        payroll_id: input.payroll._uuid,
    }, { transaction: t });
    await expenseItemModel_1.default.create({
        expense_id: row.get("_uuid"),
        line_no: 1,
        item_name: `${input.description} (${input.people} ຄົນ)`.slice(0, 255),
        quantity: 1,
        unit: null,
        unit_price: amount,
        discount: 0,
        amount,
    }, { transaction: t });
    return row;
};
exports.recordPayrollExpense = recordPayrollExpense;
/** ຍົກເລີກການຈ່າຍເງິນເດືອນ — ລຶບລາຍຈ່າຍທີ່ບັນທຶກຄູ່ໄວ້ (ບໍ່ມີເງິນ / ບັນຊີຄູ່ຂອງມັນເອງໃຫ້ຄືນ) */
const removePayrollExpense = async (payrollId, t) => {
    const rows = await expenseModel_1.default.findAll({ where: { payroll_id: payrollId }, attributes: ["_uuid"], transaction: t });
    if (!rows.length)
        return;
    const ids = rows.map((r) => r._uuid);
    await expenseItemModel_1.default.destroy({ where: { expense_id: { [sequelize_1.Op.in]: ids } }, transaction: t });
    await expenseModel_1.default.destroy({ where: { _uuid: { [sequelize_1.Op.in]: ids } }, transaction: t });
};
exports.removePayrollExpense = removePayrollExpense;
const uploadedName = (req) => req.file?.filename;
/** ໄຟລ໌ທີ່ multer ບັນທຶກໄວ້ແລ້ວ ແຕ່ການບັນທຶກລົ້ມເຫຼວ — ລຶບຖິ້ມ ບໍ່ໃຫ້ຄ້າງ */
const discardUpload = (req) => {
    const name = uploadedName(req);
    if (name)
        (0, uploadFile_1.deleteFile)(FILE_FOLDER, name);
};
/**
 * POST /expense/fetch { start_date?, end_date?, status? } — ລາຍຈ່າຍ (+ ລາຍການຍ່ອຍ) ຕາມວັນທີຈ່າຍ ໃໝ່ສຸດກ່ອນ
 * + ສະຫຼຸບຍອດຕາມສະກຸນເງິນ (ສະເພາະທີ່ໃຊ້ງານ). ວັນທີ "YYYY-MM-DD" ຫຼື "DD/MM/YYYY"
 */
const getExpenses = async (req, res) => {
    try {
        const body = req.body || {};
        const where = {};
        const start = (0, bansiHelpers_1.toDateOnly)(body.start_date);
        const end = (0, bansiHelpers_1.toDateOnly)(body.end_date);
        if (start || end) {
            where.expense_date = { ...(start ? { [sequelize_1.Op.gte]: start } : {}), ...(end ? { [sequelize_1.Op.lte]: end } : {}) };
        }
        if ([journalHelpers_1.ACTIVE, journalHelpers_1.CANCELLED].includes(Number(body.status)))
            where.status = Number(body.status);
        if (Number.isInteger(Number(body.partner_id)) && Number(body.partner_id) > 0)
            where.partner_id = Number(body.partner_id);
        const rows = await expenseModel_1.default.findAll({
            where,
            order: [["expense_date", "DESC"], ["createdAt", "DESC"], ...itemOrder],
            include: includeAll,
        });
        const data = rows.map(present);
        const totals = new Map();
        data.filter((r) => Number(r.status) === journalHelpers_1.ACTIVE).forEach((r) => {
            const cur = r.acount?.treasury?.currency;
            const key = cur?.name ?? "—";
            const item = totals.get(key) ?? { currency: key, genus: cur?.genus ?? null, total: 0, tax: 0, count: 0 };
            item.total += r.balance_expense;
            item.tax += r.tax;
            item.count += 1;
            totals.set(key, item);
        });
        res.status(200).json({ data, summary: [...totals.values()] });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting expenses");
    }
};
exports.getExpenses = getExpenses;
/**
 * POST /expense/create (multipart, ໄຟລ໌ field "file_doct")
 * { expense_date?, sub_category_id (ປະເພດມາຈາກລາຍການຍ່ອຍ), expense_title? (ບໍ່ສົ່ງ = ຊື່ລາຍການຍ່ອຍ),
 *   payee_name?, bill_no?, acount_id_fk,
 *   items (JSON: [{ item_name, quantity, unit?, unit_price, discount? }]), tax_id? | (tax, calc_method)?,
 *   payee_bank_id?, payee_account_number?, partner_id?, description? }
 * — pay_type ຄິດຈາກໝວດຂອງບັນຊີເອງ; ຍອດໃຊ້ໄດ້ຂອງບັນຊີຕ້ອງພໍກັບຍອດຈ່າຍ (ລວມອາກອນ)
 */
const createExpense = async (req, res) => {
    const t = await expenseModel_1.default.sequelize.transaction();
    const fail = async (code, message) => {
        await t.rollback();
        discardUpload(req);
        res.status(code).json({ message });
    };
    try {
        const body = req.body || {};
        const accountId = Number(body.acount_id_fk);
        if (!Number.isInteger(accountId))
            return fail(400, "ກະລຸນາເລືອກບັນຊີທີ່ຈ່າຍເງິນ");
        const expenseDate = expenseDateOf(body.expense_date);
        if ("error" in expenseDate)
            return fail(400, expenseDate.error);
        const partner = await (0, journalHelpers_1.partnerIdOf)(body.partner_id, journalHelpers_1.EXPENSE_PARTNER_TYPES);
        if ("error" in partner)
            return fail(400, partner.error);
        const parsed = parseItems(body.items);
        if ("error" in parsed)
            return fail(400, parsed.error);
        const subtotal = parsed.items.reduce((n, item) => n + item.amount, 0);
        if (subtotal <= 0)
            return fail(400, "ຍອດລວມຂອງລາຍການຕ້ອງຫຼາຍກວ່າ 0");
        const picked = await (0, journalHelpers_1.resolveSubCategory)(body.sub_category_id, EXPENSE_KIND, { t });
        if ("error" in picked)
            return fail(400, picked.error);
        const title = String(body.expense_title ?? "").trim() || picked.sub.name;
        // ລັອກບັນຊີກ່ອນອ່ານຍອດ — ສອງຄົນຈ່າຍພ້ອມກັນຈະບໍ່ຈ່າຍເກີນຍອດ
        const account = await treasuryAcount_1.default.findByPk(accountId, { transaction: t, lock: t.LOCK.UPDATE });
        if (!account || Number(account.status) !== 1)
            return fail(400, "ບັນຊີທີ່ຈ່າຍເງິນບໍ່ມີ ຫຼື ປິດໃຊ້ງານແລ້ວ");
        const taxed = await (0, journalHelpers_1.computeTax)(body, subtotal, t);
        if ("error" in taxed)
            return fail(400, taxed.error);
        if ((Number(account.balance_treasury) || 0) < taxed.total) {
            return fail(400, "ຍອດເງິນທີ່ໃຊ້ໄດ້ຂອງບັນຊີບໍ່ພໍຈ່າຍ");
        }
        const payType = (await (0, journalHelpers_1.isCashAccount)(account, t)) ? journalHelpers_1.CASH : journalHelpers_1.TRANSFER;
        const number = await nextExpenseNumber(t);
        const actor = Number((0, bansiHelpers_1.actorOf)(req));
        const row = await expenseModel_1.default.create({
            number,
            expense_date: expenseDate.date,
            expense_title: title,
            sub_category_id: picked.sub._uuid,
            payee_name: text(body.payee_name),
            partner_id: "id" in partner ? partner.id : null,
            bill_no: text(body.bill_no),
            type_acountid: account.type_treasuryid,
            acount_id_fk: accountId,
            pay_type: payType,
            ...payeeBankFields(body, payType),
            subtotal,
            tax: taxed.tax,
            balance_expense: taxed.total,
            description: text(body.description),
            file_doct: uploadedName(req) ?? null,
            status: journalHelpers_1.ACTIVE,
            createdbyid: Number.isInteger(actor) ? actor : null,
        }, { transaction: t });
        const expenseId = row.get("_uuid");
        await expenseItemModel_1.default.bulkCreate(parsed.items.map((item, index) => ({ ...item, expense_id: expenseId, line_no: index + 1 })), { transaction: t });
        await (0, accountMovement_1.moveBalance)(account, {
            direction: accountMovement_1.MOVE_OUT, amount: taxed.total, source: "EXPENSE", sourceId: expenseId,
            docNumber: number, date: expenseDate.date, description: title, actorId: actor,
        }, t);
        // ລົງບັນຊີຄູ່ (ໜີ້ ລາຍຈ່າຍ + ອາກອນ / ມີ ເງິນສົດ/ທະນາຄານ) — ບໍ່ສຳເລັດ = ບໍ່ບັນທຶກລາຍຈ່າຍ
        await (0, glPosting_1.postExpense)(row, t, Number.isInteger(actor) ? actor : null);
        await t.commit();
        const saved = await findFull(expenseId);
        res.status(200).json({ message: "Successfully created expense", data: saved && present(saved) });
    }
    catch (error) {
        await t.rollback();
        discardUpload(req);
        if ((0, glCore_1.replyGlError)(res, error))
            return;
        (0, bansiHelpers_1.sendError)(res, error, "Error creating expense");
    }
};
exports.createExpense = createExpense;
/**
 * PUT /expense/:id (multipart) — ແກ້ໄດ້ສະເພາະ ວັນທີຈ່າຍ, ລາຍການຍ່ອຍ (ປ່ຽນ = ຫົວຂໍ້ເປັນຊື່ລາຍການຍ່ອຍໃໝ່), ຫົວຂໍ້,
 * ຜູ້ຮັບເງິນ, ເລກທີໃບບິນ, ລາຍລະອຽດ,
 * ທະນາຄານ/ເລກບັນຊີຜູ້ຮັບ (ເງິນໂອນ), ໄຟລ໌ (ສົ່ງ remove_file=1 ເພື່ອລຶບ). ລາຍການຍ່ອຍ / ບັນຊີ / ອາກອນ ບໍ່ປ່ຽນ
 */
const updateExpense = async (req, res) => {
    const fail = (code, message) => {
        discardUpload(req);
        res.status(code).json({ message });
    };
    try {
        const row = await expenseModel_1.default.findByPk((0, bansiHelpers_1.decodeId)(req));
        if (!row)
            return fail(404, "ບໍ່ພົບລາຍຈ່າຍ");
        if (Number(row.status) !== journalHelpers_1.ACTIVE)
            return fail(400, "ລາຍຈ່າຍທີ່ຍົກເລີກແລ້ວ ແກ້ໄຂບໍ່ໄດ້");
        const fromPayroll = !!row.payroll_id;
        const body = req.body || {};
        const patch = {};
        if (body.expense_title !== undefined) {
            const title = String(body.expense_title).trim();
            if (!title)
                return fail(400, "ກະລຸນາປ້ອນຫົວຂໍ້ລາຍຈ່າຍ");
            patch.expense_title = title;
        }
        if (body.sub_category_id !== undefined) {
            const picked = await (0, journalHelpers_1.resolveSubCategory)(body.sub_category_id, EXPENSE_KIND, { keepId: row.sub_category_id });
            if ("error" in picked)
                return fail(400, picked.error);
            patch.sub_category_id = picked.sub._uuid;
            if (picked.sub._uuid !== Number(row.sub_category_id) && body.expense_title === undefined)
                patch.expense_title = picked.sub.name;
        }
        if (body.expense_date !== undefined) {
            const expenseDate = expenseDateOf(body.expense_date);
            if ("error" in expenseDate)
                return fail(400, expenseDate.error);
            // ວັນທີຂອງລາຍຈ່າຍຈາກເງິນເດືອນ = ວັນທີຈ່າຍເງິນເດືອນ
            if (fromPayroll && expenseDate.date !== String(row.expense_date))
                return fail(400, PAYROLL_LOCKED);
            patch.expense_date = expenseDate.date;
        }
        if (body.payee_name !== undefined)
            patch.payee_name = text(body.payee_name);
        if (body.bill_no !== undefined)
            patch.bill_no = text(body.bill_no);
        // ລູກຄ້າ/ຜູ້ສະໜອງ ແກ້ໄດ້ (ບໍ່ກະທົບຍອດບັນຊີ ແລະ ບັນຊີຄູ່)
        const partner = await (0, journalHelpers_1.partnerIdOf)(body.partner_id, journalHelpers_1.EXPENSE_PARTNER_TYPES, row.partner_id ?? null);
        if ("error" in partner)
            return fail(400, partner.error);
        if ("id" in partner)
            patch.partner_id = partner.id;
        if (body.description !== undefined)
            patch.description = text(body.description);
        // ວິທີຈ່າຍລັອກຕາມບັນຊີທີ່ບັນທຶກແລ້ວ — ແກ້ໄດ້ແຕ່ທະນາຄານ/ເລກບັນຊີຜູ້ຮັບ
        if (body.payee_bank_id !== undefined || body.payee_account_number !== undefined) {
            Object.assign(patch, payeeBankFields(body, Number(row.pay_type)));
        }
        const uploaded = uploadedName(req);
        const replacesFile = !!uploaded || Number(body.remove_file) === 1;
        const oldFile = replacesFile ? row.file_doct : null;
        if (replacesFile)
            patch.file_doct = uploaded ?? null;
        // ປ່ຽນວັນທີ/ລາຍການຍ່ອຍ (ປະເພດ)/ຫົວຂໍ້ → ລົງບັນຊີໃໝ່ໃນ transaction ດຽວກັນ (ປີການເງິນປິດແລ້ວ = ແກ້ບໍ່ໄດ້)
        const affectsGl = !fromPayroll && ["expense_date", "sub_category_id", "expense_title"].some((key) => patch[key] !== undefined && String(patch[key]) !== String(row[key]));
        const t = await expenseModel_1.default.sequelize.transaction();
        try {
            await row.update({ ...patch, updatedAt: new Date() }, { transaction: t });
            if (affectsGl)
                await (0, glPosting_1.postExpense)(row, t, Number((0, bansiHelpers_1.actorOf)(req)) || null);
            await t.commit();
        }
        catch (error) {
            await t.rollback();
            throw error;
        }
        if (oldFile)
            (0, uploadFile_1.deleteFile)(FILE_FOLDER, oldFile);
        const saved = await findFull(row._uuid);
        res.status(200).json({ message: "Successfully updated expense", data: saved && present(saved) });
    }
    catch (error) {
        discardUpload(req);
        if ((0, glCore_1.replyGlError)(res, error))
            return;
        (0, bansiHelpers_1.sendError)(res, error, "Error updating expense");
    }
};
exports.updateExpense = updateExpense;
/** PUT /expense/cancel/:id — ຍົກເລີກ (status 2) ແລະ ຄືນເງິນເຂົ້າບັນຊີທີ່ຈ່າຍ (ລາຍການຍ່ອຍເກັບໄວ້ຄືເດີມ) */
const cancelExpense = async (req, res) => {
    const t = await expenseModel_1.default.sequelize.transaction();
    const fail = async (code, message) => {
        await t.rollback();
        res.status(code).json({ message });
    };
    try {
        const row = await expenseModel_1.default.findByPk((0, bansiHelpers_1.decodeId)(req), { transaction: t, lock: t.LOCK.UPDATE });
        if (!row)
            return fail(404, "ບໍ່ພົບລາຍຈ່າຍ");
        if (Number(row.status) !== journalHelpers_1.ACTIVE)
            return fail(400, "ລາຍຈ່າຍນີ້ຖືກຍົກເລີກແລ້ວ");
        if (row.payroll_id)
            return fail(400, PAYROLL_LOCKED);
        const account = await treasuryAcount_1.default.findByPk(row.acount_id_fk, { transaction: t, lock: t.LOCK.UPDATE });
        if (account) {
            await (0, accountMovement_1.moveBalance)(account, {
                direction: accountMovement_1.MOVE_IN, amount: Number(row.balance_expense) || 0, source: "EXPENSE_CANCEL", sourceId: row._uuid,
                docNumber: row.number, description: row.expense_title, actorId: Number((0, bansiHelpers_1.actorOf)(req)),
            }, t);
        }
        // ກັບລາຍການໃບບັນທຶກບັນຊີຂອງລາຍຈ່າຍນີ້
        await (0, glCore_1.reverseSource)("EXPENSE", row._uuid, t, Number((0, bansiHelpers_1.actorOf)(req)) || null);
        await row.update({ status: journalHelpers_1.CANCELLED, updatedAt: new Date() }, { transaction: t });
        await t.commit();
        res.status(200).json({ message: "Successfully cancelled expense" });
    }
    catch (error) {
        await t.rollback();
        if ((0, glCore_1.replyGlError)(res, error))
            return;
        (0, bansiHelpers_1.sendError)(res, error, "Error cancelling expense");
    }
};
exports.cancelExpense = cancelExpense;
/** GET /expense/download/:id — ສົ່ງໄຟລ໌ຄັດຕິດເປັນ attachment (ຊື່ = ເລກທີ + ນາມສະກຸນໄຟລ໌) */
const downloadExpenseFile = async (req, res) => {
    try {
        const row = await expenseModel_1.default.findByPk((0, bansiHelpers_1.decodeId)(req));
        if (!row?.file_doct) {
            res.status(404).json({ message: "ລາຍຈ່າຍນີ້ບໍ່ມີໄຟລ໌ຄັດຕິດ" });
            return;
        }
        // ບ່ອນດຽວກັບທີ່ createUploadFile("expense") ບັນທຶກ (src/uploads/expense)
        const filePath = path_1.default.join(__dirname, "..", "..", "uploads", FILE_FOLDER, path_1.default.basename(row.file_doct));
        if (!fs_1.default.existsSync(filePath)) {
            res.status(404).json({ message: "ບໍ່ພົບໄຟລ໌ໃນ server" });
            return;
        }
        res.download(filePath, `${row.number}${path_1.default.extname(row.file_doct)}`);
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error downloading expense file");
    }
};
exports.downloadExpenseFile = downloadExpenseFile;
