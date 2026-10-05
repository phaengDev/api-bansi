import PaymentMethod from "../../models/paymentMethod";
import TreasuryAccount from "../../models/treasuryAcount";
import { createCrudHandlers } from "./bansiHelpers";

const crud = createCrudHandlers(PaymentMethod, {
  label: "payment method",
  codeField: "method_code",
  required: ["name", "method_type"],
  fields: [
    "method_code", "name", "method_type", "account_id",
    "require_ref", "fee_percent", "sort", "description", "status",
  ],
  order: [["sort", "ASC"], ["method_code", "ASC"]],
  include: [{ model: TreasuryAccount, as: "account", attributes: ["_uuid", "acountName", "acount_number"] }],
});

export const getPaymentMethods = crud.fetch;
export const getPaymentMethodOption = crud.option;
export const createPaymentMethod = crud.create;
export const updatePaymentMethod = crud.update;
