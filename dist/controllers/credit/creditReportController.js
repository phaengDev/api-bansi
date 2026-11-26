"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCreditReport = void 0;
const sequelize_1 = require("sequelize");
const moment_1 = __importDefault(require("moment"));
const loan_1 = __importStar(require("../../models/loan"));
const treasuryAcount_1 = __importDefault(require("../../models/treasuryAcount"));
const employee_1 = __importDefault(require("../../models/employee"));
const loanCredit_1 = require("../../models/loanCredit");
const glCore_1 = require("../bansi/glCore");
const bansiHelpers_1 = require("../bansi/bansiHelpers");
const journalHelpers_1 = require("../bansi/journalHelpers");
const loanController_1 = require("../bansi/loanController");
const riskController_1 = require("./riskController");
const creditPenalty_1 = require("./creditPenalty");
/**
 * ລາຍງານສິນເຊື່ອ — GET /credit/report/:type
 *  portfolio ?as_of     ສັນຍາທີ່ຍັງຄ້າງ ພ້ອມມື້ກາຍກຳນົດ, ຊັ້ນໜີ້ ແລະ ເງິນແຮ (ຄາດຄະເນ)
 *  disbursements ?from&to   ການປ່ອຍກູ້ (ລວມສັນຍາທີ່ອອກຈາກການປັບໂຄງສ້າງ)
 *  collections ?from&to     ການຮັບຊຳລະ ແຍກ ຕົ້ນ / ດອກ / ຄ່າປັບ / ຄ່າທຳນຽມ
 *  writeoffs                ໜີ້ສູນ ແລະ ຍອດເກັບຄືນ
 */
const num = (v) => Number(v) || 0;
const ACTIVE = 1;
const lookups = async (customerIds, productIds, officerIds) => {
    const [customers, products, officers] = await Promise.all([
        loanCredit_1.LoanCustomer.findAll({ where: { _uuid: [...new Set(customerIds.filter(Boolean))] }, attributes: ["_uuid", "customer_code", "full_name", "phone"], raw: true }),
        loanCredit_1.LoanProduct.findAll({ where: { _uuid: [...new Set(productIds.filter(Boolean))] }, attributes: ["_uuid", "product_code", "name_la"], raw: true }),
        employee_1.default.findAll({ where: { _uuid: [...new Set(officerIds.filter(Boolean))] }, attributes: ["_uuid", "first_name", "last_name"], raw: true }),
    ]);
    return {
        customer: (id) => customers.find((c) => c._uuid === id) ?? null,
        product: (id) => products.find((p) => p._uuid === id)?.name_la ?? null,
        officer: (id) => {
            const e = officers.find((o) => o._uuid === id);
            return e ? [e.first_name, e.last_name].filter(Boolean).join(" ") : null;
        },
    };
};
const rangeOf = (req) => {
    const today = (0, journalHelpers_1.todayLao)();
    const from = (0, bansiHelpers_1.toDateOnly)(req.query.from) ?? (0, moment_1.default)(today).startOf("month").format("YYYY-MM-DD");
    const to = (0, bansiHelpers_1.toDateOnly)(req.query.to) ?? today;
    if (from > to)
        throw new glCore_1.GlError("ວັນທີເລີ່ມຕ້ອງບໍ່ຫຼັງວັນທີສິ້ນສຸດ");
    return { from, to };
};
const getCreditReport = async (req, res) => {
    try {
        if (!(await (0, glCore_1.glReady)()))
            throw new glCore_1.GlError("ຍັງບໍ່ໄດ້ເປີດໃຊ້ລະບົບບັນຊີຄູ່");
        const type = req.params.type;
        if (type === "portfolio") {
            const asOf = (0, bansiHelpers_1.toDateOnly)(req.query.as_of) ?? (0, journalHelpers_1.todayLao)();
            const { rows } = await (0, riskController_1.portfolioAt)(asOf);
            const look = await lookups(rows.map((r) => r.customer_id), rows.map((r) => r.product_id), rows.map((r) => r.officer_id));
            res.status(200).json({
                as_of: asOf,
                data: rows.map((r) => {
                    const c = look.customer(r.customer_id);
                    return {
                        loan_id: r.loan_id, loan_code: r.loan_code, customer_code: c?.customer_code ?? null, customer: c?.full_name ?? r.counterparty, phone: c?.phone ?? null,
                        product: look.product(r.product_id), officer: look.officer(r.officer_id), currency: r.currency,
                        start_date: r.start_date, maturity: r.maturity, annual_rate: r.annual_rate, principal: r.principal, outstanding: r.outstanding,
                        overdue_principal: r.overdue_principal, overdue_interest: r.overdue_interest, days_overdue: r.days_overdue,
                        class_code: r.class_code, is_npl: r.is_npl, provision_rate: r.provision_rate, provision_amount: r.provision_amount,
                    };
                }).sort((a, b) => b.days_overdue - a.days_overdue || a.loan_code.localeCompare(b.loan_code)),
            });
            return;
        }
        if (type === "disbursements") {
            const { from, to } = rangeOf(req);
            const [loans, currencies] = await Promise.all([
                loan_1.default.findAll({ where: { customer_id: { [sequelize_1.Op.ne]: null }, status: ACTIVE, start_date: { [sequelize_1.Op.between]: [from, to] } }, order: [["start_date", "ASC"], ["loan_code", "ASC"]] }),
                (0, loanController_1.currencyMap)(),
            ]);
            const look = await lookups(loans.map((l) => l.customer_id), loans.map((l) => l.product_id), loans.map((l) => l.officer_id));
            res.status(200).json({
                from, to,
                data: loans.map((l) => {
                    const c = look.customer(l.customer_id);
                    const cur = currencies.get(Number(l.currency_id));
                    return {
                        loan_id: l._uuid, loan_code: l.loan_code, date: l.start_date, customer_code: c?.customer_code ?? null, customer: c?.full_name ?? l.counterparty,
                        product: look.product(l.product_id), officer: look.officer(l.officer_id), currency: cur ? { name: cur.name, genus: cur.genus } : null,
                        principal: num(l.principal), upfront_fee: num(l.upfront_fee), net: (0, glCore_1.round2)(num(l.principal) - num(l.upfront_fee)),
                        annual_rate: Number(l.annual_rate), term: l.term, restructured: !l.application_id,
                    };
                }),
            });
            return;
        }
        if (type === "collections") {
            const { from, to } = rangeOf(req);
            const credit = await loan_1.default.findAll({ where: { customer_id: { [sequelize_1.Op.ne]: null } }, attributes: ["_uuid", "loan_code", "counterparty", "customer_id", "currency_id", "close_reason"] });
            const payments = credit.length ? await loan_1.LoanPayment.findAll({
                where: { loan_id: credit.map((l) => l._uuid), status: ACTIVE, pay_date: { [sequelize_1.Op.between]: [from, to] } }, order: [["pay_date", "ASC"], ["_uuid", "ASC"]],
            }) : [];
            const [look, names, treasuries, currencies, writeoffs] = await Promise.all([
                lookups(credit.map((l) => l.customer_id), [], []),
                (0, creditPenalty_1.userNames)(payments.map((p) => p.created_by)),
                treasuryAcount_1.default.findAll({ where: { _uuid: [...new Set(payments.map((p) => p.treasury_account_id))] }, attributes: ["_uuid", "acountName"], raw: true }),
                (0, loanController_1.currencyMap)(),
                loanCredit_1.LoanWriteoff.findAll({ where: { status: ACTIVE }, attributes: ["loan_id", "writeoff_date"], raw: true }),
            ]);
            res.status(200).json({
                from, to,
                data: payments.map((p) => {
                    const loan = credit.find((l) => l._uuid === p.loan_id);
                    const c = look.customer(loan.customer_id);
                    const cur = currencies.get(Number(loan.currency_id));
                    const wo = writeoffs.find((w) => w.loan_id === loan._uuid);
                    return {
                        payment_id: p._uuid, number: p.number, date: p.pay_date, loan_id: loan._uuid, loan_code: loan.loan_code,
                        customer_code: c?.customer_code ?? null, customer: c?.full_name ?? loan.counterparty, currency: cur ? { name: cur.name, genus: cur.genus } : null,
                        principal: num(p.principal), interest: num(p.interest), penalty: num(p.penalty), fee: num(p.fee),
                        total: (0, glCore_1.round2)(num(p.principal) + num(p.interest) + num(p.penalty) + num(p.fee)), payment_type: p.payment_type,
                        recovery: !!wo && String(p.pay_date) >= String(wo.writeoff_date),
                        account: treasuries.find((a) => a._uuid === p.treasury_account_id)?.acountName ?? null,
                        reference: p.reference, by: names.get(Number(p.created_by)) ?? null,
                    };
                }),
            });
            return;
        }
        if (type === "writeoffs") {
            const rows = await loanCredit_1.LoanWriteoff.findAll({ where: { status: ACTIVE }, order: [["writeoff_date", "DESC"]] });
            const loans = await loan_1.default.findAll({ where: { _uuid: rows.map((r) => r.loan_id) }, attributes: ["_uuid", "loan_code", "counterparty", "customer_id", "currency_id"] });
            const [look, names, currencies] = await Promise.all([lookups(loans.map((l) => l.customer_id), [], []), (0, creditPenalty_1.userNames)(rows.map((r) => r.approved_by)), (0, loanController_1.currencyMap)()]);
            res.status(200).json({
                data: rows.map((r) => {
                    const loan = loans.find((l) => l._uuid === r.loan_id);
                    const c = look.customer(loan?.customer_id ?? null);
                    const cur = currencies.get(Number(loan?.currency_id));
                    const total = (0, glCore_1.round2)(num(r.principal) + num(r.interest) + num(r.penalty));
                    return {
                        _uuid: r._uuid, loan_id: r.loan_id, loan_code: loan?.loan_code ?? null, date: r.writeoff_date, customer_code: c?.customer_code ?? null,
                        customer: c?.full_name ?? loan?.counterparty ?? null, currency: cur ? { name: cur.name, genus: cur.genus } : null,
                        principal: num(r.principal), interest: num(r.interest), penalty: num(r.penalty), total, recovered: num(r.recovered_amount),
                        remaining: (0, glCore_1.round2)(total - num(r.recovered_amount)), reason: r.reason, by: names.get(Number(r.approved_by)) ?? null,
                    };
                }),
            });
            return;
        }
        throw new glCore_1.GlError("ບໍ່ພົບລາຍງານ");
    }
    catch (error) {
        (0, loanController_1.fail)(res, error, "Error getting credit report");
    }
};
exports.getCreditReport = getCreditReport;
