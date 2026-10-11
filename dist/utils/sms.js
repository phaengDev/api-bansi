"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendSms = exports.smsConfigured = exports.SmsError = void 0;
/**
 * ສົ່ງ SMS ຜ່ານ Telbiz (ຜູ້ໃຫ້ບໍລິການ SMS ໃນລາວ, ເບີ 20/30XXXXXXXX) — TELBIZ_CLIENT_ID / TELBIZ_SECRET ໃນ .env
 * (ຫ້າມຂຽນລະຫັດໄວ້ໃນ code). ບໍ່ໄດ້ຕັ້ງ: development = ພິມຂໍ້ຄວາມໃນ console ແທນ (ທົດສອບໄດ້ ບໍ່ເສຍຄ່າ SMS),
 * production = SmsError
 */
class SmsError extends Error {
}
exports.SmsError = SmsError;
let client = null;
const smsConfigured = () => !!(process.env.TELBIZ_CLIENT_ID?.trim() && process.env.TELBIZ_SECRET?.trim());
exports.smsConfigured = smsConfigured;
const sendSms = async (phone, message) => {
    if (!(0, exports.smsConfigured)()) {
        if (process.env.NODE_ENV === "production")
            throw new SmsError("ລະບົບ SMS ຍັງບໍ່ໄດ້ຕັ້ງຄ່າ — ຕິດຕໍ່ HR");
        console.log(`📩 [SMS ບໍ່ໄດ້ສົ່ງແທ້ — ຕັ້ງ TELBIZ_* ໃນ .env] ${phone}: ${message}`);
        return;
    }
    if (!client) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Telbiz = require("telbiz");
        client = new Telbiz(process.env.TELBIZ_CLIENT_ID.trim(), process.env.TELBIZ_SECRET.trim());
    }
    try {
        // ຫົວຂໍ້ຕ້ອງເປັນອັນທີ່ Telbiz ອະນຸຍາດ (Default, News, Promotion, OTP, Info)
        await client.SendSMSAsync(process.env.TELBIZ_HEADER?.trim() || "OTP", phone, message);
    }
    catch (error) {
        console.error("Telbiz SMS error:", error?.statusText ?? error?.message ?? error);
        throw new SmsError("ສົ່ງ SMS ບໍ່ສຳເລັດ — ລອງໃໝ່ພາຍຫຼັງ");
    }
};
exports.sendSms = sendSms;
