import app from "./server";
import sequelize from "./config/database";
import { runAutoSync } from "./utils/autoSync";
import { seedDefaults } from "./utils/seedDefaults";
import { seedGlDefaults } from "./controllers/bansi/glSeed";
import { networkInterfaces } from "os";

const PORT = process.env.PORT || 8888;

const getPositiveNumber = (value: string | undefined, fallback: number) => {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
};

const retryDelay = getPositiveNumber(process.env.DB_RETRY_DELAY_MS, 5000);
const wait = (milliseconds: number) => new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
});

const getLocalIpAddresses = () => {
    const addresses = Object.values(networkInterfaces()).flatMap((networkInterface) =>
        (networkInterface ?? [])
            .filter(({ family, internal }) => family === "IPv4" && !internal)
            .map(({ address }) => address)
    );

    return [...new Set(addresses)];
};

async function connectDatabase() {
    let attempt = 1;

    while (true) {
        try {
            await sequelize.authenticate();
            console.log("✅ Database connected");
            return;
        } catch (error) {
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
    await runAutoSync();
    // ສະກຸນເງິນ + ເມນູບັນຊີ (ສະເພາະທີ່ຍັງບໍ່ມີ)
    await seedDefaults().catch((error) => console.error("❌ seedDefaults:", (error as any)?.parent?.sqlMessage ?? error));
    // ຜັງບັນຊີ + ບົດບາດເລີ່ມຕົ້ນ + index ຂອງບັນຊີຄູ່ (ສະເພາະທີ່ຍັງບໍ່ມີ) — ລົ້ມເຫຼວກໍ່ເປີດ server ຕໍ່
    await seedGlDefaults().catch((error) => console.error("❌ seedGlDefaults:", (error as any)?.parent?.sqlMessage ?? error));
    app.listen(PORT, () => {
        console.log(`🚀 Server running at:`);
        console.log(`   Local:   http://localhost:${PORT}`);
        getLocalIpAddresses().forEach((ipAddress) => {
            console.log(`   Network: http://${ipAddress}:${PORT}`);
        });
    });
}

void startServer();
