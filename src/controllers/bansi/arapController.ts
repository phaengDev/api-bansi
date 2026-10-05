import { Request, Response } from "express";
import { Op, QueryTypes, Transaction } from "sequelize";
import moment from "moment";
import sequelize from "../../config/database";
import Partner from "../../models/partner";
import PartnerDoc, { PartnerDocLine } from "../../models/partnerDoc";
import PartnerPayment, { PartnerAllocation } from "../../models/partnerPayment";
import ChartAccount from "../../models/chartAccount";
import TreasuryAccount from "../../models/treasuryAcount";
import TypeTreasury from "../../models/typeTreasury";
import Currency from "../../models/currencyModel";
import Banks from "../../models/bankModel";
import { url } from "../../utils";
import { actorOf, decodeId, pickFields, sendError, toDateOnly } from "./bansiHelpers";
import { issueDocNumber } from "./docNumberingController";
import { MOVE_IN, MOVE_OUT, moveBalance } from "./accountMovement";
import { computeTax, entryDateOf, isCashAccount, todayLao } from "./journalHelpers";
import {
  CREDIT, DEBIT, DraftLine, GlError, glReady, isBaseCurrency, postEntry, rateOf, reverseSource, roleAccountId,
  round2, treasuryAccountId,
} from "./glCore";

/**
 * ລູກໜີ້ (AR, kind 1) ແລະ ເຈົ້າໜີ້ (AP, kind 2):
 * - ຄູ່ຄ້າ (tbl_partner)
 * - ໃບແຈ້ງໜີ້ / ໃບບິນ (tbl_partner_doc + lines) — ລົງບັນຊີ:
 *     AR: ໜີ້ ລູກໜີ້ (ຍອດລວມ) / ມີ ລາຍຮັບແຕ່ລະແຖວ (ກ່ອນອາກອນ) + ມີ ອາກອນຂາອອກ
 *     AP: ໜີ້ ລາຍຈ່າຍ/ຊັບສິນແຕ່ລະແຖວ + ໜີ້ ອາກອນຂາເຂົ້າ / ມີ ເຈົ້າໜີ້ (ຍອດລວມ)
 * - ຮັບ/ຈ່າຍຊຳລະ (tbl_partner_payment + allocation) — ເງິນເຂົ້າ/ອອກ ບັນຊີເງິນຄັງ ແລະ ລົງບັນຊີ:
 *     AR: ໜີ້ ເງິນສົດ/ທະນາຄານ / ມີ ລູກໜີ້ (ຕາມອັດຕາຂອງໃບ) ± ກຳໄລ/ຂາດທຶນ ອັດຕາແລກປ່ຽນ
 *     AP: ໜີ້ ເຈົ້າໜີ້ (ຕາມອັດຕາຂອງໃບ) / ມີ ເງິນສົດ/ທະນາຄານ ± ກຳໄລ/ຂາດທຶນ ອັດຕາແລກປ່ຽນ
 * ຍົກເລີກ = ກັບລາຍການໃບບັນທຶກ (ໃບທີ່ຕັດໜີ້ແລ້ວຕ້ອງຍົກເລີກການຊຳລະກ່ອນ). ຕ້ອງແລ່ນ sql/create_gl_ar_ap.sql
 */

export const AR = 1;
export const AP = 2;
const ACTIVE = 1;
const CANCELLED = 2;

const KIND = {
  [AR]: { docCode: "AR_INVOICE", docPrefix: "INV", payCode: "AR_RECEIPT", payPrefix: "RCV", role: "AR", partnerTypes: [1, 3] },
  [AP]: { docCode: "AP_BILL", docPrefix: "BILL", payCode: "AP_PAYMENT", payPrefix: "PAY", role: "AP", partnerTypes: [2, 3] },
} as const;
type Kind = typeof AR | typeof AP;
const kindOf = (value: unknown): Kind | null => (Number(value) === AR ? AR : Number(value) === AP ? AP : null);

// ---- ຕາຕະລາງພ້ອມບໍ່ ----
let ready = false;
let checkedAt = 0;
const arapReady = async (t?: Transaction) => {
  if (ready) return true;
  if (!(await glReady(t))) return false;
  if (Date.now() - checkedAt < 60_000) return false;
  checkedAt = Date.now();
  const rows = await sequelize.query<{ n: number }>(
    "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN " +
      "('tbl_partner','tbl_partner_doc','tbl_partner_doc_line','tbl_partner_payment','tbl_partner_allocation')",
    { type: QueryTypes.SELECT, transaction: t }
  );
  ready = Number(rows[0]?.n) === 5;
  return ready;
};

const notReady = (res: Response) =>
  res.status(503).json({
    message: "ຍັງບໍ່ໄດ້ສ້າງຕາຕະລາງລູກໜີ້-ເຈົ້າໜີ້ — ແລ່ນ sql/create_gl_accounting.sql ແລະ sql/create_gl_ar_ap.sql ກ່ອນ",
    notReady: true,
  });

const fail = (res: Response, error: unknown, fallback: string) => {
  if (error instanceof GlError) {
    res.status(400).json({ message: error.message });
    return;
  }
  sendError(res, error, fallback);
};

/** ເລກທີ: ຮູບແບບຈາກ ຕັ້ງຄ່າ → ເລກທີເອກະສານ (code) ຫຼື PREFIX-YYYY-00001 */
const nextNumber = async (code: string, prefix: string, model: any, field: string, date: string, t: Transaction) => {
  const issued = await issueDocNumber(code, t);
  if (issued?.number) return issued.number;
  const head = `${prefix}-${moment(date).format("YYYY")}-`;
  const last: any = await model.findOne({
    where: { [field]: { [Op.like]: `${head}%` } },
    order: [[field, "DESC"]],
    transaction: t,
    lock: t.LOCK.UPDATE,
  });
  const seq = last ? Number(String(last[field]).slice(head.length)) || 0 : 0;
  return `${head}${String(seq + 1).padStart(5, "0")}`;
};

/** ສະກຸນຂອງ id — ບໍ່ສົ່ງ = LAK (ຖ້າມີໃນ tbl_currency) */
const currencyIdOf = async (value: unknown, t: Transaction) => {
  if (value) return Number(value);
  const base: any = await Currency.findOne({ where: { name: "LAK" }, transaction: t });
  return base ? Number(base._id) : null;
};

/** ສະກຸນດຽວກັນບໍ່ (null ຫຼື LAK = ສະກຸນຫຼັກ) */
const sameCurrency = async (a: number | null, b: number | null, t: Transaction) => {
  if (Number(a || 0) === Number(b || 0)) return true;
  const [ca, cb] = await Promise.all([a ? Currency.findByPk(a, { transaction: t }) : null, b ? Currency.findByPk(b, { transaction: t }) : null]);
  return isBaseCurrency(ca) && isBaseCurrency(cb);
};

// ======================= ຄູ່ຄ້າ =======================

const PARTNER_FIELDS = [
  "partner_code", "name", "partner_type", "contact_person", "phone", "email", "address", "tax_number",
  "credit_days", "receivable_account_id", "payable_account_id", "description", "status",
] as const;

/** GET /partner/fetch — ທຸກຄູ່ຄ້າ + ຍອດຄ້າງ (LAK ຕາມອັດຕາຂອງໃບ) ແລະ ຈຳນວນໃບທີ່ຍັງຄ້າງ */
export const getPartners = async (_req: Request, res: Response) => {
  try {
    if (!(await arapReady())) return notReady(res);
    const [partners, open] = await Promise.all([
      Partner.findAll({ order: [["partner_code", "ASC"]] }),
      sequelize.query<{ partner_id: number; doc_kind: number; open_base: string; docs: number; overdue_base: string }>(
        `SELECT partner_id, doc_kind, SUM((total - paid) * exchange_rate) AS open_base, COUNT(*) AS docs,
                SUM(CASE WHEN due_date < :today THEN (total - paid) * exchange_rate ELSE 0 END) AS overdue_base
         FROM tbl_partner_doc WHERE status = 1 AND total > paid GROUP BY partner_id, doc_kind`,
        { type: QueryTypes.SELECT, replacements: { today: todayLao() } }
      ),
    ]);
    const data = partners.map((p: any) => {
      const row = (kind: number) => open.find((o) => Number(o.partner_id) === Number(p._uuid) && Number(o.doc_kind) === kind);
      const ar = row(AR);
      const ap = row(AP);
      return {
        ...p.get({ plain: true }),
        ar_open: round2(Number(ar?.open_base) || 0),
        ar_overdue: round2(Number(ar?.overdue_base) || 0),
        ar_docs: Number(ar?.docs) || 0,
        ap_open: round2(Number(ap?.open_base) || 0),
        ap_overdue: round2(Number(ap?.overdue_base) || 0),
        ap_docs: Number(ap?.docs) || 0,
      };
    });
    res.status(200).json({ data, total: data.length });
  } catch (error) {
    sendError(res, error, "Error getting partners");
  }
};

const preparePartner = async (body: Record<string, any>, existing?: any) => {
  const merged = { ...(existing ? existing.get({ plain: true }) : {}), ...body };
  const code = String(merged.partner_code ?? "").trim().toUpperCase();
  const name = String(merged.name ?? "").trim();
  if (!code) throw new GlError("ກະລຸນາປ້ອນລະຫັດຄູ່ຄ້າ");
  if (!name) throw new GlError("ກະລຸນາປ້ອນຊື່ຄູ່ຄ້າ");
  const clash = await Partner.count({ where: { partner_code: code, ...(existing ? { _uuid: { [Op.ne]: existing._uuid } } : {}) } });
  if (clash) throw new GlError(`ລະຫັດ ${code} ມີແລ້ວ`);
  const type = [1, 2, 3].includes(Number(merged.partner_type)) ? Number(merged.partner_type) : 1;
  const accountOf = async (value: unknown, group: number, label: string) => {
    if (!value) return null;
    const account: any = await ChartAccount.findByPk(Number(value));
    if (!account || Number(account.status) !== 1 || Number(account.is_postable) !== 1 || Number(account.account_group) !== group) {
      throw new GlError(`${label} ຕ້ອງເປັນບັນຊີລົງລາຍການກຸ່ມ ${group} ທີ່ໃຊ້ງານຢູ່`);
    }
    return Number(account._uuid);
  };
  return {
    partner_code: code,
    name,
    partner_type: type,
    contact_person: String(merged.contact_person ?? "").trim() || null,
    phone: String(merged.phone ?? "").trim() || null,
    email: String(merged.email ?? "").trim() || null,
    address: String(merged.address ?? "").trim() || null,
    tax_number: String(merged.tax_number ?? "").trim() || null,
    credit_days: Math.max(0, Math.round(Number(merged.credit_days) || 0)),
    receivable_account_id: await accountOf(merged.receivable_account_id, 1, "ບັນຊີລູກໜີ້"),
    payable_account_id: await accountOf(merged.payable_account_id, 2, "ບັນຊີເຈົ້າໜີ້"),
    description: String(merged.description ?? "").trim() || null,
    status: Number(merged.status) === 0 ? 0 : 1,
  };
};

/** POST /partner/create */
export const createPartner = async (req: Request, res: Response) => {
  try {
    if (!(await arapReady())) return notReady(res);
    const row = await Partner.create(await preparePartner(pickFields(req.body, PARTNER_FIELDS)));
    res.status(200).json({ message: "Successfully created partner", data: row });
  } catch (error) {
    fail(res, error, "Error creating partner");
  }
};

/** PUT /partner/:id (base64) */
export const updatePartner = async (req: Request<{ id: string }>, res: Response) => {
  try {
    if (!(await arapReady())) return notReady(res);
    const row: any = await Partner.findByPk(decodeId(req));
    if (!row) {
      res.status(404).json({ message: "ບໍ່ພົບຄູ່ຄ້າ" });
      return;
    }
    await row.update({ ...(await preparePartner(pickFields(req.body, PARTNER_FIELDS), row)), updatedAt: new Date() });
    res.status(200).json({ message: "Successfully updated partner", data: row });
  } catch (error) {
    fail(res, error, "Error updating partner");
  }
};

// ======================= ໃບແຈ້ງໜີ້ / ໃບບິນ =======================

const docInclude = [
  { model: Partner, as: "partner", attributes: ["_uuid", "partner_code", "name", "phone"] },
  {
    model: PartnerDocLine,
    as: "lines",
    include: [{ model: ChartAccount, as: "account", attributes: ["_uuid", "account_code", "name_la", "name_en", "name_cn", "account_group"] }],
  },
  {
    model: PartnerAllocation,
    as: "allocations",
    include: [{ model: PartnerPayment, as: "payment", attributes: ["_uuid", "pay_number", "pay_date", "status"] }],
  },
];

/**
 * POST /partner-doc/fetch { kind, partner_id?, open_only?, status?, start_date?, end_date? } —
 * ໃບຕາມວັນທີ (ໃໝ່ສຸດກ່ອນ) ພ້ອມແຖວ, ຄູ່ຄ້າ, ການຕັດໜີ້ ແລະ ສະກຸນເງິນ
 */
export const getPartnerDocs = async (req: Request, res: Response) => {
  try {
    if (!(await arapReady())) return notReady(res);
    const body = req.body || {};
    const kind = kindOf(body.kind);
    if (!kind) throw new GlError("kind ຕ້ອງເປັນ 1 (ລູກໜີ້) ຫຼື 2 (ເຈົ້າໜີ້)");
    const where: any = { doc_kind: kind };
    if (body.partner_id) where.partner_id = Number(body.partner_id);
    if (body.open_only) {
      where.status = ACTIVE;
      where.total = { [Op.gt]: sequelize.col("PartnerDoc.paid") };
    } else if ([ACTIVE, CANCELLED].includes(Number(body.status))) where.status = Number(body.status);
    const start = toDateOnly(body.start_date);
    const end = toDateOnly(body.end_date);
    if (start || end) where.doc_date = { ...(start ? { [Op.gte]: start } : {}), ...(end ? { [Op.lte]: end } : {}) };
    const [rows, currencies] = await Promise.all([
      PartnerDoc.findAll({ where, order: [["doc_date", "DESC"], ["_uuid", "DESC"]], include: docInclude }),
      Currency.findAll({ attributes: ["_id", "name", "genus"] }),
    ]);
    const data = rows.map((r: any) => {
      const plain = r.get({ plain: true });
      plain.lines.sort((a: any, b: any) => a.line_no - b.line_no);
      return {
        ...plain,
        currency: currencies.find((c: any) => Number(c._id) === Number(r.currency_id)) ?? null,
        open: round2(Number(r.total) - Number(r.paid)),
      };
    });
    res.status(200).json({ data, total: data.length });
  } catch (error) {
    fail(res, error, "Error getting partner documents");
  }
};

/**
 * POST /partner-doc/create
 * { kind, partner_id, doc_date?, due_date?, reference?, description?, currency_id?, exchange_rate?,
 *   tax_id? | (tax, calc_method)?, lines: [{ account_id, description?, amount }] }
 */
export const createPartnerDoc = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    if (!(await arapReady(t))) {
      await t.rollback();
      return notReady(res);
    }
    const body = req.body || {};
    const kind = kindOf(body.kind);
    if (!kind) throw new GlError("kind ຕ້ອງເປັນ 1 (ລູກໜີ້) ຫຼື 2 (ເຈົ້າໜີ້)");
    const cfg = KIND[kind];

    const partner: any = await Partner.findByPk(Number(body.partner_id), { transaction: t });
    if (!partner || Number(partner.status) !== 1) throw new GlError("ບໍ່ພົບຄູ່ຄ້າ ຫຼື ປິດໃຊ້ງານແລ້ວ");
    if (!(cfg.partnerTypes as readonly number[]).includes(Number(partner.partner_type))) {
      throw new GlError(kind === AR ? "ຄູ່ຄ້ານີ້ບໍ່ແມ່ນລູກຄ້າ" : "ຄູ່ຄ້ານີ້ບໍ່ແມ່ນຜູ້ສະໜອງ");
    }

    const docDate = entryDateOf(body.doc_date, "ວັນທີເອກະສານ");
    if ("error" in docDate) throw new GlError(docDate.error);
    const due = toDateOnly(body.due_date) ?? moment(docDate.date).add(Number(partner.credit_days) || 0, "days").format("YYYY-MM-DD");
    if (due < docDate.date) throw new GlError("ວັນຄົບກຳນົດຕ້ອງບໍ່ກ່ອນວັນທີເອກະສານ");

    const items: any[] = Array.isArray(body.lines) ? body.lines : [];
    const lines = items
      .map((l) => ({ account_id: Number(l?.account_id), description: String(l?.description ?? "").trim() || null, amount: round2(Number(l?.amount) || 0) }))
      .filter((l) => l.amount !== 0 || l.account_id);
    if (!lines.length) throw new GlError("ກະລຸນາປ້ອນຢ່າງໜ້ອຍ 1 ລາຍການ");
    lines.forEach((l, i) => {
      if (!l.account_id) throw new GlError(`ແຖວ ${i + 1}: ກະລຸນາເລືອກບັນຊີ`);
      if (!(l.amount > 0)) throw new GlError(`ແຖວ ${i + 1}: ຈຳນວນຕ້ອງຫຼາຍກວ່າ 0`);
    });
    const subtotal = round2(lines.reduce((n, l) => n + l.amount, 0));
    const taxed: any = await computeTax(body, subtotal, t);
    if ("error" in taxed) throw new GlError(taxed.error);
    const tax = round2(taxed.tax);
    const total = round2(taxed.total);

    const currencyId = await currencyIdOf(body.currency_id, t);
    const rate = Number(body.exchange_rate) > 0 ? Number(body.exchange_rate) : await rateOf(currencyId, docDate.date, t);
    const control = (kind === AR ? partner.receivable_account_id : partner.payable_account_id) || (await roleAccountId(cfg.role, t));

    const doc: any = await PartnerDoc.create({
      doc_kind: kind,
      doc_number: await nextNumber(cfg.docCode, cfg.docPrefix, PartnerDoc, "doc_number", docDate.date, t),
      partner_id: partner._uuid,
      doc_date: docDate.date,
      due_date: due,
      reference: String(body.reference ?? "").trim() || null,
      description: String(body.description ?? "").trim() || null,
      currency_id: currencyId,
      exchange_rate: rate,
      subtotal,
      tax_id: Number(body.tax_id) > 0 ? Number(body.tax_id) : null,
      tax,
      total,
      paid: 0,
      control_account_id: control,
      status: ACTIVE,
      created_by: Number(actorOf(req)) || null,
    }, { transaction: t });
    await PartnerDocLine.bulkCreate(lines.map((l, i) => ({ ...l, doc_id: doc._uuid, line_no: i + 1 })), { transaction: t });

    // ຍອດກ່ອນອາກອນຂອງແຕ່ລະແຖວ (ອາກອນລວມໃນລາຄາ → ຫານຕາມສັດສ່ວນ, ເສດໃສ່ແຖວສຸດທ້າຍ)
    const net = round2(total - tax);
    let remaining = net;
    const netLines = lines.map((l, i) => {
      const value = i === lines.length - 1 ? remaining : round2((l.amount * net) / subtotal);
      remaining = round2(remaining - value);
      return { ...l, net: value };
    });
    const common = { currencyId, rate };
    const sideOf = (isControl: boolean): DraftLine["side"] => (kind === AR ? (isControl ? DEBIT : CREDIT) : (isControl ? CREDIT : DEBIT));
    const draft: DraftLine[] = [
      { ...common, accountId: control, side: sideOf(true), amount: total, description: partner.name },
      ...netLines.map((l) => ({ ...common, accountId: l.account_id, side: sideOf(false), amount: l.net, description: l.description })),
    ];
    if (tax) draft.push({ ...common, accountId: await roleAccountId(kind === AR ? "VAT_OUTPUT" : "VAT_INPUT", t), side: sideOf(false), amount: tax });
    await postEntry({
      date: docDate.date,
      sourceType: cfg.docCode,
      sourceId: doc._uuid,
      reference: doc.doc_number,
      description: `${partner.name}${doc.description ? ` — ${doc.description}` : ""}`,
      lines: draft,
      actorId: Number(actorOf(req)) || null,
    }, t);

    await t.commit();
    res.status(200).json({ message: "Successfully created document", data: doc });
  } catch (error) {
    await t.rollback();
    fail(res, error, "Error creating document");
  }
};

/** PUT /partner-doc/cancel/:id — ຍົກເລີກໄດ້ສະເພາະໃບທີ່ຍັງບໍ່ໄດ້ຕັດໜີ້ (ກັບລາຍການໃບບັນທຶກ) */
export const cancelPartnerDoc = async (req: Request<{ id: string }>, res: Response) => {
  const t = await sequelize.transaction();
  try {
    if (!(await arapReady(t))) {
      await t.rollback();
      return notReady(res);
    }
    const doc: any = await PartnerDoc.findByPk(decodeId(req), { transaction: t, lock: t.LOCK.UPDATE });
    if (!doc) throw new GlError("ບໍ່ພົບເອກະສານ");
    if (Number(doc.status) !== ACTIVE) throw new GlError("ເອກະສານນີ້ຖືກຍົກເລີກແລ້ວ");
    if (Number(doc.paid) > 0) throw new GlError("ເອກະສານນີ້ຕັດໜີ້ແລ້ວ — ຍົກເລີກການຊຳລະກ່ອນ");
    await reverseSource(KIND[doc.doc_kind as Kind].docCode, doc._uuid, t, Number(actorOf(req)) || null);
    await doc.update({ status: CANCELLED, updatedAt: new Date() }, { transaction: t });
    await t.commit();
    res.status(200).json({ message: "Successfully cancelled document" });
  } catch (error) {
    await t.rollback();
    fail(res, error, "Error cancelling document");
  }
};

// ======================= ຮັບ / ຈ່າຍຊຳລະ =======================

const paymentInclude = [
  { model: Partner, as: "partner", attributes: ["_uuid", "partner_code", "name"] },
  {
    model: TreasuryAccount,
    as: "account",
    attributes: ["_uuid", "acountName", "acount_number", "bankId", "type_treasuryid"],
    include: [
      { model: Banks, as: "banks", attributes: ["_uuid", "abbr", "name_la", "logo"] },
      {
        model: TypeTreasury,
        as: "treasury",
        attributes: ["_uuid", "treasury_name", "currencyId"],
        include: [{ model: Currency, as: "currency", attributes: ["_id", "name", "genus"] }],
      },
    ],
  },
  {
    model: PartnerAllocation,
    as: "allocations",
    include: [{ model: PartnerDoc, as: "doc", attributes: ["_uuid", "doc_number", "doc_date", "due_date", "total"] }],
  },
];

const presentPayment = (row: any) => {
  const r = row.get({ plain: true });
  const logo = r.account?.banks?.logo;
  return {
    ...r,
    account: r.account && {
      ...r.account,
      banks: r.account.banks && { ...r.account.banks, url: logo ? `${url()}/logo/${logo}` : null },
    },
  };
};

/** POST /partner-payment/fetch { kind?, partner_id?, start_date?, end_date?, status? } */
export const getPartnerPayments = async (req: Request, res: Response) => {
  try {
    if (!(await arapReady())) return notReady(res);
    const body = req.body || {};
    const where: any = {};
    const kind = kindOf(body.kind);
    if (kind) where.pay_kind = kind;
    if (body.partner_id) where.partner_id = Number(body.partner_id);
    if ([ACTIVE, CANCELLED].includes(Number(body.status))) where.status = Number(body.status);
    const start = toDateOnly(body.start_date);
    const end = toDateOnly(body.end_date);
    if (start || end) where.pay_date = { ...(start ? { [Op.gte]: start } : {}), ...(end ? { [Op.lte]: end } : {}) };
    const rows = await PartnerPayment.findAll({ where, order: [["pay_date", "DESC"], ["_uuid", "DESC"]], include: paymentInclude });
    res.status(200).json({ data: rows.map(presentPayment), total: rows.length });
  } catch (error) {
    fail(res, error, "Error getting payments");
  }
};

/** ຍອດຕັດແລ້ວຂອງໃບ = ລວມການຕັດຂອງການຊຳລະທີ່ຍັງໃຊ້ງານ */
const refreshPaid = async (docIds: number[], t: Transaction) => {
  for (const id of [...new Set(docIds)]) {
    const [row] = await sequelize.query<{ paid: string }>(
      `SELECT COALESCE(SUM(a.amount), 0) AS paid FROM tbl_partner_allocation a
       JOIN tbl_partner_payment p ON p._uuid = a.payment_id AND p.status = 1 WHERE a.doc_id = :id`,
      { type: QueryTypes.SELECT, replacements: { id }, transaction: t }
    );
    await PartnerDoc.update({ paid: round2(Number(row?.paid)), updatedAt: new Date() }, { where: { _uuid: id }, transaction: t });
  }
};

/**
 * POST /partner-payment/create
 * { kind, partner_id, pay_date?, treasury_account_id, reference?, description?, allocations: [{ doc_id, amount }] } —
 * ຍອດຊຳລະ = ລວມການຕັດໜີ້; ທຸກໃບຕ້ອງເປັນຂອງຄູ່ຄ້ານີ້ ແລະ ສະກຸນດຽວກັບບັນຊີເງິນຄັງ
 */
export const createPartnerPayment = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    if (!(await arapReady(t))) {
      await t.rollback();
      return notReady(res);
    }
    const body = req.body || {};
    const kind = kindOf(body.kind);
    if (!kind) throw new GlError("kind ຕ້ອງເປັນ 1 (ລູກໜີ້) ຫຼື 2 (ເຈົ້າໜີ້)");
    const cfg = KIND[kind];
    const actorId = Number(actorOf(req)) || null;

    const partner: any = await Partner.findByPk(Number(body.partner_id), { transaction: t });
    if (!partner) throw new GlError("ບໍ່ພົບຄູ່ຄ້າ");
    const payDate = entryDateOf(body.pay_date, kind === AR ? "ວັນທີຮັບເງິນ" : "ວັນທີຈ່າຍເງິນ");
    if ("error" in payDate) throw new GlError(payDate.error);

    const account: any = await TreasuryAccount.findByPk(Number(body.treasury_account_id), {
      include: [{ model: TypeTreasury, as: "treasury", attributes: ["_uuid", "currencyId"] }],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!account || Number(account.status) !== 1) throw new GlError("ບັນຊີເງິນຄັງບໍ່ມີ ຫຼື ປິດໃຊ້ງານແລ້ວ");
    const currencyId = account.treasury?.currencyId ?? null;

    const items: any[] = Array.isArray(body.allocations) ? body.allocations : [];
    const allocations = items
      .map((a) => ({ doc_id: Number(a?.doc_id), amount: round2(Number(a?.amount) || 0) }))
      .filter((a) => a.doc_id && a.amount > 0);
    if (!allocations.length) throw new GlError("ກະລຸນາເລືອກໃບທີ່ຈະຕັດໜີ້ ແລະ ຈຳນວນ");
    if (new Set(allocations.map((a) => a.doc_id)).size !== allocations.length) throw new GlError("ເລືອກໃບດຽວກັນຊ້ຳ");

    const docs: any[] = await PartnerDoc.findAll({
      where: { _uuid: allocations.map((a) => a.doc_id) },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    for (const a of allocations) {
      const doc = docs.find((d) => Number(d._uuid) === a.doc_id);
      if (!doc || Number(doc.doc_kind) !== kind || Number(doc.partner_id) !== Number(partner._uuid)) {
        throw new GlError("ມີໃບທີ່ບໍ່ແມ່ນຂອງຄູ່ຄ້ານີ້");
      }
      if (Number(doc.status) !== ACTIVE) throw new GlError(`ໃບ ${doc.doc_number} ຖືກຍົກເລີກແລ້ວ`);
      const open = round2(Number(doc.total) - Number(doc.paid));
      if (a.amount > open + 0.001) throw new GlError(`ໃບ ${doc.doc_number} ຄ້າງພຽງ ${open.toLocaleString("en-US")}`);
      if (!(await sameCurrency(doc.currency_id, currencyId, t))) {
        throw new GlError(`ໃບ ${doc.doc_number} ຄົນລະສະກຸນກັບບັນຊີ ${account.acountName}`);
      }
    }
    const amount = round2(allocations.reduce((n, a) => n + a.amount, 0));
    if (kind === AP && (Number(account.balance_treasury) || 0) < amount) {
      throw new GlError(`ຍອດເງິນທີ່ໃຊ້ໄດ້ຂອງ ${account.acountName} ບໍ່ພໍ`);
    }

    const rate = await rateOf(currencyId, payDate.date, t);
    const payment: any = await PartnerPayment.create({
      pay_kind: kind,
      pay_number: await nextNumber(cfg.payCode, cfg.payPrefix, PartnerPayment, "pay_number", payDate.date, t),
      partner_id: partner._uuid,
      pay_date: payDate.date,
      treasury_account_id: account._uuid,
      currency_id: currencyId,
      exchange_rate: rate,
      amount,
      reference: String(body.reference ?? "").trim() || null,
      description: String(body.description ?? "").trim() || null,
      status: ACTIVE,
      created_by: actorId,
    }, { transaction: t });
    await PartnerAllocation.bulkCreate(allocations.map((a) => ({ ...a, payment_id: payment._uuid })), { transaction: t });
    await refreshPaid(allocations.map((a) => a.doc_id), t);

    await moveBalance(account, {
      direction: kind === AR ? MOVE_IN : MOVE_OUT,
      amount,
      source: kind === AR ? "AR_RECEIPT" : "AP_PAYMENT",
      sourceId: payment._uuid,
      docNumber: payment.pay_number,
      date: payDate.date,
      description: `${partner.name}${payment.description ? ` — ${payment.description}` : ""}`,
      actorId,
    }, t);

    // ລົງບັນຊີ: ເງິນສົດ/ທະນາຄານ ຕາມອັດຕາມື້ຊຳລະ, ລູກໜີ້/ເຈົ້າໜີ້ ຕາມອັດຕາຂອງແຕ່ລະໃບ, ສ່ວນຕ່າງ = ອັດຕາແລກປ່ຽນ
    const cashAccount = await treasuryAccountId(account._uuid, await isCashAccount(account, t), t);
    const cashBase = round2(amount * rate);
    const controlLines: DraftLine[] = allocations.map((a) => {
      const doc = docs.find((d) => Number(d._uuid) === a.doc_id);
      return {
        accountId: Number(doc.control_account_id),
        side: kind === AR ? CREDIT : DEBIT,
        amount: a.amount,
        currencyId,
        rate: Number(doc.exchange_rate) || 1,
        description: doc.doc_number,
      };
    });
    const controlBase = round2(controlLines.reduce((n, l) => n + round2(l.amount * (l.rate ?? 1)), 0));
    const gain = round2(kind === AR ? cashBase - controlBase : controlBase - cashBase);
    const draft: DraftLine[] = [
      { accountId: cashAccount, side: kind === AR ? DEBIT : CREDIT, amount, currencyId, rate, treasuryAccountId: account._uuid, description: partner.name },
      ...controlLines,
    ];
    if (gain > 0) draft.push({ accountId: await roleAccountId("FX_GAIN", t), side: CREDIT, amount: gain });
    if (gain < 0) draft.push({ accountId: await roleAccountId("FX_LOSS", t), side: DEBIT, amount: -gain });
    await postEntry({
      date: payDate.date,
      sourceType: cfg.payCode,
      sourceId: payment._uuid,
      reference: payment.pay_number,
      description: `${partner.name}${payment.description ? ` — ${payment.description}` : ""}`,
      lines: draft,
      actorId,
    }, t);

    await t.commit();
    res.status(200).json({ message: "Successfully created payment", data: payment });
  } catch (error) {
    await t.rollback();
    fail(res, error, "Error creating payment");
  }
};

/** PUT /partner-payment/cancel/:id — ເງິນກັບຄືນບັນຊີເງິນຄັງ, ກັບລາຍການໃບບັນທຶກ ແລະ ຄືນຍອດຄ້າງໃຫ້ໃບ */
export const cancelPartnerPayment = async (req: Request<{ id: string }>, res: Response) => {
  const t = await sequelize.transaction();
  try {
    if (!(await arapReady(t))) {
      await t.rollback();
      return notReady(res);
    }
    const payment: any = await PartnerPayment.findByPk(decodeId(req), { transaction: t, lock: t.LOCK.UPDATE });
    if (!payment) throw new GlError("ບໍ່ພົບການຊຳລະ");
    if (Number(payment.status) !== ACTIVE) throw new GlError("ການຊຳລະນີ້ຖືກຍົກເລີກແລ້ວ");
    const kind = payment.pay_kind as Kind;
    const actorId = Number(actorOf(req)) || null;
    const amount = round2(Number(payment.amount));

    const account: any = await TreasuryAccount.findByPk(payment.treasury_account_id, { transaction: t, lock: t.LOCK.UPDATE });
    if (account) {
      if (kind === AR && (Number(account.balance_treasury) || 0) < amount) {
        throw new GlError("ຍອດເງິນທີ່ໃຊ້ໄດ້ຂອງບັນຊີບໍ່ພໍ ຈຶ່ງຫັກຄືນ ແລະ ຍົກເລີກບໍ່ໄດ້");
      }
      await moveBalance(account, {
        direction: kind === AR ? MOVE_OUT : MOVE_IN,
        amount,
        source: kind === AR ? "AR_RECEIPT_CANCEL" : "AP_PAYMENT_CANCEL",
        sourceId: payment._uuid,
        docNumber: payment.pay_number,
        description: payment.description,
        actorId,
      }, t);
    }
    await reverseSource(KIND[kind].payCode, payment._uuid, t, actorId);
    await payment.update({ status: CANCELLED, updatedAt: new Date() }, { transaction: t });
    const allocations: any[] = await PartnerAllocation.findAll({ where: { payment_id: payment._uuid }, transaction: t });
    await refreshPaid(allocations.map((a) => Number(a.doc_id)), t);
    await t.commit();
    res.status(200).json({ message: "Successfully cancelled payment" });
  } catch (error) {
    await t.rollback();
    fail(res, error, "Error cancelling payment");
  }
};
