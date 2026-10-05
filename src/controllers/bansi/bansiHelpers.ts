import { Request, Response } from "express";
import { ModelStatic, Op, Transaction, WhereOptions } from "sequelize";
import moment from "moment";
import { maxid } from "../../utils";

/** id ໃນ URL ເປັນ base64 ຕາມທຳນຽມຂອງ API ນີ້ */
export const decodeId = (req: Request<{ id: string }>) => atob(req.params.id);

/** ຜູ້ໃຊ້ທີ່ login (sub ຂອງ JWT = user_uuid) — ເກັບໄວ້ໃນຖັນ createby / closed_by */
export const actorOf = (req: Request) => String((req as any).user?.sub ?? "");

/**
 * ວັນທີ → "YYYY-MM-DD" ສຳລັບຖັນ DATE. ຮັບໄດ້ທັງ "DD/MM/YYYY" (axios interceptor ຂອງໜ້າເວັບ),
 * "YYYY-MM-DD" ແລະ ISO. ຄ່າວ່າງ/ຜິດຮູບແບບ → null
 */
export const toDateOnly = (value: unknown): string | null => {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value);
  const parsed = /^\d{2}\/\d{2}\/\d{4}$/.test(text)
    ? moment(text, "DD/MM/YYYY", true)
    : moment(text, [moment.ISO_8601, "YYYY-MM-DD"], true);
  return parsed.isValid() ? parsed.format("YYYY-MM-DD") : null;
};

/** ເອົາສະເພາະຖັນທີ່ອະນຸຍາດ — ກັນ body ແກ້ _uuid / createdAt / ຖັນອື່ນທີ່ບໍ່ຄວນແຕະ */
export const pickFields = (body: Record<string, any>, fields: readonly string[]) =>
  Object.fromEntries(fields.filter((f) => body?.[f] !== undefined).map((f) => [f, body[f] === "" ? null : body[f]]));

/** ຂໍ້ຄວາມ error ຈິງ (ເຊັ່ນ SQL error) ສົ່ງກັບໃຫ້ໜ້າຈໍສະແດງໄດ້ */
export const errorMessage = (error: unknown, fallback: string) =>
  (error as any)?.parent?.sqlMessage ?? (error as Error)?.message ?? fallback;

export const sendError = (res: Response, error: unknown, fallback: string) => {
  console.error(fallback, error);
  res.status(500).json({ message: errorMessage(error, fallback) });
};

type CrudOptions = {
  /** ຖັນລະຫັດທີ່ຕ້ອງບໍ່ຊ້ຳ ເຊັ່ນ "journal_code" */
  codeField: string;
  /** ຖັນທີ່ຮັບຈາກ body ຕອນເພີ່ມ/ແກ້ໄຂ */
  fields: readonly string[];
  /** ລຽງລາຍການ */
  order: [string, "ASC" | "DESC"][];
  /** ຖັນທີ່ບັງຄັບຕ້ອງມີຕອນເພີ່ມ (ນອກຈາກ codeField) */
  required?: readonly string[];
  include?: any[];
  /** ປັບ body ກ່ອນບັນທຶກ (ເຊັ່ນ ແປງວັນທີ) — existing = ແຖວເດີມຕອນແກ້ໄຂ */
  prepare?: (body: Record<string, any>, existing?: any) => Record<string, any>;
  /** ເອີ້ນຫຼັງບັນທຶກ (ໃນ transaction ດຽວກັນ) — ເຊັ່ນ ຕັ້ງຄ່າເລີ່ມຕົ້ນໃຫ້ມີອັນດຽວ */
  afterSave?: (row: any, t: Transaction) => Promise<void>;
  label: string;
};

/**
 * CRUD ມາດຕະຖານຂອງຕາຕະລາງຕັ້ງຄ່າບັນຊີ (bansi): fetch ທັງໝົດ, option ສະເພາະ status 1,
 * create (ລະຫັດບໍ່ຊ້ຳ + maxid), update (ແກ້ສະເພາະຖັນທີ່ອະນຸຍາດ). ບໍ່ມີລຶບ — ປິດໃຊ້ງານດ້ວຍ status.
 */
export const createCrudHandlers = (model: ModelStatic<any>, options: CrudOptions) => {
  const { codeField, fields, order, required = [], include, prepare, afterSave, label } = options;

  const codeTaken = async (code: string, exceptId?: string | number) => {
    const where: WhereOptions = { [codeField]: code };
    if (exceptId !== undefined) (where as any)._uuid = { [Op.ne]: exceptId };
    return (await model.count({ where })) > 0;
  };

  const fetch = async (_req: Request, res: Response) => {
    try {
      const data = await model.findAll({ order, include });
      res.status(200).json({ data, total: data.length });
    } catch (error) {
      sendError(res, error, `Error getting ${label}`);
    }
  };

  const option = async (_req: Request, res: Response) => {
    try {
      const data = await model.findAll({ where: { status: 1 }, order, include });
      res.status(200).json({ data });
    } catch (error) {
      sendError(res, error, `Error getting ${label} option`);
    }
  };

  const create = async (req: Request, res: Response) => {
    const t = await model.sequelize!.transaction();
    try {
      const picked = pickFields(req.body, fields);
      const body = prepare ? prepare(picked) : picked;
      const code = String(body[codeField] ?? "").trim();
      const missing = [codeField, ...required].filter((f) => body[f] === undefined || body[f] === null || body[f] === "");
      if (!code || missing.length) {
        await t.rollback();
        res.status(400).json({ message: `ກະລຸນາປ້ອນ: ${missing.join(", ")}` });
        return;
      }
      if (await codeTaken(code)) {
        await t.rollback();
        res.status(400).json({ message: `ລະຫັດ ${code} ມີແລ້ວ` });
        return;
      }
      const row = await model.create(
        { ...body, [codeField]: code, _uuid: await maxid(model, "_uuid"), createdAt: new Date(), updatedAt: new Date() },
        { transaction: t }
      );
      if (afterSave) await afterSave(row, t);
      await t.commit();
      res.status(200).json({ message: `Successfully created ${label}`, data: row });
    } catch (error) {
      await t.rollback();
      sendError(res, error, `Error creating ${label}`);
    }
  };

  const update = async (req: Request<{ id: string }>, res: Response) => {
    const t = await model.sequelize!.transaction();
    try {
      const id = decodeId(req);
      const row = await model.findByPk(id, { transaction: t });
      if (!row) {
        await t.rollback();
        res.status(404).json({ message: `${label} not found` });
        return;
      }
      const picked = pickFields(req.body, fields);
      const body = prepare ? prepare(picked, row) : picked;
      if (body[codeField] !== undefined) {
        body[codeField] = String(body[codeField]).trim();
        if (!body[codeField] || (await codeTaken(body[codeField], id))) {
          await t.rollback();
          res.status(400).json({ message: `ລະຫັດ ${body[codeField]} ມີແລ້ວ ຫຼື ວ່າງ` });
          return;
        }
      }
      await row.update({ ...body, updatedAt: new Date() }, { transaction: t });
      if (afterSave) await afterSave(row, t);
      await t.commit();
      res.status(200).json({ message: `Successfully updated ${label}`, data: row });
    } catch (error) {
      await t.rollback();
      sendError(res, error, `Error updating ${label}`);
    }
  };

  return { fetch, option, create, update };
};
