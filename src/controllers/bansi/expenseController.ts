import { Request, Response } from "express";
import moment from "moment";
import path from "path";
import fs from "fs";
import { Op } from "sequelize";
import Expenses from "../../models/expenseModel";
import ExpenseItems from "../../models/expenseItemModel";
import FinanceCategories from "../../models/typeIncomeModel";
import TreasuryAcount from "../../models/treasuryAcount";
import Banks from "../../models/bankModel";
import Users from "../../models/userModel";
import { url } from "../../utils";
import { deleteFile } from "../../utils/uploadFile";
import { actorOf, decodeId, sendError, toDateOnly } from "./bansiHelpers";
import { issueDocNumber } from "./docNumberingController";
import { MOVE_IN, MOVE_OUT, moveBalance } from "./accountMovement";
import {
  ACTIVE, BUSINESS_OFFSET, CANCELLED, CASH, EXPENSE_PARTNER_TYPES, TRANSFER, accountInclude, computeTax, entryDateOf, isCashAccount,
  partnerIdOf, partnerInclude,
} from "./journalHelpers";
import { replyGlError, reverseSource } from "./glCore";
import { postExpense } from "./glPosting";

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

const expenseDateOf = (value: unknown) => entryDateOf(value, "ວັນທີຈ່າຍເງິນ");
const text = (value: unknown) => String(value ?? "").trim() || null;

const includeAll = [
  { model: FinanceCategories, as: "typeout", attributes: ["_uuid", "type_code", "type_name"] },
  accountInclude,
  { model: Users, as: "user", attributes: ["user_uuid", "user_name"] },
  { model: Banks, as: "payeeBank", attributes: ["_uuid", "abbr", "name_la", "logo"] },
  partnerInclude,
  { model: ExpenseItems, as: "items" },
];
const itemOrder: any = [[{ model: ExpenseItems, as: "items" }, "line_no", "ASC"]];

/** ຜູ້ຮັບເງິນ — ທະນາຄານ / ເລກບັນຊີ ສະເພາະເງິນໂອນ (ບໍ່ບັງຄັບ); pay_type ມາຈາກຜູ້ເອີ້ນ */
const payeeBankFields = (body: any, payType: number) => {
  const isTransfer = payType === TRANSFER;
  const bankId = Number(body.payee_bank_id);
  return {
    payee_bank_id: isTransfer && Number.isInteger(bankId) && bankId > 0 ? bankId : null,
    payee_account_number: isTransfer ? text(body.payee_account_number) : null,
  };
};

type ItemInput = { item_name: string; quantity: number; unit: string | null; unit_price: number; discount: number; amount: number };

/**
 * ລາຍການຍ່ອຍຈາກ body.items (JSON string ໃນ multipart ຫຼື array) — ກວດ ແລະ ຄິດ amount ເອງ:
 * ຊື່ບໍ່ວ່າງ, ຈຳນວນ > 0, ລາຄາ ≥ 0, 0 ≤ ສ່ວນຫຼຸດ ≤ ຈຳນວນ × ລາຄາ
 */
const parseItems = (raw: unknown): { items: ItemInput[] } | { error: string } => {
  let list: any;
  try {
    list = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return { error: "ຂໍ້ມູນລາຍການບໍ່ຖືກຕ້ອງ" };
  }
  if (!Array.isArray(list) || !list.length) return { error: "ກະລຸນາປ້ອນລາຍການຢ່າງໜ້ອຍ 1 ລາຍການ" };
  if (list.length > MAX_ITEMS) return { error: `ລາຍການຫຼາຍເກີນ ${MAX_ITEMS} ແຖວ` };
  const items: ItemInput[] = [];
  for (const [index, row] of list.entries()) {
    const no = index + 1;
    const name = String(row?.item_name ?? "").trim();
    const quantity = Number(row?.quantity);
    const price = Number(row?.unit_price);
    const discount = Number(row?.discount ?? 0) || 0;
    if (!name) return { error: `ລາຍການທີ ${no}: ກະລຸນາປ້ອນຊື່ລາຍການ` };
    if (!Number.isFinite(quantity) || quantity <= 0) return { error: `ລາຍການທີ ${no}: ຈຳນວນຕ້ອງຫຼາຍກວ່າ 0` };
    if (!Number.isFinite(price) || price < 0) return { error: `ລາຍການທີ ${no}: ລາຄາບໍ່ຖືກຕ້ອງ` };
    const gross = quantity * price;
    if (discount < 0 || discount > gross) return { error: `ລາຍການທີ ${no}: ສ່ວນຫຼຸດຕ້ອງບໍ່ເກີນລາຄາລວມ` };
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
const present = (row: any) => {
  const r = row.get({ plain: true });
  const logo = r.acount?.banks?.logo;
  const payeeLogo = r.payeeBank?.logo;
  return {
    ...r,
    subtotal: Number(r.subtotal) || 0,
    tax: Number(r.tax) || 0,
    balance_expense: Number(r.balance_expense) || 0,
    items: (r.items ?? []).map((item: any) => ({
      ...item,
      quantity: Number(item.quantity) || 0,
      unit_price: Number(item.unit_price) || 0,
      discount: Number(item.discount) || 0,
      amount: Number(item.amount) || 0,
    })),
    file_url: r.file_doct ? `${url()}/${FILE_FOLDER}/${r.file_doct}` : null,
    payeeBank: r.payeeBank && { ...r.payeeBank, url: payeeLogo ? `${url()}/logo/${payeeLogo}` : null },
    acount: r.acount && {
      ...r.acount,
      banks: r.acount.banks && { ...r.acount.banks, url: logo ? `${url()}/logo/${logo}` : null },
    },
  };
};

const findFull = (id: number) => Expenses.findByPk(id, { include: includeAll, order: itemOrder });

const uploadedName = (req: Request) => (req as any).file?.filename as string | undefined;

/** ໄຟລ໌ທີ່ multer ບັນທຶກໄວ້ແລ້ວ ແຕ່ການບັນທຶກລົ້ມເຫຼວ — ລຶບຖິ້ມ ບໍ່ໃຫ້ຄ້າງ */
const discardUpload = (req: Request) => {
  const name = uploadedName(req);
  if (name) deleteFile(FILE_FOLDER, name);
};

/**
 * POST /expense/fetch { start_date?, end_date?, status? } — ລາຍຈ່າຍ (+ ລາຍການຍ່ອຍ) ຕາມວັນທີຈ່າຍ ໃໝ່ສຸດກ່ອນ
 * + ສະຫຼຸບຍອດຕາມສະກຸນເງິນ (ສະເພາະທີ່ໃຊ້ງານ). ວັນທີ "YYYY-MM-DD" ຫຼື "DD/MM/YYYY"
 */
export const getExpenses = async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const where: any = {};
    const start = toDateOnly(body.start_date);
    const end = toDateOnly(body.end_date);
    if (start || end) {
      where.expense_date = { ...(start ? { [Op.gte]: start } : {}), ...(end ? { [Op.lte]: end } : {}) };
    }
    if ([ACTIVE, CANCELLED].includes(Number(body.status))) where.status = Number(body.status);
    if (Number.isInteger(Number(body.partner_id)) && Number(body.partner_id) > 0) where.partner_id = Number(body.partner_id);

    const rows = await Expenses.findAll({
      where,
      order: [["expense_date", "DESC"], ["createdAt", "DESC"], ...itemOrder],
      include: includeAll,
    });
    const data = rows.map(present);

    const totals = new Map<string, { currency: string; genus: string | null; total: number; tax: number; count: number }>();
    data.filter((r) => Number(r.status) === ACTIVE).forEach((r) => {
      const cur = r.acount?.treasury?.currency;
      const key = cur?.name ?? "—";
      const item = totals.get(key) ?? { currency: key, genus: cur?.genus ?? null, total: 0, tax: 0, count: 0 };
      item.total += r.balance_expense;
      item.tax += r.tax;
      item.count += 1;
      totals.set(key, item);
    });

    res.status(200).json({ data, summary: [...totals.values()] });
  } catch (error) {
    sendError(res, error, "Error getting expenses");
  }
};

/**
 * POST /expense/create (multipart, ໄຟລ໌ field "file_doct")
 * { expense_date?, expense_title, type_expense_fk, payee_name?, bill_no?, acount_id_fk,
 *   items (JSON: [{ item_name, quantity, unit?, unit_price, discount? }]), tax_id? | (tax, calc_method)?,
 *   payee_bank_id?, payee_account_number?, partner_id?, description? }
 * — pay_type ຄິດຈາກໝວດຂອງບັນຊີເອງ; ຍອດໃຊ້ໄດ້ຂອງບັນຊີຕ້ອງພໍກັບຍອດຈ່າຍ (ລວມອາກອນ)
 */
export const createExpense = async (req: Request, res: Response) => {
  const t = await Expenses.sequelize!.transaction();
  const fail = async (code: number, message: string) => {
    await t.rollback();
    discardUpload(req);
    res.status(code).json({ message });
  };
  try {
    const body = req.body || {};
    const title = String(body.expense_title ?? "").trim();
    const categoryId = Number(body.type_expense_fk);
    const accountId = Number(body.acount_id_fk);
    if (!title) return fail(400, "ກະລຸນາປ້ອນຫົວຂໍ້ລາຍຈ່າຍ");
    if (!Number.isInteger(categoryId)) return fail(400, "ກະລຸນາເລືອກປະເພດລາຍຈ່າຍ");
    if (!Number.isInteger(accountId)) return fail(400, "ກະລຸນາເລືອກບັນຊີທີ່ຈ່າຍເງິນ");
    const expenseDate = expenseDateOf(body.expense_date);
    if ("error" in expenseDate) return fail(400, expenseDate.error);
    const partner = await partnerIdOf(body.partner_id, EXPENSE_PARTNER_TYPES);
    if ("error" in partner) return fail(400, partner.error);
    const parsed = parseItems(body.items);
    if ("error" in parsed) return fail(400, parsed.error);
    const subtotal = parsed.items.reduce((n, item) => n + item.amount, 0);
    if (subtotal <= 0) return fail(400, "ຍອດລວມຂອງລາຍການຕ້ອງຫຼາຍກວ່າ 0");

    const category = await FinanceCategories.findOne({
      where: { _uuid: categoryId, typestatus: EXPENSE_KIND, status: 1 },
      transaction: t,
    });
    if (!category) return fail(400, "ບໍ່ພົບປະເພດລາຍຈ່າຍທີ່ເລືອກ");

    // ລັອກບັນຊີກ່ອນອ່ານຍອດ — ສອງຄົນຈ່າຍພ້ອມກັນຈະບໍ່ຈ່າຍເກີນຍອດ
    const account: any = await TreasuryAcount.findByPk(accountId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!account || Number(account.status) !== 1) return fail(400, "ບັນຊີທີ່ຈ່າຍເງິນບໍ່ມີ ຫຼື ປິດໃຊ້ງານແລ້ວ");

    const taxed = await computeTax(body, subtotal, t);
    if ("error" in taxed) return fail(400, taxed.error as string);
    if ((Number(account.balance_treasury) || 0) < taxed.total) {
      return fail(400, "ຍອດເງິນທີ່ໃຊ້ໄດ້ຂອງບັນຊີບໍ່ພໍຈ່າຍ");
    }

    const payType = (await isCashAccount(account, t)) ? CASH : TRANSFER;

    const issued = await issueDocNumber(DOC_CODE, t);
    let number = issued?.number;
    if (!number) {
      const prefix = `PV-${moment().utcOffset(BUSINESS_OFFSET).format("YYYY")}-`;
      const count = await Expenses.count({ where: { number: { [Op.like]: `${prefix}%` } }, transaction: t });
      number = `${prefix}${String(count + 1).padStart(5, "0")}`;
    }

    const actor = Number(actorOf(req));
    const row = await Expenses.create(
      {
        number,
        expense_date: expenseDate.date,
        expense_title: title,
        type_expense_fk: categoryId,
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
        status: ACTIVE,
        createdbyid: Number.isInteger(actor) ? actor : null,
      },
      { transaction: t }
    );
    const expenseId = row.get("_uuid") as number;
    await ExpenseItems.bulkCreate(
      parsed.items.map((item, index) => ({ ...item, expense_id: expenseId, line_no: index + 1 })),
      { transaction: t }
    );
    await moveBalance(account, {
      direction: MOVE_OUT, amount: taxed.total, source: "EXPENSE", sourceId: expenseId,
      docNumber: number, date: expenseDate.date, description: title, actorId: actor,
    }, t);
    // ລົງບັນຊີຄູ່ (ໜີ້ ລາຍຈ່າຍ + ອາກອນ / ມີ ເງິນສົດ/ທະນາຄານ) — ບໍ່ສຳເລັດ = ບໍ່ບັນທຶກລາຍຈ່າຍ
    await postExpense(row, t, Number.isInteger(actor) ? actor : null);
    await t.commit();

    const saved = await findFull(expenseId);
    res.status(200).json({ message: "Successfully created expense", data: saved && present(saved) });
  } catch (error) {
    await t.rollback();
    discardUpload(req);
    if (replyGlError(res, error)) return;
    sendError(res, error, "Error creating expense");
  }
};

/**
 * PUT /expense/:id (multipart) — ແກ້ໄດ້ສະເພາະ ວັນທີຈ່າຍ, ຫົວຂໍ້, ປະເພດ, ຜູ້ຮັບເງິນ, ເລກທີໃບບິນ, ລາຍລະອຽດ,
 * ທະນາຄານ/ເລກບັນຊີຜູ້ຮັບ (ເງິນໂອນ), ໄຟລ໌ (ສົ່ງ remove_file=1 ເພື່ອລຶບ). ລາຍການຍ່ອຍ / ບັນຊີ / ອາກອນ ບໍ່ປ່ຽນ
 */
export const updateExpense = async (req: Request<{ id: string }>, res: Response) => {
  const fail = (code: number, message: string) => {
    discardUpload(req);
    res.status(code).json({ message });
  };
  try {
    const row: any = await Expenses.findByPk(decodeId(req));
    if (!row) return fail(404, "ບໍ່ພົບລາຍຈ່າຍ");
    if (Number(row.status) !== ACTIVE) return fail(400, "ລາຍຈ່າຍທີ່ຍົກເລີກແລ້ວ ແກ້ໄຂບໍ່ໄດ້");

    const body = req.body || {};
    const patch: any = {};
    if (body.expense_title !== undefined) {
      const title = String(body.expense_title).trim();
      if (!title) return fail(400, "ກະລຸນາປ້ອນຫົວຂໍ້ລາຍຈ່າຍ");
      patch.expense_title = title;
    }
    if (body.type_expense_fk !== undefined) {
      const category = await FinanceCategories.findOne({
        where: { _uuid: Number(body.type_expense_fk), typestatus: EXPENSE_KIND, status: 1 },
      });
      if (!category) return fail(400, "ບໍ່ພົບປະເພດລາຍຈ່າຍທີ່ເລືອກ");
      patch.type_expense_fk = Number(body.type_expense_fk);
    }
    if (body.expense_date !== undefined) {
      const expenseDate = expenseDateOf(body.expense_date);
      if ("error" in expenseDate) return fail(400, expenseDate.error);
      patch.expense_date = expenseDate.date;
    }
    if (body.payee_name !== undefined) patch.payee_name = text(body.payee_name);
    if (body.bill_no !== undefined) patch.bill_no = text(body.bill_no);
    // ລູກຄ້າ/ຜູ້ສະໜອງ ແກ້ໄດ້ (ບໍ່ກະທົບຍອດບັນຊີ ແລະ ບັນຊີຄູ່)
    const partner = await partnerIdOf(body.partner_id, EXPENSE_PARTNER_TYPES, row.partner_id ?? null);
    if ("error" in partner) return fail(400, partner.error);
    if ("id" in partner) patch.partner_id = partner.id;
    if (body.description !== undefined) patch.description = text(body.description);
    // ວິທີຈ່າຍລັອກຕາມບັນຊີທີ່ບັນທຶກແລ້ວ — ແກ້ໄດ້ແຕ່ທະນາຄານ/ເລກບັນຊີຜູ້ຮັບ
    if (body.payee_bank_id !== undefined || body.payee_account_number !== undefined) {
      Object.assign(patch, payeeBankFields(body, Number(row.pay_type)));
    }

    const uploaded = uploadedName(req);
    const replacesFile = !!uploaded || Number(body.remove_file) === 1;
    const oldFile = replacesFile ? row.file_doct : null;
    if (replacesFile) patch.file_doct = uploaded ?? null;

    // ປ່ຽນວັນທີ/ປະເພດ/ຫົວຂໍ້ → ລົງບັນຊີໃໝ່ໃນ transaction ດຽວກັນ (ປີການເງິນປິດແລ້ວ = ແກ້ບໍ່ໄດ້)
    const affectsGl = ["expense_date", "type_expense_fk", "expense_title"].some(
      (key) => patch[key] !== undefined && String(patch[key]) !== String(row[key])
    );
    const t = await Expenses.sequelize!.transaction();
    try {
      await row.update({ ...patch, updatedAt: new Date() }, { transaction: t });
      if (affectsGl) await postExpense(row, t, Number(actorOf(req)) || null);
      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
    if (oldFile) deleteFile(FILE_FOLDER, oldFile);
    const saved = await findFull(row._uuid);
    res.status(200).json({ message: "Successfully updated expense", data: saved && present(saved) });
  } catch (error) {
    discardUpload(req);
    if (replyGlError(res, error)) return;
    sendError(res, error, "Error updating expense");
  }
};

/** PUT /expense/cancel/:id — ຍົກເລີກ (status 2) ແລະ ຄືນເງິນເຂົ້າບັນຊີທີ່ຈ່າຍ (ລາຍການຍ່ອຍເກັບໄວ້ຄືເດີມ) */
export const cancelExpense = async (req: Request<{ id: string }>, res: Response) => {
  const t = await Expenses.sequelize!.transaction();
  const fail = async (code: number, message: string) => {
    await t.rollback();
    res.status(code).json({ message });
  };
  try {
    const row: any = await Expenses.findByPk(decodeId(req), { transaction: t, lock: t.LOCK.UPDATE });
    if (!row) return fail(404, "ບໍ່ພົບລາຍຈ່າຍ");
    if (Number(row.status) !== ACTIVE) return fail(400, "ລາຍຈ່າຍນີ້ຖືກຍົກເລີກແລ້ວ");

    const account: any = await TreasuryAcount.findByPk(row.acount_id_fk, { transaction: t, lock: t.LOCK.UPDATE });
    if (account) {
      await moveBalance(account, {
        direction: MOVE_IN, amount: Number(row.balance_expense) || 0, source: "EXPENSE_CANCEL", sourceId: row._uuid,
        docNumber: row.number, description: row.expense_title, actorId: Number(actorOf(req)),
      }, t);
    }
    // ກັບລາຍການໃບບັນທຶກບັນຊີຂອງລາຍຈ່າຍນີ້
    await reverseSource("EXPENSE", row._uuid, t, Number(actorOf(req)) || null);
    await row.update({ status: CANCELLED, updatedAt: new Date() }, { transaction: t });
    await t.commit();
    res.status(200).json({ message: "Successfully cancelled expense" });
  } catch (error) {
    await t.rollback();
    if (replyGlError(res, error)) return;
    sendError(res, error, "Error cancelling expense");
  }
};

/** GET /expense/download/:id — ສົ່ງໄຟລ໌ຄັດຕິດເປັນ attachment (ຊື່ = ເລກທີ + ນາມສະກຸນໄຟລ໌) */
export const downloadExpenseFile = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const row: any = await Expenses.findByPk(decodeId(req));
    if (!row?.file_doct) {
      res.status(404).json({ message: "ລາຍຈ່າຍນີ້ບໍ່ມີໄຟລ໌ຄັດຕິດ" });
      return;
    }
    // ບ່ອນດຽວກັບທີ່ createUploadFile("expense") ບັນທຶກ (src/uploads/expense)
    const filePath = path.join(__dirname, "..", "..", "uploads", FILE_FOLDER, path.basename(row.file_doct));
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ message: "ບໍ່ພົບໄຟລ໌ໃນ server" });
      return;
    }
    res.download(filePath, `${row.number}${path.extname(row.file_doct)}`);
  } catch (error) {
    sendError(res, error, "Error downloading expense file");
  }
};
