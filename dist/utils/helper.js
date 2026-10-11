"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateOTP = generateOTP;
exports.generatePass = generatePass;
const crypto_1 = __importDefault(require("crypto"));
/**
 * ✅ สร้าง OTP แบบสุ่ม 6 หลัก
 */
function generateOTP(length = 6) {
    let otp = "";
    const digits = "0123456789";
    for (let i = 0; i < length; i++) {
        otp += digits[crypto_1.default.randomInt(0, digits.length)];
    }
    return otp;
}
/**
 * ລະຫັດຜ່ານຊົ່ວຄາວ (ລືມລະຫັດ → ຢືນຢັນ OTP ແລ້ວ) — ຕົວເລກລ້ວນ ໃຫ້ພະນັກງານພິມໃນມືຖືງ່າຍ (ແປ້ນຕົວເລກ);
 * ເຂົ້າ app ແລ້ວຕ້ອງປ່ຽນ (must_change_password)
 */
function generatePass(length = 8) {
    if (length < 4) {
        throw new Error("Password length must be at least 4");
    }
    const digits = "0123456789";
    let password = "";
    for (let i = 0; i < length; i++) {
        password += digits[crypto_1.default.randomInt(0, digits.length)];
    }
    return password;
}
