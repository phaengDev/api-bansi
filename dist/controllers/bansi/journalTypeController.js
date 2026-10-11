"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateJournalType = exports.createJournalType = exports.getJournalTypeOption = exports.getJournalTypes = void 0;
const journalType_1 = __importDefault(require("../../models/journalType"));
const bansiHelpers_1 = require("./bansiHelpers");
const crud = (0, bansiHelpers_1.createCrudHandlers)(journalType_1.default, {
    label: "journal type",
    codeField: "journal_code",
    required: ["name", "journal_kind"],
    fields: ["journal_code", "name", "journal_kind", "description", "status"],
    order: [["journal_kind", "ASC"], ["journal_code", "ASC"]],
});
exports.getJournalTypes = crud.fetch;
exports.getJournalTypeOption = crud.option;
exports.createJournalType = crud.create;
exports.updateJournalType = crud.update;
