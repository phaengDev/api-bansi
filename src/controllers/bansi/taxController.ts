import { Op } from "sequelize";
import Tax from "../../models/tax";
import { createCrudHandlers, toDateOnly } from "./bansiHelpers";

const crud = createCrudHandlers(Tax, {
  label: "tax",
  codeField: "tax_code",
  required: ["name", "rate", "tax_kind"],
  fields: [
    "tax_code", "name", "rate", "tax_kind", "calc_method",
    "is_default", "effective_date", "description", "status",
  ],
  order: [["tax_kind", "ASC"], ["tax_code", "ASC"]],
  prepare: (body) =>
    body.effective_date !== undefined ? {
       ...body, effective_date: toDateOnly(body.effective_date) 
      } : body,
  // ອາກອນເລີ່ມຕົ້ນມີໄດ້ອັນດຽວຕໍ່ປະເພດ
  afterSave: async (row, t) => {
    if (Number(row.is_default) === 1) {
      await Tax.update(
        { is_default: 0 },
        { where: { tax_kind: row.tax_kind, _uuid: { [Op.ne]: row._uuid } }, transaction: t }
      );
    }
  },
});

export const getTaxes = crud.fetch;
export const getTaxOption = crud.option;
export const createTax = crud.create;
export const updateTax = crud.update;
