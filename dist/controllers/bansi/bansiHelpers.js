"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCrudHandlers = exports.sendError = exports.errorMessage = exports.pickFields = exports.toDateOnly = exports.actorOf = exports.decodeId = void 0;
const sequelize_1 = require("sequelize");
const moment_1 = __importDefault(require("moment"));
const utils_1 = require("../../utils");
/** id ໃນ URL ເປັນ base64 ຕາມທຳນຽມຂອງ API ນີ້ */
const decodeId = (req) => atob(req.params.id);
exports.decodeId = decodeId;
/** ຜູ້ໃຊ້ທີ່ login (sub ຂອງ JWT = user_uuid) — ເກັບໄວ້ໃນຖັນ createby / closed_by */
const actorOf = (req) => String(req.user?.sub ?? "");
exports.actorOf = actorOf;
/**
 * ວັນທີ → "YYYY-MM-DD" ສຳລັບຖັນ DATE. ຮັບໄດ້ທັງ "DD/MM/YYYY" (axios interceptor ຂອງໜ້າເວັບ),
 * "YYYY-MM-DD" ແລະ ISO. ຄ່າວ່າງ/ຜິດຮູບແບບ → null
 */
const toDateOnly = (value) => {
    if (value === null || value === undefined || value === "")
        return null;
    const text = String(value);
    const parsed = /^\d{2}\/\d{2}\/\d{4}$/.test(text)
        ? (0, moment_1.default)(text, "DD/MM/YYYY", true)
        : (0, moment_1.default)(text, [moment_1.default.ISO_8601, "YYYY-MM-DD"], true);
    return parsed.isValid() ? parsed.format("YYYY-MM-DD") : null;
};
exports.toDateOnly = toDateOnly;
/** ເອົາສະເພາະຖັນທີ່ອະນຸຍາດ — ກັນ body ແກ້ _uuid / createdAt / ຖັນອື່ນທີ່ບໍ່ຄວນແຕະ */
const pickFields = (body, fields) => Object.fromEntries(fields.filter((f) => body?.[f] !== undefined).map((f) => [f, body[f] === "" ? null : body[f]]));
exports.pickFields = pickFields;
/** ຂໍ້ຄວາມ error ຈິງ (ເຊັ່ນ SQL error) ສົ່ງກັບໃຫ້ໜ້າຈໍສະແດງໄດ້ */
const errorMessage = (error, fallback) => error?.parent?.sqlMessage ?? error?.message ?? fallback;
exports.errorMessage = errorMessage;
const sendError = (res, error, fallback) => {
    console.error(fallback, error);
    res.status(500).json({ message: (0, exports.errorMessage)(error, fallback) });
};
exports.sendError = sendError;
/**
 * CRUD ມາດຕະຖານຂອງຕາຕະລາງຕັ້ງຄ່າບັນຊີ (bansi): fetch ທັງໝົດ, option ສະເພາະ status 1,
 * create (ລະຫັດບໍ່ຊ້ຳ + maxid), update (ແກ້ສະເພາະຖັນທີ່ອະນຸຍາດ). ບໍ່ມີລຶບ — ປິດໃຊ້ງານດ້ວຍ status.
 */
const createCrudHandlers = (model, options) => {
    const { codeField, fields, order, required = [], include, prepare, afterSave, label } = options;
    const codeTaken = async (code, exceptId) => {
        const where = { [codeField]: code };
        if (exceptId !== undefined)
            where._uuid = { [sequelize_1.Op.ne]: exceptId };
        return (await model.count({ where })) > 0;
    };
    const fetch = async (_req, res) => {
        try {
            const data = await model.findAll({ order, include });
            res.status(200).json({ data, total: data.length });
        }
        catch (error) {
            (0, exports.sendError)(res, error, `Error getting ${label}`);
        }
    };
    const option = async (_req, res) => {
        try {
            const data = await model.findAll({ where: { status: 1 }, order, include });
            res.status(200).json({ data });
        }
        catch (error) {
            (0, exports.sendError)(res, error, `Error getting ${label} option`);
        }
    };
    const create = async (req, res) => {
        const t = await model.sequelize.transaction();
        try {
            const picked = (0, exports.pickFields)(req.body, fields);
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
            const row = await model.create({ ...body, [codeField]: code, _uuid: await (0, utils_1.maxid)(model, "_uuid"), createdAt: new Date(), updatedAt: new Date() }, { transaction: t });
            if (afterSave)
                await afterSave(row, t);
            await t.commit();
            res.status(200).json({ message: `Successfully created ${label}`, data: row });
        }
        catch (error) {
            await t.rollback();
            (0, exports.sendError)(res, error, `Error creating ${label}`);
        }
    };
    const update = async (req, res) => {
        const t = await model.sequelize.transaction();
        try {
            const id = (0, exports.decodeId)(req);
            const row = await model.findByPk(id, { transaction: t });
            if (!row) {
                await t.rollback();
                res.status(404).json({ message: `${label} not found` });
                return;
            }
            const picked = (0, exports.pickFields)(req.body, fields);
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
            if (afterSave)
                await afterSave(row, t);
            await t.commit();
            res.status(200).json({ message: `Successfully updated ${label}`, data: row });
        }
        catch (error) {
            await t.rollback();
            (0, exports.sendError)(res, error, `Error updating ${label}`);
        }
    };
    return { fetch, option, create, update };
};
exports.createCrudHandlers = createCrudHandlers;
