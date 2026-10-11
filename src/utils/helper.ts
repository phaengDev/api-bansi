import crypto from "crypto";

/**
 * ✅ สร้าง OTP แบบสุ่ม 6 หลัก
 */
export function generateOTP(length: number = 6): string {
  let otp = "";
  const digits = "0123456789";
  for (let i = 0; i < length; i++) {
    otp += digits[crypto.randomInt(0, digits.length)];
  }
  return otp;
}
/**
 * ລະຫັດຜ່ານຊົ່ວຄາວ (ລືມລະຫັດ → ຢືນຢັນ OTP ແລ້ວ) — ຕົວເລກລ້ວນ ໃຫ້ພະນັກງານພິມໃນມືຖືງ່າຍ (ແປ້ນຕົວເລກ);
 * ເຂົ້າ app ແລ້ວຕ້ອງປ່ຽນ (must_change_password)
 */
export function generatePass(length: number = 8): string {
  if (length < 4) {
    throw new Error("Password length must be at least 4");
  }
  const digits = "0123456789";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += digits[crypto.randomInt(0, digits.length)];
  }
  return password;
}
