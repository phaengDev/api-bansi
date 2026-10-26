"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const uploadFile_1 = require("../utils/uploadFile");
const auth_1 = require("../middleware/auth");
const permission_1 = require("../middleware/permission");
const userController_1 = require("../controllers/userController");
const currencyController_1 = require("../controllers/currencyController");
const bankController_1 = require("../controllers/bankController");
const menuController_1 = require("../controllers/menuController");
const workPlanController_1 = require("../controllers/workPlanController");
// ======== bansi (ບັນຊີ)
const typeAcountController_1 = require("../controllers/bansi/typeAcountController");
const typeTreasuryController_1 = require("../controllers/bansi/typeTreasuryController");
const treasuryAcountController_1 = require("../controllers/bansi/treasuryAcountController");
const transferMoneyControlle_1 = require("../controllers/bansi/transferMoneyControlle");
const typeinexpController_1 = require("../controllers/bansi/typeinexpController");
const fiscalYearController_1 = require("../controllers/bansi/fiscalYearController");
const exchangeRateController_1 = require("../controllers/bansi/exchangeRateController");
const openingBalanceController_1 = require("../controllers/bansi/openingBalanceController");
const paymentMethodController_1 = require("../controllers/bansi/paymentMethodController");
const journalTypeController_1 = require("../controllers/bansi/journalTypeController");
const menuLockController_1 = require("../controllers/bansi/menuLockController");
const incomeController_1 = require("../controllers/bansi/incomeController");
const expenseController_1 = require("../controllers/bansi/expenseController");
const accountMovement_1 = require("../controllers/bansi/accountMovement");
const docNumberingController_1 = require("../controllers/bansi/docNumberingController");
const taxController_1 = require("../controllers/bansi/taxController");
const chartAccountController_1 = require("../controllers/bansi/chartAccountController");
const journalController_1 = require("../controllers/bansi/journalController");
const arapController_1 = require("../controllers/bansi/arapController");
const budgetController_1 = require("../controllers/bansi/budgetController");
// ======== ຂໍ້ມູນພື້ນຖານ (HR)
const departmentController_1 = require("../controllers/hr/departmentController");
const employeeController_1 = require("../controllers/hr/employeeController");
const companyController_1 = require("../controllers/hr/companyController");
const appAuthController_1 = require("../controllers/hr/appAuthController");
const appReleaseController_1 = require("../controllers/hr/appReleaseController");
const myWorkPlanController_1 = require("../controllers/hr/myWorkPlanController");
const attendanceController_1 = require("../controllers/hr/attendanceController");
const payrollController_1 = require("../controllers/hr/payrollController");
const leaveController_1 = require("../controllers/hr/leaveController");
const leaveTypeController_1 = require("../controllers/hr/leaveTypeController");
const overtimeController_1 = require("../controllers/hr/overtimeController");
const historyController_1 = require("../controllers/hr/historyController");
const teamController_1 = require("../controllers/hr/teamController");
const correctionController_1 = require("../controllers/hr/correctionController");
const hrHelpers_1 = require("../controllers/hr/hrHelpers");
const birthdayController_1 = require("../controllers/hr/birthdayController");
const notificationController_1 = require("../controllers/hr/notificationController");
const router = (0, express_1.Router)();
// ================= public — ທຸກ route ທີ່ຢູ່ເທິງ router.use(verifyToken) ບໍ່ຕ້ອງ login
router.post("/user/login", auth_1.login);
// app ພະນັກງານ — ເຂົ້າດ້ວຍເບີໂທ (20XXXXXXXX) + ລະຫັດຜ່ານ; token ໃຊ້ໄດ້ສະເພາະ route ຂໍ້ມູນຂອງຕົນເອງ (/…/me, /attendance/scan, /app/…)
router.post("/app/login", appAuthController_1.appLogin);
// ລືມລະຫັດຜ່ານ — OTP ທາງ SMS ແລ້ວອອກລະຫັດຜ່ານໃໝ່
router.post("/app/otp/request", appAuthController_1.requestAppOtp);
router.post("/app/otp/verify", appAuthController_1.verifyAppOtp);
// Mac ທີ່ build ແອັບ ອັບໂຫຼດ APK ເອງຫຼັງ build — ກະແຈ APP_RELEASE_KEY ແທນ login
router.post("/app-release/publish", appReleaseController_1.requireReleaseKey, appReleaseController_1.apkUpload, appReleaseController_1.createAppRelease);
router.get("/user/type", userController_1.getTypeUser);
router.get("/currency", currencyController_1.getcurrency);
router.use(auth_1.verifyToken);
// ເວັບ bansi ກວດ token ທຸກເທື່ອທີ່ເປີດເວັບ (ກ່ອນ /user/:id)
router.get("/user/session", auth_1.checkSession);
router.put("/app/password", appAuthController_1.changeAppPassword);
// ຂໍ້ມູນບໍລິສັດສຳລັບ app (token ພະນັກງານເຂົ້າ /company ບໍ່ໄດ້ — ໃຊ້ຂໍ້ມູນດຽວກັນ, ບໍ່ມີລະຫັດ QR)
router.get("/app/company", companyController_1.getCompany);
// ລຸ້ນລ່າສຸດຂອງແອັບ Android ທີ່ HR ອັບໂຫຼດ — ແອັບທຽບເລກ build ແລ້ວຂຶ້ນແຖບອັບເດດ
router.get("/app/release", appReleaseController_1.getLatestAppRelease);
// ================= ເມນູໜ້າ desktop ບັນຊີ (types 2) + ສະຖານະລັອກ
router.get("/menu/main", menuController_1.getMainMenus);
// ================= ສະກຸນເງິນ
router.put("/currency/:id", currencyController_1.updateCurrency);
router.post("/currency/mt", currencyController_1.updateCurrencyMt);
// ========= ບັນຊີຜູ້ໃຊ້ — ສິດກວດຈາກ tbl_users (requirePermission); ປ່ຽນລະຫັດ: ຕົນເອງ (ໃສ່ລະຫັດເກົ່າ) ຫຼື ມີສິດແກ້ໄຂ
router.post("/user/create", (0, permission_1.requirePermission)("creates"), userController_1.createUser);
router.post("/user/fetch", userController_1.getUsers);
router.get("/user/:id", userController_1.getUserById);
router.put("/user/password/:id", userController_1.updatePassword);
router.put("/user/:id", (0, permission_1.requirePermission)("updates"), userController_1.updateUser);
router.delete("/user/:id", (0, permission_1.requirePermission)("deletes"), userController_1.deleteUser);
// ========= ທະນາຄານ — ໂລໂກ້ field "logo" ຫຼື "logos"
router.post("/bank/create", (0, uploadFile_1.createUpload)('logo').fields([{ name: "logo", maxCount: 1 }, { name: "logos", maxCount: 1 }]), bankController_1.createBank);
router.put("/bank/:id", (0, uploadFile_1.createUpload)('logo').fields([{ name: "logo", maxCount: 1 }, { name: "logos", maxCount: 1 }]), bankController_1.updateBank);
router.delete("/bank/:id", bankController_1.deleteBank);
router.get("/bank/fetch", bankController_1.fetchBank);
router.get("/bank", bankController_1.getBankOption);
// ========= Work Plan (ປະຕິທິນແຜນວຽກ — ເມນູ /calendar ຂອງໜ້າ desktop ບັນຊີ)
router.post("/workplan/create", workPlanController_1.createWorkPlan);
router.post("/workplan/fetch", workPlanController_1.fetchWorkPlan);
router.get("/workplan/date/:id", workPlanController_1.getWorkPlanByDate);
router.get("/workplan/:id", workPlanController_1.getWorkPlanById);
router.put("/workplan/done/:id", workPlanController_1.doneWorkPlan);
router.put("/workplan/:id", workPlanController_1.updateWorkPlan);
router.delete("/workplan/:id", workPlanController_1.deleteWorkPlan);
// ========= ໝວດບັນຊີ (bansi type account) routes
router.get("/type-account/fetch", typeAcountController_1.getTypeAcount);
router.get("/type-account/option", typeAcountController_1.getTypeAcountOption);
router.post("/type-account/create", typeAcountController_1.createTypeAcount);
router.put("/type-account/:id", typeAcountController_1.updateTypeAcount);
// ========= ປະເພດບັນຊີ (bansi type treasury) routes — fetch ເປັນ POST ເພາະຮັບ filter { typeId, currencyId } ທາງ body
router.post("/type-treasury/fetch", typeTreasuryController_1.getTypeTreasury);
router.post("/type-treasury/create", typeTreasuryController_1.createTypeTreasury);
router.put("/type-treasury/:id", typeTreasuryController_1.updateTypeTreasury);
router.delete("/type-treasury/:id", typeTreasuryController_1.deleteTypeTreasury);
router.get("/type-treasury/option", typeTreasuryController_1.getTypeTreasurOption);
router.post("/type-treasury/option", typeTreasuryController_1.getTypeTreasurOption);
router.get("/type-treasury/bytype/:id", typeTreasuryController_1.getTreasurbytype);
// ========= ບັນຊີຄັງ (bansi treasury account) routes
router.post("/treasury-account/fetch", treasuryAcountController_1.getTreasuryAcount);
router.get("/treasury-account/option", treasuryAcountController_1.getAcountOption);
router.post("/treasury-account/option", treasuryAcountController_1.getTreasuryAcountOption);
router.post("/treasury-account/option/except", treasuryAcountController_1.getAcountOptionExcept);
router.post("/treasury-account/create", treasuryAcountController_1.createTreasuryAcount);
router.get("/treasury-account/typeone/:id", treasuryAcountController_1.getTreasurtypeone);
router.put("/treasury-account/:id", treasuryAcountController_1.updateTreasuryAcount);
// ========= ໂອນເງິນລະຫວ່າງບັນຊີ (bansi transfer money) routes
router.post("/transfer-money/fetch", transferMoneyControlle_1.getTransferMoney);
router.post("/transfer-money/create", transferMoneyControlle_1.createTransferMoney);
// ປະຫວັດເງິນເຂົ້າ-ອອກ ຂອງບັນຊີດຽວ (ໜ້າປຶ້ມບັນຊີໃຫຍ່)
router.post("/transfer-money/statement", transferMoneyControlle_1.getAccountStatement);
// ========= ປະເພດລາຍຮັບ-ລາຍຈ່າຍ (bansi finance categories) routes — :id ຂອງ fetch/option ແມ່ນ typestatus (1 ລາຍຮັບ, 2 ລາຍຈ່າຍ), ບໍ່ແມ່ນ base64
router.get("/finance-category/fetch/:id", typeinexpController_1.getTypeInexp);
router.get("/finance-category/option/:id", typeinexpController_1.getTypeInexpOption);
router.post("/finance-category/create", typeinexpController_1.createTypeInexp);
router.put("/finance-category/:id", typeinexpController_1.updateTypeInexp);
// ========= ຕັ້ງຄ່າບັນຊີ (bansi settings)
// ປີການເງິນ
router.get("/fiscal-year/fetch", fiscalYearController_1.getFiscalYears);
router.get("/fiscal-year/option", fiscalYearController_1.getFiscalYearOption);
router.post("/fiscal-year/create", fiscalYearController_1.createFiscalYear);
router.put("/fiscal-year/current/:id", fiscalYearController_1.setCurrentFiscalYear);
router.put("/fiscal-year/close/:id", fiscalYearController_1.closeFiscalYear);
router.put("/fiscal-year/reopen/:id", fiscalYearController_1.reopenFiscalYear);
router.put("/fiscal-year/:id", fiscalYearController_1.updateFiscalYear);
router.delete("/fiscal-year/:id", fiscalYearController_1.deleteFiscalYear);
// ອັດຕາແລກປ່ຽນ (ປະຫວັດ) — ບັນທຶກແລ້ວອັບເດດ tbl_currency.reate ໃຫ້ເອງ
router.post("/exchange-rate/fetch", exchangeRateController_1.getExchangeRates);
router.post("/exchange-rate/create", exchangeRateController_1.createExchangeRate);
router.delete("/exchange-rate/:id", exchangeRateController_1.deleteExchangeRate);
// ຍອດຍົກມາ — body { fiscal_id } / { fiscal_id, items[] }
router.post("/opening-balance/fetch", openingBalanceController_1.getOpeningBalances);
router.post("/opening-balance/save", openingBalanceController_1.saveOpeningBalances);
// ວິທີຊຳລະເງິນ
router.get("/payment-method/fetch", paymentMethodController_1.getPaymentMethods);
router.get("/payment-method/option", paymentMethodController_1.getPaymentMethodOption);
router.post("/payment-method/create", paymentMethodController_1.createPaymentMethod);
router.put("/payment-method/:id", paymentMethodController_1.updatePaymentMethod);
// ປະເພດປຶ້ມບັນຊີ
router.get("/journal-type/fetch", journalTypeController_1.getJournalTypes);
router.get("/journal-type/option", journalTypeController_1.getJournalTypeOption);
router.post("/journal-type/create", journalTypeController_1.createJournalType);
router.put("/journal-type/:id", journalTypeController_1.updateJournalType);
// ເລກທີເອກະສານ — /next/:code ອອກເລກໃໝ່ (code ເປັນ doc_code ທຳມະດາ ບໍ່ແມ່ນ base64)
router.get("/doc-numbering/fetch", docNumberingController_1.getDocNumberings);
router.get("/doc-numbering/option", docNumberingController_1.getDocNumberingOption);
router.post("/doc-numbering/create", docNumberingController_1.createDocNumbering);
router.post("/doc-numbering/next/:code", docNumberingController_1.nextDocNumber);
router.put("/doc-numbering/:id", docNumberingController_1.updateDocNumbering);
// ອາກອນ
router.get("/tax/fetch", taxController_1.getTaxes);
router.get("/tax/option", taxController_1.getTaxOption);
router.post("/tax/create", taxController_1.createTax);
router.put("/tax/:id", taxController_1.updateTax);
// ລະຫັດຜ່ານເຂົ້າເມນູ desktop ບັນຊີ (tbl_main_menu.password) — ລາຍການເມນູ + ສະຖານະລັອກ ຢູ່ GET /menu/main
router.post("/menu-lock/verify", menuLockController_1.verifyMenuLock);
router.post("/menu-lock/save", menuLockController_1.saveMenuLock);
router.post("/menu-lock/remove", menuLockController_1.removeMenuLock);
// ລາຍຮັບ (ບັນທຶກບັນຊີປະຈຳວັນ) — ບັນທຶກແລ້ວເງິນເຂົ້າບັນຊີເງິນຄັງທັນທີ, ຍົກເລີກ = ຫັກຄືນ; ໄຟລ໌ field "file_doct"
router.post("/income/fetch", incomeController_1.getIncomes);
router.post("/income/create", (0, uploadFile_1.createUploadFile)("income").single("file_doct"), incomeController_1.createIncome);
router.put("/income/cancel/:id", incomeController_1.cancelIncome);
router.get("/income/download/:id", incomeController_1.downloadIncomeFile);
// ປະຫວັດການເຄື່ອນໄຫວຂອງບັນຊີເງິນຄັງ (tbl_account_movement) — ທຸກການປ່ຽນຍອດ: ຍອດກ່ອນ / ເຂົ້າ-ອອກ / ຍອດຫຼັງ
router.post("/account-movement/fetch", accountMovement_1.getAccountMovements);
router.put("/income/:id", (0, uploadFile_1.createUploadFile)("income").single("file_doct"), incomeController_1.updateIncome);
// ລາຍຈ່າຍ (ຫົວ + ລາຍການຍ່ອຍ) — /expense/:id ຢູ່ທ້າຍສຸດ ບໍ່ໃຫ້ທັບ /expense/cancel, /expense/download
router.post("/expense/fetch", expenseController_1.getExpenses);
router.post("/expense/create", (0, uploadFile_1.createUploadFile)("expense").single("file_doct"), expenseController_1.createExpense);
router.put("/expense/cancel/:id", expenseController_1.cancelExpense);
router.get("/expense/download/:id", expenseController_1.downloadExpenseFile);
router.put("/expense/:id", (0, uploadFile_1.createUploadFile)("expense").single("file_doct"), expenseController_1.updateExpense);
// ========= ບັນຊີຄູ່ (GL) — ຕາຕະລາງ ແລະ ຜັງບັນຊີເລີ່ມຕົ້ນ ສ້າງເອງຕອນເປີດ server (runAutoSync + seedGlDefaults)
// ຜັງບັນຊີ
router.get("/chart-account/fetch", chartAccountController_1.getChartAccounts);
router.get("/chart-account/option", chartAccountController_1.getChartAccountOption);
router.post("/chart-account/create", chartAccountController_1.createChartAccount);
router.put("/chart-account/:id", chartAccountController_1.updateChartAccount);
router.delete("/chart-account/:id", chartAccountController_1.deleteChartAccount);
// ຜູກບັນຊີ (ປະເພດລາຍຮັບ-ລາຍຈ່າຍ, ບັນຊີເງິນຄັງ, ບົດບາດຂອງລະບົບ)
router.get("/gl-mapping/fetch", chartAccountController_1.getGlMappings);
router.post("/gl-mapping/save", chartAccountController_1.saveGlMappings);
// ສະຖານະ + ລົງບັນຊີຍ້ອນຫຼັງໃຫ້ເອກະສານເກົ່າ
router.get("/gl/status", chartAccountController_1.getGlStatus);
router.post("/gl/rebuild", chartAccountController_1.rebuildGl);
// ສະໝຸດບັນຊີ: ລາຍການ, ບັນທຶກທົ່ວໄປ, ກັບລາຍການ
router.post("/journal-entry/fetch", journalController_1.getJournalEntries);
router.post("/journal-entry/create", journalController_1.createJournalEntry);
router.put("/journal-entry/reverse/:id", journalController_1.reverseJournalEntry);
// ຍອດຕາມບັນຊີ (ງົບທົດລອງ, ໃບສະຫຼຸບຊັບສົມບັດ) ແລະ ປຶ້ມບັນຊີໃຫຍ່ຂອງບັນຊີດຽວ
router.post("/gl/balances", journalController_1.getGlBalances);
router.post("/gl/ledger", journalController_1.getGlLedger);
// ========= ລູກໜີ້ (kind 1) / ເຈົ້າໜີ້ (kind 2)
router.get("/partner/fetch", arapController_1.getPartners);
router.post("/partner/create", arapController_1.createPartner);
router.put("/partner/:id", arapController_1.updatePartner);
// ໃບແຈ້ງໜີ້ / ໃບບິນ — ຍົກເລີກໄດ້ສະເພາະໃບທີ່ຍັງບໍ່ໄດ້ຕັດໜີ້
router.post("/partner-doc/fetch", arapController_1.getPartnerDocs);
router.post("/partner-doc/create", arapController_1.createPartnerDoc);
router.put("/partner-doc/cancel/:id", arapController_1.cancelPartnerDoc);
// ຮັບ / ຈ່າຍຊຳລະ (ຕັດໜີ້ຫຼາຍໃບໄດ້) — ເງິນເຂົ້າ/ອອກ ບັນຊີເງິນຄັງ
router.post("/partner-payment/fetch", arapController_1.getPartnerPayments);
router.post("/partner-payment/create", arapController_1.createPartnerPayment);
router.put("/partner-payment/cancel/:id", arapController_1.cancelPartnerPayment);
// ========= ງົບປະມານລາຍຈ່າຍ (ຕາມໝວດລາຍຈ່າຍ ຕໍ່ປີການເງິນ) — ຍອດໃຊ້ຈິງຄິດຈາກລາຍຈ່າຍ; /check ໃຫ້ຟອມລາຍຈ່າຍເຕືອນເກີນງົບ
router.post("/budget/fetch", budgetController_1.getBudgets);
router.post("/budget/expenses", budgetController_1.getBudgetExpenses);
router.post("/budget/check", budgetController_1.checkBudget);
router.post("/budget/create", budgetController_1.createBudget);
router.put("/budget/:id", budgetController_1.updateBudget);
router.delete("/budget/:id", budgetController_1.deleteBudget);
// ========= ຂໍ້ມູນພື້ນຖານ (HR): ແຂວງ/ເມືອງ, ພະແນກ + ຕຳແໜ່ງ, ພະນັກງານ + ເອກະສານ — ການແກ້ໄຂກວດສິດຂອງຜູ້ໃຊ້
router.get("/address/province", departmentController_1.getProvinces);
router.get("/department/fetch", departmentController_1.getDepartments);
router.get("/department/option", departmentController_1.getDepartmentOption);
router.post("/department/create", (0, permission_1.requirePermission)("creates"), departmentController_1.createDepartment);
router.put("/department/:id", (0, permission_1.requirePermission)("updates"), departmentController_1.updateDepartment);
router.delete("/department/:id", (0, permission_1.requirePermission)("deletes"), departmentController_1.deleteDepartment);
router.get("/employee/fetch", employeeController_1.getEmployees);
router.get("/employee/option", employeeController_1.getEmployeeOption);
// ຂໍ້ມູນຂອງຕົນເອງ (app ມືຖືຂອງພະນັກງານ — ບັນຊີຕ້ອງຜູກກັບພະນັກງານ)
router.get("/employee/me", employeeController_1.getMyEmployee);
router.put("/employee/me/profile", hrHelpers_1.profileUpload, employeeController_1.updateMyProfilePhoto);
router.get("/employee/me/history", historyController_1.getMyWorkHistory);
router.get("/employee/me/colleagues", teamController_1.getMyColleagues);
// ແຜນວຽກສ່ວນຕົວຂອງພະນັກງານ (app) — ຕາຕະລາງດຽວກັບປະຕິທິນແຜນວຽກຂອງເວັບ
router.get("/employee/me/workplan", myWorkPlanController_1.getMyWorkPlans);
router.post("/employee/me/workplan", myWorkPlanController_1.createMyWorkPlan);
router.get("/employee/me/workplan/:id", myWorkPlanController_1.getMyWorkPlan);
router.put("/employee/me/workplan/:id", myWorkPlanController_1.updateMyWorkPlan);
router.post("/employee/me/workplan/:id/progress", myWorkPlanController_1.addMyWorkPlanProgress);
router.delete("/employee/me/workplan/:id", myWorkPlanController_1.deleteMyWorkPlan);
router.post("/employee/create", (0, permission_1.requirePermission)("creates"), hrHelpers_1.profileUpload, employeeController_1.createEmployee);
// ເອກະສານ: POST :id = ພະນັກງານ, GET/DELETE :id = ເອກະສານ — ໄຟລ໌ບໍ່ມີ URL ສາທາລະນະ ດາວໂຫຼດຜ່ານນີ້ເທົ່ານັ້ນ
router.post("/employee/document/:id", (0, permission_1.requirePermission)("updates"), hrHelpers_1.documentUpload, employeeController_1.uploadEmployeeDocuments);
router.get("/employee/document/download/:id", employeeController_1.downloadEmployeeDocument);
router.delete("/employee/document/:id", (0, permission_1.requirePermission)("updates"), employeeController_1.deleteEmployeeDocument);
// ຕັ້ງລະຫັດຜ່ານ app ຂອງພະນັກງານຄືນເປັນຄ່າເລີ່ມຕົ້ນ (ກ່ອນ /employee/:id)
router.put("/employee/app-password/:id", (0, permission_1.requirePermission)("updates"), employeeController_1.resetAppPassword);
router.put("/employee/:id", (0, permission_1.requirePermission)("updates"), hrHelpers_1.profileUpload, employeeController_1.updateEmployee);
router.delete("/employee/:id", (0, permission_1.requirePermission)("deletes"), employeeController_1.deleteEmployee);
// ຂໍ້ມູນບໍລິສັດ (ແຖວດຽວ) — ພິກັດ + ໄລຍະສະແກນ, ເວລາເຂົ້າ-ອອກວຽກ, ວັນພັກ
router.get("/company", companyController_1.getCompany);
router.put("/company", (0, permission_1.requirePermission)("updates"), hrHelpers_1.companyLogoUpload, companyController_1.saveCompany);
// ຮູບເສື້ອເຄື່ອງແບບ 1 ໂປໂລບໍລິສັດ, 2 ເສື້ອເຊີດ, 3 ເສື້ອທຳມະດາ
router.put("/company/uniform/:type", (0, permission_1.requirePermission)("updates"), hrHelpers_1.uniformPhotoUpload, companyController_1.saveUniformPhoto);
router.delete("/company/uniform/:type", (0, permission_1.requirePermission)("updates"), companyController_1.removeUniformPhoto);
// QR ສະແກນເຂົ້າ-ອອກວຽກ (HR) — ລະຫັດລັບຂອງ QR ບໍ່ອອກທາງ GET /company
router.get("/company/scan-qr", (0, permission_1.requirePermission)("updates"), companyController_1.getScanQr);
router.put("/company/scan-qr", (0, permission_1.requirePermission)("updates"), companyController_1.saveScanQr);
// ລິ້ງສັ້ນ Google Maps → ລິ້ງເຕັມ (ມີພິກັດ) ສຳລັບຊ່ອງວາງພິກັດໃນ modal ທີ່ຕັ້ງບໍລິສັດ
router.post("/company/map-link", (0, permission_1.requirePermission)("updates"), companyController_1.resolveMapLink);
// ອັບເດດແອັບພະນັກງານ (Android) — HR ອັບໂຫຼດ APK, ແອັບດາວໂຫຼດຈາກ /image/app/…
router.get("/app-release/fetch", appReleaseController_1.getAppReleases);
router.post("/app-release/create", (0, permission_1.requirePermission)("creates"), appReleaseController_1.apkUpload, appReleaseController_1.createAppRelease);
router.delete("/app-release/:id", (0, permission_1.requirePermission)("deletes"), appReleaseController_1.deleteAppRelease);
// ========= ການເຂົ້າ-ອອກວຽກ — /scan, /me ສຳລັບ app ມືຖືຂອງພະນັກງານ (ບັນຊີຕ້ອງຜູກກັບພະນັກງານ); ອື່ນໆ ສຳລັບ HR
router.post("/attendance/scan", attendanceController_1.scanAttendance);
router.get("/attendance/me", attendanceController_1.getMyAttendance);
router.post("/attendance/daily", attendanceController_1.getDailyAttendance);
router.post("/attendance/monthly", attendanceController_1.getMonthlyAttendance);
router.post("/attendance/records", attendanceController_1.getEmployeeAttendance);
router.post("/attendance/save", (0, permission_1.requirePermission)("updates"), attendanceController_1.saveAttendance);
router.delete("/attendance/:id", (0, permission_1.requirePermission)("deletes"), attendanceController_1.deleteAttendance);
// ວັນພັກລັດຖະການ (ນອກຈາກວັນພັກປະຈຳອາທິດ) — ບໍ່ນັບເປັນມື້ເຮັດວຽກ
// ວັນພັກຂອງປີ + ຈຳນວນວັນພັກແຕ່ລະປີ ສຳລັບ app ມືຖື
router.get("/holiday/me", attendanceController_1.getMyHolidays);
router.get("/holiday/fetch", attendanceController_1.getHolidays);
router.post("/holiday/create", (0, permission_1.requirePermission)("creates"), attendanceController_1.createHoliday);
router.delete("/holiday/:id", (0, permission_1.requirePermission)("deletes"), attendanceController_1.deleteHoliday);
// ການເຮັດວຽກລ່ວງເວລາ (OT) — HR ບັນທຶກ; ເງິນເດືອນລວມໃຫ້ອັດຕະໂນມັດ
// OT ຂອງຕົນເອງ (app ມືຖື)
router.get("/overtime/me", overtimeController_1.getMyOvertime);
router.post("/overtime/fetch", (0, permission_1.requirePermission)("updates"), overtimeController_1.getOvertimes);
router.post("/overtime/create", (0, permission_1.requirePermission)("creates"), overtimeController_1.createOvertime);
router.put("/overtime/:id", (0, permission_1.requirePermission)("updates"), overtimeController_1.updateOvertime);
router.delete("/overtime/:id", (0, permission_1.requirePermission)("deletes"), overtimeController_1.deleteOvertime);
// ========= ວັນເກີດ (app ມືຖື) — ເພື່ອນທີ່ມີວັນເກີດມື້ນີ້, ສົ່ງຄຳອວຍພອນ, ຄຳອວຍພອນທີ່ໄດ້ຮັບ
router.get("/birthday/me", birthdayController_1.getMyBirthdays);
router.post("/birthday/me/wish", birthdayController_1.sendBirthdayWish);
router.get("/birthday/me/wishes", birthdayController_1.getMyBirthdayWishes);
router.post("/birthday/me/wishes/:id/reply", birthdayController_1.replyBirthdayWish);
router.get("/birthday/me/replies", birthdayController_1.getMyBirthdayReplies);
router.get("/birthday/me/wall", birthdayController_1.getBirthdayWall);
// ========= ແຈ້ງເຕືອນ — /me ສຳລັບ app ມືຖື (ກະດິ່ງ); HR ແຈ້ງການໃຫ້ພະນັກງານທຸກຄົນ
router.get("/notification/me", notificationController_1.getMyNotifications);
router.get("/notification/me/stream", notificationController_1.streamMyNotifications);
router.put("/notification/me/read", notificationController_1.readAllMyNotifications);
router.put("/notification/me/read/:id", notificationController_1.readMyNotification);
// ເຄື່ອງຮັບແຈ້ງເຕືອນເດັ້ງຂຶ້ນຈໍ (Firebase) ຂອງ app ພະນັກງານ
router.post("/app/device-token", notificationController_1.registerDeviceToken);
router.post("/notification/announce", (0, permission_1.requirePermission)("creates"), notificationController_1.announce);
// ========= ຄຳຂໍລາພັກ — /me ສຳລັບ app ມືຖືຂອງພະນັກງານ; HR (ຕ້ອງມີສິດແກ້ໄຂ ທັງເບິ່ງລາຍການ) ອະນຸມັດ = ບັນທຶກລາພັກລົງການເຂົ້າວຽກ
router.get("/leave/me", leaveController_1.getMyLeaves);
router.post("/leave/me", leaveController_1.createMyLeave);
router.put("/leave/me/cancel/:id", leaveController_1.cancelMyLeave);
router.post("/leave/fetch", (0, permission_1.requirePermission)("updates"), leaveController_1.getLeaves);
router.post("/leave/balance", (0, permission_1.requirePermission)("updates"), leaveController_1.getLeaveBalance);
router.put("/leave/approve/:id", (0, permission_1.requirePermission)("updates"), leaveController_1.approveLeave);
router.put("/leave/reject/:id", (0, permission_1.requirePermission)("updates"), leaveController_1.rejectLeave);
// ປະເພດການລາພັກ (HR) — ຊື່, ໄດ້/ບໍ່ໄດ້ເງິນເດືອນ, ຂີດຈຳກັດມື້ຕໍ່ປີ / ຕໍ່ຄັ້ງ
router.get("/leave-type/fetch", leaveTypeController_1.getLeaveTypes);
router.post("/leave-type/create", (0, permission_1.requirePermission)("creates"), leaveTypeController_1.createLeaveType);
router.put("/leave-type/:id", (0, permission_1.requirePermission)("updates"), leaveTypeController_1.updateLeaveType);
router.delete("/leave-type/:id", (0, permission_1.requirePermission)("deletes"), leaveTypeController_1.deleteLeaveType);
// ========= ແຈ້ງລືມສະແກນ / ຂໍແກ້ເວລາ — /me ສຳລັບ app ມືຖື; HR ອະນຸມັດ = ບັນທຶກເວລາລົງການເຂົ້າວຽກ
router.get("/correction/me", correctionController_1.getMyCorrections);
router.post("/correction/me", correctionController_1.createMyCorrection);
router.put("/correction/me/cancel/:id", correctionController_1.cancelMyCorrection);
router.post("/correction/fetch", (0, permission_1.requirePermission)("updates"), correctionController_1.getCorrections);
router.put("/correction/approve/:id", (0, permission_1.requirePermission)("updates"), correctionController_1.approveCorrection);
router.put("/correction/reject/:id", (0, permission_1.requirePermission)("updates"), correctionController_1.rejectCorrection);
// ========= ເງິນເດືອນ — /setting ແລະ /line/:id ກ່ອນ /:id; ຈ່າຍ = ເງິນອອກຈາກບັນຊີເງິນຄັງ + ລົງບັນຊີຄູ່
router.get("/payroll/setting", payrollController_1.getPayrollSetting);
router.put("/payroll/setting", (0, permission_1.requirePermission)("updates"), payrollController_1.savePayrollSetting);
router.post("/payroll/fetch", payrollController_1.getPayrolls);
router.post("/payroll/create", (0, permission_1.requirePermission)("creates"), payrollController_1.createPayroll);
router.put("/payroll/recalc/:id", (0, permission_1.requirePermission)("updates"), payrollController_1.recalcPayroll);
router.post("/payroll/line/preview/:id", payrollController_1.previewPayrollLine);
router.put("/payroll/line/:id", (0, permission_1.requirePermission)("updates"), payrollController_1.updatePayrollLine);
router.delete("/payroll/line/:id", (0, permission_1.requirePermission)("deletes"), payrollController_1.deletePayrollLine);
router.put("/payroll/pay/:id", (0, permission_1.requirePermission)("updates"), payrollController_1.payPayroll);
router.put("/payroll/unpay/:id", (0, permission_1.requirePermission)("updates"), payrollController_1.unpayPayroll);
// ສະລິບເງິນເດືອນຂອງຕົນເອງ (app ມືຖື) — ກ່ອນ /payroll/:id
router.get("/payroll/me", payrollController_1.getMyPayslips);
// ກວດເງິນເດືອນຫຼວງໜ້າ (ເດືອນທີ່ຍັງບໍ່ຈ່າຍ) — ຄິດຈາກການເຂົ້າວຽກເຖິງມື້ນີ້ + ເງິນເພີ່ມ/ຫັກໃນໃບຮ່າງ
router.get("/payroll/me/preview", payrollController_1.getMyPayrollPreview);
router.get("/payroll/:id", payrollController_1.getPayroll);
router.delete("/payroll/:id", (0, permission_1.requirePermission)("deletes"), payrollController_1.deletePayroll);
exports.default = router;
