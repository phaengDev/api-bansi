"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.appJwtConfig = exports.adminJwtConfig = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// ADMIN_JWT_* ມາກ່ອນ ແລ້ວຈຶ່ງ JWT_* — ບໍ່ມີ secret ໃນ .env = login ຕອບ 500 (ບໍ່ໃຊ້ secret ຄ່າຕັ້ງຕົ້ນ)
exports.adminJwtConfig = {
    secret: (process.env.ADMIN_JWT_SECRET ?? process.env.JWT_SECRET ?? "").trim(),
    expiresIn: process.env.ADMIN_JWT_EXPIRES_IN ?? process.env.JWT_EXPIRES_IN ?? "1d",
    issuer: process.env.ADMIN_JWT_ISSUER ?? process.env.JWT_ISSUER ?? "Bansi-OAC",
};
exports.appJwtConfig = {
    secret: (process.env.APP_JWT_SECRET ?? process.env.JWT_SECRET ?? "4h@fT9*R1xOAC!2026").trim(),
    expiresIn: process.env.APP_JWT_EXPIRES_IN ?? process.env.JWT_EXPIRES_IN ?? "1d",
    issuer: process.env.APP_JWT_ISSUER ?? process.env.JWT_ISSUER ?? "4h@fT9*R1xOAC!2026",
};
