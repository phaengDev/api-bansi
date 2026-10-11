"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updatePaymentMethod = exports.createPaymentMethod = exports.getPaymentMethodOption = exports.getPaymentMethods = void 0;
const paymentMethod_1 = __importDefault(require("../../models/paymentMethod"));
const treasuryAcount_1 = __importDefault(require("../../models/treasuryAcount"));
const bansiHelpers_1 = require("./bansiHelpers");
const crud = (0, bansiHelpers_1.createCrudHandlers)(paymentMethod_1.default, {
    label: "payment method",
    codeField: "method_code",
    required: ["name", "method_type"],
    fields: [
        "method_code", "name", "method_type", "account_id",
        "require_ref", "fee_percent", "sort", "description", "status",
    ],
    order: [["sort", "ASC"], ["method_code", "ASC"]],
    include: [{ model: treasuryAcount_1.default, as: "account", attributes: ["_uuid", "acountName", "acount_number"] }],
});
exports.getPaymentMethods = crud.fetch;
exports.getPaymentMethodOption = crud.option;
exports.createPaymentMethod = crud.create;
exports.updatePaymentMethod = crud.update;
