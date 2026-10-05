import { Model, ModelStatic, Op } from "sequelize";

/** URL ຂອງໄຟລ໌ທີ່ upload (server.ts ເປີດ /image → src/uploads) — ຕັ້ງ IMAGE_URL ໃນ .env ຕອນ deploy */
export function url() {
  return process.env.IMAGE_URL || `http://localhost:${process.env.PORT || 8888}/image`;
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
