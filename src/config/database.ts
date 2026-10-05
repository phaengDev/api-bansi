import { Sequelize } from "sequelize";
import dotenv from "dotenv";
dotenv.config();

const dbPort = Number(process.env.DB_PORT || 3306);
const connectTimeout = Number(process.env.DB_CONNECT_TIMEOUT_MS || 10000);

const sequelize = new Sequelize(
  process.env.DB_NAME as string,
  process.env.DB_USER as string,
  process.env.DB_PASS as string,
  {
    host: process.env.DB_HOST,
    port: dbPort,
    dialect: process.env.DB_DIALECT as any,
    logging: false,
    dialectOptions: {
      connectTimeout,
    },
  }
);
export default sequelize;
