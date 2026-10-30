import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import moment from "moment";
import { Op, fn, col } from "sequelize";
import Banks from "../../models/bankModel";
import MoneyAccount from "../../models/moneyAccount";
import MoneyCategory from "../../models/moneyCategory";
import MoneyEntry from "../../models/moneyEntry";
import { url } from "../../utils";
import { decodeId, sendError, toDateOnly } from "../bansi/bansiHelpers";
import { selfEmployee } from "./attendanceController";
import { RECEIPT_DIR, removeQuietly } from "./hrHelpers";
import { todayLao } from "./workCalendar";

/**
 * ບັນຊີເງິນສ່ວນຕົວຂອງພະນັກງານ (app ມືຖື — token ຂອງພະນັກງານ, ເຫັນສະເພາະຂອງຕົນເອງ, ບໍ່ກ່ຽວກັບຂໍ້ມູນ HR):
 * - GET /money/me/accounts — ບັນຊີ (ເງິນສົດ / ທະນາຄານ / e-wallet) ພ້ອມຍອດປັດຈຸບັນ · GET /money/me/banks — ທະນາຄານໃຫ້ເລືອກ
 * - POST /money/me/accounts { name, kind, bank_id?, account_no?, currency, opening_balance } — ສະກຸນ ແລະ ຍອດເລີ່ມຕົ້ນ
 *   ໃສ່ໄດ້ສະເພາະຕອນສ້າງ · PUT /money/me/accounts/:id { name?, kind?, bank_id?, account_no? } · DELETE (soft — ລາຍການເກົ່າຍັງຢູ່)
 * - GET /money/me/categories · POST / PUT / DELETE /money/me/categories/:id — ໝວດ (ເປີດເທື່ອທຳອິດ = ສ້າງຊຸດເລີ່ມຕົ້ນໃຫ້)
 * - GET /money/me/entries?from=&to=&account_id=&kind=&offset= — ລາຍການໃນຊ່ວງ (ໃໝ່ສຸດກ່ອນ, ເທື່ອລະ 50; account_id = ລວມການໂອນເຂົ້າ;
 *   kind = income | expense | transfer ສະເພາະປະເພດນັ້ນ ເທື່ອລະ 500 — ແອັບຈັດກຸ່ມຕາມໝວດ / ບັນຊີ)
 *   + ລາຍຮັບ / ລາຍຈ່າຍ ຂອງຊ່ວງແຍກຕາມສະກຸນ (ບໍ່ນັບການໂອນ, ບໍ່ຂຶ້ນກັບ kind)
 * - POST /money/me/entries (multipart) — ລາຍຮັບ / ລາຍຈ່າຍ: account_id, category_id (ປະເພດຕາມໝວດ), amount, entry_date, note, photo?;
 *   ໂອນ: kind=transfer, account_id (ຕົ້ນທາງ), to_account_id, amount, to_amount (ສະກຸນຕ່າງກັນ = ແລກເງິນ), entry_date, note
 * - PUT /money/me/entries/:id (multipart: ຟີວທີ່ປ່ຽນ, photo ໃໝ່ ຫຼື remove_photo=1) · DELETE · GET …/:id/photo (ຮູບໃບບິນ)
 * - GET /money/me/summary?from=&to=&currency=&account_id= — ລາຍງານ: ຍອດລວມ, ແຍກຕາມໝວດ, ແນວໂນ້ມລາຍວັນ (≤ 62 ມື້) / ລາຍເດືອນ
 *   + ແຍກຕາມບັນຊີ (ທຸກສະກຸນ: ຮັບ, ຈ່າຍ, ໂອນເຂົ້າ-ອອກ ໃນຊ່ວງ ແລະ ຍອດປັດຈຸບັນ)
 * ສະກຸນຂອງລາຍການ = ສະກຸນຂອງບັນຊີ, ບໍ່ແປງຄ່າ (ອັດຕາແລກປ່ຽນປ່ຽນທຸກມື້) — ລາຍງານເທື່ອລະສະກຸນ.
 * ລາຍການກ່ອນມີບັນຊີ (account_id null) = "ບໍ່ລະບຸບັນຊີ" — ບໍ່ນັບໃນຍອດບັນຊີໃດ
 */

export const KINDS = ["income", "expense"] as const;
type Kind = (typeof KINDS)[number];
export const CURRENCIES = ["LAK", "THB", "USD"] as const;
const TRANSFER = "transfer";
const ACCOUNT_KINDS = ["cash", "bank", "wallet"] as const;

const MAX_NAME = 60;
const MAX_NOTE = 500;
const MAX_CATEGORIES = 60;
const MAX_ACCOUNTS = 30;
const ACCOUNT_NO = /^[0-9A-Za-z\- ]{1,30}$/;
/** DECIMAL(16, 2) */
const MAX_AMOUNT = 1e13;
const PAGE = 50;
/** ຂໍສະເພາະປະເພດ ຫຼື kind=all (ຈັດກຸ່ມທັງເດືອນໃນແອັບ) */
const KIND_PAGE = 500;
/** ເບິ່ງ / ລາຍງານໄດ້ບໍ່ເກີນ 1 ປີຕໍ່ເທື່ອ; ຍາວກວ່າ 62 ມື້ = ແນວໂນ້ມລາຍເດືອນ */
const MAX_RANGE_DAYS = 366;
const DAILY_TREND_DAYS = 62;
const ICON = /^[a-z_]{1,30}$/;
const COLOR = /^#[0-9A-Fa-f]{6}$/;

/** ໝວດເລີ່ມຕົ້ນຂອງທຸກຄົນ — icon ກົງກັບ moneyIcons ຂອງແອັບ */
const DEFAULTS: { kind: Kind; name: string; icon: string; color: string }[] = [
  { kind: "income", name: "ເງິນເດືອນ", icon: "salary", color: "#0E7A52" },
  { kind: "income", name: "ໂບນັດ / ຄ່ານາຍໜ້າ", icon: "bonus", color: "#16A34A" },
  { kind: "income", name: "ລາຍຮັບອື່ນ", icon: "savings", color: "#0D9488" },
  { kind: "expense", name: "ອາຫານ", icon: "food", color: "#F97316" },
  { kind: "expense", name: "ເດີນທາງ / ນ້ຳມັນ", icon: "transport", color: "#2563EB" },
  { kind: "expense", name: "ຄ່າໂທ / ອິນເຕີເນັດ", icon: "phone", color: "#7C3AED" },
  { kind: "expense", name: "ຊື້ເຄື່ອງ", icon: "shopping", color: "#DB2777" },
  { kind: "expense", name: "ທີ່ພັກ / ຄ່າເຊົ່າ", icon: "home", color: "#0891B2" },
  { kind: "expense", name: "ສຸຂະພາບ", icon: "health", color: "#DC2626" },
  { kind: "expense", name: "ຄອບຄົວ", icon: "family", color: "#CA8A04" },
  { kind: "expense", name: "ອື່ນໆ", icon: "other", color: "#64748B" },
];

const isKind = (value: unknown): value is Kind => KINDS.includes(value as Kind);
const isCurrency = (value: string) => CURRENCIES.includes(value as any);
const daysBetween = (from: string, to: string) => moment(to, "YYYY-MM-DD").diff(moment(from, "YYYY-MM-DD"), "days");
const amountOf = (value: unknown) => Math.round((Number(value) || 0) * 100) / 100;
const idOf = (req: Request<{ id: string }>) => {
  const id = Number(decodeId(req));
  return Number.isInteger(id) && id > 0 ? id : null;
};
/** id ຈາກ query / body (ຕົວເລກທຳມະດາ) — ບໍ່ມີ / ຜິດ = null */
const plainId = (value: unknown) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

/** ສ້າງຊຸດໝວດເລີ່ມຕົ້ນເທື່ອດຽວຕໍ່ຄົນ — ຄຳຂໍທີ່ມາພ້ອມກັນລໍຖ້າອັນດຽວກັນ ບໍ່ສ້າງຊ້ຳ */
const seeding = new Map<number, Promise<void>>();
const ensureCategories = (employeeId: number) => {
  const running = seeding.get(employeeId);
  if (running) return running;
  const job = (async () => {
    if (await MoneyCategory.count({ where: { employee_id: employeeId } })) return;
    await MoneyCategory.bulkCreate(DEFAULTS.map((d, sort) => ({ ...d, employee_id: employeeId, sort })));
  })().finally(() => seeding.delete(employeeId));
  seeding.set(employeeId, job);
  return job;
};

const categoryOf = (c: MoneyCategory) => ({
  _uuid: c._uuid,
  kind: c.kind,
  name: c.name,
  icon: c.icon,
  color: c.color,
  active: Number(c.status) === 1,
});

/** ທຸກໝວດຂອງຄົນນີ້ (ລວມທີ່ລຶບແລ້ວ — ລາຍການເກົ່າຍັງຕ້ອງສະແດງຊື່) */
const categoryMap = async (employeeId: number) =>
  new Map((await MoneyCategory.findAll({ where: { employee_id: employeeId } })).map((c) => [c._uuid, categoryOf(c)]));

// ================= ບັນຊີ

type BankRow = { _uuid: number; abbr: string; name_la: string; logo: string | null };
const bankOf = (b: BankRow | undefined) =>
  b ? { _uuid: Number(b._uuid), abbr: b.abbr, name: b.name_la || b.abbr, logo: b.logo ? `${url()}/logo/${b.logo}` : null } : null;

const bankMap = async (ids: number[]) => {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map<number, BankRow>();
  const rows = (await Banks.findAll({
    where: { _uuid: { [Op.in]: unique } },
    attributes: ["_uuid", "abbr", "name_la", "logo"],
    raw: true,
  })) as unknown as BankRow[];
  return new Map(rows.map((b) => [Number(b._uuid), b]));
};

/** ການເຄື່ອນໄຫວຂອງແຕ່ລະບັນຊີ: ລາຍຮັບ − ລາຍຈ່າຍ − ໂອນອອກ + ໂອນເຂົ້າ ([where] ເພີ່ມເງື່ອນໄຂ ເຊັ່ນ ຊ່ວງວັນທີ) */
const flowsOf = async (employeeId: number, where: Record<string, any> = {}) => {
  const [own, incoming] = await Promise.all([
    MoneyEntry.findAll({
      attributes: ["account_id", "kind", [fn("SUM", col("amount")), "total"], [fn("COUNT", col("_uuid")), "count"]],
      where: { ...where, employee_id: employeeId, account_id: { [Op.ne]: null } },
      group: ["account_id", "kind"],
      raw: true,
    }) as unknown as Promise<{ account_id: number; kind: string; total: string; count: number }[]>,
    MoneyEntry.findAll({
      attributes: ["to_account_id", [fn("SUM", col("to_amount")), "total"], [fn("COUNT", col("_uuid")), "count"]],
      where: { ...where, employee_id: employeeId, kind: TRANSFER, to_account_id: { [Op.ne]: null } },
      group: ["to_account_id"],
      raw: true,
    }) as unknown as Promise<{ to_account_id: number; total: string; count: number }[]>,
  ]);
  const flows = new Map<number, { income: number; expense: number; transfer_out: number; transfer_in: number; count: number }>();
  const of = (id: number) => {
    if (!flows.has(id)) flows.set(id, { income: 0, expense: 0, transfer_out: 0, transfer_in: 0, count: 0 });
    return flows.get(id)!;
  };
  for (const r of own) {
    const flow = of(Number(r.account_id));
    const key = r.kind === TRANSFER ? "transfer_out" : isKind(r.kind) ? r.kind : null;
    if (!key) continue;
    flow[key] = amountOf(flow[key] + amountOf(r.total));
    flow.count += Number(r.count) || 0;
  }
  for (const r of incoming) {
    const flow = of(Number(r.to_account_id));
    flow.transfer_in = amountOf(flow.transfer_in + amountOf(r.total));
    flow.count += Number(r.count) || 0;
  }
  return flows;
};
const netOf = (f?: { income: number; expense: number; transfer_out: number; transfer_in: number }) =>
  f ? f.income - f.expense - f.transfer_out + f.transfer_in : 0;

const accountOf = (a: MoneyAccount, bank: BankRow | undefined, balance?: number) => ({
  _uuid: a._uuid,
  name: a.name,
  kind: a.kind,
  bank: bankOf(bank),
  account_no: a.account_no || null,
  currency: a.currency,
  opening_balance: Number(a.opening_balance),
  ...(balance === undefined ? {} : { balance: amountOf(balance) }),
  active: Number(a.status) === 1,
});

/** ບັນຊີຂອງຄົນນີ້ (ລວມທີ່ລຶບແລ້ວ ຖ້າ [all]) ພ້ອມຍອດປັດຈຸບັນ */
const accountList = async (employeeId: number, all = false) => {
  const rows = await MoneyAccount.findAll({
    where: { employee_id: employeeId, ...(all ? {} : { status: 1 }) },
    order: [["sort", "ASC"], ["_uuid", "ASC"]],
  });
  const [flows, banks] = await Promise.all([flowsOf(employeeId), bankMap(rows.map((a) => Number(a.bank_id)))]);
  return rows.map((a) => accountOf(a, banks.get(Number(a.bank_id)), Number(a.opening_balance) + netOf(flows.get(a._uuid))));
};

/** ທຸກບັນຊີຂອງຄົນນີ້ (ລວມທີ່ລຶບແລ້ວ) ສຳລັບສະແດງໃນລາຍການ — ບໍ່ຄິດຍອດ */
const accountMap = async (employeeId: number) => {
  const rows = await MoneyAccount.findAll({ where: { employee_id: employeeId } });
  const banks = await bankMap(rows.map((a) => Number(a.bank_id)));
  return new Map(rows.map((a) => [a._uuid, accountOf(a, banks.get(Number(a.bank_id)))]));
};

/** ບັນຊີຂອງຂ້ອຍທີ່ຍັງໃຊ້ງານ — ບໍ່ແມ່ນຂອງຂ້ອຍ / ບໍ່ມີ = null */
const myAccount = (id: number | null, employeeId: number) =>
  id ? MoneyAccount.findOne({ where: { _uuid: id, employee_id: employeeId, status: 1 } }) : Promise.resolve(null);

/** ພະນັກງານທີ່ login — ບໍ່ແມ່ນ = ຕອບ error ແລ້ວຄືນ null */
const me = async (req: Request, res: Response) => {
  const self = await selfEmployee(req);
  if ("code" in self) {
    res.status(self.code).json({ message: self.message });
    return null;
  }
  return self.employee._uuid;
};

/** GET /money/me/accounts */
export const getMyMoneyAccounts = async (req: Request, res: Response) => {
  try {
    const employeeId = await me(req, res);
    if (employeeId === null) return;
    res.status(200).json({ data: await accountList(employeeId) });
  } catch (error) {
    sendError(res, error, "Error getting money accounts");
  }
};

/** GET /money/me/banks — ທະນາຄານທີ່ເປີດໃຊ້ (ໂລໂກ້) ໃຫ້ເລືອກຕອນສ້າງບັນຊີ */
export const getMyMoneyBanks = async (req: Request, res: Response) => {
  try {
    const employeeId = await me(req, res);
    if (employeeId === null) return;
    const rows = (await Banks.findAll({ where: { status: 1 }, attributes: ["_uuid", "abbr", "name_la", "logo"], raw: true })) as unknown as BankRow[];
    res.status(200).json({ data: rows.map(bankOf) });
  } catch (error) {
    sendError(res, error, "Error getting banks");
  }
};

/** ຂໍ້ມູນບັນຊີຈາກ body — ສະກຸນ ແລະ ຍອດເລີ່ມຕົ້ນ ອ່ານສະເພາະຕອນສ້າງ (ແກ້ໄຂບໍ່ໄດ້) */
const readAccount = async (body: Record<string, any>, existing?: MoneyAccount) => {
  const creating = !existing;
  const has = (key: string) => creating || body[key] !== undefined;
  const input: Record<string, any> = {};
  if (has("name")) {
    const name = String(body.name ?? "").trim();
    if (!name) return { error: "ກະລຸນາປ້ອນຊື່ບັນຊີ" };
    if (name.length > MAX_NAME) return { error: `ຊື່ບັນຊີຍາວໄດ້ບໍ່ເກີນ ${MAX_NAME} ຕົວອັກສອນ` };
    input.name = name;
  }
  const kind = has("kind") ? String(body.kind ?? "") : existing!.kind;
  if (!ACCOUNT_KINDS.includes(kind as any)) return { error: "ກະລຸນາເລືອກປະເພດບັນຊີ" };
  input.kind = kind;
  if (kind === "bank") {
    const bankId = has("bank_id") ? plainId(body.bank_id) : Number(existing!.bank_id) || null;
    if (!bankId || !(await Banks.findOne({ where: { _uuid: bankId, status: 1 } }))) return { error: "ກະລຸນາເລືອກທະນາຄານ" };
    input.bank_id = bankId;
  } else {
    input.bank_id = null;
  }
  if (has("account_no")) {
    const accountNo = String(body.account_no ?? "").trim();
    if (accountNo && !ACCOUNT_NO.test(accountNo)) return { error: "ເລກບັນຊີບໍ່ຖືກຕ້ອງ" };
    input.account_no = accountNo || null;
  }
  if (creating) {
    const currency = String(body.currency ?? "LAK").toUpperCase();
    if (!isCurrency(currency)) return { error: "ສະກຸນເງິນບໍ່ຖືກຕ້ອງ" };
    const opening = amountOf(body.opening_balance);
    if (Math.abs(opening) >= MAX_AMOUNT) return { error: "ຍອດເງິນຫຼາຍເກີນໄປ" };
    input.currency = currency;
    input.opening_balance = opening;
  }
  return { input };
};

/** POST /money/me/accounts */
export const createMyMoneyAccount = async (req: Request, res: Response) => {
  try {
    const employeeId = await me(req, res);
    if (employeeId === null) return;
    const result = await readAccount(req.body ?? {});
    if (result.error) {
      res.status(400).json({ message: result.error });
      return;
    }
    if ((await MoneyAccount.count({ where: { employee_id: employeeId, status: 1 } })) >= MAX_ACCOUNTS) {
      res.status(400).json({ message: `ມີບັນຊີໄດ້ບໍ່ເກີນ ${MAX_ACCOUNTS} ບັນຊີ` });
      return;
    }
    const sort = Number(await MoneyAccount.max("sort", { where: { employee_id: employeeId } })) || 0;
    const row = await MoneyAccount.create({ ...result.input, employee_id: employeeId, sort: sort + 1 });
    const banks = await bankMap([Number(row.bank_id)]);
    res.status(200).json({ message: "ເພີ່ມບັນຊີແລ້ວ", data: accountOf(row, banks.get(Number(row.bank_id)), Number(row.opening_balance)) });
  } catch (error) {
    sendError(res, error, "Error creating money account");
  }
};

/** PUT /money/me/accounts/:id */
export const updateMyMoneyAccount = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const employeeId = await me(req, res);
    if (employeeId === null) return;
    const account = await myAccount(idOf(req), employeeId);
    if (!account) {
      res.status(404).json({ message: "ບໍ່ພົບບັນຊີນີ້" });
      return;
    }
    const result = await readAccount(req.body ?? {}, account);
    if (result.error) {
      res.status(400).json({ message: result.error });
      return;
    }
    await account.update({ ...result.input, updatedAt: new Date() });
    res.status(200).json({ message: "ບັນທຶກບັນຊີແລ້ວ" });
  } catch (error) {
    sendError(res, error, "Error updating money account");
  }
};

/** DELETE /money/me/accounts/:id — ລາຍການເກົ່າຍັງຢູ່ (ເບິ່ງໄດ້ໃນ "ທັງໝົດ") */
export const deleteMyMoneyAccount = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const employeeId = await me(req, res);
    if (employeeId === null) return;
    const account = await myAccount(idOf(req), employeeId);
    if (!account) {
      res.status(404).json({ message: "ບໍ່ພົບບັນຊີນີ້" });
      return;
    }
    await account.update({ status: 0, updatedAt: new Date() });
    res.status(200).json({ message: "ລຶບບັນຊີແລ້ວ — ລາຍການເກົ່າຍັງຢູ່ຄືເດີມ" });
  } catch (error) {
    sendError(res, error, "Error deleting money account");
  }
};

// ================= ໝວດໝູ່

/** GET /money/me/categories */
export const getMyMoneyCategories = async (req: Request, res: Response) => {
  try {
    const employeeId = await me(req, res);
    if (employeeId === null) return;
    await ensureCategories(employeeId);
    const rows = await MoneyCategory.findAll({
      where: { employee_id: employeeId, status: 1 },
      order: [["kind", "DESC"], ["sort", "ASC"], ["_uuid", "ASC"]],
    });
    res.status(200).json({ data: rows.map(categoryOf) });
  } catch (error) {
    sendError(res, error, "Error getting money categories");
  }
};

/** ຊື່ / ໄອຄອນ / ສີ ຈາກ body — has = ສົ່ງມາບໍ່ (ແກ້ໄຂສົ່ງສະເພາະທີ່ປ່ຽນ) */
const readCategory = (body: Record<string, any>, creating: boolean) => {
  const has = (key: string) => creating || body[key] !== undefined;
  const input: Record<string, any> = {};
  if (has("name")) {
    const name = String(body.name ?? "").trim();
    if (!name) return { error: "ກະລຸນາປ້ອນຊື່ໝວດ" };
    if (name.length > MAX_NAME) return { error: `ຊື່ໝວດຍາວໄດ້ບໍ່ເກີນ ${MAX_NAME} ຕົວອັກສອນ` };
    input.name = name;
  }
  if (has("icon")) {
    const icon = String(body.icon ?? "other");
    if (!ICON.test(icon)) return { error: "ໄອຄອນບໍ່ຖືກຕ້ອງ" };
    input.icon = icon;
  }
  if (has("color")) {
    const color = String(body.color ?? "#64748B");
    if (!COLOR.test(color)) return { error: "ສີບໍ່ຖືກຕ້ອງ" };
    input.color = color.toUpperCase();
  }
  return { input };
};

/** POST /money/me/categories */
export const createMyMoneyCategory = async (req: Request, res: Response) => {
  try {
    const employeeId = await me(req, res);
    if (employeeId === null) return;
    const body = req.body ?? {};
    if (!isKind(body.kind)) {
      res.status(400).json({ message: "ກະລຸນາເລືອກ ລາຍຮັບ ຫຼື ລາຍຈ່າຍ" });
      return;
    }
    const result = readCategory(body, true);
    if ("error" in result) {
      res.status(400).json({ message: result.error });
      return;
    }
    await ensureCategories(employeeId);
    const active = { employee_id: employeeId, status: 1 };
    if ((await MoneyCategory.count({ where: active })) >= MAX_CATEGORIES) {
      res.status(400).json({ message: `ມີໝວດໄດ້ບໍ່ເກີນ ${MAX_CATEGORIES} ໝວດ` });
      return;
    }
    const sort = Number(await MoneyCategory.max("sort", { where: { employee_id: employeeId } })) || 0;
    const row = await MoneyCategory.create({ ...result.input, kind: body.kind, employee_id: employeeId, sort: sort + 1 });
    res.status(200).json({ message: "ເພີ່ມໝວດແລ້ວ", data: categoryOf(row) });
  } catch (error) {
    sendError(res, error, "Error creating money category");
  }
};

/** ໝວດຂອງຂ້ອຍທີ່ຍັງໃຊ້ງານ — ບໍ່ແມ່ນຂອງຂ້ອຍ / ບໍ່ມີ = null */
const myCategory = (id: number | null, employeeId: number) =>
  id ? MoneyCategory.findOne({ where: { _uuid: id, employee_id: employeeId, status: 1 } }) : Promise.resolve(null);

/** PUT /money/me/categories/:id */
export const updateMyMoneyCategory = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const employeeId = await me(req, res);
    if (employeeId === null) return;
    const category = await myCategory(idOf(req), employeeId);
    if (!category) {
      res.status(404).json({ message: "ບໍ່ພົບໝວດນີ້" });
      return;
    }
    const result = readCategory(req.body ?? {}, false);
    if ("error" in result) {
      res.status(400).json({ message: result.error });
      return;
    }
    await category.update({ ...result.input, updatedAt: new Date() });
    res.status(200).json({ message: "ບັນທຶກໝວດແລ້ວ", data: categoryOf(category) });
  } catch (error) {
    sendError(res, error, "Error updating money category");
  }
};

/** DELETE /money/me/categories/:id */
export const deleteMyMoneyCategory = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const employeeId = await me(req, res);
    if (employeeId === null) return;
    const category = await myCategory(idOf(req), employeeId);
    if (!category) {
      res.status(404).json({ message: "ບໍ່ພົບໝວດນີ້" });
      return;
    }
    await category.update({ status: 0, updatedAt: new Date() });
    res.status(200).json({ message: "ລຶບໝວດແລ້ວ — ລາຍການເກົ່າຍັງຢູ່ຄືເດີມ" });
  } catch (error) {
    sendError(res, error, "Error deleting money category");
  }
};

// ================= ລາຍການ

type AccountView = ReturnType<typeof accountOf>;

const accountBrief = (a: AccountView | undefined) =>
  a ? { _uuid: a._uuid, name: a.name, kind: a.kind, logo: a.bank?.logo ?? null, currency: a.currency, active: a.active } : null;

const entryOf = (e: MoneyEntry, categories: Map<number, ReturnType<typeof categoryOf>>, accounts: Map<number, AccountView>) => {
  const category = e.kind === TRANSFER ? undefined : categories.get(Number(e.category_id));
  return {
    _uuid: e._uuid,
    kind: e.kind,
    category_id: e.kind === TRANSFER ? null : e.category_id,
    category: category ? { name: category.name, icon: category.icon, color: category.color } : null,
    account_id: e.account_id ?? null,
    account: accountBrief(accounts.get(Number(e.account_id))),
    to_account_id: e.to_account_id ?? null,
    to_account: accountBrief(accounts.get(Number(e.to_account_id))),
    amount: Number(e.amount),
    to_amount: e.to_amount === null || e.to_amount === undefined ? null : Number(e.to_amount),
    currency: e.currency,
    entry_date: e.entry_date,
    note: e.note || null,
    has_photo: !!e.photo,
    /** PAYROLL = ລາຍການທີ່ລະບົບເຄີຍເພີ່ມຕອນ HR ຈ່າຍເງິນເດືອນ (ເລີກແລ້ວ) */
    source: e.source ?? null,
    createdAt: e.createdAt,
  };
};

/** from / to ຂອງ query — ບໍ່ສົ່ງ = ເດືອນນີ້ */
const rangeOf = (query: Request["query"]) => {
  const month = moment(todayLao(), "YYYY-MM-DD");
  const from = query.from === undefined ? month.clone().startOf("month").format("YYYY-MM-DD") : toDateOnly(query.from);
  const to = query.to === undefined ? month.clone().endOf("month").format("YYYY-MM-DD") : toDateOnly(query.to);
  if (!from || !to || to < from || daysBetween(from, to) >= MAX_RANGE_DAYS) return null;
  return { from, to };
};

/** ເງື່ອນໄຂ "ລາຍການຂອງບັນຊີນີ້" — ລວມການໂອນເຂົ້າ */
const ofAccount = (accountId: number | null) =>
  accountId ? { [Op.or]: [{ account_id: accountId }, { to_account_id: accountId }] } : {};

/** GET /money/me/entries?from=&to=&account_id=&kind=&offset= */
export const getMyMoneyEntries = async (req: Request, res: Response) => {
  try {
    const employeeId = await me(req, res);
    if (employeeId === null) return;
    const range = rangeOf(req.query);
    if (!range) {
      res.status(400).json({ message: "ຊ່ວງວັນທີບໍ່ຖືກຕ້ອງ (ບໍ່ເກີນ 1 ປີ)" });
      return;
    }
    const accountId = plainId(req.query.account_id);
    const kind = [...KINDS, TRANSFER].includes(String(req.query.kind)) ? String(req.query.kind) : null;
    // kind=all = ທຸກປະເພດ ທັງເດືອນ (ໜ້າບັນຊີ ກັ່ນຕອງ / ແຍກຕາມໝວດໃນແອັບ)
    const page = kind || req.query.kind === "all" ? KIND_PAGE : PAGE;
    const offset = Math.max(0, Math.floor(Number(req.query.offset) || 0));
    const inRange = { employee_id: employeeId, entry_date: { [Op.between]: [range.from, range.to] } };
    const [rows, sums, categories, accounts] = await Promise.all([
      MoneyEntry.findAll({
        where: { ...inRange, ...ofAccount(accountId), ...(kind ? { kind } : {}) },
        order: [["entry_date", "DESC"], ["_uuid", "DESC"]],
        limit: page + 1,
        offset,
      }),
      MoneyEntry.findAll({
        attributes: ["currency", "kind", [fn("SUM", col("amount")), "total"]],
        where: { ...inRange, kind: { [Op.in]: [...KINDS] }, ...(accountId ? { account_id: accountId } : {}) },
        group: ["currency", "kind"],
        raw: true,
      }) as unknown as Promise<{ currency: string; kind: string; total: string }[]>,
      categoryMap(employeeId),
      accountMap(employeeId),
    ]);
    const totals = CURRENCIES.map((currency) => ({
      currency,
      income: amountOf(sums.find((s) => s.currency === currency && s.kind === "income")?.total),
      expense: amountOf(sums.find((s) => s.currency === currency && s.kind === "expense")?.total),
    })).filter((t) => t.income || t.expense);
    res.status(200).json({
      ...range,
      today: todayLao(),
      data: rows.slice(0, page).map((e) => entryOf(e, categories, accounts)),
      has_more: rows.length > page,
      totals,
    });
  } catch (error) {
    sendError(res, error, "Error getting money entries");
  }
};

/**
 * ບັນຊີຂອງລາຍການ: ຕ້ອງເປັນບັນຊີທີ່ໃຊ້ງານ — ແກ້ໄຂລາຍການເກົ່າ ໂດຍສົ່ງບັນຊີເດີມ = ບໍ່ກວດ (ບັນຊີທີ່ລຶບແລ້ວບັນທຶກໄດ້ໂດຍບໍ່ຕ້ອງປ່ຽນ)
 */
const accountFor = async (value: unknown, employeeId: number, current?: number | null) => {
  const id = plainId(value);
  if (id && current && id === Number(current)) return MoneyAccount.findOne({ where: { _uuid: id, employee_id: employeeId } });
  return myAccount(id, employeeId);
};

/** ວັນທີ / ບັນທຶກ / ຈຳນວນ — ໃຊ້ຮ່ວມກັນທຸກປະເພດ */
const readCommon = (body: Record<string, any>, has: (key: string) => boolean, input: Record<string, any>) => {
  if (has("amount")) {
    const amount = amountOf(body.amount);
    if (!(amount > 0)) return "ກະລຸນາປ້ອນຈຳນວນເງິນ";
    if (amount >= MAX_AMOUNT) return "ຈຳນວນເງິນຫຼາຍເກີນໄປ";
    input.amount = amount;
  }
  if (has("entry_date")) {
    const date = toDateOnly(body.entry_date);
    const latest = moment(todayLao(), "YYYY-MM-DD").add(1, "year").format("YYYY-MM-DD");
    if (!date || date < "2000-01-01" || date > latest) return "ວັນທີບໍ່ຖືກຕ້ອງ";
    input.entry_date = date;
  }
  if (body.note !== undefined) {
    const note = String(body.note ?? "").trim();
    if (note.length > MAX_NOTE) return `ບັນທຶກຍາວໄດ້ບໍ່ເກີນ ${MAX_NOTE} ຕົວອັກສອນ`;
    input.note = note || null;
  }
  return null;
};

/**
 * ກວດຂໍ້ມູນລາຍການຈາກ body (multipart = ທຸກຄ່າເປັນ string) — ບໍ່ມີ existing (ເພີ່ມໃໝ່) = ຕ້ອງມີຄົບ.
 * ລາຍຮັບ / ລາຍຈ່າຍ: ປະເພດຕາມໝວດ, ສະກຸນຕາມບັນຊີ. ໂອນ: ສົ່ງຄົບທຸກເທື່ອ (ຕົ້ນທາງ, ປາຍທາງ, ຈຳນວນ); ສະກຸນດຽວກັນ = ເຂົ້າເທົ່າທີ່ອອກ.
 * ປະເພດຂອງລາຍການທີ່ມີແລ້ວປ່ຽນລະຫວ່າງ ໂອນ ↔ ຮັບ/ຈ່າຍ ບໍ່ໄດ້
 */
const readEntry = async (body: Record<string, any>, employeeId: number, existing?: MoneyEntry) => {
  const creating = !existing;
  const transfer = existing ? existing.kind === TRANSFER : body.kind === TRANSFER;
  if (existing && !transfer && body.kind === TRANSFER) return { error: "ປ່ຽນລາຍຮັບ / ລາຍຈ່າຍ ເປັນການໂອນບໍ່ໄດ້ — ລຶບແລ້ວບັນທຶກໃໝ່" };
  const input: Record<string, any> = {};

  if (transfer) {
    const from = await accountFor(body.account_id, employeeId, existing?.account_id);
    if (!from) return { error: "ກະລຸນາເລືອກບັນຊີທີ່ໂອນອອກ" };
    const to = await accountFor(body.to_account_id, employeeId, existing?.to_account_id);
    if (!to) return { error: "ກະລຸນາເລືອກບັນຊີທີ່ໂອນເຂົ້າ" };
    if (from._uuid === to._uuid) return { error: "ບັນຊີໂອນອອກ ແລະ ໂອນເຂົ້າ ຕ້ອງບໍ່ແມ່ນບັນຊີດຽວກັນ" };
    const error = readCommon(body, () => true, input);
    if (error) return { error };
    let toAmount = input.amount;
    if (from.currency !== to.currency) {
      toAmount = amountOf(body.to_amount);
      if (!(toAmount > 0)) return { error: `ກະລຸນາປ້ອນຈຳນວນທີ່ໄດ້ຮັບ (${to.currency})` };
      if (toAmount >= MAX_AMOUNT) return { error: "ຈຳນວນເງິນຫຼາຍເກີນໄປ" };
    }
    Object.assign(input, { kind: TRANSFER, category_id: 0, account_id: from._uuid, to_account_id: to._uuid, to_amount: toAmount, currency: from.currency });
    return { input };
  }

  const has = (key: string) => creating || (body[key] !== undefined && body[key] !== "");
  const sameCategory = !!existing && Number(body.category_id) === Number(existing.category_id);
  if (has("category_id") && !sameCategory) {
    const category = await myCategory(plainId(body.category_id), employeeId);
    if (!category) return { error: "ກະລຸນາເລືອກໝວດ" };
    input.category_id = category._uuid;
    input.kind = category.kind;
  }
  if (has("account_id")) {
    const account = await accountFor(body.account_id, employeeId, existing?.account_id);
    if (!account) return { error: "ກະລຸນາເລືອກບັນຊີ" };
    input.account_id = account._uuid;
    input.currency = account.currency;
  }
  const error = readCommon(body, has, input);
  if (error) return { error };
  return { input };
};

/** ລາຍການຂອງຂ້ອຍ — ບໍ່ແມ່ນຂອງຂ້ອຍ / ບໍ່ມີ = null (ຕອບ 404 ຄືກັນ ບໍ່ບອກວ່າມີຢູ່) */
const myEntry = (id: number | null, employeeId: number) =>
  id ? MoneyEntry.findOne({ where: { _uuid: id, employee_id: employeeId } }) : Promise.resolve(null);

const receiptPath = (file: string) => path.join(RECEIPT_DIR, path.basename(file));

const SAVED: Record<string, string> = { income: "ບັນທຶກລາຍຮັບແລ້ວ", expense: "ບັນທຶກລາຍຈ່າຍແລ້ວ", [TRANSFER]: "ບັນທຶກການໂອນແລ້ວ" };

/** POST /money/me/entries */
export const createMyMoneyEntry = async (req: Request, res: Response) => {
  const uploaded = req.file?.filename;
  const fail = (code: number, message: string) => {
    if (uploaded) removeQuietly(receiptPath(uploaded));
    res.status(code).json({ message });
  };
  try {
    const employeeId = await me(req, res);
    if (employeeId === null) {
      if (uploaded) removeQuietly(receiptPath(uploaded));
      return;
    }
    await ensureCategories(employeeId);
    const result = await readEntry(req.body ?? {}, employeeId);
    if (result.error) return fail(400, result.error);
    const row = await MoneyEntry.create({ ...result.input, employee_id: employeeId, photo: uploaded ?? null });
    res.status(200).json({
      message: SAVED[row.kind] ?? "ບັນທຶກແລ້ວ",
      data: entryOf(row, await categoryMap(employeeId), await accountMap(employeeId)),
    });
  } catch (error) {
    if (uploaded) removeQuietly(receiptPath(uploaded));
    sendError(res, error, "Error creating money entry");
  }
};

/** PUT /money/me/entries/:id */
export const updateMyMoneyEntry = async (req: Request<{ id: string }>, res: Response) => {
  const uploaded = req.file?.filename;
  const fail = (code: number, message: string) => {
    if (uploaded) removeQuietly(receiptPath(uploaded));
    res.status(code).json({ message });
  };
  try {
    const employeeId = await me(req, res);
    if (employeeId === null) {
      if (uploaded) removeQuietly(receiptPath(uploaded));
      return;
    }
    const entry = await myEntry(idOf(req), employeeId);
    if (!entry) return fail(404, "ບໍ່ພົບລາຍການນີ້");
    const body = req.body ?? {};
    const result = await readEntry(body, employeeId, entry);
    if (result.error) return fail(400, result.error);
    const old = entry.photo;
    const removePhoto = ["1", "true"].includes(String(body.remove_photo));
    const photo = uploaded ?? (removePhoto ? null : old);
    await entry.update({ ...result.input, photo, updatedAt: new Date() });
    if (old && old !== photo) removeQuietly(receiptPath(old));
    res.status(200).json({
      message: "ບັນທຶກການແກ້ໄຂແລ້ວ",
      data: entryOf(entry, await categoryMap(employeeId), await accountMap(employeeId)),
    });
  } catch (error) {
    if (uploaded) removeQuietly(receiptPath(uploaded));
    sendError(res, error, "Error updating money entry");
  }
};

/** DELETE /money/me/entries/:id */
export const deleteMyMoneyEntry = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const employeeId = await me(req, res);
    if (employeeId === null) return;
    const entry = await myEntry(idOf(req), employeeId);
    if (!entry) {
      res.status(404).json({ message: "ບໍ່ພົບລາຍການນີ້" });
      return;
    }
    await entry.destroy();
    if (entry.photo) removeQuietly(receiptPath(entry.photo));
    res.status(200).json({ message: "ລຶບລາຍການແລ້ວ" });
  } catch (error) {
    sendError(res, error, "Error deleting money entry");
  }
};

/** GET /money/me/entries/:id/photo */
export const getMyMoneyEntryPhoto = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const employeeId = await me(req, res);
    if (employeeId === null) return;
    const entry = await myEntry(idOf(req), employeeId);
    const file = entry?.photo ? receiptPath(entry.photo) : null;
    if (!file || !fs.existsSync(file)) {
      res.status(404).json({ message: "ບໍ່ພົບຮູບ" });
      return;
    }
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.sendFile(file);
  } catch (error) {
    sendError(res, error, "Error getting receipt photo");
  }
};

// ================= ລາຍງານ

/** GET /money/me/summary?from=&to=&currency=&account_id= */
export const getMyMoneySummary = async (req: Request, res: Response) => {
  try {
    const employeeId = await me(req, res);
    if (employeeId === null) return;
    const range = rangeOf(req.query);
    if (!range) {
      res.status(400).json({ message: "ຊ່ວງວັນທີບໍ່ຖືກຕ້ອງ (ບໍ່ເກີນ 1 ປີ)" });
      return;
    }
    const currency = String(req.query.currency ?? "LAK").toUpperCase();
    if (!isCurrency(currency)) {
      res.status(400).json({ message: "ສະກຸນເງິນບໍ່ຖືກຕ້ອງ" });
      return;
    }
    const accountId = plainId(req.query.account_id);
    const dates = { entry_date: { [Op.between]: [range.from, range.to] } };
    const inRange = { employee_id: employeeId, ...dates };
    // ລາຍຮັບ-ລາຍຈ່າຍ (ບໍ່ນັບການໂອນ) ຂອງສະກຸນນີ້ (ແລະ ບັນຊີນີ້ ຖ້າເລືອກ)
    const where = { ...inRange, currency, kind: { [Op.in]: [...KINDS] }, ...(accountId ? { account_id: accountId } : {}) };
    const [byCategory, byDay, used, categories, accounts, flows, legacy] = await Promise.all([
      MoneyEntry.findAll({
        attributes: ["category_id", "kind", [fn("SUM", col("amount")), "total"], [fn("COUNT", col("_uuid")), "count"]],
        where,
        group: ["category_id", "kind"],
        raw: true,
      }) as unknown as Promise<{ category_id: number; kind: string; total: string; count: number }[]>,
      // raw ບໍ່ຜ່ານ model — DATE ອາດມາເປັນ Date object, ໃຫ້ MySQL ແປງເປັນ "YYYY-MM-DD" ເອງ
      MoneyEntry.findAll({
        attributes: [[fn("DATE_FORMAT", col("entry_date"), "%Y-%m-%d"), "day"], "kind", [fn("SUM", col("amount")), "total"]],
        where,
        group: ["day", "kind"],
        raw: true,
      }) as unknown as Promise<{ day: string; kind: string; total: string }[]>,
      MoneyEntry.findAll({ attributes: ["currency"], where: inRange, group: ["currency"], raw: true }) as unknown as Promise<{ currency: string }[]>,
      categoryMap(employeeId),
      accountList(employeeId, true),
      flowsOf(employeeId, dates),
      // ລາຍການກ່ອນມີບັນຊີ — ລວມເປັນ "ບໍ່ລະບຸບັນຊີ" ແຍກຕາມສະກຸນ
      MoneyEntry.findAll({
        attributes: ["currency", "kind", [fn("SUM", col("amount")), "total"], [fn("COUNT", col("_uuid")), "count"]],
        where: { ...inRange, account_id: null, kind: { [Op.in]: [...KINDS] } },
        group: ["currency", "kind"],
        raw: true,
      }) as unknown as Promise<{ currency: string; kind: string; total: string; count: number }[]>,
    ]);

    const rows = byCategory.map((r) => {
      const category = categories.get(Number(r.category_id));
      return {
        category_id: Number(r.category_id),
        kind: r.kind,
        name: category?.name ?? "—",
        icon: category?.icon ?? "other",
        color: category?.color ?? "#64748B",
        total: amountOf(r.total),
        count: Number(r.count) || 0,
      };
    }).sort((a, b) => b.total - a.total);
    const sum = (kind: Kind) => amountOf(rows.filter((r) => r.kind === kind).reduce((s, r) => s + r.total, 0));
    const income = sum("income");
    const expense = sum("expense");

    // ແນວໂນ້ມ: ທຸກມື້ / ທຸກເດືອນໃນຊ່ວງ (ມື້ທີ່ບໍ່ມີລາຍການ = 0)
    const daily = daysBetween(range.from, range.to) < DAILY_TREND_DAYS;
    const keyOf = (date: string) => (daily ? date : date.slice(0, 7));
    const points = new Map<string, { key: string; income: number; expense: number }>();
    const step = daily ? "day" : "month";
    for (let d = moment(range.from, "YYYY-MM-DD").startOf(step); d.format("YYYY-MM-DD") <= range.to; d.add(1, step)) {
      const key = keyOf(d.format("YYYY-MM-DD"));
      points.set(key, { key, income: 0, expense: 0 });
    }
    for (const r of byDay) {
      const point = points.get(keyOf(String(r.day)));
      if (point && isKind(r.kind)) point[r.kind] = amountOf(point[r.kind] + amountOf(r.total));
    }

    // ແຍກຕາມບັນຊີ: ບັນຊີທີ່ໃຊ້ງານທັງໝົດ + ບັນຊີທີ່ລຶບແລ້ວແຕ່ມີລາຍການໃນຊ່ວງ + ບໍ່ລະບຸບັນຊີ
    const byAccount: Record<string, any>[] = accounts
      .filter((a) => a.active || flows.has(a._uuid))
      .map((a) => ({ account_id: a._uuid, name: a.name, kind: a.kind, logo: a.bank?.logo ?? null, currency: a.currency, active: a.active, balance: a.balance, income: 0, expense: 0, transfer_in: 0, transfer_out: 0, count: 0, ...flows.get(a._uuid) }));
    for (const c of CURRENCIES) {
      const of = (kind: Kind) => legacy.find((l) => l.currency === c && l.kind === kind);
      const count = (Number(of("income")?.count) || 0) + (Number(of("expense")?.count) || 0);
      if (!count) continue;
      byAccount.push({
        account_id: null, name: "ບໍ່ລະບຸບັນຊີ", kind: null, logo: null, currency: c, active: false, balance: null,
        income: amountOf(of("income")?.total), expense: amountOf(of("expense")?.total), transfer_in: 0, transfer_out: 0, count,
      });
    }

    res.status(200).json({
      ...range,
      currency,
      currencies: CURRENCIES.filter((c) => c === currency || used.some((u) => u.currency === c) || accounts.some((a) => a.active && a.currency === c)),
      totals: { income, expense, balance: amountOf(income - expense), count: rows.reduce((s, r) => s + r.count, 0) },
      categories: rows,
      trend: { group: daily ? "day" : "month", points: [...points.values()] },
      accounts: byAccount,
    });
  } catch (error) {
    sendError(res, error, "Error getting money summary");
  }
};
