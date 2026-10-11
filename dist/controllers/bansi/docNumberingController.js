"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.nextDocNumber = exports.issueDocNumber = exports.formatDocNumber = exports.updateDocNumbering = exports.createDocNumbering = exports.getDocNumberingOption = exports.getDocNumberings = void 0;
const moment_1 = __importDefault(require("moment"));
const docNumbering_1 = __importDefault(require("../../models/docNumbering"));
const journalType_1 = __importDefault(require("../../models/journalType"));
const bansiHelpers_1 = require("./bansiHelpers");
const crud = (0, bansiHelpers_1.createCrudHandlers)(docNumbering_1.default, {
    label: "document numbering",
    codeField: "doc_code",
    required: ["name"],
    fields: [
        "doc_code", "name", "journal_id", "prefix", "sep", "year_format",
        "with_month", "digits", "reset_period", "next_number", "description", "status",
    ],
    order: [["doc_code", "ASC"]],
    include: [{ model: journalType_1.default, as: "journal", attributes: ["_uuid", "journal_code", "name"] }],
    // ປ່ຽນ next_number ເອງ → ລ້າງ period_key ໃຫ້ເລກທີ່ຕັ້ງໃຊ້ກັບເອກະສານໃບຕໍ່ໄປທັນທີ (ບໍ່ຖືກ reset ເປັນ 1)
    prepare: (body, existing) => body.next_number !== undefined && (!existing || Number(body.next_number) !== Number(existing.next_number))
        ? { ...body, period_key: null }
        : body,
});
exports.getDocNumberings = crud.fetch;
exports.getDocNumberingOption = crud.option;
exports.createDocNumbering = crud.create;
exports.updateDocNumbering = crud.update;
/** ງວດຂອງເລກລຳດັບ — ປ່ຽນງວດແລ້ວເລີ່ມນັບ 1 ໃໝ່ */
const periodKeyOf = (resetPeriod, date) => resetPeriod === 2 ? date.format("YYYY-MM") : resetPeriod === 1 ? date.format("YYYY") : "ALL";
/** ປະກອບເລກທີ ເຊັ່ນ RV-2026-00015 (ໜ້າເວັບໃຊ້ສູດດຽວກັນສະແດງຕົວຢ່າງ) */
const formatDocNumber = (row, seq, date) => {
    const year = row.year_format === 2 ? date.format("YY") : row.year_format === 4 ? date.format("YYYY") : "";
    const datePart = year ? `${year}${Number(row.with_month) === 1 ? date.format("MM") : ""}` : "";
    return [row.prefix, datePart, String(seq).padStart(Number(row.digits) || 1, "0")].filter(Boolean).join(row.sep ?? "");
};
exports.formatDocNumber = formatDocNumber;
/**
 * ອອກເລກທີໃໝ່ຂອງ doc_code ໃນ transaction ຂອງຜູ້ເອີ້ນ ແລະ ເລື່ອນ next_number — ລັອກແຖວ (FOR UPDATE) ກັນສອງຄົນໄດ້ເລກຊ້ຳ.
 * ຄືນ null ຖ້າຍັງບໍ່ມີຮູບແບບເລກທີຂອງ doc_code ນີ້ (ຜູ້ເອີ້ນເລືອກເອງວ່າຈະໃຊ້ເລກສຳຮອງ ຫຼື ແຈ້ງ error)
 */
const issueDocNumber = async (code, t) => {
    const row = await docNumbering_1.default.findOne({
        where: { doc_code: code, status: 1 },
        transaction: t,
        lock: t.LOCK.UPDATE,
    });
    if (!row)
        return null;
    const now = (0, moment_1.default)();
    const key = periodKeyOf(Number(row.reset_period), now);
    // period_key ວ່າງ = ຍັງບໍ່ເຄີຍອອກເລກ ຫຼື ຫາກໍ່ຕັ້ງ next_number ເອງ → ໃຊ້ next_number ຕາມທີ່ຕັ້ງ
    const seq = !row.period_key || row.period_key === key ? Number(row.next_number) || 1 : 1;
    const number = (0, exports.formatDocNumber)(row, seq, now);
    await row.update({ next_number: seq + 1, period_key: key, updatedAt: new Date() }, { transaction: t });
    return { number, sequence: seq };
};
exports.issueDocNumber = issueDocNumber;
/** POST /doc-numbering/next/:code — ອອກເລກທີໃໝ່ (ໂມດູນອື່ນເອີ້ນ issueDocNumber ໂດຍກົງພາຍໃນ transaction ຂອງມັນ) */
const nextDocNumber = async (req, res) => {
    const t = await docNumbering_1.default.sequelize.transaction();
    try {
        const issued = await (0, exports.issueDocNumber)(req.params.code, t);
        if (!issued) {
            await t.rollback();
            res.status(404).json({ message: `ບໍ່ພົບຮູບແບບເລກທີ ${req.params.code}` });
            return;
        }
        await t.commit();
        res.status(200).json(issued);
    }
    catch (error) {
        await t.rollback();
        (0, bansiHelpers_1.sendError)(res, error, "Error generating document number");
    }
};
exports.nextDocNumber = nextDocNumber;
