import JournalType from "../../models/journalType";
import { createCrudHandlers } from "./bansiHelpers";

const crud = createCrudHandlers(JournalType, {
  label: "journal type",
  codeField: "journal_code",
  required: ["name", "journal_kind"],
  fields: ["journal_code", "name", "journal_kind", "description", "status"],
  order: [["journal_kind", "ASC"], ["journal_code", "ASC"]],
});

export const getJournalTypes = crud.fetch;
export const getJournalTypeOption = crud.option;
export const createJournalType = crud.create;
export const updateJournalType = crud.update;
