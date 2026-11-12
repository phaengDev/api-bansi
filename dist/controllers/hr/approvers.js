"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fullName = exports.notifyApprovers = exports.approverIds = exports.APPROVAL_FLAGS = void 0;
const sequelize_1 = require("sequelize");
const userModel_1 = __importDefault(require("../../models/userModel"));
const employee_1 = __importDefault(require("../../models/employee"));
const notificationController_1 = require("./notificationController");
const workCalendar_1 = require("./workCalendar");
exports.APPROVAL_FLAGS = {
    leave: "approve_leave",
    correction: "approve_correction",
    advance: "approve_advance",
};
/** ພະນັກງານທີ່ອະນຸມັດປະເພດນີ້ໄດ້ (ບັນຊີໃຊ້ງານຢູ່ + ພະນັກງານຍັງເຮັດວຽກ) */
const approverIds = async (kind) => {
    const users = await userModel_1.default.findAll({
        where: { [exports.APPROVAL_FLAGS[kind]]: 1, status: 1, employee_id: { [sequelize_1.Op.ne]: null } },
        attributes: ["employee_id"],
        include: [{ model: employee_1.default, as: "employee", attributes: ["_uuid"], where: { work_status: workCalendar_1.WORKING }, required: true }],
    });
    return [...new Set(users.map((u) => Number(u.employee_id)))];
};
exports.approverIds = approverIds;
/**
 * ຄຳຂໍໃໝ່ຈາກ app → ແຈ້ງເຕືອນມືຖືຂອງຜູ້ມີສິດອະນຸມັດ (ບໍ່ລວມຜູ້ຂໍເອງ); ref "approve:<kind>:<id>" — app ເປີດໜ້າອະນຸມັດ.
 * ສົ່ງບໍ່ໄດ້ ບໍ່ໃຫ້ການສົ່ງຄຳຂໍລົ້ມ
 */
const notifyApprovers = async (kind, requesterId, requestId, title, body) => {
    try {
        const ids = (await (0, exports.approverIds)(kind)).filter((id) => id !== requesterId);
        if (!ids.length)
            return;
        await (0, notificationController_1.notify)(ids.map((employee_id) => ({
            employee_id,
            type: "approval",
            title,
            body: body.slice(0, 500),
            ref: `approve:${kind}:${requestId}`,
            createdbyid: null,
            push: true,
        })));
    }
    catch (error) {
        console.error("notifyApprovers", error);
    }
};
exports.notifyApprovers = notifyApprovers;
/** "ຊື່ ນາມສະກຸນ" ຂອງພະນັກງານ */
const fullName = (e) => [e?.first_name, e?.last_name].filter(Boolean).join(" ");
exports.fullName = fullName;
