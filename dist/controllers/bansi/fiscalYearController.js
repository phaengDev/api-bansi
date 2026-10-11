"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteFiscalYear = exports.reopenFiscalYear = exports.closeFiscalYear = exports.setCurrentFiscalYear = exports.updateFiscalYear = exports.createFiscalYear = exports.getFiscalYearOption = exports.getFiscalYears = void 0;
const sequelize_1 = require("sequelize");
const utils_1 = require("../../utils");
const fiscalYear_1 = __importDefault(require("../../models/fiscalYear"));
const openingBalance_1 = __importDefault(require("../../models/openingBalance"));
const budget_1 = __importDefault(require("../../models/budget"));
const bansiHelpers_1 = require("./bansiHelpers");
const FIELDS = ["fiscal_code", "fiscal_name", "start_date", "end_date", "description"];
/** ປີທີ່ວັນທີຊ້ອນກັບ start..end (ບໍ່ນັບປີ exceptId) — ປີການເງິນຕ້ອງບໍ່ທັບກັນ */
const findOverlap = (start, end, exceptId) => fiscalYear_1.default.findOne({
    where: {
        start_date: { [sequelize_1.Op.lte]: end },
        end_date: { [sequelize_1.Op.gte]: start },
        ...(exceptId !== undefined ? { _uuid: { [sequelize_1.Op.ne]: exceptId } } : {}),
    },
});
/** ກວດວັນທີ ແລະ ລະຫັດ — ຄືນຂໍ້ຄວາມ error ຫຼື null */
const validate = async (body, exceptId) => {
    if (!String(body.fiscal_code ?? "").trim())
        return "ກະລຸນາປ້ອນລະຫັດປີການເງິນ";
    if (!body.start_date || !body.end_date)
        return "ກະລຸນາເລືອກວັນທີເລີ່ມ ແລະ ວັນທີສິ້ນສຸດ";
    if (body.start_date > body.end_date)
        return "ວັນທີເລີ່ມຕ້ອງກ່ອນວັນທີສິ້ນສຸດ";
    const codeTaken = await fiscalYear_1.default.count({
        where: { fiscal_code: body.fiscal_code, ...(exceptId !== undefined ? { _uuid: { [sequelize_1.Op.ne]: exceptId } } : {}) },
    });
    if (codeTaken)
        return `ລະຫັດ ${body.fiscal_code} ມີແລ້ວ`;
    const overlap = await findOverlap(body.start_date, body.end_date, exceptId);
    if (overlap)
        return `ວັນທີຊ້ອນກັບປີການເງິນ ${overlap.fiscal_code}`;
    return null;
};
const normalize = (raw) => {
    const body = (0, bansiHelpers_1.pickFields)(raw, FIELDS);
    if (body.fiscal_code !== undefined)
        body.fiscal_code = String(body.fiscal_code).trim();
    if (body.start_date !== undefined)
        body.start_date = (0, bansiHelpers_1.toDateOnly)(body.start_date);
    if (body.end_date !== undefined)
        body.end_date = (0, bansiHelpers_1.toDateOnly)(body.end_date);
    return body;
};
// ລາຍການທັງໝົດ — ປີໃໝ່ສຸດຢູ່ເທິງ
const getFiscalYears = async (_req, res) => {
    try {
        const data = await fiscalYear_1.default.findAll({ order: [["start_date", "DESC"]] });
        res.status(200).json({ data, total: data.length });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting fiscal years");
    }
};
exports.getFiscalYears = getFiscalYears;
// ສຳລັບ dropdown — ທຸກປີ (ໜ້າຍອດຍົກມາຕ້ອງເບິ່ງປີທີ່ປິດແລ້ວໄດ້ນຳ)
const getFiscalYearOption = async (_req, res) => {
    try {
        const data = await fiscalYear_1.default.findAll({ order: [["start_date", "DESC"]] });
        res.status(200).json({ data });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error getting fiscal year option");
    }
};
exports.getFiscalYearOption = getFiscalYearOption;
const createFiscalYear = async (req, res) => {
    const t = await fiscalYear_1.default.sequelize.transaction();
    try {
        const body = normalize(req.body);
        const invalid = await validate(body);
        if (invalid) {
            await t.rollback();
            res.status(400).json({ message: invalid });
            return;
        }
        // ປີທຳອິດ ຫຼື ຂໍໃຫ້ເປັນປີປັດຈຸບັນ → ຍ້າຍ is_current ມາປີນີ້
        const makeCurrent = Number(req.body.is_current) === 1 || (await fiscalYear_1.default.count({ where: { is_current: 1 } })) === 0;
        if (makeCurrent)
            await fiscalYear_1.default.update({ is_current: 0 }, { where: { is_current: 1 }, transaction: t });
        const row = await fiscalYear_1.default.create({
            ...body,
            _uuid: await (0, utils_1.maxid)(fiscalYear_1.default, "_uuid"),
            is_current: makeCurrent ? 1 : 0,
            status: 1,
            createby: (0, bansiHelpers_1.actorOf)(req),
            createdAt: new Date(),
            updatedAt: new Date(),
        }, { transaction: t });
        await t.commit();
        res.status(200).json({ message: "Successfully created fiscal year", data: row });
    }
    catch (error) {
        await t.rollback();
        (0, bansiHelpers_1.sendError)(res, error, "Error creating fiscal year");
    }
};
exports.createFiscalYear = createFiscalYear;
const updateFiscalYear = async (req, res) => {
    try {
        const id = (0, bansiHelpers_1.decodeId)(req);
        const row = await fiscalYear_1.default.findByPk(id);
        if (!row) {
            res.status(404).json({ message: "ບໍ່ພົບປີການເງິນ" });
            return;
        }
        // ປີທີ່ປິດແລ້ວ ແກ້ໄດ້ສະເພາະຊື່ ແລະ ລາຍລະອຽດ
        const body = row.status === 2 ? (0, bansiHelpers_1.pickFields)(req.body, ["fiscal_name", "description"]) : normalize(req.body);
        if (row.status !== 2) {
            const invalid = await validate({ ...row.get({ plain: true }), ...body }, id);
            if (invalid) {
                res.status(400).json({ message: invalid });
                return;
            }
        }
        await row.update({ ...body, updatedAt: new Date() });
        res.status(200).json({ message: "Successfully updated fiscal year", data: row });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error updating fiscal year");
    }
};
exports.updateFiscalYear = updateFiscalYear;
// ຕັ້ງເປັນປີປັດຈຸບັນ — ມີໄດ້ປີດຽວ ແລະ ຕ້ອງເປັນປີທີ່ຍັງເປີດ
const setCurrentFiscalYear = async (req, res) => {
    const t = await fiscalYear_1.default.sequelize.transaction();
    try {
        const id = (0, bansiHelpers_1.decodeId)(req);
        const row = await fiscalYear_1.default.findByPk(id, { transaction: t });
        if (!row || row.status !== 1) {
            await t.rollback();
            res.status(400).json({ message: "ຕັ້ງໄດ້ສະເພາະປີການເງິນທີ່ຍັງເປີດຢູ່" });
            return;
        }
        await fiscalYear_1.default.update({ is_current: 0 }, { where: { is_current: 1 }, transaction: t });
        await row.update({ is_current: 1, updatedAt: new Date() }, { transaction: t });
        await t.commit();
        res.status(200).json({ message: "Successfully set current fiscal year", data: row });
    }
    catch (error) {
        await t.rollback();
        (0, bansiHelpers_1.sendError)(res, error, "Error setting current fiscal year");
    }
};
exports.setCurrentFiscalYear = setCurrentFiscalYear;
// ປິດບັນຊີ — ຫ້າມປິດປີປັດຈຸບັນ (ຕ້ອງຍ້າຍປີປັດຈຸບັນໄປປີໃໝ່ກ່ອນ)
const closeFiscalYear = async (req, res) => {
    try {
        const row = await fiscalYear_1.default.findByPk((0, bansiHelpers_1.decodeId)(req));
        if (!row) {
            res.status(404).json({ message: "ບໍ່ພົບປີການເງິນ" });
            return;
        }
        if (row.is_current === 1) {
            res.status(400).json({ message: "ປິດປີປັດຈຸບັນບໍ່ໄດ້ — ຕັ້ງປີອື່ນເປັນປີປັດຈຸບັນກ່ອນ" });
            return;
        }
        await row.update({ status: 2, closed_at: new Date(), closed_by: (0, bansiHelpers_1.actorOf)(req), updatedAt: new Date() });
        res.status(200).json({ message: "Successfully closed fiscal year", data: row });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error closing fiscal year");
    }
};
exports.closeFiscalYear = closeFiscalYear;
// ເປີດປີທີ່ປິດແລ້ວຄືນ (ກໍລະນີປິດຜິດ)
const reopenFiscalYear = async (req, res) => {
    try {
        const row = await fiscalYear_1.default.findByPk((0, bansiHelpers_1.decodeId)(req));
        if (!row) {
            res.status(404).json({ message: "ບໍ່ພົບປີການເງິນ" });
            return;
        }
        await row.update({ status: 1, closed_at: null, closed_by: null, updatedAt: new Date() });
        res.status(200).json({ message: "Successfully reopened fiscal year", data: row });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error reopening fiscal year");
    }
};
exports.reopenFiscalYear = reopenFiscalYear;
// ລຶບໄດ້ສະເພາະປີທີ່ບໍ່ແມ່ນປີປັດຈຸບັນ, ຍັງເປີດຢູ່ ແລະ ບໍ່ມີຍອດຍົກມາ / ງົບປະມານ
const deleteFiscalYear = async (req, res) => {
    try {
        const id = (0, bansiHelpers_1.decodeId)(req);
        const row = await fiscalYear_1.default.findByPk(id);
        if (!row) {
            res.status(404).json({ message: "ບໍ່ພົບປີການເງິນ" });
            return;
        }
        const used = (await openingBalance_1.default.count({ where: { fiscal_id: id } })) + (await budget_1.default.count({ where: { fiscal_id: id } }));
        if (row.is_current === 1 || row.status === 2 || used) {
            res.status(400).json({ message: "ລຶບບໍ່ໄດ້ — ເປັນປີປັດຈຸບັນ, ປິດບັນຊີແລ້ວ ຫຼື ມີຍອດຍົກມາ / ງົບປະມານແລ້ວ" });
            return;
        }
        await row.destroy();
        res.status(200).json({ message: "Successfully deleted fiscal year" });
    }
    catch (error) {
        (0, bansiHelpers_1.sendError)(res, error, "Error deleting fiscal year");
    }
};
exports.deleteFiscalYear = deleteFiscalYear;
