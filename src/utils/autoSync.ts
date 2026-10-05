import { ModelStatic, QueryTypes } from "sequelize";
import sequelize from "../config/database";

/**
 * ສ້າງ/ປັບຕາຕະລາງໃຫ້ກົງກັບ model ເອງຕອນເປີດ server — ໃຊ້ແທນ Model.sync() (MySQL/MariaDB):
 * - ຍັງບໍ່ມີຕາຕະລາງ → ສ້າງໃໝ່; ມີແລ້ວ → ບໍ່ສ້າງຊ້ຳ ແລະ ບໍ່ລຶບຂໍ້ມູນ
 * - rename { ຊື່ເກົ່າ: "ຊື່ໃໝ່" } → ປ່ຽນຊື່ຖັນໃນ DB (ຂໍ້ມູນຢູ່ຄືເດີມ) — ຕ້ອງບອກເອງ ເພາະລະບົບແຍກບໍ່ອອກວ່າ
 *   ປ່ຽນຊື່ ຫຼື ລຶບຟີວເກົ່າແລ້ວເພີ່ມຟີວໃໝ່
 * - ຟີວໃໝ່ໃນ model → ເພີ່ມຖັນ ຢູ່ຕຳແໜ່ງດຽວກັບໃນ model
 * - ຍ້າຍລຳດັບຟີວໃນ model → ຍ້າຍຖັນໃນ DB ໃຫ້ລຽງຕາມ
 * ບໍ່ລຶບຖັນທີ່ເອົາອອກຈາກ model, ບໍ່ປ່ຽນ type ຂອງຖັນທີ່ມີແລ້ວ, ບໍ່ສ້າງ foreign key constraint
 * (ຄື sql/create_bansi_settings.sql — ກັນສ້າງບໍ່ໄດ້ເພາະຕາຕະລາງປາຍທາງຍັງບໍ່ມີ ຫຼື type ບໍ່ກົງ)
 *
 * ໃຊ້: ທ້າຍໄຟລ໌ model ຂຽນ autoSync(Tax) ຫຼື autoSync(Tax, { rename: { name_la: "name" } })
 */
type AutoSyncOptions = { rename?: Record<string, string> };

const registry: { model: ModelStatic<any>; options: AutoSyncOptions }[] = [];

export const autoSync = (model: ModelStatic<any>, options: AutoSyncOptions = {}) => {
  registry.push({ model, options });
};

const q = (name: string) => `\`${name}\``;

/** ຖັນໃນ DB ຕາມລຳດັບ → ຄຳນິຍາມເຕັມຈາກ SHOW CREATE TABLE (ໃຊ້ຕອນຍ້າຍ/ປ່ຽນຊື່ ໃຫ້ type, default, collation ຄືເດີມ) */
const readColumns = async (table: string) => {
  const [row] = await sequelize.query<Record<string, string>>(`SHOW CREATE TABLE ${q(table)}`, {
    type: QueryTypes.SELECT,
  });
  const columns = new Map<string, string>();
  for (const line of row["Create Table"].split("\n")) {
    const match = line.match(/^\s+`([^`]+)` (.+?),?$/);
    if (match) columns.set(match[1], match[2]);
  }
  return columns;
};

/** ຟີວຂອງ model ຕາມລຳດັບທີ່ປະກາດ (ບໍ່ລວມ VIRTUAL) ໂດຍຕັດ references ຂອງ belongsTo ອອກ */
const modelColumns = (model: ModelStatic<any>) =>
  Object.entries(model.getAttributes())
    .filter(([, attr]) => (attr.type as any)?.key !== "VIRTUAL")
    .map(([key, attr]) => {
      const { references, onDelete, onUpdate, ...rest } = attr as any;
      return { field: (attr.field ?? key) as string, attr: rest };
    });

const syncTable = async (model: ModelStatic<any>, { rename = {} }: AutoSyncOptions) => {
  const qi = sequelize.getQueryInterface();
  const table = model.tableName;
  const fields = modelColumns(model);
  const log = (change: string) => console.log(`🛠️  ${table}: ${change}`);

  if (!(await qi.tableExists(table))) {
    await qi.createTable(table, Object.fromEntries(fields.map(({ field, attr }) => [field, attr])), {
      charset: "utf8mb4",
    });
    log("created");
    return;
  }

  let columns = await readColumns(table);

  for (const [from, to] of Object.entries(rename)) {
    const definition = columns.get(from);
    if (!definition || columns.has(to)) continue;
    await sequelize.query(`ALTER TABLE ${q(table)} CHANGE COLUMN ${q(from)} ${q(to)} ${definition}`);
    log(`rename ${from} → ${to}`);
    columns = await readColumns(table);
  }

  // ຍ້າຍຖັນທີ່ມີແລ້ວໃຫ້ລຽງຕາມ model — ຖັນທີ່ບໍ່ຢູ່ໃນ model ປະໄວ້ບ່ອນເດີມ
  const wanted = fields.map((f) => f.field).filter((f) => columns.has(f));
  const current = [...columns.keys()].filter((c) => wanted.includes(c));
  for (let i = 0; i < wanted.length; i++) {
    if (current[i] === wanted[i]) continue;
    const position = i === 0 ? "FIRST" : `AFTER ${q(wanted[i - 1])}`;
    await sequelize.query(`ALTER TABLE ${q(table)} MODIFY COLUMN ${q(wanted[i])} ${columns.get(wanted[i])} ${position}`);
    log(`move ${wanted[i]} ${position.replace(/`/g, "")}`);
    current.splice(current.indexOf(wanted[i]), 1);
    current.splice(i, 0, wanted[i]);
  }

  // ເພີ່ມຖັນໃໝ່ຕໍ່ຈາກຟີວກ່ອນໜ້າໃນ model
  for (let i = 0; i < fields.length; i++) {
    const { field, attr } = fields[i];
    if (columns.has(field)) continue;
    await qi.addColumn(table, field, { ...attr, ...(i === 0 ? { first: true } : { after: fields[i - 1].field }) });
    log(`add ${field}`);
  }
};

/** ເອີ້ນເທື່ອດຽວຫຼັງເຊື່ອມ DB ໄດ້ (App.ts) — ຕາຕະລາງໃດຜິດພາດ ບັນທຶກ log ແລ້ວເຮັດຕາຕະລາງອື່ນຕໍ່ */
export const runAutoSync = async () => {
  if (!["mysql", "mariadb"].includes(sequelize.getDialect())) {
    console.warn(`⚠️  autoSync ຮອງຮັບສະເພາະ MySQL/MariaDB — ຂ້າມ (${sequelize.getDialect()})`);
    return;
  }
  for (const { model, options } of registry) {
    try {
      await syncTable(model, options);
    } catch (error) {
      console.error(`❌ autoSync ${model.tableName}:`, (error as any)?.parent?.sqlMessage ?? error);
    }
  }
};
