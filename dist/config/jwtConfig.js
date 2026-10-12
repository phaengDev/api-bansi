"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminJwtConfig = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// ADMIN_JWT_* ມາກ່ອນ ແລ້ວຈຶ່ງ JWT_* — ບໍ່ມີ secret ໃນ .env = login ຕອບ 500 (ບໍ່ໃຊ້ secret ຄ່າຕັ້ງຕົ້ນ)
exports.adminJwtConfig = {
    secret: (process.env.ADMIN_JWT_SECRET ?? process.env.JWT_SECRET ?? "").trim(),
    expiresIn: process.env.ADMIN_JWT_EXPIRES_IN ?? process.env.JWT_EXPIRES_IN ?? "1d",
    issuer: process.env.ADMIN_JWT_ISSUER ?? process.env.JWT_ISSUER ?? "Bansi-OAC",
};
// secret ສັ້ນ = ເດົາໄດ້ ແລ້ວປອມ token ເຂົ້າລະບົບໄດ້ — ຕ້ອງຍາວຢ່າງໜ້ອຍ 32 ຕົວ (ສ້າງ: openssl rand -hex 32)
if (exports.adminJwtConfig.secret && exports.adminJwtConfig.secret.length < 32) {
    console.warn("⚠️ JWT_SECRET ສັ້ນເກີນໄປ (< 32 ຕົວ) — ສ້າງໃໝ່ດ້ວຍ `openssl rand -hex 32` ແລ້ວໃສ່ໃນ .env");
}
