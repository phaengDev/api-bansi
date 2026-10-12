"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPush = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const sequelize_1 = require("sequelize");
const app_1 = require("firebase-admin/app");
const messaging_1 = require("firebase-admin/messaging");
const deviceToken_1 = __importDefault(require("../models/deviceToken"));
/**
 * ແຈ້ງເຕືອນເດັ້ງຂຶ້ນຈໍມືຖື ຜ່ານ Firebase Cloud Messaging (ຟຣີ) — ສົ່ງຫາທຸກເຄື່ອງ (tbl_device_token) ຂອງພະນັກງານ.
 * ກະແຈ: ໄຟລ໌ service account ຈາກ Firebase Console (Project settings → Service accounts → Generate new private key)
 * ວາງທີ່ firebase-service-account.json ຂ້າງ package.json (ຫຼື ຕັ້ງ FIREBASE_SERVICE_ACCOUNT=path ໃນ .env) — ຫ້າມ commit.
 * ບໍ່ມີໄຟລ໌ = ປິດການສົ່ງ (ແຈ້ງເຕືອນໃນແອັບຍັງເຮັດວຽກປົກກະຕິ)
 */
/** ຊ່ອງແຈ້ງເຕືອນ Android ຄວາມສຳຄັນສູງ (ເດັ້ງຂຶ້ນຈໍ) — ສ້າງໃນ MainActivity.kt ຂອງແອັບ oacbroker, ຊື່ຕ້ອງກົງກັນ */
const ANDROID_CHANNEL = "oac_alerts";
/** FCM ຮັບບໍ່ເກີນ 500 token ຕໍ່ຄັ້ງ */
const BATCH = 500;
/** token ທີ່ເຄື່ອງຖອນແອັບ / ໝົດອາຍຸ — ລຶບອອກຈາກ tbl_device_token */
const DEAD_TOKEN = new Set(["messaging/registration-token-not-registered", "messaging/invalid-registration-token"]);
let messaging;
/** ເປີດ Firebase ເທື່ອດຽວ — ບໍ່ມີກະແຈ = null (log ເທື່ອດຽວ) */
const client = () => {
    if (messaging !== undefined)
        return messaging;
    const file = path_1.default.resolve(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT || "firebase-service-account.json");
    try {
        if (!fs_1.default.existsSync(file)) {
            console.log(`ℹ️  push: ບໍ່ພົບ ${file} — ປິດແຈ້ງເຕືອນເດັ້ງຂຶ້ນຈໍ`);
            messaging = null;
            return messaging;
        }
        const app = (0, app_1.getApps)()[0] ?? (0, app_1.initializeApp)({ credential: (0, app_1.cert)(JSON.parse(fs_1.default.readFileSync(file, "utf8"))) });
        messaging = (0, messaging_1.getMessaging)(app);
    }
    catch (error) {
        console.error("❌ push: ເປີດ Firebase ບໍ່ໄດ້", error);
        messaging = null;
    }
    return messaging;
};
/**
 * ສົ່ງແຈ້ງເຕືອນເດັ້ງຂຶ້ນຈໍ — ບໍ່ throw (ຜູ້ເອີ້ນບໍ່ຕ້ອງ await): ລົ້ມເຫຼວ ແຄ່ log,
 * ແຈ້ງເຕືອນຍັງຢູ່ໃນ tbl_notification ໃຫ້ເຫັນໃນແອັບ
 */
const sendPush = async (messages) => {
    const fcm = client();
    if (!fcm || !messages.length)
        return;
    try {
        const devices = await deviceToken_1.default.findAll({
            where: { employee_id: { [sequelize_1.Op.in]: [...new Set(messages.map((m) => m.employee_id))] } },
            attributes: ["token", "employee_id"],
            raw: true,
        });
        const tokensOf = new Map();
        for (const d of devices)
            tokensOf.set(Number(d.employee_id), [...(tokensOf.get(Number(d.employee_id)) ?? []), d.token]);
        const dead = [];
        for (const m of messages) {
            const tokens = tokensOf.get(m.employee_id) ?? [];
            for (let i = 0; i < tokens.length; i += BATCH) {
                const batch = tokens.slice(i, i + BATCH);
                const result = await fcm.sendEachForMulticast({
                    tokens: batch,
                    notification: { title: m.title, ...(m.body ? { body: m.body } : {}) },
                    data: m.data,
                    android: { priority: "high", notification: { channelId: ANDROID_CHANNEL, sound: "default" } },
                    apns: { payload: { aps: { sound: "default" } } },
                });
                result.responses.forEach((r, index) => {
                    if (!r.success && r.error && DEAD_TOKEN.has(r.error.code))
                        dead.push(batch[index]);
                });
            }
        }
        if (dead.length)
            await deviceToken_1.default.destroy({ where: { token: { [sequelize_1.Op.in]: dead } } });
    }
    catch (error) {
        console.error("❌ push:", error);
    }
};
exports.sendPush = sendPush;
