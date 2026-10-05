import { Request, Response } from "express";
import { Op } from "sequelize";
import { maxid } from "../../utils";
import FiscalYear from "../../models/fiscalYear";
import OpeningBalance from "../../models/openingBalance";
import { actorOf, decodeId, pickFields, sendError, toDateOnly } from "./bansiHelpers";

const FIELDS = ["fiscal_code", "fiscal_name", "start_date", "end_date", "description"] as const;

/** ປີທີ່ວັນທີຊ້ອນກັບ start..end (ບໍ່ນັບປີ exceptId) — ປີການເງິນຕ້ອງບໍ່ທັບກັນ */
const findOverlap = (start: string, end: string, exceptId?: string | number) =>
  FiscalYear.findOne({
    where: {
      start_date: { [Op.lte]: end },
      end_date: { [Op.gte]: start },
      ...(exceptId !== undefined ? { _uuid: { [Op.ne]: exceptId } } : {}),
    },
  });

/** ກວດວັນທີ ແລະ ລະຫັດ — ຄືນຂໍ້ຄວາມ error ຫຼື null */
const validate = async (body: Record<string, any>, exceptId?: string | number) => {
  if (!String(body.fiscal_code ?? "").trim()) return "ກະລຸນາປ້ອນລະຫັດປີການເງິນ";
  if (!body.start_date || !body.end_date) return "ກະລຸນາເລືອກວັນທີເລີ່ມ ແລະ ວັນທີສິ້ນສຸດ";
  if (body.start_date > body.end_date) return "ວັນທີເລີ່ມຕ້ອງກ່ອນວັນທີສິ້ນສຸດ";
  const codeTaken = await FiscalYear.count({
    where: { fiscal_code: body.fiscal_code, ...(exceptId !== undefined ? { _uuid: { [Op.ne]: exceptId } } : {}) },
  });
  if (codeTaken) return `ລະຫັດ ${body.fiscal_code} ມີແລ້ວ`;
  const overlap = await findOverlap(body.start_date, body.end_date, exceptId);
  if (overlap) return `ວັນທີຊ້ອນກັບປີການເງິນ ${overlap.fiscal_code}`;
  return null;
};

const normalize = (raw: Record<string, any>) => {
  const body = pickFields(raw, FIELDS);
  if (body.fiscal_code !== undefined) body.fiscal_code = String(body.fiscal_code).trim();
  if (body.start_date !== undefined) body.start_date = toDateOnly(body.start_date);
  if (body.end_date !== undefined) body.end_date = toDateOnly(body.end_date);
  return body;
};

// ລາຍການທັງໝົດ — ປີໃໝ່ສຸດຢູ່ເທິງ
export const getFiscalYears = async (_req: Request, res: Response) => {
  try {
    const data = await FiscalYear.findAll({ order: [["start_date", "DESC"]] });
    res.status(200).json({ data, total: data.length });
  } catch (error) {
    sendError(res, error, "Error getting fiscal years");
  }
};

// ສຳລັບ dropdown — ທຸກປີ (ໜ້າຍອດຍົກມາຕ້ອງເບິ່ງປີທີ່ປິດແລ້ວໄດ້ນຳ)
export const getFiscalYearOption = async (_req: Request, res: Response) => {
  try {
    const data = await FiscalYear.findAll({ order: [["start_date", "DESC"]] });
    res.status(200).json({ data });
  } catch (error) {
    sendError(res, error, "Error getting fiscal year option");
  }
};

export const createFiscalYear = async (req: Request, res: Response) => {
  const t = await FiscalYear.sequelize!.transaction();
  try {
    const body = normalize(req.body);
    const invalid = await validate(body);
    if (invalid) {
      await t.rollback();
      res.status(400).json({ message: invalid });
      return;
    }
    // ປີທຳອິດ ຫຼື ຂໍໃຫ້ເປັນປີປັດຈຸບັນ → ຍ້າຍ is_current ມາປີນີ້
    const makeCurrent = Number(req.body.is_current) === 1 || (await FiscalYear.count({ where: { is_current: 1 } })) === 0;
    if (makeCurrent) await FiscalYear.update({ is_current: 0 }, { where: { is_current: 1 }, transaction: t });
    const row = await FiscalYear.create(
      {
        ...body,
        _uuid: await maxid(FiscalYear, "_uuid"),
        is_current: makeCurrent ? 1 : 0,
        status: 1,
        createby: actorOf(req),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      { transaction: t }
    );
    await t.commit();
    res.status(200).json({ message: "Successfully created fiscal year", data: row });
  } catch (error) {
    await t.rollback();
    sendError(res, error, "Error creating fiscal year");
  }
};

export const updateFiscalYear = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const id = decodeId(req);
    const row = await FiscalYear.findByPk(id);
    if (!row) {
      res.status(404).json({ message: "ບໍ່ພົບປີການເງິນ" });
      return;
    }
    // ປີທີ່ປິດແລ້ວ ແກ້ໄດ້ສະເພາະຊື່ ແລະ ລາຍລະອຽດ
    const body = row.status === 2 ? pickFields(req.body, ["fiscal_name", "description"]) : normalize(req.body);
    if (row.status !== 2) {
      const invalid = await validate({ ...row.get({ plain: true }), ...body }, id);
      if (invalid) {
        res.status(400).json({ message: invalid });
        return;
      }
    }
    await row.update({ ...body, updatedAt: new Date() });
    res.status(200).json({ message: "Successfully updated fiscal year", data: row });
  } catch (error) {
    sendError(res, error, "Error updating fiscal year");
  }
};

// ຕັ້ງເປັນປີປັດຈຸບັນ — ມີໄດ້ປີດຽວ ແລະ ຕ້ອງເປັນປີທີ່ຍັງເປີດ
export const setCurrentFiscalYear = async (req: Request<{ id: string }>, res: Response) => {
  const t = await FiscalYear.sequelize!.transaction();
  try {
    const id = decodeId(req);
    const row = await FiscalYear.findByPk(id, { transaction: t });
    if (!row || row.status !== 1) {
      await t.rollback();
      res.status(400).json({ message: "ຕັ້ງໄດ້ສະເພາະປີການເງິນທີ່ຍັງເປີດຢູ່" });
      return;
    }
    await FiscalYear.update({ is_current: 0 }, { where: { is_current: 1 }, transaction: t });
    await row.update({ is_current: 1, updatedAt: new Date() }, { transaction: t });
    await t.commit();
    res.status(200).json({ message: "Successfully set current fiscal year", data: row });
  } catch (error) {
    await t.rollback();
    sendError(res, error, "Error setting current fiscal year");
  }
};

// ປິດບັນຊີ — ຫ້າມປິດປີປັດຈຸບັນ (ຕ້ອງຍ້າຍປີປັດຈຸບັນໄປປີໃໝ່ກ່ອນ)
export const closeFiscalYear = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const row = await FiscalYear.findByPk(decodeId(req));
    if (!row) {
      res.status(404).json({ message: "ບໍ່ພົບປີການເງິນ" });
      return;
    }
    if (row.is_current === 1) {
      res.status(400).json({ message: "ປິດປີປັດຈຸບັນບໍ່ໄດ້ — ຕັ້ງປີອື່ນເປັນປີປັດຈຸບັນກ່ອນ" });
      return;
    }
    await row.update({ status: 2, closed_at: new Date(), closed_by: actorOf(req), updatedAt: new Date() });
    res.status(200).json({ message: "Successfully closed fiscal year", data: row });
  } catch (error) {
    sendError(res, error, "Error closing fiscal year");
  }
};

// ເປີດປີທີ່ປິດແລ້ວຄືນ (ກໍລະນີປິດຜິດ)
export const reopenFiscalYear = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const row = await FiscalYear.findByPk(decodeId(req));
    if (!row) {
      res.status(404).json({ message: "ບໍ່ພົບປີການເງິນ" });
      return;
    }
    await row.update({ status: 1, closed_at: null, closed_by: null, updatedAt: new Date() });
    res.status(200).json({ message: "Successfully reopened fiscal year", data: row });
  } catch (error) {
    sendError(res, error, "Error reopening fiscal year");
  }
};

// ລຶບໄດ້ສະເພາະປີທີ່ບໍ່ແມ່ນປີປັດຈຸບັນ, ຍັງເປີດຢູ່ ແລະ ບໍ່ມີຍອດຍົກມາ
export const deleteFiscalYear = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const id = decodeId(req);
    const row = await FiscalYear.findByPk(id);
    if (!row) {
      res.status(404).json({ message: "ບໍ່ພົບປີການເງິນ" });
      return;
    }
    const used = await OpeningBalance.count({ where: { fiscal_id: id } });
    if (row.is_current === 1 || row.status === 2 || used) {
      res.status(400).json({ message: "ລຶບບໍ່ໄດ້ — ເປັນປີປັດຈຸບັນ, ປິດບັນຊີແລ້ວ ຫຼື ມີຍອດຍົກມາແລ້ວ" });
      return;
    }
    await row.destroy();
    res.status(200).json({ message: "Successfully deleted fiscal year" });
  } catch (error) {
    sendError(res, error, "Error deleting fiscal year");
  }
};
