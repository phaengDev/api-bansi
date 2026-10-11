import dotenv from "dotenv";
dotenv.config();

type JwtConfig = {
    secret: string;
    expiresIn: string;
    issuer: string;
};

// ADMIN_JWT_* ມາກ່ອນ ແລ້ວຈຶ່ງ JWT_* — ບໍ່ມີ secret ໃນ .env = login ຕອບ 500 (ບໍ່ໃຊ້ secret ຄ່າຕັ້ງຕົ້ນ)
export const adminJwtConfig: JwtConfig = {
    secret: (process.env.ADMIN_JWT_SECRET ?? process.env.JWT_SECRET ?? "").trim(),
    expiresIn: process.env.ADMIN_JWT_EXPIRES_IN ?? process.env.JWT_EXPIRES_IN ?? "1d",
    issuer: process.env.ADMIN_JWT_ISSUER ?? process.env.JWT_ISSUER ?? "Bansi-OAC",
};

export const appJwtConfig: JwtConfig = {
    secret: (process.env.APP_JWT_SECRET ?? process.env.JWT_SECRET ?? "4h@fT9*R1xOAC!2026").trim(),
    expiresIn: process.env.APP_JWT_EXPIRES_IN ?? process.env.JWT_EXPIRES_IN ?? "1d",
    issuer: process.env.APP_JWT_ISSUER ?? process.env.JWT_ISSUER ?? "4h@fT9*R1xOAC!2026",
};