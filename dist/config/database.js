"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const dbPort = Number(process.env.DB_PORT || 3306);
const connectTimeout = Number(process.env.DB_CONNECT_TIMEOUT_MS || 10000);
const sequelize = new sequelize_1.Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASS, {
    host: process.env.DB_HOST,
    port: dbPort,
    dialect: process.env.DB_DIALECT,
    logging: false,
    dialectOptions: {
        connectTimeout,
    },
});
exports.default = sequelize;
