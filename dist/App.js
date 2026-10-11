"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const server_1 = __importDefault(require("./server"));
const database_1 = __importDefault(require("./config/database"));
const autoSync_1 = require("./utils/autoSync");
const seedDefaults_1 = require("./utils/seedDefaults");
const glSeed_1 = require("./controllers/bansi/glSeed");
const os_1 = require("os");
const PORT = process.env.PORT || 8888;
const getPositiveNumber = (value, fallback) => {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
};
const retryDelay = getPositiveNumber(process.env.DB_RETRY_DELAY_MS, 5000);
const wait = (milliseconds) => new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
});
const getLocalIpAddresses = () => {
    const addresses = Object.values((0, os_1.networkInterfaces)()).flatMap((networkInterface) => (networkInterface ?? [])
        .filter(({ family, internal }) => family === "IPv4" && !internal)
        .map(({ address }) => address));
    return [...new Set(addresses)];
};
async function connectDatabase() {
    let attempt = 1;
    while (true) {
        try {
            await database_1.default.authenticate();
            console.log("✅ Database connected");
            return;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`❌ Database connection attempt ${attempt} failed: ${message}`);
            console.log(`🔄 Retrying database connection in ${retryDelay}ms...`);
            attempt += 1;
            await wait(retryDelay);
        }
    }
}
async function startServer() {
    await connectDatabase();
    // ສ້າງ/ປັບຕາຕະລາງທຸກ model ທີ່ເອີ້ນ autoSync() (ບໍ່ລຶບຂໍ້ມູນ)
    await (0, autoSync_1.runAutoSync)();
    // ສະກຸນເງິນ + ເມນູບັນຊີ (ສະເພາະທີ່ຍັງບໍ່ມີ)
    await (0, seedDefaults_1.seedDefaults)().catch((error) => console.error("❌ seedDefaults:", error?.parent?.sqlMessage ?? error));
    // ຜັງບັນຊີ + ບົດບາດເລີ່ມຕົ້ນ + index ຂອງບັນຊີຄູ່ (ສະເພາະທີ່ຍັງບໍ່ມີ) — ລົ້ມເຫຼວກໍ່ເປີດ server ຕໍ່
    await (0, glSeed_1.seedGlDefaults)().catch((error) => console.error("❌ seedGlDefaults:", error?.parent?.sqlMessage ?? error));
    server_1.default.listen(PORT, () => {
        console.log(`🚀 Server running at:`);
        console.log(`   Local:   http://localhost:${PORT}`);
        getLocalIpAddresses().forEach((ipAddress) => {
            console.log(`   Network: http://${ipAddress}:${PORT}`);
        });
    });
}
void startServer();
