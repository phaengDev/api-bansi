import { AsyncLocalStorage } from "async_hooks";
import { RequestHandler } from "express";
import { Model, ModelStatic, Op } from "sequelize";

/** ທີ່ຢູ່ /image ຂອງ request ປັດຈຸບັນ — ຕັ້ງໂດຍ withImageBase */
const imageBase = new AsyncLocalStorage<string>();

/**
 * Middleware: ຈື່ host ທີ່ client ເອີ້ນມາ (ຜ່ານ Cloudflare ໄດ້ https + ໂດເມນແທ້ຈາກ X-Forwarded-*, ຕ້ອງ trust proxy)
 * → URL ຮູບກົງກັບ server ທີ່ເອີ້ນສະເໝີ: localhost ຕອນ dev, ໂດເມນຕອນ deploy, IP ວົງ LAN ສຳລັບ app ມືຖື
 */
export const withImageBase: RequestHandler = (req, _res, next) =>
  imageBase.run(`${req.protocol}://${req.get("x-forwarded-host") ?? req.get("host")}/image`, next);

/** URL ຂອງໄຟລ໌ທີ່ upload (server.ts ເປີດ /image → src/uploads) */
export function url() {
  return imageBase.getStore() ?? `http://localhost:${process.env.PORT || 8888}/image`;
}

export async function maxid(model: ModelStatic<any>, column: string): Promise<number> {
  const maxResult = await model.max(column) as number | null;
  const nextId = (maxResult ?? 10000) + 1; // starts from 10001
  return nextId;
}

export const codeType = async (
  model: ModelStatic<Model<any, any>>,
  field: string,
  code: string | number
): Promise<string> => {
  if (!code) throw new Error("❌ Code is required");

  const prefix = String(code);

  // 🔹 ເອົາເລກທຳອິດທີ່ຍັງບໍ່ມີຄົນໃຊ້ ເຊັ່ນ 101 → 1011, 1012, 1013 ມີແລ້ວ → 1014.
  //    ບໍ່ໃຊ້ ORDER BY DESC ເພາະລຽງແບບຂໍ້ຄວາມ "10131" > "1013" ແລ້ວອອກເລກຜິດເປັນ 10132
  const rows = await model.findAll({
    attributes: [field],
    where: { [field]: { [Op.like]: `${prefix}%` } },
    raw: true,
  });
  const used = new Set(rows.map((r: any) => String(r[field])));
  let next = 1;
  while (used.has(`${prefix}${next}`)) next++;

  return `${prefix}${next}`;
};
