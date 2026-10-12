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
  getEmployees, getEmployeeOption, getMyEmployee, updateMyProfilePhoto, createEmployee, updateEmployee, deleteEmployee,
  uploadEmployeeDocuments, downloadEmployeeDocument, deleteEmployeeDocument, resetAppPassword,
} from "../controllers/hr/employeeController";
import { getCompany, saveCompany, getScanQr, saveScanQr, resolveMapLink } from "../controllers/hr/companyController";
import { appLogin, changeAppPassword, requestAppOtp, verifyAppOtp } from "../controllers/hr/appAuthController";
import {
  scanAttendance, getMyAttendance, getDailyAttendance, getMonthlyAttendance, getEmployeeAttendance,
  saveAttendance, deleteAttendance, getHolidays, getMyHolidays, createHoliday, deleteHoliday,
} from "../controllers/hr/attendanceController";
import {
  getPayrollSetting, savePayrollSetting, getPayrolls, getPayroll, getMyPayslips, getMyPayrollPreview, createPayroll, recalcPayroll,
  previewPayrollLine, updatePayrollLine, deletePayrollLine, deletePayroll, payPayroll, unpayPayroll,
} from "../controllers/hr/payrollController";
import {
  getMyLeaves, createMyLeave, cancelMyLeave, getLeaves, approveLeave, rejectLeave,
} from "../controllers/hr/leaveController";
import { createOvertime, deleteOvertime, getMyOvertime, getOvertimes, updateOvertime } from "../controllers/hr/overtimeController";
import { getMyWorkHistory } from "../controllers/hr/historyController";
import { getMyColleagues } from "../controllers/hr/teamController";
import {
  approveCorrection, cancelMyCorrection, createMyCorrection, getCorrections, getMyCorrections, rejectCorrection,
} from "../controllers/hr/correctionController";
import { companyLogoUpload, documentUpload, profileUpload } from "../controllers/hr/hrHelpers";
import { getMyBirthdayReplies, getMyBirthdays, getMyBirthdayWishes, replyBirthdayWish, sendBirthdayWish } from "../controllers/hr/birthdayController";
import { announce, getMyNotifications, readAllMyNotifications, readMyNotification, streamMyNotifications } from "../controllers/hr/notificationController";

const router = Router();

// ================= public — ທຸກ route ທີ່ຢູ່ເທິງ router.use(verifyToken) ບໍ່ຕ້ອງ login
router.post("/user/login", login);
// app ພະນັກງານ — ເຂົ້າດ້ວຍເບີໂທ (20XXXXXXXX) + ລະຫັດຜ່ານ; token ໃຊ້ໄດ້ສະເພາະ route ຂໍ້ມູນຂອງຕົນເອງ (/…/me, /attendance/scan, /app/…)
router.post("/app/login", appLogin);
// ລືມລະຫັດຜ່ານ — OTP ທາງ SMS ແລ້ວອອກລະຫັດຜ່ານໃໝ່
router.post("/app/otp/request", requestAppOtp);
router.post("/app/otp/verify", verifyAppOtp);
router.get("/user/type", getTypeUser);
router.get("/currency", getcurrency);

router.use(verifyToken);

router.put("/app/password", changeAppPassword);
// ຂໍ້ມູນບໍລິສັດສຳລັບ app (token ພະນັກງານເຂົ້າ /company ບໍ່ໄດ້ — ໃຊ້ຂໍ້ມູນດຽວກັນ, ບໍ່ມີລະຫັດ QR)
router.get("/app/company", getCompany);

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
// ຂໍ້ມູນຂອງຕົນເອງ (app ມືຖືຂອງພະນັກງານ — ບັນຊີຕ້ອງຜູກກັບພະນັກງານ)
router.get("/employee/me", getMyEmployee);
router.put("/employee/me/profile", profileUpload, updateMyProfilePhoto);
router.get("/employee/me/history", getMyWorkHistory);
router.get("/employee/me/colleagues", getMyColleagues);
router.post("/employee/create", requirePermission("creates"), profileUpload, createEmployee);
// ເອກະສານ: POST :id = ພະນັກງານ, GET/DELETE :id = ເອກະສານ — ໄຟລ໌ບໍ່ມີ URL ສາທາລະນະ ດາວໂຫຼດຜ່ານນີ້ເທົ່ານັ້ນ
router.post("/employee/document/:id", requirePermission("updates"), documentUpload, uploadEmployeeDocuments);
router.get("/employee/document/download/:id", downloadEmployeeDocument);
router.delete("/employee/document/:id", requirePermission("updates"), deleteEmployeeDocument);
// ຕັ້ງລະຫັດຜ່ານ app ຂອງພະນັກງານຄືນເປັນຄ່າເລີ່ມຕົ້ນ (ກ່ອນ /employee/:id)
router.put("/employee/app-password/:id", requirePermission("updates"), resetAppPassword);
router.put("/employee/:id", requirePermission("updates"), profileUpload, updateEmployee);
router.delete("/employee/:id", requirePermission("deletes"), deleteEmployee);
// ຂໍ້ມູນບໍລິສັດ (ແຖວດຽວ) — ພິກັດ + ໄລຍະສະແກນ, ເວລາເຂົ້າ-ອອກວຽກ, ວັນພັກ
router.get("/company", getCompany);
router.put("/company", requirePermission("updates"), companyLogoUpload, saveCompany);
// QR ສະແກນເຂົ້າ-ອອກວຽກ (HR) — ລະຫັດລັບຂອງ QR ບໍ່ອອກທາງ GET /company
router.get("/company/scan-qr", requirePermission("updates"), getScanQr);
router.put("/company/scan-qr", requirePermission("updates"), saveScanQr);
// ລິ້ງສັ້ນ Google Maps → ລິ້ງເຕັມ (ມີພິກັດ) ສຳລັບຊ່ອງວາງພິກັດໃນ modal ທີ່ຕັ້ງບໍລິສັດ
router.post("/company/map-link", requirePermission("updates"), resolveMapLink);
// ========= ການເຂົ້າ-ອອກວຽກ — /scan, /me ສຳລັບ app ມືຖືຂອງພະນັກງານ (ບັນຊີຕ້ອງຜູກກັບພະນັກງານ); ອື່ນໆ ສຳລັບ HR
router.post("/attendance/scan", scanAttendance);
router.get("/attendance/me", getMyAttendance);
router.post("/attendance/daily", getDailyAttendance);
router.post("/attendance/monthly", getMonthlyAttendance);
router.post("/attendance/records", getEmployeeAttendance);
router.post("/attendance/save", requirePermission("updates"), saveAttendance);
router.delete("/attendance/:id", requirePermission("deletes"), deleteAttendance);
// ວັນພັກລັດຖະການ (ນອກຈາກວັນພັກປະຈຳອາທິດ) — ບໍ່ນັບເປັນມື້ເຮັດວຽກ
// ວັນພັກຂອງປີ + ຈຳນວນວັນພັກແຕ່ລະປີ ສຳລັບ app ມືຖື
router.get("/holiday/me", getMyHolidays);
router.get("/holiday/fetch", getHolidays);
router.post("/holiday/create", requirePermission("creates"), createHoliday);
router.delete("/holiday/:id", requirePermission("deletes"), deleteHoliday);
// ການເຮັດວຽກລ່ວງເວລາ (OT) — HR ບັນທຶກ; ເງິນເດືອນລວມໃຫ້ອັດຕະໂນມັດ
// OT ຂອງຕົນເອງ (app ມືຖື)
router.get("/overtime/me", getMyOvertime);
router.post("/overtime/fetch", requirePermission("updates"), getOvertimes);
router.post("/overtime/create", requirePermission("creates"), createOvertime);
router.put("/overtime/:id", requirePermission("updates"), updateOvertime);
router.delete("/overtime/:id", requirePermission("deletes"), deleteOvertime);
// ========= ວັນເກີດ (app ມືຖື) — ເພື່ອນທີ່ມີວັນເກີດມື້ນີ້, ສົ່ງຄຳອວຍພອນ, ຄຳອວຍພອນທີ່ໄດ້ຮັບ
router.get("/birthday/me", getMyBirthdays);
router.post("/birthday/me/wish", sendBirthdayWish);
router.get("/birthday/me/wishes", getMyBirthdayWishes);
router.post("/birthday/me/wishes/:id/reply", replyBirthdayWish);
router.get("/birthday/me/replies", getMyBirthdayReplies);
// ========= ແຈ້ງເຕືອນ — /me ສຳລັບ app ມືຖື (ກະດິ່ງ); HR ແຈ້ງການໃຫ້ພະນັກງານທຸກຄົນ
router.get("/notification/me", getMyNotifications);
router.get("/notification/me/stream", streamMyNotifications);
router.put("/notification/me/read", readAllMyNotifications);
router.put("/notification/me/read/:id", readMyNotification);
router.post("/notification/announce", requirePermission("creates"), announce);
// ========= ຄຳຂໍລາພັກ — /me ສຳລັບ app ມືຖືຂອງພະນັກງານ; HR (ຕ້ອງມີສິດແກ້ໄຂ ທັງເບິ່ງລາຍການ) ອະນຸມັດ = ບັນທຶກລາພັກລົງການເຂົ້າວຽກ
router.get("/leave/me", getMyLeaves);
router.post("/leave/me", createMyLeave);
router.put("/leave/me/cancel/:id", cancelMyLeave);
router.post("/leave/fetch", requirePermission("updates"), getLeaves);
router.put("/leave/approve/:id", requirePermission("updates"), approveLeave);
router.put("/leave/reject/:id", requirePermission("updates"), rejectLeave);
// ========= ແຈ້ງລືມສະແກນ / ຂໍແກ້ເວລາ — /me ສຳລັບ app ມືຖື; HR ອະນຸມັດ = ບັນທຶກເວລາລົງການເຂົ້າວຽກ
router.get("/correction/me", getMyCorrections);
router.post("/correction/me", createMyCorrection);
router.put("/correction/me/cancel/:id", cancelMyCorrection);
router.post("/correction/fetch", requirePermission("updates"), getCorrections);
router.put("/correction/approve/:id", requirePermission("updates"), approveCorrection);
router.put("/correction/reject/:id", requirePermission("updates"), rejectCorrection);
// ========= ເງິນເດືອນ — /setting ແລະ /line/:id ກ່ອນ /:id; ຈ່າຍ = ເງິນອອກຈາກບັນຊີເງິນຄັງ + ລົງບັນຊີຄູ່
router.get("/payroll/setting", getPayrollSetting);
router.put("/payroll/setting", requirePermission("updates"), savePayrollSetting);
router.post("/payroll/fetch", getPayrolls);
router.post("/payroll/create", requirePermission("creates"), createPayroll);
router.put("/payroll/recalc/:id", requirePermission("updates"), recalcPayroll);
router.post("/payroll/line/preview/:id", previewPayrollLine);
router.put("/payroll/line/:id", requirePermission("updates"), updatePayrollLine);
router.delete("/payroll/line/:id", requirePermission("deletes"), deletePayrollLine);
router.put("/payroll/pay/:id", requirePermission("updates"), payPayroll);
router.put("/payroll/unpay/:id", requirePermission("updates"), unpayPayroll);
// ສະລິບເງິນເດືອນຂອງຕົນເອງ (app ມືຖື) — ກ່ອນ /payroll/:id
router.get("/payroll/me", getMyPayslips);
// ກວດເງິນເດືອນຫຼວງໜ້າ (ເດືອນທີ່ຍັງບໍ່ຈ່າຍ) — ຄິດຈາກການເຂົ້າວຽກເຖິງມື້ນີ້ + ເງິນເພີ່ມ/ຫັກໃນໃບຮ່າງ
router.get("/payroll/me/preview", getMyPayrollPreview);
router.get("/payroll/:id", getPayroll);
router.delete("/payroll/:id", requirePermission("deletes"), deletePayroll);

export default router;
