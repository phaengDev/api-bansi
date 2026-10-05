import { Request, Response } from "express";
import { Op, QueryTypes } from "sequelize";
import ChartAccount from "../../models/chartAccount";
import GlMapping from "../../models/glMapping";
import JournalLine from "../../models/journalLine";
import FinanceCategories from "../../models/typeIncomeModel";
import TreasuryAccount from "../../models/treasuryAcount";
import TypeTreasury from "../../models/typeTreasury";
import TypeAcount from "../../models/typeAcount";
import Banks from "../../models/bankModel";
import Currency from "../../models/currencyModel";
import { actorOf, decodeId, pickFields, sendError } from "./bansiHelpers";
import { CASH_CLASS_CODE } from "./journalHelpers";
import { GROUP_SIDE, GlError, ROLES, TYPES_BY_GROUP, glReady } from "./glCore";
import { rebuildFromDocuments } from "./glPosting";

/**
 * ຜັງບັນຊີ (tbl_chart_account) + ການຜູກບັນຊີ (tbl_gl_mapping) + ສະຖານະ/ລົງບັນຊີຍ້ອນຫຼັງ.
 * ກຸ່ມ = ຕົວເລກທຳອິດຂອງລະຫັດ (1 ຊັບສິນ … 5 ລາຍຈ່າຍ); ບັນຊີແມ່ຕ້ອງເປັນບັນຊີຫົວໃນກຸ່ມດຽວກັນ
 */

const FIELDS = [
  "account_code", "name_la", "name_en", "name_cn", "parent_id", "account_type", "normal_side",
  "is_postable", "currency_id", "description", "status",
] as const;

const notReady = (res: Response) =>
  res.status(503).json({ message: "ຍັງບໍ່ໄດ້ສ້າງຕາຕະລາງຜັງບັນຊີ — ແລ່ນ sql/create_gl_accounting.sql ກ່ອນ", notReady: true });

const fail = (res: Response, error: unknown, fallback: string) => {
  if (error instanceof GlError) {
    res.status(400).json({ message: error.message });
    return;
  }
  sendError(res, error, fallback);
};

/** ຍອດສະສົມທັງໝົດຂອງແຕ່ລະບັນຊີ (ໜີ້, ມີ, ຈຳນວນແຖວ) */
const usageByAccount = async () => {
  const rows = await ChartAccount.sequelize!.query<{ account_id: number; debit: string; credit: string; line_count: number }>(
    // LINES ເປັນຄຳສະຫງວນຂອງ MySQL — ໃຊ້ line_count
    "SELECT account_id, SUM(debit) AS debit, SUM(credit) AS credit, COUNT(*) AS line_count FROM tbl_journal_line GROUP BY account_id",
    { type: QueryTypes.SELECT }
  );
  return new Map(rows.map((r) => [Number(r.account_id), r]));
};

/** GET /chart-account/fetch — ທຸກບັນຊີ ລຽງຕາມລະຫັດ + ຍອດ (debit, credit, lines) + ບົດບາດທີ່ຜູກ */
export const getChartAccounts = async (_req: Request, res: Response) => {
  try {
    if (!(await glReady())) return notReady(res);
    const [accounts, usage, roles] = await Promise.all([
      ChartAccount.findAll({ order: [["account_code", "ASC"]] }),
      usageByAccount(),
      GlMapping.findAll({ where: { source_type: "ROLE" } }),
    ]);
    const data = accounts.map((a: any) => {
      const u = usage.get(Number(a._uuid));
      return {
        ...a.get({ plain: true }),
        debit: Number(u?.debit) || 0,
        credit: Number(u?.credit) || 0,
        lines: Number(u?.line_count) || 0,
        roles: roles.filter((r: any) => Number(r.account_id) === Number(a._uuid)).map((r: any) => r.source_key),
      };
    });
    res.status(200).json({ data, total: data.length });
  } catch (error) {
    sendError(res, error, "Error getting chart of accounts");
  }
};

/** GET /chart-account/option — ບັນຊີທີ່ລົງລາຍການໄດ້ ແລະ ໃຊ້ງານຢູ່ (ສຳລັບຕົວເລືອກ) */
export const getChartAccountOption = async (_req: Request, res: Response) => {
  try {
    if (!(await glReady())) return notReady(res);
    const data = await ChartAccount.findAll({
      where: { status: 1, is_postable: 1 },
      order: [["account_code", "ASC"]],
    });
    res.status(200).json({ data });
  } catch (error) {
    sendError(res, error, "Error getting chart account option");
  }
};

/**
 * ກວດ ແລະ ຈັດຄ່າກ່ອນບັນທຶກ — ຄືນຄ່າທີ່ພ້ອມບັນທຶກ ຫຼື throw GlError.
 * existing = ແຖວເດີມຕອນແກ້ໄຂ (ບັນຊີລະບົບ: ລະຫັດ ແລະ ລັກສະນະ ຫົວ/ລົງລາຍການ ປ່ຽນບໍ່ໄດ້)
 */
const prepare = async (body: Record<string, any>, existing?: any) => {
  const merged = { ...(existing ? existing.get({ plain: true }) : {}), ...body };
  const code = String(merged.account_code ?? "").trim();
  if (!/^[1-5][0-9A-Za-z.\-]{0,19}$/.test(code)) {
    throw new GlError("ລະຫັດບັນຊີຕ້ອງຂຶ້ນຕົ້ນດ້ວຍເລກກຸ່ມ 1–5 (1 ຊັບສິນ, 2 ໜີ້ສິນ, 3 ທຶນ, 4 ລາຍຮັບ, 5 ລາຍຈ່າຍ)");
  }
  const group = Number(code[0]);
  const name = String(merged.name_la ?? "").trim();
  if (!name) throw new GlError("ກະລຸນາປ້ອນຊື່ບັນຊີ (ລາວ)");

  if (existing && Number(existing.is_system) === 1) {
    if (code !== existing.account_code) throw new GlError("ບັນຊີຂອງລະບົບ ປ່ຽນລະຫັດບໍ່ໄດ້");
    if (Number(merged.is_postable) !== Number(existing.is_postable)) throw new GlError("ບັນຊີຂອງລະບົບ ປ່ຽນເປັນບັນຊີຫົວ/ລົງລາຍການ ບໍ່ໄດ້");
  }
  const clash = await ChartAccount.count({
    where: { account_code: code, ...(existing ? { _uuid: { [Op.ne]: existing._uuid } } : {}) },
  });
  if (clash) throw new GlError(`ລະຫັດ ${code} ມີແລ້ວ`);

  const parentId = merged.parent_id ? Number(merged.parent_id) : null;
  if (parentId) {
    if (existing && parentId === Number(existing._uuid)) throw new GlError("ບັນຊີແມ່ເປັນຕົວມັນເອງບໍ່ໄດ້");
    const parent: any = await ChartAccount.findByPk(parentId);
    if (!parent) throw new GlError("ບໍ່ພົບບັນຊີແມ່");
    if (Number(parent.is_postable) === 1) throw new GlError(`ບັນຊີແມ່ ${parent.account_code} ຕ້ອງເປັນບັນຊີຫົວ`);
    if (Number(parent.account_group) !== group) throw new GlError(`ລະຫັດ ${code} ຢູ່ກຸ່ມ ${group} ແຕ່ບັນຊີແມ່ ${parent.account_code} ຢູ່ກຸ່ມ ${parent.account_group}`);
    // ກັນວົງວຽນ: ບັນຊີແມ່ຕ້ອງບໍ່ແມ່ນລູກຫຼານຂອງບັນຊີນີ້
    if (existing) {
      for (let p: any = parent; p?.parent_id; p = await ChartAccount.findByPk(p.parent_id)) {
        if (Number(p.parent_id) === Number(existing._uuid)) throw new GlError("ເລືອກບັນຊີລູກເປັນບັນຊີແມ່ບໍ່ໄດ້");
      }
    }
  }

  const type = String(merged.account_type ?? TYPES_BY_GROUP[group][0]);
  if (!TYPES_BY_GROUP[group].includes(type)) throw new GlError("ໝວດຍ່ອຍບໍ່ກົງກັບກຸ່ມຂອງບັນຊີ");
  const side = Number(merged.normal_side) === 1 || Number(merged.normal_side) === 2 ? Number(merged.normal_side) : GROUP_SIDE[group];
  const postable = Number(merged.is_postable) === 0 ? 0 : 1;
  const status = Number(merged.status) === 0 ? 0 : 1;

  if (existing) {
    const id = Number(existing._uuid);
    const lines = await JournalLine.count({ where: { account_id: id } });
    if (lines && Number(existing.account_group) !== group) throw new GlError("ບັນຊີນີ້ມີລາຍການແລ້ວ — ປ່ຽນກຸ່ມ (ເລກທຳອິດຂອງລະຫັດ) ບໍ່ໄດ້");
    if (lines && postable === 0) throw new GlError("ບັນຊີນີ້ມີລາຍການແລ້ວ — ປ່ຽນເປັນບັນຊີຫົວບໍ່ໄດ້");
    if (postable === 1 && (await ChartAccount.count({ where: { parent_id: id } }))) {
      throw new GlError("ບັນຊີນີ້ມີບັນຊີລູກ — ຕ້ອງເປັນບັນຊີຫົວ");
    }
    if (status === 0 && Number(existing.status) === 1) {
      const mapped = await GlMapping.count({ where: { account_id: id } });
      if (mapped) throw new GlError("ບັນຊີນີ້ຖືກຜູກຢູ່ (ຜັງບັນຊີ → ຜູກບັນຊີ) — ປ່ຽນການຜູກກ່ອນຈຶ່ງປິດໃຊ້ງານ");
    }
  }

  return {
    account_code: code,
    name_la: name,
    name_en: String(merged.name_en ?? "").trim() || null,
    name_cn: String(merged.name_cn ?? "").trim() || null,
    parent_id: parentId,
    account_group: group,
    account_type: type,
    normal_side: side,
    is_postable: postable,
    currency_id: merged.currency_id ? Number(merged.currency_id) : null,
    description: String(merged.description ?? "").trim() || null,
    status,
  };
};

/** POST /chart-account/create */
export const createChartAccount = async (req: Request, res: Response) => {
  try {
    if (!(await glReady())) return notReady(res);
    const values = await prepare(pickFields(req.body, FIELDS));
    const row = await ChartAccount.create({ ...values, is_system: 0 });
    res.status(200).json({ message: "Successfully created account", data: row });
  } catch (error) {
    fail(res, error, "Error creating account");
  }
};

/** PUT /chart-account/:id (base64) */
export const updateChartAccount = async (req: Request<{ id: string }>, res: Response) => {
  try {
    if (!(await glReady())) return notReady(res);
    const row: any = await ChartAccount.findByPk(decodeId(req));
    if (!row) {
      res.status(404).json({ message: "ບໍ່ພົບບັນຊີ" });
      return;
    }
    const values = await prepare(pickFields(req.body, FIELDS), row);
    await row.update({ ...values, updatedAt: new Date() });
    res.status(200).json({ message: "Successfully updated account", data: row });
  } catch (error) {
    fail(res, error, "Error updating account");
  }
};

/** DELETE /chart-account/:id — ລຶບໄດ້ສະເພາະບັນຊີທີ່ບໍ່ແມ່ນຂອງລະບົບ, ບໍ່ມີລູກ, ບໍ່ມີລາຍການ ແລະ ບໍ່ຖືກຜູກ */
export const deleteChartAccount = async (req: Request<{ id: string }>, res: Response) => {
  try {
    if (!(await glReady())) return notReady(res);
    const row: any = await ChartAccount.findByPk(decodeId(req));
    if (!row) {
      res.status(404).json({ message: "ບໍ່ພົບບັນຊີ" });
      return;
    }
    const id = Number(row._uuid);
    if (Number(row.is_system) === 1) throw new GlError("ບັນຊີຂອງລະບົບ ລຶບບໍ່ໄດ້ — ປິດໃຊ້ງານແທນ");
    if (await ChartAccount.count({ where: { parent_id: id } })) throw new GlError("ບັນຊີນີ້ມີບັນຊີລູກ — ລຶບບັນຊີລູກກ່ອນ");
    if (await JournalLine.count({ where: { account_id: id } })) throw new GlError("ບັນຊີນີ້ມີລາຍການແລ້ວ — ລຶບບໍ່ໄດ້, ປິດໃຊ້ງານແທນ");
    if (await GlMapping.count({ where: { account_id: id } })) throw new GlError("ບັນຊີນີ້ຖືກຜູກຢູ່ — ປ່ຽນການຜູກກ່ອນ");
    await row.destroy();
    res.status(200).json({ message: "Successfully deleted account" });
  } catch (error) {
    fail(res, error, "Error deleting account");
  }
};

// ======================= ການຜູກບັນຊີ =======================

/**
 * GET /gl-mapping/fetch — ການຜູກທັງໝົດ + ຂໍ້ມູນທີ່ຕ້ອງຜູກ: ປະເພດລາຍຮັບ-ລາຍຈ່າຍ ແລະ ບັນຊີເງິນຄັງ
 * (isCash = ຢູ່ໝວດເງິນສົດ → ຄ່າເລີ່ມຕົ້ນເປັນ DEFAULT_CASH, ນອກນັ້ນ DEFAULT_BANK)
 */
export const getGlMappings = async (_req: Request, res: Response) => {
  try {
    if (!(await glReady())) return notReady(res);
    const [mappings, categories, treasuries] = await Promise.all([
      GlMapping.findAll(),
      FinanceCategories.findAll({ order: [["typestatus", "ASC"], ["type_code", "ASC"]] }),
      TreasuryAccount.findAll({
        order: [["_uuid", "ASC"]],
        attributes: ["_uuid", "acountName", "acount_number", "status"],
        include: [
          { model: Banks, as: "banks", attributes: ["_uuid", "abbr"] },
          {
            model: TypeTreasury,
            as: "treasury",
            attributes: ["_uuid", "treasury_name", "currencyId"],
            include: [
              { model: Currency, as: "currency", attributes: ["_id", "name"] },
              { model: TypeAcount, as: "types", attributes: ["_uuid", "type_code"] },
            ],
          },
        ],
      }),
    ]);
    res.status(200).json({
      mappings,
      roles: Object.entries(ROLES).map(([key, r]) => ({ key, groups: r.groups })),
      categories,
      treasuries: treasuries.map((a: any) => {
        const r = a.get({ plain: true });
        return { ...r, isCash: String(r.treasury?.types?.type_code ?? "") === CASH_CLASS_CODE };
      }),
    });
  } catch (error) {
    sendError(res, error, "Error getting GL mappings");
  }
};

/**
 * POST /gl-mapping/save { items: [{ source_type, source_key, account_id | null }] } —
 * account_id null = ເອົາການຜູກອອກ (ໃຊ້ບັນຊີເລີ່ມຕົ້ນ); ບົດບາດ (ROLE) ຕ້ອງມີບັນຊີສະເໝີ
 */
export const saveGlMappings = async (req: Request, res: Response) => {
  const t = await GlMapping.sequelize!.transaction();
  try {
    if (!(await glReady(t))) {
      await t.rollback();
      return notReady(res);
    }
    const items: any[] = Array.isArray(req.body?.items) ? req.body.items : [];
    let saved = 0;
    for (const item of items) {
      const sourceType = String(item?.source_type ?? "");
      const sourceKey = String(item?.source_key ?? "");
      const accountId = item?.account_id ? Number(item.account_id) : null;
      if (!["ROLE", "FINANCE_CATEGORY", "TREASURY_ACCOUNT"].includes(sourceType) || !sourceKey) {
        throw new GlError("ຂໍ້ມູນການຜູກບັນຊີບໍ່ຖືກຕ້ອງ");
      }
      if (sourceType === "ROLE" && !ROLES[sourceKey]) throw new GlError(`ບໍ່ຮູ້ຈັກບົດບາດ ${sourceKey}`);

      const existing: any = await GlMapping.findOne({ where: { source_type: sourceType, source_key: sourceKey }, transaction: t });
      if (!accountId) {
        if (sourceType === "ROLE") throw new GlError(`ບົດບາດ "${ROLES[sourceKey].label}" ຕ້ອງມີບັນຊີ`);
        if (existing) await existing.destroy({ transaction: t });
        saved++;
        continue;
      }

      const account: any = await ChartAccount.findByPk(accountId, { transaction: t });
      if (!account || Number(account.status) !== 1 || Number(account.is_postable) !== 1) {
        throw new GlError("ຕ້ອງເລືອກບັນຊີທີ່ລົງລາຍການໄດ້ ແລະ ໃຊ້ງານຢູ່");
      }
      const group = Number(account.account_group);
      if (sourceType === "ROLE" && !ROLES[sourceKey].groups.includes(group)) {
        throw new GlError(`ບົດບາດ "${ROLES[sourceKey].label}" ຕ້ອງໃຊ້ບັນຊີກຸ່ມ ${ROLES[sourceKey].groups.join(", ")}`);
      }
      if (sourceType === "TREASURY_ACCOUNT" && group !== 1) throw new GlError("ບັນຊີເງິນຄັງ ຕ້ອງຜູກກັບບັນຊີຊັບສິນ (ກຸ່ມ 1)");

      if (existing) await existing.update({ account_id: accountId, updatedAt: new Date() }, { transaction: t });
      else await GlMapping.create({ source_type: sourceType, source_key: sourceKey, account_id: accountId }, { transaction: t });
      saved++;
    }
    await t.commit();
    res.status(200).json({ message: "Successfully saved GL mappings", saved });
  } catch (error) {
    await t.rollback();
    fail(res, error, "Error saving GL mappings");
  }
};

// ======================= ສະຖານະ + ລົງບັນຊີຍ້ອນຫຼັງ =======================

/** GET /gl/status — ຕາຕະລາງພ້ອມບໍ່ + ຈຳນວນເອກະສານທີ່ຍັງບໍ່ໄດ້ລົງບັນຊີ */
export const getGlStatus = async (_req: Request, res: Response) => {
  try {
    if (!(await glReady())) {
      res.status(200).json({ ready: false });
      return;
    }
    const [row] = await ChartAccount.sequelize!.query<Record<string, number>>(
      `SELECT
        (SELECT COUNT(*) FROM tbl_incomes i WHERE i.status = 1 AND NOT EXISTS
          (SELECT 1 FROM tbl_journal_entry e WHERE e.source_type = 'INCOME' AND e.source_id = i._uuid)) AS incomes,
        (SELECT COUNT(*) FROM tbl_expenses x WHERE x.status = 1 AND NOT EXISTS
          (SELECT 1 FROM tbl_journal_entry e WHERE e.source_type = 'EXPENSE' AND e.source_id = x._uuid)) AS expenses,
        (SELECT COUNT(*) FROM tbl_transfer_money m WHERE m.status = 1 AND NOT EXISTS
          (SELECT 1 FROM tbl_journal_entry e WHERE e.source_type = 'TRANSFER' AND e.source_id = m._uuid)) AS transfers,
        (SELECT COUNT(*) FROM tbl_journal_entry) AS entries`,
      { type: QueryTypes.SELECT }
    );
    res.status(200).json({
      ready: true,
      unposted: { incomes: Number(row.incomes), expenses: Number(row.expenses), transfers: Number(row.transfers) },
      entries: Number(row.entries),
    });
  } catch (error) {
    sendError(res, error, "Error getting GL status");
  }
};

/** POST /gl/rebuild — ລົງບັນຊີໃຫ້ເອກະສານເກົ່າທີ່ຍັງບໍ່ມີໃບບັນທຶກ */
export const rebuildGl = async (req: Request, res: Response) => {
  try {
    const result = await rebuildFromDocuments(Number(actorOf(req)) || null);
    res.status(200).json({ message: "Successfully posted documents", ...result });
  } catch (error) {
    fail(res, error, "Error posting documents");
  }
};
