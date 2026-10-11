"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateTax = exports.createTax = exports.getTaxOption = exports.getTaxes = void 0;
const sequelize_1 = require("sequelize");
const tax_1 = __importDefault(require("../../models/tax"));
const bansiHelpers_1 = require("./bansiHelpers");
const crud = (0, bansiHelpers_1.createCrudHandlers)(tax_1.default, {
    label: "tax",
    codeField: "tax_code",
    required: ["name", "rate", "tax_kind"],
    fields: [
        "tax_code", "name", "rate", "tax_kind", "calc_method",
        "is_default", "effective_date", "description", "status",
    ],
    order: [["tax_kind", "ASC"], ["tax_code", "ASC"]],
    prepare: (body) => body.effective_date !== undefined ? {
        ...body, effective_date: (0, bansiHelpers_1.toDateOnly)(body.effective_date)
    } : body,
    // ອາກອນເລີ່ມຕົ້ນມີໄດ້ອັນດຽວຕໍ່ປະເພດ
    afterSave: async (row, t) => {
        if (Number(row.is_default) === 1) {
            await tax_1.default.update({ is_default: 0 }, { where: { tax_kind: row.tax_kind, _uuid: { [sequelize_1.Op.ne]: row._uuid } }, transaction: t });
        }
    },
});
exports.getTaxes = crud.fetch;
exports.getTaxOption = crud.option;
exports.createTax = crud.create;
exports.updateTax = crud.update;
