import { Router } from "express";
import { createUpload, createUploadFile } from "../utils/uploadFile";
import { verifyToken, login, checkSession } from "../middleware/auth";
import { requirePermission } from "../middleware/permission";
import { hideSalaryFields, requireSalaryAccess } from "../middleware/salaryAccess";
import { AUDIT } from "../middleware/auditRoutes";
import { createRecurringFromExpense, deleteRecurringExpense, getRecurringExpenses, updateRecurringExpense } from "../controllers/bansi/recurringExpenseController";
import { requireMenu } from "../middleware/menuAccess";
import {
  cancelLoanPayment, createLoan, deleteLoan, getAccrualRuns, getLoan, getLoans, payLoan, previewAccrual, previewLoan, runAccrual, undoAccrual, updateLoan,
} from "../controllers/bansi/loanController";
import {
  cancelApplication, routeApplication, createApplication, createCollateral, createCustomer, createProduct, decideApplication, deleteApplication, deleteCollateral,
  deleteCustomer, disburseApplication, getApplication, getApplications, getContract, getContracts, getCustomer, getCustomers, getProducts,
  previewApplication, saveClassRules, undoDisbursement, updateApplication, updateCollateral, updateCustomer, updateProduct,
} from "../controllers/credit/creditController";
import { getRouteOptions } from "../controllers/credit/creditRouting";
import {
  collectContract, createCollection, deleteCollection, getCollections, getDashboard, quoteContract, undoWaiver, waivePenalty,
} from "../controllers/credit/collectionController";
import {
  getClassification, postClassification, recoverContract, restructureContract, undoClassification, undoRestructure, undoWriteOff, writeOffContract,
} from "../controllers/credit/riskController";
import { createNotice, deleteDocument, downloadDocument, getDocuments, uploadDocuments } from "../controllers/credit/creditDocController";
import { getCreditReport } from "../controllers/credit/creditReportController";
import { getAuditLogs } from "../controllers/auditController";

// ເງິນເດືອນ / ເງິນເບີກ / ເງິນ OT ທີ່ຄິດຈາກເງິນເດືອນ — ຊ່ອນສຳລັບຜູ້ທີ່ບໍ່ມີສິດເມນູເງິນເດືອນ (middleware/salaryAccess)
const hideEmployeeSalary = hideSalaryFields("basic_salary");
const hideSummaryMoney = hideSalaryFields("advance_balance", "last_payroll");
const hideOvertimeEstimate = hideSalaryFields("estimate");
import { getUsers, createUser, getUserById, updateUser, deleteUser, updatePassword, getTypeUser } from "../controllers/userController";
import { getcurrency, updateCurrency, updateCurrencyMt } from "../controllers/currencyController";
import { createBank, updateBank, deleteBank, fetchBank, getBankOption } from "../controllers/bankController";
import { USER_ADMIN_MENU_PATH, getAllMainMenus, getMainMenus } from "../controllers/menuController";
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
    getTreasurtypeone,
    sortTreasuryAccounts,
} from "../controllers/bansi/treasuryAcountController";
import { createTransferMoney, getTransferMoney, getAccountStatement } from "../controllers/bansi/transferMoneyControlle";
import { getTypeInexp, getTypeInexpOption, createTypeInexp, updateTypeInexp, addSubCategory } from "../controllers/bansi/typeinexpController";
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
import { getAccountSetting, updateAccountSetting } from "../controllers/bansi/accountSettingController";
import {
  cancelWithholding, createWithholding, getProfitTax, getVatReport, getWithholdings, postProfitTax,
} from "../controllers/bansi/taxReportController";
import { cancelTaxPayment, createTaxPayment, getTaxOutstanding, getTaxPayments } from "../controllers/bansi/taxPaymentController";
import { postFxReval, previewFxReval, undoFxReval } from "../controllers/bansi/fxRevalController";
import {
  closePeriod, deleteBankRec, getBankRecAccounts, getBankRecHistory, getPeriodCloseStatus, openBankRec, reopenPeriod, saveBankRec,
} from "../controllers/bansi/closingController";
import {
  createFixedAsset, deleteFixedAsset, disposeFixedAsset, getAssetSchedule, getDepreciationRuns, getFixedAssets, previewDepreciation,
  restoreFixedAsset, runDepreciation, undoDepreciation, updateFixedAsset,
} from "../controllers/bansi/fixedAssetController";
import {
  getChartAccounts, getChartAccountOption, createChartAccount, updateChartAccount, deleteChartAccount,
  getGlMappings, saveGlMappings, getGlStatus, rebuildGl,
} from "../controllers/bansi/chartAccountController";
import {
  getJournalEntries, createJournalEntry, reverseJournalEntry, getGlBalances, getGlLedger,
} from "../controllers/bansi/journalController";
import {
  getPartners, createPartner, updatePartner, getPartnerDocs, createPartnerDoc,
  updatePartnerDoc, cancelPartnerDoc,
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
  uploadEmployeeDocuments, updateEmployeeDocument, downloadEmployeeDocument, deleteEmployeeDocument, resetAppPassword,
} from "../controllers/hr/employeeController";
import { getCompany, saveCompany, getScanQr, saveScanQr, resolveMapLink, saveUniformPhoto, removeUniformPhoto } from "../controllers/hr/companyController";
import { appLogin, changeAppPassword, requestAppOtp, verifyAppOtp } from "../controllers/hr/appAuthController";
import { aiChat, aiSpeak, aiTranscribe, voiceQuestionUpload } from "../controllers/hr/aiController";
import { getAttendanceVoice } from "../controllers/hr/voiceController";
import { apkUpload, createAppRelease, deleteAppRelease, getAppReleases, getLatestAppRelease, requireReleaseKey } from "../controllers/hr/appReleaseController";
import { addMyWorkPlanProgress, createMyWorkPlan, deleteMyWorkPlan, getMyWorkPlan, getMyWorkPlans, updateMyWorkPlan } from "../controllers/hr/myWorkPlanController";
import {
  createMyMoneyAccount, createMyMoneyCategory, createMyMoneyEntry, deleteMyMoneyAccount, deleteMyMoneyCategory, deleteMyMoneyEntry,
  getMyMoneyAccounts, getMyMoneyBanks, getMyMoneyCategories, getMyMoneyEntries, getMyMoneyEntryPhoto, getMyMoneySummary,
  updateMyMoneyAccount, updateMyMoneyCategory, updateMyMoneyEntry,
} from "../controllers/hr/myMoneyController";
import {
  createMyNote, createMyNoteFolder, deleteMyNote, deleteMyNoteFolder, getMyNotes, renameMyNoteFolder, updateMyNote,
} from "../controllers/hr/noteController";
import {
  scanAttendance, getMyAttendance, getDailyAttendance, getMonthlyAttendance, getEmployeeAttendance,
  saveAttendance, deleteAttendance, getHolidays, getMyHolidays, createHoliday, deleteHoliday,
} from "../controllers/hr/attendanceController";
import {
  getPayrollSetting, savePayrollSetting, getPayrolls, getPayroll, getMyPayslips, getMyPayrollPreview, createPayroll, recalcPayroll,
  previewPayrollLine, updatePayrollLine, deletePayrollLine, deletePayroll, payPayroll, unpayPayroll, getPayrollExpenseDefault, getPayrollTaxReport } from "../controllers/hr/payrollController";
import {
  getMyLeaves, createMyLeave, cancelMyLeave, getLeaves, getLeaveBalance, approveLeave, rejectLeave, revokeLeave, getLeaveQuota, setLeaveQuota,
  getMyLeaveFile, getMyLeaveFileLink, openLeaveFile, downloadLeaveFile,
} from "../controllers/hr/leaveController";
import { getLeaveTypes, createLeaveType, updateLeaveType, deleteLeaveType } from "../controllers/hr/leaveTypeController";
import { createOvertime, deleteOvertime, getMyOvertime, getOvertimes, updateOvertime } from "../controllers/hr/overtimeController";
import { getMyWorkHistory } from "../controllers/hr/historyController";
import { getMyColleagues } from "../controllers/hr/teamController";
import { autoAssignBosses, getMyOrg, getOrgChart, setBoss } from "../controllers/hr/orgController";
import { createPosition, deletePosition, getPositionOption, getPositions, updatePosition } from "../controllers/hr/positionController";
import { createHrOption, deleteHrOption, getHrOptionList, getHrOptions, updateHrOption } from "../controllers/hr/hrOptionController";
import { deleteSkill, deleteSkillType, getSkills, saveSkill, saveSkillType, setEmployeeSkills } from "../controllers/hr/skillController";
import { createResume, deleteResume, downloadResumeFile, updateResume } from "../controllers/hr/resumeController";
import {
  approveCorrection, cancelMyCorrection, createMyCorrection, getCorrections, getMyCorrections, rejectCorrection,
} from "../controllers/hr/correctionController";
import { companyDocUpload, companyLogoUpload, creditDocUpload, documentUpload, leaveFileUpload, profileUpload, receiptUpload, taskFileUpload, uniformPhotoUpload } from "../controllers/hr/hrHelpers";
import {
  approveAdvance, cancelAdvance, cancelMyAdvance, createAdvance, createMyAdvance, deleteAdvanceRepayment, getAdvance, getAdvances, getMyAdvances,
  payAdvance, rejectAdvance, repayAdvance, unpayAdvance, updateAdvanceSchedule,
} from "../controllers/hr/advanceController";
import { decideMyApproval, getMyApprovalList, getMyApprovals } from "../controllers/hr/approvalController";
import { getEmployeeSummary, getExpiring, getHrPending, getSalaryHistory } from "../controllers/hr/hrSummaryController";
import { createCompanyDocument, deleteCompanyDocument, downloadCompanyDocument, getCompanyDocuments, updateCompanyDocument } from "../controllers/hr/companyDocumentController";
import {
  bulkTasks, createMyTaskComment, createTask, createTaskComment, createTaskProject, deleteMyTaskComment, deleteTaskComment, deleteTaskFile,
  deleteTaskProject, downloadTaskFile, getMyTaskComments, getMyTaskFileLink, getMyTasks, getTask, getTaskProjects, getTasks, openTaskFile,
  toggleTaskStar, updateMyTaskItem, updateMyTaskProgress, updateTask, updateTaskItem, updateTaskProject, updateTaskStatus, uploadTaskFiles,
  getMyAssignedTasks, createMyAssignedTask, updateMyAssignedTaskStatus, deleteMyAssignedTask,
} from "../controllers/hr/taskController";
import { getBirthdayWall, getMyBirthdayReplies, getMyBirthdays, getMyBirthdayWishes, replyBirthdayWish, sendBirthdayWish } from "../controllers/hr/birthdayController";
import { announce, getMyNotifications, readAllMyNotifications, readMyNotification, streamMyNotifications, registerDeviceToken } from "../controllers/hr/notificationController";
import { getMyWeather } from "../controllers/hr/weatherController";

const router = Router();

// ================= public — ທຸກ route ທີ່ຢູ່ເທິງ router.use(verifyToken) ບໍ່ຕ້ອງ login
router.post("/user/login", login);
// app ພະນັກງານ — ເຂົ້າດ້ວຍເບີໂທ (20XXXXXXXX) + ລະຫັດຜ່ານ; token ໃຊ້ໄດ້ສະເພາະ route ຂໍ້ມູນຂອງຕົນເອງ (/…/me, /attendance/scan, /app/…)
router.post("/app/login", appLogin);
// ລືມລະຫັດຜ່ານ — OTP ທາງ SMS ແລ້ວອອກລະຫັດຜ່ານໃໝ່
router.post("/app/otp/request", requestAppOtp);
router.post("/app/otp/verify", verifyAppOtp);
// Mac ທີ່ build ແອັບ ອັບໂຫຼດ APK ເອງຫຼັງ build — ກະແຈ APP_RELEASE_KEY ແທນ login
router.post("/app-release/publish", requireReleaseKey, apkUpload, createAppRelease);
// app ພະນັກງານເປີດເອກະສານຂອງວຽກໃນ browser — ລິ້ງເຊັນຊົ່ວຄາວແທນ login (ອອກໂດຍ GET /task/me/file/:id)
router.get("/task/file/open/:token", openTaskFile);
// ໃບລາທີ່ແນບກັບຄຳຂໍລາພັກ — ລິ້ງເຊັນຊົ່ວຄາວ (ອອກໂດຍ GET /leave/me/file/:id/link)
router.get("/leave/file/open/:token", openLeaveFile);
router.get("/user/type", getTypeUser);
router.get("/currency", getcurrency);

router.use(verifyToken);

// ເວັບ bansi ກວດ token ທຸກເທື່ອທີ່ເປີດເວັບ (ກ່ອນ /user/:id)
router.get("/user/session", checkSession);
router.put("/app/password", changeAppPassword);
// ຂໍ້ມູນບໍລິສັດສຳລັບ app (token ພະນັກງານເຂົ້າ /company ບໍ່ໄດ້ — ໃຊ້ຂໍ້ມູນດຽວກັນ, ບໍ່ມີລະຫັດ QR)
router.get("/app/company", getCompany);
// ລຸ້ນລ່າສຸດຂອງແອັບ Android ທີ່ HR ອັບໂຫຼດ — ແອັບທຽບເລກ build ແລ້ວຂຶ້ນແຖບອັບເດດ
router.get("/app/release", getLatestAppRelease);
// ຜູ້ຊ່ວຍ AI ໃນເມນູແຜນວຽກ (Claude) — ວາງແຜນ, ສະຫຼຸບ, ຖາມ-ຕອບ ກ່ຽວກັບແຜນວຽກຂອງຕົນເອງ
router.post("/app/ai/chat", aiChat);
router.post("/app/ai/speak", aiSpeak);
router.post("/app/ai/transcribe", voiceQuestionUpload, aiTranscribe);
// ສຽງເວົ້າ "ເຂົ້າວຽກຊ້າ / ອອກກ່ອນເວລາ … ນາທີ" (Gemini TTS, ສຽງຕາມເພດ, ເກັບ cache)
router.get("/app/voice/attendance", getAttendanceVoice);

// ================= ເມນູໜ້າ desktop ບັນຊີ (types 2) + ສະຖານະລັອກ — main = ສະເພາະເມນູທີ່ຜູ້ໃຊ້ໄດ້ສິດ (tbl_users.menu_access),
// all = ທຸກເມນູ (ຟອມຜູ້ໃຊ້ຕິກສິດ)
router.get("/menu/main", getMainMenus);
router.get("/menu/all", getAllMainMenus);

// ================= ປະຫວັດການແກ້ໄຂ / ຍົກເລີກ / ລຶບ (ເລື່ອງສຳຄັນ) — ສະເພາະຜູ້ມີສິດເມນູ ຕັ້ງຄ່າຂໍ້ມູນພື້ນຖານ
router.get("/audit/fetch", requireMenu(USER_ADMIN_MENU_PATH, "ທ່ານບໍ່ມີສິດເບິ່ງປະຫວັດການແກ້ໄຂ"), getAuditLogs);

// ================= ສະກຸນເງິນ
router.put("/currency/:id", requirePermission("updates"), updateCurrency);
router.post("/currency/mt", requirePermission("updates"), updateCurrencyMt);

// ========= ບັນຊີຜູ້ໃຊ້ — ສິດກວດຈາກ tbl_users (requirePermission); ປ່ຽນລະຫັດ: ຕົນເອງ (ໃສ່ລະຫັດເກົ່າ) ຫຼື ມີສິດແກ້ໄຂ
router.post("/user/create", requirePermission("creates"), createUser);
router.post("/user/fetch", getUsers);
router.get("/user/:id", getUserById);
router.put("/user/password/:id", AUDIT.userPassword, updatePassword);
router.put("/user/:id", requirePermission("updates"), AUDIT.userUpdate, updateUser);
router.delete("/user/:id", requirePermission("deletes"), AUDIT.userDelete, deleteUser);

// ========= ທະນາຄານ — ໂລໂກ້ field "logo" ຫຼື "logos"
router.post("/bank/create", requirePermission("creates"), createUpload('logo').fields([{ name: "logo", maxCount: 1 }, { name: "logos", maxCount: 1 }]), createBank);
router.put("/bank/:id", requirePermission("updates"), createUpload('logo').fields([{ name: "logo", maxCount: 1 }, { name: "logos", maxCount: 1 }]), updateBank);
router.delete("/bank/:id", requirePermission("deletes"), deleteBank);
router.get("/bank/fetch", fetchBank);
router.get("/bank", getBankOption);

// ========= ໝວດບັນຊີ (bansi type account) routes
router.get("/type-account/fetch", getTypeAcount);
router.get("/type-account/option", getTypeAcountOption);
router.post("/type-account/create", requirePermission("creates"), createTypeAcount);
router.put("/type-account/:id", requirePermission("updates"), updateTypeAcount);
// ========= ປະເພດບັນຊີ (bansi type treasury) routes — fetch ເປັນ POST ເພາະຮັບ filter { typeId, currencyId } ທາງ body
router.post("/type-treasury/fetch", getTypeTreasury);
router.post("/type-treasury/create", requirePermission("creates"), createTypeTreasury);
router.put("/type-treasury/:id", requirePermission("updates"), updateTypeTreasury);
router.delete("/type-treasury/:id", requirePermission("deletes"), deleteTypeTreasury);
router.get("/type-treasury/option", getTypeTreasurOption);
router.post("/type-treasury/option", getTypeTreasurOption);
router.get("/type-treasury/bytype/:id", getTreasurbytype);
// ========= ບັນຊີຄັງ (bansi treasury account) routes
router.post("/treasury-account/fetch", getTreasuryAcount);
router.get("/treasury-account/option", getAcountOption);
router.post("/treasury-account/option", getTreasuryAcountOption);
router.post("/treasury-account/option/except", getAcountOptionExcept);
router.post("/treasury-account/create", requirePermission("creates"), createTreasuryAcount);
router.get("/treasury-account/typeone/:id", getTreasurtypeone);
// ລາກຍ້າຍບັດ — ກ່ອນ /:id ບໍ່ດັ່ງນັ້ນ "sort" ຈະຖືກຈັບເປັນ :id
router.put("/treasury-account/sort", requirePermission("updates"), sortTreasuryAccounts);
router.put("/treasury-account/:id", requirePermission("updates"), updateTreasuryAcount);
// ========= ໂອນເງິນລະຫວ່າງບັນຊີ (bansi transfer money) routes
router.post("/transfer-money/fetch", getTransferMoney);
router.post("/transfer-money/create", requirePermission("creates"), createTransferMoney);
// ປະຫວັດເງິນເຂົ້າ-ອອກ ຂອງບັນຊີດຽວ (ໜ້າປຶ້ມບັນຊີໃຫຍ່)
router.post("/transfer-money/statement", getAccountStatement);
// ========= ປະເພດລາຍຮັບ-ລາຍຈ່າຍ (bansi finance categories) routes — :id ຂອງ fetch/option ແມ່ນ typestatus (1 ລາຍຮັບ, 2 ລາຍຈ່າຍ), ບໍ່ແມ່ນ base64
router.get("/finance-category/fetch/:id", getTypeInexp);
router.get("/finance-category/option/:id", getTypeInexpOption);
router.post("/finance-category/create", requirePermission("creates"), createTypeInexp);
router.put("/finance-category/:id", requirePermission("updates"), updateTypeInexp);
// ຟອມລາຍຮັບ/ລາຍຈ່າຍ ເພີ່ມລາຍການຍ່ອຍໃໝ່ໄດ້ເລີຍ (ບໍ່ຕ້ອງໄປໜ້າຕັ້ງຄ່າ)
router.post("/finance-category/sub/:id", requirePermission("creates", "updates"), addSubCategory);
// ========= ຕັ້ງຄ່າບັນຊີ (bansi settings)
// ປີການເງິນ
router.get("/fiscal-year/fetch", getFiscalYears);
router.get("/fiscal-year/option", getFiscalYearOption);
router.post("/fiscal-year/create", requirePermission("creates"), createFiscalYear);
router.put("/fiscal-year/current/:id", requirePermission("updates"), setCurrentFiscalYear);
router.put("/fiscal-year/close/:id", requirePermission("updates"), AUDIT.fiscalClose, closeFiscalYear);
router.put("/fiscal-year/reopen/:id", requirePermission("updates"), AUDIT.fiscalReopen, reopenFiscalYear);
router.put("/fiscal-year/:id", requirePermission("updates"), AUDIT.fiscalUpdate, updateFiscalYear);
router.delete("/fiscal-year/:id", requirePermission("deletes"), AUDIT.fiscalDelete, deleteFiscalYear);
// ອັດຕາແລກປ່ຽນ (ປະຫວັດ) — ບັນທຶກແລ້ວອັບເດດ tbl_currency.reate ໃຫ້ເອງ
router.post("/exchange-rate/fetch", getExchangeRates);
router.post("/exchange-rate/create", requirePermission("creates"), createExchangeRate);
router.delete("/exchange-rate/:id", requirePermission("deletes"), deleteExchangeRate);
// ຍອດຍົກມາ — body { fiscal_id } / { fiscal_id, items[] }
router.post("/opening-balance/fetch", getOpeningBalances);
router.post("/opening-balance/save", requirePermission("creates", "updates"), saveOpeningBalances);
// ວິທີຊຳລະເງິນ
router.get("/payment-method/fetch", getPaymentMethods);
router.get("/payment-method/option", getPaymentMethodOption);
router.post("/payment-method/create", requirePermission("creates"), createPaymentMethod);
router.put("/payment-method/:id", requirePermission("updates"), updatePaymentMethod);
// ປະເພດປຶ້ມບັນຊີ
router.get("/journal-type/fetch", getJournalTypes);
router.get("/journal-type/option", getJournalTypeOption);
router.post("/journal-type/create", requirePermission("creates"), createJournalType);
router.put("/journal-type/:id", requirePermission("updates"), updateJournalType);
// ເລກທີເອກະສານ — /next/:code ອອກເລກໃໝ່ (code ເປັນ doc_code ທຳມະດາ ບໍ່ແມ່ນ base64)
router.get("/doc-numbering/fetch", getDocNumberings);
router.get("/doc-numbering/option", getDocNumberingOption);
router.post("/doc-numbering/create", requirePermission("creates"), createDocNumbering);
router.post("/doc-numbering/next/:code", requirePermission("creates"), nextDocNumber);
router.put("/doc-numbering/:id", requirePermission("updates"), updateDocNumbering);
// ອາກອນ
router.get("/tax/fetch", getTaxes);
router.get("/tax/option", getTaxOption);
router.post("/tax/create", requirePermission("creates"), createTax);
router.put("/tax/:id", requirePermission("updates"), AUDIT.taxUpdate, updateTax);
// ລາຍງານອາກອນ (ຈາກສະໝຸດບັນຊີ)
router.post("/tax/vat-report", getVatReport);
router.post("/tax/profit-tax", getProfitTax);
router.post("/tax/profit-tax/post", requirePermission("creates", "updates"), postProfitTax);
// ອາກອນຫັກ ນ ທີ່ຈ່າຍ
router.post("/wht/fetch", getWithholdings);
router.post("/wht/create", requirePermission("creates"), createWithholding);
router.put("/wht/cancel/:id", requirePermission("deletes"), cancelWithholding);
// ນຳສົ່ງອາກອນໃຫ້ລັດ (ບັນຊີແບບຄົບຕາມມາດຕະຖານ)
router.post("/tax-payment/outstanding", getTaxOutstanding);
router.post("/tax-payment/fetch", getTaxPayments);
router.post("/tax-payment/create", requirePermission("creates"), createTaxPayment);
router.put("/tax-payment/cancel/:id", requirePermission("deletes"), cancelTaxPayment);
// ປັບມູນຄ່າເງິນຕາຕ່າງປະເທດທ້າຍເດືອນ
router.post("/fx-reval/preview", previewFxReval);
router.post("/fx-reval/post", requirePermission("creates"), postFxReval);
router.delete("/fx-reval/:month", requirePermission("deletes"), undoFxReval);
// ຕັ້ງຄ່າບັນຊີຂອງບໍລິສັດ — ຮູບແບບຕົວເລກ, ເລກອາກອນ, ຜູ້ເຊັນງົບ, ຟັງຊັນທີ່ໃຊ້, ນະໂຍບາຍບັນຊີ
router.get("/account-setting", getAccountSetting);
router.put("/account-setting", requirePermission("updates"), AUDIT.settingUpdate, updateAccountSetting);
// ປິດງວດປະຈຳເດືອນ (lock_date) + ລາຍການກວດ, ກະທົບຍອດທະນາຄານ
router.get("/period-close/status", getPeriodCloseStatus);
router.put("/period-close/close", requirePermission("updates"), AUDIT.periodClose, closePeriod);
router.put("/period-close/reopen", requirePermission("updates"), AUDIT.periodReopen, reopenPeriod);
router.get("/bank-rec/accounts", getBankRecAccounts);
router.post("/bank-rec/history", getBankRecHistory);
router.post("/bank-rec/open", openBankRec);
router.post("/bank-rec/save", requirePermission("creates", "updates"), saveBankRec);
router.delete("/bank-rec/:id", requirePermission("deletes"), deleteBankRec);
// ຊັບສົມບັດຄົງທີ່ — ທະບຽນ, ຄ່າຫຼຸ້ຍຫ້ຽນລາຍເດືອນ, ຈຳໜ່າຍ, ຕາຕະລາງ
// ================= ລະບົບສິນເຊື່ອ (sql/credit_system.sql) — ຜະລິດຕະພັນ, ລູກຄ້າ, ຫຼັກຊັບ, ຄຳຮ້ອງ → ອະນຸມັດ → ປ່ອຍກູ້, ສັນຍາ
router.get("/credit/product", getProducts);
router.post("/credit/product", requirePermission("creates"), createProduct);
router.put("/credit/product/:id", requirePermission("updates"), AUDIT.creditProductUpdate, updateProduct);
router.put("/credit/class-rule", requirePermission("updates"), saveClassRules);
router.get("/credit/customer", getCustomers);
router.get("/credit/customer/:id", getCustomer);
router.post("/credit/customer", requirePermission("creates"), createCustomer);
router.put("/credit/customer/:id", requirePermission("updates"), AUDIT.creditCustomerUpdate, updateCustomer);
router.delete("/credit/customer/:id", requirePermission("deletes"), AUDIT.creditCustomerDelete, deleteCustomer);
router.post("/credit/collateral", requirePermission("creates"), createCollateral);
router.put("/credit/collateral/:id", requirePermission("updates"), updateCollateral);
router.delete("/credit/collateral/:id", requirePermission("deletes"), deleteCollateral);
router.post("/credit/preview", previewApplication);
router.get("/credit/application", getApplications);
router.get("/credit/application/:id", getApplication);
router.post("/credit/application", requirePermission("creates"), createApplication);
router.put("/credit/application/:id", requirePermission("updates"), updateApplication);
router.post("/credit/application/:id/decide", requirePermission("updates"), AUDIT.creditAppDecide, decideApplication);
router.post("/credit/application/:id/cancel", requirePermission("updates"), AUDIT.creditAppCancel, cancelApplication);
// ສົ່ງໃຫ້ຜູ້ພິຈາລະນາ: ທາງເລືອກ (ອັດຕະໂນມັດ / ຄົນທີ່ຕຳແໜ່ງສູງກວ່າ) ແລະ ປ່ຽນ / ສົ່ງຕໍ່
router.get("/credit/route-options", getRouteOptions);
router.post("/credit/application/:id/route", requirePermission("updates"), AUDIT.creditAppRoute, routeApplication);
router.post("/credit/application/:id/disburse", requirePermission("creates"), AUDIT.creditDisburse, disburseApplication);
router.delete("/credit/application/:id", requirePermission("deletes"), AUDIT.creditAppDelete, deleteApplication);
router.get("/credit/contract", getContracts);
router.get("/credit/contract/:id", getContract);
router.post("/credit/contract/:id/undo-disburse", requirePermission("deletes"), AUDIT.creditUndoDisburse, undoDisbursement);
// ຮັບຊຳລະ (ຄ່າປັບ → ດອກເບ້ຍ → ຕົ້ນທຶນ), ຍົກເວັ້ນຄ່າປັບ, ຕິດຕາມໜີ້, ພາບລວມ
router.post("/credit/contract/:id/quote", quoteContract);
router.post("/credit/contract/:id/collect", requirePermission("creates"), AUDIT.creditCollect, collectContract);
router.post("/credit/contract/:id/waive", requirePermission("updates"), AUDIT.creditWaive, waivePenalty);
router.delete("/credit/penalty/:id", requirePermission("deletes"), AUDIT.creditUndoWaiver, undoWaiver);
router.get("/credit/collections", getCollections);
router.post("/credit/collection", requirePermission("creates"), createCollection);
router.delete("/credit/collection/:id", requirePermission("deletes"), deleteCollection);
router.get("/credit/dashboard", getDashboard);
// ໄລຍະ 3: ຈັດຊັ້ນໜີ້ + ເງິນແຮ, ຕັດໜີ້ສູນ / ເກັບຄືນ, ປັບໂຄງສ້າງ, ເອກະສານ, ແຈ້ງເຕືອນ, ລາຍງານ
router.get("/credit/classification", getClassification);
router.post("/credit/classification", requirePermission("creates"), AUDIT.creditClassify, postClassification);
router.delete("/credit/classification/:period", requirePermission("deletes"), AUDIT.creditUnclassify, undoClassification);
router.post("/credit/contract/:id/writeoff", requirePermission("deletes"), AUDIT.creditWriteOff, writeOffContract);
router.delete("/credit/writeoff/:id", requirePermission("deletes"), AUDIT.creditUndoWriteOff, undoWriteOff);
router.post("/credit/contract/:id/recover", requirePermission("creates"), AUDIT.creditRecover, recoverContract);
router.post("/credit/contract/:id/restructure", requirePermission("updates"), AUDIT.creditRestructure, restructureContract);
router.delete("/credit/restructure/:id", requirePermission("deletes"), AUDIT.creditUndoRestructure, undoRestructure);
router.get("/credit/document", getDocuments);
router.post("/credit/document", requirePermission("creates", "updates"), creditDocUpload, uploadDocuments);
router.get("/credit/document/download/:id", downloadDocument);
router.delete("/credit/document/:id", requirePermission("deletes"), deleteDocument);
router.post("/credit/notice", requirePermission("creates"), createNotice);
router.get("/credit/report/:type", getCreditReport);

// ================= ເງິນກູ້ຢືມ / ເງິນໃຫ້ກູ້ — ຕາຕະລາງຜ່ອນ, ການຈ່າຍ/ຮັບຄືນ, ດອກເບ້ຍຄ້າງທ້າຍເດືອນ (bansi/loanController)
router.get("/loan/fetch", getLoans);
router.get("/loan/accrual-runs", getAccrualRuns);
router.post("/loan/preview", previewLoan);
router.post("/loan/accrual-preview", previewAccrual);
router.post("/loan/accrue", requirePermission("creates"), runAccrual);
router.delete("/loan/accrue/:month", requirePermission("deletes"), undoAccrual);
router.post("/loan/create", requirePermission("creates"), createLoan);
router.post("/loan/pay/:id", requirePermission("creates"), payLoan);
router.put("/loan/payment/cancel/:id", requirePermission("deletes"), AUDIT.loanPaymentCancel, cancelLoanPayment);
router.get("/loan/:id", getLoan);
router.put("/loan/:id", requirePermission("updates"), AUDIT.loanUpdate, updateLoan);
router.delete("/loan/:id", requirePermission("deletes"), AUDIT.loanDelete, deleteLoan);

router.get("/fixed-asset/fetch", getFixedAssets);
router.get("/fixed-asset/runs", getDepreciationRuns);
router.post("/fixed-asset/schedule", getAssetSchedule);
router.post("/fixed-asset/depreciation-preview", previewDepreciation);
router.post("/fixed-asset/depreciate", requirePermission("creates"), runDepreciation);
router.delete("/fixed-asset/depreciate/:month", requirePermission("deletes"), undoDepreciation);
router.post("/fixed-asset/create", requirePermission("creates"), createFixedAsset);
router.post("/fixed-asset/dispose/:id", requirePermission("updates"), disposeFixedAsset);
router.put("/fixed-asset/restore/:id", requirePermission("updates"), restoreFixedAsset);
router.put("/fixed-asset/:id", requirePermission("updates"), updateFixedAsset);
router.delete("/fixed-asset/:id", requirePermission("deletes"), deleteFixedAsset);
// ລະຫັດຜ່ານເຂົ້າເມນູ desktop ບັນຊີ (tbl_main_menu.password) — ລາຍການເມນູ + ສະຖານະລັອກ ຢູ່ GET /menu/main
router.post("/menu-lock/verify", verifyMenuLock);
router.post("/menu-lock/save", requirePermission("updates"), AUDIT.menuLock, saveMenuLock);
router.post("/menu-lock/remove", requirePermission("updates"), AUDIT.menuUnlock, removeMenuLock);
// ລາຍຮັບ (ບັນທຶກບັນຊີປະຈຳວັນ) — ບັນທຶກແລ້ວເງິນເຂົ້າບັນຊີເງິນຄັງທັນທີ, ຍົກເລີກ = ຫັກຄືນ; ໄຟລ໌ field "file_doct"
router.post("/income/fetch", getIncomes);
router.post("/income/create", requirePermission("creates"), createUploadFile("income").single("file_doct"), createIncome);
router.put("/income/cancel/:id", requirePermission("deletes"), AUDIT.incomeCancel, cancelIncome);
router.get("/income/download/:id", downloadIncomeFile);
// ປະຫວັດການເຄື່ອນໄຫວຂອງບັນຊີເງິນຄັງ (tbl_account_movement) — ທຸກການປ່ຽນຍອດ: ຍອດກ່ອນ / ເຂົ້າ-ອອກ / ຍອດຫຼັງ
router.post("/account-movement/fetch", getAccountMovements);
router.put("/income/:id", requirePermission("updates"), createUploadFile("income").single("file_doct"), AUDIT.incomeUpdate, updateIncome);
// ລາຍຈ່າຍ (ຫົວ + ລາຍການຍ່ອຍ) — /expense/:id ຢູ່ທ້າຍສຸດ ບໍ່ໃຫ້ທັບ /expense/cancel, /expense/download
router.post("/expense/fetch", getExpenses);
router.post("/expense/create", requirePermission("creates"), createUploadFile("expense").single("file_doct"), createExpense);
// ລາຍຈ່າຍປະຈຳເດືອນ (ແມ່ແບບຈາກລາຍຈ່າຍທີ່ບັນທຶກແລ້ວ) — ບັນທຶກແທ້ຜ່ານ /expense/create (recurring_id)
router.get("/expense-recurring", getRecurringExpenses);
router.post("/expense-recurring/from-expense/:id", requirePermission("creates"), createRecurringFromExpense);
router.put("/expense-recurring/:id", requirePermission("updates"), updateRecurringExpense);
router.delete("/expense-recurring/:id", requirePermission("deletes"), AUDIT.recurringDelete, deleteRecurringExpense);
router.put("/expense/cancel/:id", requirePermission("deletes"), AUDIT.expenseCancel, cancelExpense);
router.get("/expense/download/:id", downloadExpenseFile);
router.put("/expense/:id", requirePermission("updates"), createUploadFile("expense").single("file_doct"), AUDIT.expenseUpdate, updateExpense);
// ========= ບັນຊີຄູ່ (GL) — ຕາຕະລາງ ແລະ ຜັງບັນຊີເລີ່ມຕົ້ນ ສ້າງເອງຕອນເປີດ server (runAutoSync + seedGlDefaults)
// ຜັງບັນຊີ
router.get("/chart-account/fetch", getChartAccounts);
router.get("/chart-account/option", getChartAccountOption);
router.post("/chart-account/create", requirePermission("creates"), createChartAccount);
router.put("/chart-account/:id", requirePermission("updates"), AUDIT.accountUpdate, updateChartAccount);
router.delete("/chart-account/:id", requirePermission("deletes"), AUDIT.accountDelete, deleteChartAccount);
// ຜູກບັນຊີ (ປະເພດລາຍຮັບ-ລາຍຈ່າຍ, ບັນຊີເງິນຄັງ, ບົດບາດຂອງລະບົບ)
router.get("/gl-mapping/fetch", getGlMappings);
router.post("/gl-mapping/save", requirePermission("updates"), saveGlMappings);
// ສະຖານະ + ລົງບັນຊີຍ້ອນຫຼັງໃຫ້ເອກະສານເກົ່າ
router.get("/gl/status", getGlStatus);
router.post("/gl/rebuild", requirePermission("updates"), rebuildGl);
// ສະໝຸດບັນຊີ: ລາຍການ, ບັນທຶກທົ່ວໄປ, ກັບລາຍການ
router.post("/journal-entry/fetch", getJournalEntries);
router.post("/journal-entry/create", requirePermission("creates"), createJournalEntry);
router.put("/journal-entry/reverse/:id", requirePermission("deletes"), AUDIT.journalReverse, reverseJournalEntry);
// ຍອດຕາມບັນຊີ (ງົບທົດລອງ, ໃບສະຫຼຸບຊັບສົມບັດ) ແລະ ປຶ້ມບັນຊີໃຫຍ່ຂອງບັນຊີດຽວ
router.post("/gl/balances", getGlBalances);
router.post("/gl/ledger", getGlLedger);
// ========= ລູກໜີ້ (kind 1) / ເຈົ້າໜີ້ (kind 2)
router.get("/partner/fetch", getPartners);
router.post("/partner/create", requirePermission("creates"), createPartner);
router.put("/partner/:id", requirePermission("updates"), updatePartner);
// ໃບແຈ້ງໜີ້ / ໃບບິນ — ແກ້ໄຂ/ຍົກເລີກໄດ້ສະເພາະໃບທີ່ຍັງບໍ່ໄດ້ຕັດໜີ້ (ສິດ ເພີ່ມ / ແກ້ໄຂ / ລຶບ ຂອງຜູ້ໃຊ້)
router.post("/partner-doc/fetch", getPartnerDocs);
router.post("/partner-doc/create", requirePermission("creates"), createPartnerDoc);
router.put("/partner-doc/update/:id", requirePermission("updates"), AUDIT.docUpdate, updatePartnerDoc);
router.put("/partner-doc/cancel/:id", requirePermission("deletes"), AUDIT.docCancel, cancelPartnerDoc);
// ຮັບ / ຈ່າຍຊຳລະ (ຕັດໜີ້ຫຼາຍໃບໄດ້) — ເງິນເຂົ້າ/ອອກ ບັນຊີເງິນຄັງ
router.post("/partner-payment/fetch", getPartnerPayments);
router.post("/partner-payment/create", requirePermission("creates"), createPartnerPayment);
router.put("/partner-payment/cancel/:id", requirePermission("deletes"), AUDIT.paymentCancel, cancelPartnerPayment);
// ========= ງົບປະມານລາຍຈ່າຍ (ຕາມໝວດລາຍຈ່າຍ ຕໍ່ປີການເງິນ) — ຍອດໃຊ້ຈິງຄິດຈາກລາຍຈ່າຍ; /check ໃຫ້ຟອມລາຍຈ່າຍເຕືອນເກີນງົບ
router.post("/budget/fetch", getBudgets);
router.post("/budget/expenses", getBudgetExpenses);
router.post("/budget/check", checkBudget);
router.post("/budget/create", requirePermission("creates"), createBudget);
router.put("/budget/:id", requirePermission("updates"), updateBudget);
router.delete("/budget/:id", requirePermission("deletes"), deleteBudget);
// ========= ຂໍ້ມູນພື້ນຖານ (HR): ແຂວງ/ເມືອງ, ພະແນກ + ຕຳແໜ່ງ, ພະນັກງານ + ເອກະສານ — ການແກ້ໄຂກວດສິດຂອງຜູ້ໃຊ້
router.get("/address/province", getProvinces);
router.get("/department/fetch", getDepartments);
router.get("/department/option", getDepartmentOption);
router.post("/department/create", requirePermission("creates"), createDepartment);
router.put("/department/:id", requirePermission("updates"), updateDepartment);
router.delete("/department/:id", requirePermission("deletes"), deleteDepartment);
router.get("/position/fetch", getPositions);
router.get("/position/option", getPositionOption);
router.post("/position/create", requirePermission("creates"), createPosition);
router.put("/position/:id", requirePermission("updates"), updatePosition);
router.delete("/position/:id", requirePermission("deletes"), deletePosition);
router.get("/org/chart", getOrgChart);
router.get("/org/me", getMyOrg);
router.put("/org/boss/:id", requirePermission("updates"), setBoss);
router.post("/org/auto-boss", requirePermission("updates"), autoAssignBosses);
// ຂໍ້ມູນພະນັກງານເພີ່ມເຕີມ: ລາຍການຕັ້ງຄ່າ, ທັກສະ, ປະຫວັດຫຍໍ້
router.get("/hr-option/fetch", getHrOptions);
router.get("/hr-option/option", getHrOptionList);
router.post("/hr-option/create", requirePermission("creates"), createHrOption);
router.put("/hr-option/:id", requirePermission("updates"), updateHrOption);
router.delete("/hr-option/:id", requirePermission("deletes"), deleteHrOption);
router.get("/skill/fetch", getSkills);
router.post("/skill-type/create", requirePermission("creates"), saveSkillType);
router.put("/skill-type/:id", requirePermission("updates"), saveSkillType);
router.delete("/skill-type/:id", requirePermission("deletes"), deleteSkillType);
router.post("/skill/create", requirePermission("creates"), saveSkill);
router.put("/skill/:id", requirePermission("updates"), saveSkill);
router.delete("/skill/:id", requirePermission("deletes"), deleteSkill);
router.put("/employee/skills/:id", requirePermission("updates"), hideEmployeeSalary, setEmployeeSkills);
router.post("/employee/resume/:id", requirePermission("updates"), documentUpload, hideEmployeeSalary, createResume);
router.put("/employee/resume-line/:id", requirePermission("updates"), documentUpload, hideEmployeeSalary, updateResume);
router.delete("/employee/resume-line/:id", requirePermission("updates"), hideEmployeeSalary, deleteResume);
router.get("/employee/resume-line/file/:id", downloadResumeFile);
router.get("/employee/fetch", hideEmployeeSalary, getEmployees);
router.get("/employee/expiring", getExpiring);
router.get("/employee/option", hideEmployeeSalary, getEmployeeOption);
// ຂໍ້ມູນຂອງຕົນເອງ (app ມືຖືຂອງພະນັກງານ — ບັນຊີຕ້ອງຜູກກັບພະນັກງານ)
router.get("/employee/me", getMyEmployee);
router.put("/employee/me/profile", profileUpload, updateMyProfilePhoto);
router.get("/employee/me/history", getMyWorkHistory);
router.get("/employee/me/colleagues", getMyColleagues);
// ແຜນວຽກສ່ວນຕົວຂອງພະນັກງານ (app) — ຕາຕະລາງດຽວກັບປະຕິທິນແຜນວຽກຂອງເວັບ
router.get("/employee/me/workplan", getMyWorkPlans);
router.post("/employee/me/workplan", createMyWorkPlan);
router.get("/employee/me/workplan/:id", getMyWorkPlan);
router.put("/employee/me/workplan/:id", updateMyWorkPlan);
router.post("/employee/me/workplan/:id/progress", addMyWorkPlanProgress);
router.delete("/employee/me/workplan/:id", deleteMyWorkPlan);
// ໂນດສ່ວນຕົວ (app → ເມນູ "ໂນດ") — ຂໍ້ຄວາມ + ຮູບຂີດແຕ້ມ, ສະເພາະຂອງຕົນເອງ
router.get("/note/me", getMyNotes);
router.post("/note/me", createMyNote);
router.post("/note/me/folders", createMyNoteFolder);
router.put("/note/me/folders/:id", renameMyNoteFolder);
router.delete("/note/me/folders/:id", deleteMyNoteFolder);
router.put("/note/me/:id", updateMyNote);
router.delete("/note/me/:id", deleteMyNote);
// ບັນຊີເງິນສ່ວນຕົວຂອງພະນັກງານ (app) — ເຫັນສະເພາະຂອງຕົນເອງ; ຮູບໃບບິນເປີດຜ່ານ API ນີ້ເທົ່ານັ້ນ
router.get("/money/me/accounts", getMyMoneyAccounts);
router.post("/money/me/accounts", createMyMoneyAccount);
router.put("/money/me/accounts/:id", updateMyMoneyAccount);
router.delete("/money/me/accounts/:id", deleteMyMoneyAccount);
router.get("/money/me/banks", getMyMoneyBanks);
router.get("/money/me/categories", getMyMoneyCategories);
router.post("/money/me/categories", createMyMoneyCategory);
router.put("/money/me/categories/:id", updateMyMoneyCategory);
router.delete("/money/me/categories/:id", deleteMyMoneyCategory);
router.get("/money/me/entries", getMyMoneyEntries);
router.post("/money/me/entries", receiptUpload, createMyMoneyEntry);
router.get("/money/me/entries/:id/photo", getMyMoneyEntryPhoto);
router.put("/money/me/entries/:id", receiptUpload, updateMyMoneyEntry);
router.delete("/money/me/entries/:id", deleteMyMoneyEntry);
router.get("/money/me/summary", getMyMoneySummary);
router.get("/employee/summary/:id", hideSummaryMoney, getEmployeeSummary);
// ປະຫວັດເງິນເດືອນ (ຈາກໃບເງິນເດືອນທີ່ຈ່າຍແລ້ວ + ປະຫວັດການແກ້ໄຂ) — ສະເພາະຜູ້ມີສິດເມນູເງິນເດືອນ
router.get("/employee/salary-history/:id", requireSalaryAccess, getSalaryHistory);
router.post("/employee/create", requirePermission("creates"), profileUpload, hideEmployeeSalary, createEmployee);
// ເອກະສານ: POST :id = ພະນັກງານ, GET/DELETE :id = ເອກະສານ — ໄຟລ໌ບໍ່ມີ URL ສາທາລະນະ ດາວໂຫຼດຜ່ານນີ້ເທົ່ານັ້ນ
router.post("/employee/document/:id", requirePermission("updates"), documentUpload, hideEmployeeSalary, uploadEmployeeDocuments);
router.put("/employee/document/:id", requirePermission("updates"), hideEmployeeSalary, updateEmployeeDocument);
router.get("/employee/document/download/:id", downloadEmployeeDocument);
router.delete("/employee/document/:id", requirePermission("updates"), hideEmployeeSalary, deleteEmployeeDocument);
// ຕັ້ງລະຫັດຜ່ານ app ຂອງພະນັກງານຄືນເປັນຄ່າເລີ່ມຕົ້ນ (ກ່ອນ /employee/:id)
router.put("/employee/app-password/:id", requirePermission("updates"), hideEmployeeSalary, AUDIT.employeeAppPassword, resetAppPassword);
router.put("/employee/:id", requirePermission("updates"), profileUpload, hideEmployeeSalary, AUDIT.employeeUpdate, updateEmployee);
router.delete("/employee/:id", requirePermission("deletes"), hideEmployeeSalary, AUDIT.employeeDelete, deleteEmployee);
// ຂໍ້ມູນບໍລິສັດ (ແຖວດຽວ) — ພິກັດ + ໄລຍະສະແກນ, ເວລາເຂົ້າ-ອອກວຽກ, ວັນພັກ
router.get("/company", getCompany);
router.put("/company", requirePermission("updates"), companyLogoUpload, AUDIT.companyUpdate, saveCompany);
// ຮູບເສື້ອເຄື່ອງແບບ 1 ໂປໂລບໍລິສັດ, 2 ເສື້ອເຊີດ, 3 ເສື້ອທຳມະດາ
// ເອກະສານບໍລິສັດ (ໃບທະບຽນ, ໃບອະນຸຍາດ…) ພ້ອມວັນໝົດອາຍຸ — ກ່ອນ /company/uniform
router.get("/company/document", getCompanyDocuments);
router.get("/company/document/download/:id", downloadCompanyDocument);
router.post("/company/document", requirePermission("creates"), companyDocUpload, createCompanyDocument);
router.put("/company/document/:id", requirePermission("updates"), companyDocUpload, AUDIT.companyDocUpdate, updateCompanyDocument);
router.delete("/company/document/:id", requirePermission("deletes"), AUDIT.companyDocDelete, deleteCompanyDocument);
router.put("/company/uniform/:type", requirePermission("updates"), uniformPhotoUpload, saveUniformPhoto);
router.delete("/company/uniform/:type", requirePermission("updates"), removeUniformPhoto);
// QR ສະແກນເຂົ້າ-ອອກວຽກ (HR) — ລະຫັດລັບຂອງ QR ບໍ່ອອກທາງ GET /company
router.get("/company/scan-qr", requirePermission("updates"), getScanQr);
router.put("/company/scan-qr", requirePermission("updates"), saveScanQr);
// ລິ້ງສັ້ນ Google Maps → ລິ້ງເຕັມ (ມີພິກັດ) ສຳລັບຊ່ອງວາງພິກັດໃນ modal ທີ່ຕັ້ງບໍລິສັດ
router.post("/company/map-link", requirePermission("updates"), resolveMapLink);
// ອັບເດດແອັບພະນັກງານ (Android) — HR ອັບໂຫຼດ APK, ແອັບດາວໂຫຼດຈາກ /image/app/…
router.get("/app-release/fetch", getAppReleases);
router.post("/app-release/create", requirePermission("creates"), apkUpload, createAppRelease);
router.delete("/app-release/:id", requirePermission("deletes"), deleteAppRelease);
// ========= ການເຂົ້າ-ອອກວຽກ — /scan, /me ສຳລັບ app ມືຖືຂອງພະນັກງານ (ບັນຊີຕ້ອງຜູກກັບພະນັກງານ); ອື່ນໆ ສຳລັບ HR
router.post("/attendance/scan", scanAttendance);
router.get("/attendance/me", getMyAttendance);
// ອາກາດຕອນນີ້ ທີ່ຕັ້ງບໍລິສັດ (ຫົວໜ້າຫຼັກຂອງແອັບ) — MET Norway, ເກັບໄວ້ 30 ນາທີ
router.get("/weather/me", getMyWeather);
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
router.post("/overtime/fetch", requirePermission("updates"), hideOvertimeEstimate, getOvertimes);
router.post("/overtime/create", requirePermission("creates"), createOvertime);
router.put("/overtime/:id", requirePermission("updates"), updateOvertime);
router.delete("/overtime/:id", requirePermission("deletes"), deleteOvertime);
// ========= ວັນເກີດ (app ມືຖື) — ເພື່ອນທີ່ມີວັນເກີດມື້ນີ້, ສົ່ງຄຳອວຍພອນ, ຄຳອວຍພອນທີ່ໄດ້ຮັບ
router.get("/birthday/me", getMyBirthdays);
router.post("/birthday/me/wish", sendBirthdayWish);
router.get("/birthday/me/wishes", getMyBirthdayWishes);
router.post("/birthday/me/wishes/:id/reply", replyBirthdayWish);
router.get("/birthday/me/replies", getMyBirthdayReplies);
router.get("/birthday/me/wall", getBirthdayWall);
// ========= ແຈ້ງເຕືອນ — /me ສຳລັບ app ມືຖື (ກະດິ່ງ); HR ແຈ້ງການໃຫ້ພະນັກງານທຸກຄົນ
router.get("/notification/me", getMyNotifications);
router.get("/notification/me/stream", streamMyNotifications);
router.put("/notification/me/read", readAllMyNotifications);
router.put("/notification/me/read/:id", readMyNotification);
// ເຄື່ອງຮັບແຈ້ງເຕືອນເດັ້ງຂຶ້ນຈໍ (Firebase) ຂອງ app ພະນັກງານ
router.post("/app/device-token", registerDeviceToken);
router.post("/notification/announce", requirePermission("creates"), announce);
// ========= ຄຳຂໍລາພັກ — /me ສຳລັບ app ມືຖືຂອງພະນັກງານ; HR (ຕ້ອງມີສິດແກ້ໄຂ ທັງເບິ່ງລາຍການ) ອະນຸມັດ = ບັນທຶກລາພັກລົງການເຂົ້າວຽກ
router.get("/leave/me", getMyLeaves);
router.post("/leave/me", leaveFileUpload, createMyLeave);
router.put("/leave/me/cancel/:id", cancelMyLeave);
// ໃບລາທີ່ແນບ — ເຈົ້າຂອງ + ຜູ້ມີສິດອະນຸມັດລາພັກ (app); HR ເປີດໃນເວັບ
router.get("/leave/me/file/:id", getMyLeaveFile);
router.get("/leave/me/file/:id/link", getMyLeaveFileLink);
router.get("/leave/file/download/:id", requirePermission("updates"), downloadLeaveFile);
router.post("/leave/fetch", requirePermission("updates"), getLeaves);
router.post("/leave/balance", requirePermission("updates"), getLeaveBalance);
router.get("/leave/quota/:id", getLeaveQuota);
router.put("/leave/quota/:id", requirePermission("updates"), setLeaveQuota);
router.put("/leave/approve/:id", requirePermission("updates"), approveLeave);
router.put("/leave/reject/:id", requirePermission("updates"), rejectLeave);
router.put("/leave/revoke/:id", requirePermission("updates"), revokeLeave);
// ປະເພດການລາພັກ (HR) — ຊື່, ໄດ້/ບໍ່ໄດ້ເງິນເດືອນ, ຂີດຈຳກັດມື້ຕໍ່ປີ / ຕໍ່ຄັ້ງ
router.get("/leave-type/fetch", getLeaveTypes);
router.post("/leave-type/create", requirePermission("creates"), createLeaveType);
router.put("/leave-type/:id", requirePermission("updates"), updateLeaveType);
router.delete("/leave-type/:id", requirePermission("deletes"), deleteLeaveType);
// ========= ແຈ້ງລືມສະແກນ / ຂໍແກ້ເວລາ — /me ສຳລັບ app ມືຖື; HR ອະນຸມັດ = ບັນທຶກເວລາລົງການເຂົ້າວຽກ
router.get("/correction/me", getMyCorrections);
router.post("/correction/me", createMyCorrection);
router.put("/correction/me/cancel/:id", cancelMyCorrection);
router.post("/correction/fetch", requirePermission("updates"), getCorrections);
router.put("/correction/approve/:id", requirePermission("updates"), approveCorrection);
router.put("/correction/reject/:id", requirePermission("updates"), rejectCorrection);
// ========= ເງິນເດືອນ — /setting ແລະ /line/:id ກ່ອນ /:id; ຈ່າຍ = ເງິນອອກຈາກບັນຊີເງິນຄັງ + ລົງບັນຊີຄູ່
// ================= ເງິນເບີກລ່ວງໜ້າ — ພະນັກງານຂໍຜ່ານ app; HR ອະນຸມັດ, ຈ່າຍເງິນ, ຫັກຄືນຜ່ານເງິນເດືອນ
router.get("/advance/me", getMyAdvances);
router.post("/advance/me", createMyAdvance);
router.put("/advance/me/cancel/:id", cancelMyAdvance);
// ອະນຸມັດຜ່ານ app — ພະນັກງານທີ່ຜູກບັນຊີຜູ້ໃຊ້ ແລະ ໄດ້ສິດແຕ່ລະປະເພດ (ສິດກວດໃນ controller)
router.get("/approve/me", getMyApprovals);
router.get("/approve/me/:kind", getMyApprovalList);
router.put("/approve/me/:kind/:id/:action", decideMyApproval);
router.post("/advance/fetch", requireSalaryAccess, requirePermission("updates"), getAdvances);
router.post("/advance/create", requireSalaryAccess, requirePermission("creates"), createAdvance);
router.put("/advance/approve/:id", requireSalaryAccess, requirePermission("updates"), approveAdvance);
router.put("/advance/reject/:id", requireSalaryAccess, requirePermission("updates"), rejectAdvance);
router.put("/advance/cancel/:id", requireSalaryAccess, requirePermission("updates"), AUDIT.advanceCancel, cancelAdvance);
router.put("/advance/pay/:id", requireSalaryAccess, requirePermission("updates"), AUDIT.advancePay, payAdvance);
router.put("/advance/unpay/:id", requireSalaryAccess, requirePermission("updates"), AUDIT.advanceUnpay, unpayAdvance);
router.put("/advance/schedule/:id", requireSalaryAccess, requirePermission("updates"), updateAdvanceSchedule);
router.post("/advance/repay/:id", requireSalaryAccess, requirePermission("updates"), repayAdvance);
router.delete("/advance/repayment/:id", requireSalaryAccess, requirePermission("deletes"), deleteAdvanceRepayment);
router.get("/advance/:id", requireSalaryAccess, requirePermission("updates"), getAdvance);
// ================= ມອບໝາຍວຽກ — HR ມອບໝາຍໃນເວັບ (ແຈ້ງເຕືອນເດັ້ງຂຶ້ນຈໍ), ພະນັກງານອັບເດດໃນ app
router.get("/task/me", getMyTasks);
router.put("/task/me/item/:id", updateMyTaskItem);
router.put("/task/me/progress/:id", updateMyTaskProgress);
router.get("/task/me/file/:id", getMyTaskFileLink);
router.get("/task/me/comment/:id", getMyTaskComments);
router.post("/task/me/comment/:id", createMyTaskComment);
router.delete("/task/me/comment/:id", deleteMyTaskComment);
router.get("/task/me/assigned", getMyAssignedTasks);
router.post("/task/me/assigned", createMyAssignedTask);
router.put("/task/me/assigned/:id/status", updateMyAssignedTaskStatus);
router.delete("/task/me/assigned/:id", deleteMyAssignedTask);
router.get("/task/project/fetch", getTaskProjects);
router.post("/task/project/create", requirePermission("creates"), createTaskProject);
router.put("/task/project/:id", requirePermission("updates"), updateTaskProject);
router.delete("/task/project/:id", requirePermission("deletes"), deleteTaskProject);
router.post("/task/file/:id", requirePermission("creates", "updates"), taskFileUpload, uploadTaskFiles);
router.get("/task/file/download/:id", downloadTaskFile);
router.delete("/task/file/:id", requirePermission("updates"), deleteTaskFile);
router.post("/task/comment/:id", createTaskComment);
router.delete("/task/comment/:id", deleteTaskComment);
router.post("/task/fetch", getTasks);
router.post("/task/create", requirePermission("creates"), createTask);
router.post("/task/bulk", requirePermission("updates"), bulkTasks);
router.put("/task/status/:id", requirePermission("updates"), updateTaskStatus);
router.put("/task/star/:id", toggleTaskStar);
router.put("/task/item/:id", requirePermission("updates"), updateTaskItem);
router.get("/task/:id", getTask);
router.put("/task/:id", requirePermission("updates"), updateTask);
// ຄຳຮ້ອງທີ່ລໍຖ້າ HR (ໜ້າ desktop)
router.get("/hr/pending", requirePermission("updates"), getHrPending);

router.get("/payroll/setting", requireSalaryAccess, getPayrollSetting);
router.get("/payroll/expense-default", requireSalaryAccess, getPayrollExpenseDefault);
router.put("/payroll/setting", requireSalaryAccess, requirePermission("updates"), savePayrollSetting);
router.post("/payroll/fetch", requireSalaryAccess, getPayrolls);
router.post("/payroll/tax-report", requireSalaryAccess, getPayrollTaxReport);
router.post("/payroll/create", requireSalaryAccess, requirePermission("creates"), createPayroll);
router.put("/payroll/recalc/:id", requireSalaryAccess, requirePermission("updates"), recalcPayroll);
router.post("/payroll/line/preview/:id", requireSalaryAccess, previewPayrollLine);
router.put("/payroll/line/:id", requireSalaryAccess, requirePermission("updates"), AUDIT.payrollLineUpdate, updatePayrollLine);
router.delete("/payroll/line/:id", requireSalaryAccess, requirePermission("deletes"), AUDIT.payrollLineDelete, deletePayrollLine);
router.put("/payroll/pay/:id", requireSalaryAccess, requirePermission("updates"), AUDIT.payrollPay, payPayroll);
router.put("/payroll/unpay/:id", requireSalaryAccess, requirePermission("updates"), AUDIT.payrollUnpay, unpayPayroll);
// ສະລິບເງິນເດືອນຂອງຕົນເອງ (app ມືຖື) — ກ່ອນ /payroll/:id
router.get("/payroll/me", getMyPayslips);
// ກວດເງິນເດືອນຫຼວງໜ້າ (ເດືອນທີ່ຍັງບໍ່ຈ່າຍ) — ຄິດຈາກການເຂົ້າວຽກເຖິງມື້ນີ້ + ເງິນເພີ່ມ/ຫັກໃນໃບຮ່າງ
router.get("/payroll/me/preview", getMyPayrollPreview);
router.get("/payroll/:id", requireSalaryAccess, getPayroll);
router.delete("/payroll/:id", requireSalaryAccess, requirePermission("deletes"), AUDIT.payrollDelete, deletePayroll);

export default router;
