"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.codeType = void 0;
exports.url = url;
exports.maxid = maxid;
const sequelize_1 = require("sequelize");
/** URL ຂອງໄຟລ໌ທີ່ upload (server.ts ເປີດ /image → src/uploads) — ຕັ້ງ IMAGE_URL ໃນ .env ຕອນ deploy */
function url() {
    return process.env.IMAGE_URL || `http://localhost:${process.env.PORT || 8888}/image`;
}
async function maxid(model, column) {
    const maxResult = await model.max(column);
    const nextId = (maxResult ?? 10000) + 1; // starts from 10001
    return nextId;
}
const codeType = async (model, field, code) => {
    if (!code)
        throw new Error("❌ Code is required");
    const prefix = String(code);
    // 🔹 ເອົາເລກທຳອິດທີ່ຍັງບໍ່ມີຄົນໃຊ້ ເຊັ່ນ 101 → 1011, 1012, 1013 ມີແລ້ວ → 1014.
    //    ບໍ່ໃຊ້ ORDER BY DESC ເພາະລຽງແບບຂໍ້ຄວາມ "10131" > "1013" ແລ້ວອອກເລກຜິດເປັນ 10132
    const rows = await model.findAll({
        attributes: [field],
        where: { [field]: { [sequelize_1.Op.like]: `${prefix}%` } },
        raw: true,
    });
    const used = new Set(rows.map((r) => String(r[field])));
    let next = 1;
    while (used.has(`${prefix}${next}`))
        next++;
    return `${prefix}${next}`;
};
exports.codeType = codeType;
