import { Router } from "express";
import { createUpload, createUploadFile } from "../utils/uploadFile";
import { verifyToken, login } from "../middleware/auth";
import { requirePermission } from "../middleware/permission";
import { getUsers, createUser, getUserById, updateUser, deleteUser, updatePassword, getTypeUser } from "../controllers/userController";
import { getcurrency, updateCurrency, updateCurrencyMt } from "../controllers/currencyController";
import { createBank, updateBank, deleteBank, fetchBank, getBankOption } from "../controllers/bankController";
import { getMainMenus } from "../controllers/menuController";
import {
    createWorkPlan,
    updateWorkPlan,
    doneWorkPlan,
    deleteWorkPlan,
    fetchWorkPlan,
    getWorkPlanById,
    getWorkPlanByDate,
} from "../controllers/workPlanController";
// ======== bansi (ບັນຊີ)
import { createTypeAcount, updateTypeAcount, getTypeAcount, getTypeAcountOption } from "../controllers/bansi/typeAcountController";
import { createTypeTreasury, updateTypeTreasury, deleteTypeTreasury, getTypeTreasury,getTypeTreasurOption, getTreasurbytype } from "../controllers/bansi/typeTreasuryController";
import {
    createTreasuryAcount,
    updateTreasuryAcount,
    getTreasuryAcount,
    getAcountOption,
    getAcountOptionExcept,
    getTreasuryAcountOption,
    getTreasurtypeone
} from "../controllers/bansi/treasuryAcountController";
import { createTransferMoney, getTransferMoney, getAccountStatement } from "../controllers/bansi/transferMoneyControlle";
import { getTypeInexp, getTypeInexpOption, createTypeInexp, updateTypeInexp } from "../controllers/bansi/typeinexpController";
import {
    getFiscalYears, getFiscalYearOption, createFiscalYear, updateFiscalYear,
    setCurrentFiscalYear, closeFiscalYear, reopenFiscalYear, deleteFiscalYear,
} from "../controllers/bansi/fiscalYearController";
import { getExchangeRates, createExchangeRate, deleteExchangeRate } from "../controllers/bansi/exchangeRateController";
import { getOpeningBalances, saveOpeningBalances } from "../controllers/bansi/openingBalanceController";
import { getPaymentMethods, getPaymentMethodOption, createPaymentMethod, updatePaymentMethod } from "../controllers/bansi/paymentMethodController";
import { getJournalTypes, getJournalTypeOption, createJournalType, updateJournalType } from "../controllers/bansi/journalTypeController";
import { verifyMenuLock, saveMenuLock, removeMenuLock } from "../controllers/bansi/menuLockController";
import { getIncomes, createIncome, updateIncome, cancelIncome, downloadIncomeFile } from "../controllers/bansi/incomeController";
import { getExpenses, createExpense, updateExpense, cancelExpense, downloadExpenseFile } from "../controllers/bansi/expenseController";
import { getAccountMovements } from "../controllers/bansi/accountMovement";
import {
    getDocNumberings, getDocNumberingOption, createDocNumbering, updateDocNumbering, nextDocNumber,
} from "../controllers/bansi/docNumberingController";
import { getTaxes, getTaxOption, createTax, updateTax } from "../controllers/bansi/taxController";
import {
  getChartAccounts, getChartAccountOption, createChartAccount, updateChartAccount, deleteChartAccount,
  getGlMappings, saveGlMappings, getGlStatus, rebuildGl,
} from "../controllers/bansi/chartAccountController";
import {
  getJournalEntries, createJournalEntry, reverseJournalEntry, getGlBalances, getGlLedger,
} from "../controllers/bansi/journalController";
import {
  getPartners, createPartner, updatePartner, getPartnerDocs, createPartnerDoc, cancelPartnerDoc,
  getPartnerPayments, createPartnerPayment, cancelPartnerPayment,
} from "../controllers/bansi/arapController";
import {
  getBudgets, createBudget, updateBudget, deleteBudget, getBudgetExpenses, checkBudget,
} from "../controllers/bansi/budgetController";
// ======== ຂໍ້ມູນພື້ນຖານ (HR)
import {
  getDepartments, getDepartmentOption, createDepartment, updateDepartment, deleteDepartment, getProvinces,
} from "../controllers/hr/departmentController";
import {
  getEmployees, getEmployeeOption, createEmployee, updateEmployee, deleteEmployee,
  uploadEmployeeDocuments, downloadEmployeeDocument, deleteEmployeeDocument,
} from "../controllers/hr/employeeController";
import { documentUpload, profileUpload } from "../controllers/hr/hrHelpers";

const router = Router();

// ================= public — ທຸກ route ທີ່ຢູ່ເທິງ router.use(verifyToken) ບໍ່ຕ້ອງ login
router.post("/user/login", login);
router.get("/user/type", getTypeUser);
router.get("/currency", getcurrency);

router.use(verifyToken);

// ================= ເມນູໜ້າ desktop ບັນຊີ (types 2) + ສະຖານະລັອກ
router.get("/menu/main", getMainMenus);

// ================= ສະກຸນເງິນ
router.put("/currency/:id", updateCurrency);
router.post("/currency/mt", updateCurrencyMt);

// ========= ບັນຊີຜູ້ໃຊ້ — ສິດກວດຈາກ tbl_users (requirePermission); ປ່ຽນລະຫັດ: ຕົນເອງ (ໃສ່ລະຫັດເກົ່າ) ຫຼື ມີສິດແກ້ໄຂ
router.post("/user/create", requirePermission("creates"), createUser);
router.post("/user/fetch", getUsers);
router.get("/user/:id", getUserById);
router.put("/user/password/:id", updatePassword);
router.put("/user/:id", requirePermission("updates"), updateUser);
router.delete("/user/:id", requirePermission("deletes"), deleteUser);

// ========= ທະນາຄານ — ໂລໂກ້ field "logo" ຫຼື "logos"
router.post("/bank/create", createUpload('logo').fields([{ name: "logo", maxCount: 1 }, { name: "logos", maxCount: 1 }]), createBank);
router.put("/bank/:id", createUpload('logo').fields([{ name: "logo", maxCount: 1 }, { name: "logos", maxCount: 1 }]), updateBank);
router.delete("/bank/:id", deleteBank);
router.get("/bank/fetch", fetchBank);
router.get("/bank", getBankOption);

// ========= Work Plan (ປະຕິທິນແຜນວຽກ — ເມນູ /calendar ຂອງໜ້າ desktop ບັນຊີ)
router.post("/workplan/create", createWorkPlan);
router.post("/workplan/fetch", fetchWorkPlan);
router.get("/workplan/date/:id", getWorkPlanByDate);
router.get("/workplan/:id", getWorkPlanById);
router.put("/workplan/done/:id", doneWorkPlan);
router.put("/workplan/:id", updateWorkPlan);
router.delete("/workplan/:id", deleteWorkPlan);

// ========= ໝວດບັນຊີ (bansi type account) routes
router.get("/type-account/fetch", getTypeAcount);
router.get("/type-account/option", getTypeAcountOption);
router.post("/type-account/create", createTypeAcount);
router.put("/type-account/:id", updateTypeAcount);
// ========= ປະເພດບັນຊີ (bansi type treasury) routes — fetch ເປັນ POST ເພາະຮັບ filter { typeId, currencyId } ທາງ body
router.post("/type-treasury/fetch", getTypeTreasury);
router.post("/type-treasury/create", createTypeTreasury);
router.put("/type-treasury/:id", updateTypeTreasury);
router.delete("/type-treasury/:id", deleteTypeTreasury);
router.get("/type-treasury/option", getTypeTreasurOption);
router.post("/type-treasury/option", getTypeTreasurOption);
router.get("/type-treasury/bytype/:id", getTreasurbytype);
// ========= ບັນຊີຄັງ (bansi treasury account) routes
router.post("/treasury-account/fetch", getTreasuryAcount);
router.get("/treasury-account/option", getAcountOption);
router.post("/treasury-account/option", getTreasuryAcountOption);
router.post("/treasury-account/option/except", getAcountOptionExcept);
router.post("/treasury-account/create", createTreasuryAcount);
router.get("/treasury-account/typeone/:id", getTreasurtypeone);
router.put("/treasury-account/:id", updateTreasuryAcount);
// ========= ໂອນເງິນລະຫວ່າງບັນຊີ (bansi transfer money) routes
router.post("/transfer-money/fetch", getTransferMoney);
router.post("/transfer-money/create", createTransferMoney);
// ປະຫວັດເງິນເຂົ້າ-ອອກ ຂອງບັນຊີດຽວ (ໜ້າປຶ້ມບັນຊີໃຫຍ່)
router.post("/transfer-money/statement", getAccountStatement);
// ========= ປະເພດລາຍຮັບ-ລາຍຈ່າຍ (bansi finance categories) routes — :id ຂອງ fetch/option ແມ່ນ typestatus (1 ລາຍຮັບ, 2 ລາຍຈ່າຍ), ບໍ່ແມ່ນ base64
router.get("/finance-category/fetch/:id", getTypeInexp);
router.get("/finance-category/option/:id", getTypeInexpOption);
router.post("/finance-category/create", createTypeInexp);
router.put("/finance-category/:id", updateTypeInexp);
// ========= ຕັ້ງຄ່າບັນຊີ (bansi settings)
// ປີການເງິນ
router.get("/fiscal-year/fetch", getFiscalYears);
router.get("/fiscal-year/option", getFiscalYearOption);
router.post("/fiscal-year/create", createFiscalYear);
router.put("/fiscal-year/current/:id", setCurrentFiscalYear);
router.put("/fiscal-year/close/:id", closeFiscalYear);
router.put("/fiscal-year/reopen/:id", reopenFiscalYear);
router.put("/fiscal-year/:id", updateFiscalYear);
router.delete("/fiscal-year/:id", deleteFiscalYear);
// ອັດຕາແລກປ່ຽນ (ປະຫວັດ) — ບັນທຶກແລ້ວອັບເດດ tbl_currency.reate ໃຫ້ເອງ
router.post("/exchange-rate/fetch", getExchangeRates);
router.post("/exchange-rate/create", createExchangeRate);
router.delete("/exchange-rate/:id", deleteExchangeRate);
// ຍອດຍົກມາ — body { fiscal_id } / { fiscal_id, items[] }
router.post("/opening-balance/fetch", getOpeningBalances);
router.post("/opening-balance/save", saveOpeningBalances);
// ວິທີຊຳລະເງິນ
router.get("/payment-method/fetch", getPaymentMethods);
router.get("/payment-method/option", getPaymentMethodOption);
router.post("/payment-method/create", createPaymentMethod);
router.put("/payment-method/:id", updatePaymentMethod);
// ປະເພດປຶ້ມບັນຊີ
router.get("/journal-type/fetch", getJournalTypes);
router.get("/journal-type/option", getJournalTypeOption);
router.post("/journal-type/create", createJournalType);
router.put("/journal-type/:id", updateJournalType);
// ເລກທີເອກະສານ — /next/:code ອອກເລກໃໝ່ (code ເປັນ doc_code ທຳມະດາ ບໍ່ແມ່ນ base64)
router.get("/doc-numbering/fetch", getDocNumberings);
router.get("/doc-numbering/option", getDocNumberingOption);
router.post("/doc-numbering/create", createDocNumbering);
router.post("/doc-numbering/next/:code", nextDocNumber);
router.put("/doc-numbering/:id", updateDocNumbering);
// ອາກອນ
router.get("/tax/fetch", getTaxes);
router.get("/tax/option", getTaxOption);
router.post("/tax/create", createTax);
router.put("/tax/:id", updateTax);
// ລະຫັດຜ່ານເຂົ້າເມນູ desktop ບັນຊີ (tbl_main_menu.password) — ລາຍການເມນູ + ສະຖານະລັອກ ຢູ່ GET /menu/main
router.post("/menu-lock/verify", verifyMenuLock);
router.post("/menu-lock/save", saveMenuLock);
router.post("/menu-lock/remove", removeMenuLock);
// ລາຍຮັບ (ບັນທຶກບັນຊີປະຈຳວັນ) — ບັນທຶກແລ້ວເງິນເຂົ້າບັນຊີເງິນຄັງທັນທີ, ຍົກເລີກ = ຫັກຄືນ; ໄຟລ໌ field "file_doct"
router.post("/income/fetch", getIncomes);
router.post("/income/create", createUploadFile("income").single("file_doct"), createIncome);
router.put("/income/cancel/:id", cancelIncome);
router.get("/income/download/:id", downloadIncomeFile);
// ປະຫວັດການເຄື່ອນໄຫວຂອງບັນຊີເງິນຄັງ (tbl_account_movement) — ທຸກການປ່ຽນຍອດ: ຍອດກ່ອນ / ເຂົ້າ-ອອກ / ຍອດຫຼັງ
router.post("/account-movement/fetch", getAccountMovements);
router.put("/income/:id", createUploadFile("income").single("file_doct"), updateIncome);
// ລາຍຈ່າຍ (ຫົວ + ລາຍການຍ່ອຍ) — /expense/:id ຢູ່ທ້າຍສຸດ ບໍ່ໃຫ້ທັບ /expense/cancel, /expense/download
router.post("/expense/fetch", getExpenses);
router.post("/expense/create", createUploadFile("expense").single("file_doct"), createExpense);
router.put("/expense/cancel/:id", cancelExpense);
router.get("/expense/download/:id", downloadExpenseFile);
router.put("/expense/:id", createUploadFile("expense").single("file_doct"), updateExpense);
// ========= ບັນຊີຄູ່ (GL) — ຕາຕະລາງ ແລະ ຜັງບັນຊີເລີ່ມຕົ້ນ ສ້າງເອງຕອນເປີດ server (runAutoSync + seedGlDefaults)
// ຜັງບັນຊີ
router.get("/chart-account/fetch", getChartAccounts);
router.get("/chart-account/option", getChartAccountOption);
router.post("/chart-account/create", createChartAccount);
router.put("/chart-account/:id", updateChartAccount);
router.delete("/chart-account/:id", deleteChartAccount);
// ຜູກບັນຊີ (ປະເພດລາຍຮັບ-ລາຍຈ່າຍ, ບັນຊີເງິນຄັງ, ບົດບາດຂອງລະບົບ)
router.get("/gl-mapping/fetch", getGlMappings);
router.post("/gl-mapping/save", saveGlMappings);
// ສະຖານະ + ລົງບັນຊີຍ້ອນຫຼັງໃຫ້ເອກະສານເກົ່າ
router.get("/gl/status", getGlStatus);
router.post("/gl/rebuild", rebuildGl);
// ສະໝຸດບັນຊີ: ລາຍການ, ບັນທຶກທົ່ວໄປ, ກັບລາຍການ
router.post("/journal-entry/fetch", getJournalEntries);
router.post("/journal-entry/create", createJournalEntry);
router.put("/journal-entry/reverse/:id", reverseJournalEntry);
// ຍອດຕາມບັນຊີ (ງົບທົດລອງ, ໃບສະຫຼຸບຊັບສົມບັດ) ແລະ ປຶ້ມບັນຊີໃຫຍ່ຂອງບັນຊີດຽວ
router.post("/gl/balances", getGlBalances);
router.post("/gl/ledger", getGlLedger);
// ========= ລູກໜີ້ (kind 1) / ເຈົ້າໜີ້ (kind 2)
router.get("/partner/fetch", getPartners);
router.post("/partner/create", createPartner);
router.put("/partner/:id", updatePartner);
// ໃບແຈ້ງໜີ້ / ໃບບິນ — ຍົກເລີກໄດ້ສະເພາະໃບທີ່ຍັງບໍ່ໄດ້ຕັດໜີ້
router.post("/partner-doc/fetch", getPartnerDocs);
router.post("/partner-doc/create", createPartnerDoc);
router.put("/partner-doc/cancel/:id", cancelPartnerDoc);
// ຮັບ / ຈ່າຍຊຳລະ (ຕັດໜີ້ຫຼາຍໃບໄດ້) — ເງິນເຂົ້າ/ອອກ ບັນຊີເງິນຄັງ
router.post("/partner-payment/fetch", getPartnerPayments);
router.post("/partner-payment/create", createPartnerPayment);
router.put("/partner-payment/cancel/:id", cancelPartnerPayment);
// ========= ງົບປະມານລາຍຈ່າຍ (ຕາມໝວດລາຍຈ່າຍ ຕໍ່ປີການເງິນ) — ຍອດໃຊ້ຈິງຄິດຈາກລາຍຈ່າຍ; /check ໃຫ້ຟອມລາຍຈ່າຍເຕືອນເກີນງົບ
router.post("/budget/fetch", getBudgets);
router.post("/budget/expenses", getBudgetExpenses);
router.post("/budget/check", checkBudget);
router.post("/budget/create", createBudget);
router.put("/budget/:id", updateBudget);
router.delete("/budget/:id", deleteBudget);
// ========= ຂໍ້ມູນພື້ນຖານ (HR): ແຂວງ/ເມືອງ, ພະແນກ + ຕຳແໜ່ງ, ພະນັກງານ + ເອກະສານ — ການແກ້ໄຂກວດສິດຂອງຜູ້ໃຊ້
router.get("/address/province", getProvinces);
router.get("/department/fetch", getDepartments);
router.get("/department/option", getDepartmentOption);
router.post("/department/create", requirePermission("creates"), createDepartment);
router.put("/department/:id", requirePermission("updates"), updateDepartment);
router.delete("/department/:id", requirePermission("deletes"), deleteDepartment);
router.get("/employee/fetch", getEmployees);
router.get("/employee/option", getEmployeeOption);
router.post("/employee/create", requirePermission("creates"), profileUpload, createEmployee);
// ເອກະສານ: POST :id = ພະນັກງານ, GET/DELETE :id = ເອກະສານ — ໄຟລ໌ບໍ່ມີ URL ສາທາລະນະ ດາວໂຫຼດຜ່ານນີ້ເທົ່ານັ້ນ
router.post("/employee/document/:id", requirePermission("updates"), documentUpload, uploadEmployeeDocuments);
router.get("/employee/document/download/:id", downloadEmployeeDocument);
router.delete("/employee/document/:id", requirePermission("updates"), deleteEmployeeDocument);
router.put("/employee/:id", requirePermission("updates"), profileUpload, updateEmployee);
router.delete("/employee/:id", requirePermission("deletes"), deleteEmployee);

export default router;
