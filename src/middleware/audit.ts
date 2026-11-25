import { Request, Response, NextFunction } from "express";
import AuditLog from "../models/auditLog";

type Row = Record<string, unknown>;

/** ການກະທຳທີ່ເກັບ — ບໍ່ມີ "ເພີ່ມ" (ບັນທຶກປົກກະຕິ ບໍ່ຕ້ອງເກັບປະຫວັດ) */
export type AuditAction = "update" | "cancel" | "delete" | "reverse" | "close" | "reopen" | "pay" | "unpay" | "password" | "lock" | "unlock";

export type AuditSpec = {
  /** ປະເພດເອກະສານ (ໜ້າເວັບແປເປັນຊື່) */
  entity: string;
  action: AuditAction;
  /** ໂຫຼດແຖວ (ກ່ອນ ແລະ ຫຼັງ) — ບໍ່ມີ = ເກັບແຕ່ວ່າໃຜເຮັດຫຍັງກັບລາຍການໃດ */
  load?: (id: number | null, req: Request) => Promise<Row | null>;
  /** ຊ່ອງທີ່ສຳຄັນ — ປ່ຽນແຕ່ຊ່ອງອື່ນ (update) = ບໍ່ເກັບ */
  fields?: string[];
  /** ຊື່ທີ່ອ່ານອອກ (ເລກທີເອກະສານ, ຊື່ພະນັກງານ…) */
  label?: (row: Row) => string | null | undefined;
  /** id ຂອງລາຍການ — ຄ່າຕັ້ງຕົ້ນ = params.id ແບບ base64 (decodeId) */
  id?: (req: Request) => number | null;
};

const paramId = (req: Request) => {
  const raw = req.params?.id;
  if (!raw) return null;
  try {
    const id = Number(atob(String(raw)));
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
};

/** ຄ່າທີ່ທຽບກັນໄດ້ (Date / ຕົວເລກ decimal ຈາກ DB) */
const norm = (value: unknown) => (value instanceof Date ? value.toISOString() : value === undefined ? null : value);
const same = (a: unknown, b: unknown) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));

/** { ຊ່ອງ: [ເກົ່າ, ໃໝ່] } ສະເພາະຊ່ອງທີ່ປ່ຽນ — ລຶບ (after = null) = ຄ່າເກົ່າຂອງທຸກຊ່ອງ */
const diff = (before: Row | null, after: Row | null, fields: string[]) => {
  const out: Record<string, [unknown, unknown]> = {};
  for (const field of fields) {
    const old = before ? norm(before[field]) : null;
    const next = after ? norm(after[field]) : null;
    if (!same(old, next)) out[field] = [old, next];
  }
  return out;
};

/**
 * ເກັບປະຫວັດຂອງ route ສຳຄັນ: ໂຫຼດແຖວກ່ອນ handler, ຫຼັງຕອບກັບສຳເລັດ (2xx) ໂຫຼດຄືນ ແລ້ວເກັບສະເພາະຊ່ອງທີ່ປ່ຽນ.
 * ຂຽນຫຼັງສົ່ງຄຳຕອບແລ້ວ (res "finish") — ຜູ້ໃຊ້ບໍ່ລໍ; ເກັບບໍ່ໄດ້ = log ໃນ console ເທົ່ານັ້ນ ບໍ່ໃຫ້ການບັນທຶກລົ້ມ
 */
export const audit = (spec: AuditSpec) => async (req: Request, res: Response, next: NextFunction) => {
  const id = (spec.id ?? paramId)(req);
  let before: Row | null = null;
  try {
    if (spec.load) before = await spec.load(id, req);
  } catch (error) {
    console.error("audit load", spec.entity, error);
  }
  res.on("finish", async () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return;
    try {
      const after = spec.load && spec.action !== "delete" ? await spec.load(id, req) : null;
      const changes = spec.fields ? diff(before, after, spec.fields) : {};
      // ແກ້ໄຂແຕ່ຊ່ອງທີ່ບໍ່ສຳຄັນ — ບໍ່ເກັບ
      if (spec.action === "update" && spec.fields && !Object.keys(changes).length) return;
      const row = after ?? before;
      await AuditLog.create({
        at: new Date(),
        user_id: Number(req.user?.sub) || null,
        action: spec.action,
        entity: spec.entity,
        entity_id: id,
        label: (row && spec.label?.(row))?.slice(0, 150) || null,
        changes: Object.keys(changes).length ? JSON.stringify(changes) : null,
      });
    } catch (error) {
      console.error("audit write", spec.entity, error);
    }
  });
  next();
};
