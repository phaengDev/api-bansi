import { Op } from "sequelize";
import Users from "../../models/userModel";
import Employee from "../../models/employee";
import { notify } from "./notificationController";
import { WORKING } from "./workCalendar";

/**
 * ຜູ້ອະນຸມັດຜ່ານ app — ພະນັກງານທີ່ຜູກກັບບັນຊີຜູ້ໃຊ້ (tbl_users.employee_id) ແລະ HR ຕິກໃຫ້ສິດແຕ່ລະປະເພດ.
 * ແຍກໄຟລ໌ຈາກ approvalController (ທີ່ເອີ້ນ leave / correction / advance controller) ເພື່ອບໍ່ໃຫ້ import ວົນກັນ
 */
export type ApprovalKind = "leave" | "correction" | "advance";

export const APPROVAL_FLAGS: Record<ApprovalKind, "approve_leave" | "approve_correction" | "approve_advance"> = {
  leave: "approve_leave",
  correction: "approve_correction",
  advance: "approve_advance",
};

/** ພະນັກງານທີ່ອະນຸມັດປະເພດນີ້ໄດ້ (ບັນຊີໃຊ້ງານຢູ່ + ພະນັກງານຍັງເຮັດວຽກ) */
export const approverIds = async (kind: ApprovalKind) => {
  const users = await Users.findAll({
    where: { [APPROVAL_FLAGS[kind]]: 1, status: 1, employee_id: { [Op.ne]: null } },
    attributes: ["employee_id"],
    include: [{ model: Employee, as: "employee", attributes: ["_uuid"], where: { work_status: WORKING }, required: true }],
  });
  return [...new Set(users.map((u) => Number(u.employee_id)))];
};

/**
 * ຄຳຂໍໃໝ່ຈາກ app → ແຈ້ງເຕືອນມືຖືຂອງຜູ້ມີສິດອະນຸມັດ (ບໍ່ລວມຜູ້ຂໍເອງ); ref "approve:<kind>:<id>" — app ເປີດໜ້າອະນຸມັດ.
 * ສົ່ງບໍ່ໄດ້ ບໍ່ໃຫ້ການສົ່ງຄຳຂໍລົ້ມ
 */
export const notifyApprovers = async (kind: ApprovalKind, requesterId: number, requestId: number, title: string, body: string) => {
  try {
    const ids = (await approverIds(kind)).filter((id) => id !== requesterId);
    if (!ids.length) return;
    await notify(ids.map((employee_id) => ({
      employee_id,
      type: "approval",
      title,
      body: body.slice(0, 500),
      ref: `approve:${kind}:${requestId}`,
      createdbyid: null,
      push: true,
    })));
  } catch (error) {
    console.error("notifyApprovers", error);
  }
};

/** "ຊື່ ນາມສະກຸນ" ຂອງພະນັກງານ */
export const fullName = (e: { first_name?: string | null; last_name?: string | null } | null | undefined) =>
  [e?.first_name, e?.last_name].filter(Boolean).join(" ");
