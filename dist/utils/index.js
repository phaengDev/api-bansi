"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.codeType = exports.withImageBase = void 0;
exports.url = url;
exports.maxid = maxid;
const async_hooks_1 = require("async_hooks");
const sequelize_1 = require("sequelize");
/** ທີ່ຢູ່ /image ຂອງ request ປັດຈຸບັນ — ຕັ້ງໂດຍ withImageBase */
const imageBase = new async_hooks_1.AsyncLocalStorage();
/**
 * Middleware: ຈື່ host ທີ່ client ເອີ້ນມາ (ຜ່ານ Cloudflare ໄດ້ https + ໂດເມນແທ້ຈາກ X-Forwarded-*, ຕ້ອງ trust proxy)
 * → URL ຮູບກົງກັບ server ທີ່ເອີ້ນສະເໝີ: localhost ຕອນ dev, ໂດເມນຕອນ deploy, IP ວົງ LAN ສຳລັບ app ມືຖື
 */
const withImageBase = (req, _res, next) => imageBase.run(`${req.protocol}://${req.get("x-forwarded-host") ?? req.get("host")}/image`, next);
exports.withImageBase = withImageBase;
/** URL ຂອງໄຟລ໌ທີ່ upload (server.ts ເປີດ /image → src/uploads) */
function url() {
    return imageBase.getStore() ?? `http://localhost:${process.env.PORT || 8888}/image`;
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
