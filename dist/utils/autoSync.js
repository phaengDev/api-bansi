"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAutoSync = exports.autoSync = void 0;
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const registry = [];
const autoSync = (model, options = {}) => {
    registry.push({ model, options });
};
exports.autoSync = autoSync;
const q = (name) => `\`${name}\``;
/** ຖັນໃນ DB ຕາມລຳດັບ → ຄຳນິຍາມເຕັມຈາກ SHOW CREATE TABLE (ໃຊ້ຕອນຍ້າຍ/ປ່ຽນຊື່ ໃຫ້ type, default, collation ຄືເດີມ) */
const readColumns = async (table) => {
    const [row] = await database_1.default.query(`SHOW CREATE TABLE ${q(table)}`, {
        type: sequelize_1.QueryTypes.SELECT,
    });
    const columns = new Map();
    for (const line of row["Create Table"].split("\n")) {
        const match = line.match(/^\s+`([^`]+)` (.+?),?$/);
        if (match)
            columns.set(match[1], match[2]);
    }
    return columns;
};
/** ຟີວຂອງ model ຕາມລຳດັບທີ່ປະກາດ (ບໍ່ລວມ VIRTUAL) ໂດຍຕັດ references ຂອງ belongsTo ອອກ */
const modelColumns = (model) => Object.entries(model.getAttributes())
    .filter(([, attr]) => attr.type?.key !== "VIRTUAL")
    .map(([key, attr]) => {
    const { references, onDelete, onUpdate, ...rest } = attr;
    return { field: (attr.field ?? key), attr: rest };
});
const syncTable = async (model, { rename = {} }) => {
    const qi = database_1.default.getQueryInterface();
    const table = model.tableName;
    const fields = modelColumns(model);
    const log = (change) => console.log(`🛠️  ${table}: ${change}`);
    if (!(await qi.tableExists(table))) {
        await qi.createTable(table, Object.fromEntries(fields.map(({ field, attr }) => [field, attr])), {
            charset: "utf8mb4",
        });
        log("created");
        // ດັດຊະນີທີ່ປະກາດໃນ model (indexes) — ສ້າງພ້ອມຕາຕະລາງໃໝ່ເທົ່ານັ້ນ (ຕາຕະລາງເກົ່າບໍ່ແຕະ)
        for (const index of model.options.indexes ?? []) {
            await qi.addIndex(table, { fields: index.fields, unique: index.unique });
        }
        return;
    }
    let columns = await readColumns(table);
    for (const [from, to] of Object.entries(rename)) {
        const definition = columns.get(from);
        if (!definition || columns.has(to))
            continue;
        await database_1.default.query(`ALTER TABLE ${q(table)} CHANGE COLUMN ${q(from)} ${q(to)} ${definition}`);
        log(`rename ${from} → ${to}`);
        columns = await readColumns(table);
    }
    // ຍ້າຍຖັນທີ່ມີແລ້ວໃຫ້ລຽງຕາມ model — ຖັນທີ່ບໍ່ຢູ່ໃນ model ປະໄວ້ບ່ອນເດີມ
    const wanted = fields.map((f) => f.field).filter((f) => columns.has(f));
    const current = [...columns.keys()].filter((c) => wanted.includes(c));
    for (let i = 0; i < wanted.length; i++) {
        if (current[i] === wanted[i])
            continue;
        const position = i === 0 ? "FIRST" : `AFTER ${q(wanted[i - 1])}`;
        await database_1.default.query(`ALTER TABLE ${q(table)} MODIFY COLUMN ${q(wanted[i])} ${columns.get(wanted[i])} ${position}`);
        log(`move ${wanted[i]} ${position.replace(/`/g, "")}`);
        current.splice(current.indexOf(wanted[i]), 1);
        current.splice(i, 0, wanted[i]);
    }
    // ເພີ່ມຖັນໃໝ່ຕໍ່ຈາກຟີວກ່ອນໜ້າໃນ model
    for (let i = 0; i < fields.length; i++) {
        const { field, attr } = fields[i];
        if (columns.has(field))
            continue;
        await qi.addColumn(table, field, { ...attr, ...(i === 0 ? { first: true } : { after: fields[i - 1].field }) });
        log(`add ${field}`);
    }
};
/** ເອີ້ນເທື່ອດຽວຫຼັງເຊື່ອມ DB ໄດ້ (App.ts) — ຕາຕະລາງໃດຜິດພາດ ບັນທຶກ log ແລ້ວເຮັດຕາຕະລາງອື່ນຕໍ່ */
const runAutoSync = async () => {
    if (!["mysql", "mariadb"].includes(database_1.default.getDialect())) {
        console.warn(`⚠️  autoSync ຮອງຮັບສະເພາະ MySQL/MariaDB — ຂ້າມ (${database_1.default.getDialect()})`);
        return;
    }
    for (const { model, options } of registry) {
        try {
            await syncTable(model, options);
        }
        catch (error) {
            console.error(`❌ autoSync ${model.tableName}:`, error?.parent?.sqlMessage ?? error);
        }
    }
};
exports.runAutoSync = runAutoSync;
