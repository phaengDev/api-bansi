"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.audit = void 0;
const auditLog_1 = __importDefault(require("../models/auditLog"));
const paramId = (req) => {
    const raw = req.params?.id;
    if (!raw)
        return null;
    try {
        const id = Number(atob(String(raw)));
        return Number.isInteger(id) && id > 0 ? id : null;
    }
    catch {
        return null;
    }
};
/** ຄ່າທີ່ທຽບກັນໄດ້ (Date / ຕົວເລກ decimal ຈາກ DB) */
const norm = (value) => (value instanceof Date ? value.toISOString() : value === undefined ? null : value);
const same = (a, b) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));
/** { ຊ່ອງ: [ເກົ່າ, ໃໝ່] } ສະເພາະຊ່ອງທີ່ປ່ຽນ — ລຶບ (after = null) = ຄ່າເກົ່າຂອງທຸກຊ່ອງ */
const diff = (before, after, fields) => {
    const out = {};
    for (const field of fields) {
        const old = before ? norm(before[field]) : null;
        const next = after ? norm(after[field]) : null;
        if (!same(old, next))
            out[field] = [old, next];
    }
    return out;
};
/**
 * ເກັບປະຫວັດຂອງ route ສຳຄັນ: ໂຫຼດແຖວກ່ອນ handler, ຫຼັງຕອບກັບສຳເລັດ (2xx) ໂຫຼດຄືນ ແລ້ວເກັບສະເພາະຊ່ອງທີ່ປ່ຽນ.
 * ຂຽນຫຼັງສົ່ງຄຳຕອບແລ້ວ (res "finish") — ຜູ້ໃຊ້ບໍ່ລໍ; ເກັບບໍ່ໄດ້ = log ໃນ console ເທົ່ານັ້ນ ບໍ່ໃຫ້ການບັນທຶກລົ້ມ
 */
const audit = (spec) => async (req, res, next) => {
    const id = (spec.id ?? paramId)(req);
    let before = null;
    try {
        if (spec.load)
            before = await spec.load(id, req);
    }
    catch (error) {
        console.error("audit load", spec.entity, error);
    }
    res.on("finish", async () => {
        if (res.statusCode < 200 || res.statusCode >= 300)
            return;
        try {
            const after = spec.load && spec.action !== "delete" ? await spec.load(id, req) : null;
            const changes = spec.fields ? diff(before, after, spec.fields) : {};
            // ແກ້ໄຂແຕ່ຊ່ອງທີ່ບໍ່ສຳຄັນ — ບໍ່ເກັບ
            if (spec.action === "update" && spec.fields && !Object.keys(changes).length)
                return;
            const row = after ?? before;
            await auditLog_1.default.create({
                at: new Date(),
                user_id: Number(req.user?.sub) || null,
                action: spec.action,
                entity: spec.entity,
                entity_id: id,
                label: (row && spec.label?.(row))?.slice(0, 150) || null,
                changes: Object.keys(changes).length ? JSON.stringify(changes) : null,
            });
        }
        catch (error) {
            console.error("audit write", spec.entity, error);
        }
    });
    next();
};
exports.audit = audit;
