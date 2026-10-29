import fs from "fs";
import path from "path";
import { Op } from "sequelize";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging, type Messaging } from "firebase-admin/messaging";
import DeviceToken from "../models/deviceToken";

/**
 * ແຈ້ງເຕືອນເດັ້ງຂຶ້ນຈໍມືຖື ຜ່ານ Firebase Cloud Messaging (ຟຣີ) — ສົ່ງຫາທຸກເຄື່ອງ (tbl_device_token) ຂອງພະນັກງານ.
 * ກະແຈ: ໄຟລ໌ service account ຈາກ Firebase Console (Project settings → Service accounts → Generate new private key)
 * ວາງທີ່ firebase-service-account.json ຂ້າງ package.json (ຫຼື ຕັ້ງ FIREBASE_SERVICE_ACCOUNT=path ໃນ .env) — ຫ້າມ commit.
 * ບໍ່ມີໄຟລ໌ = ປິດການສົ່ງ (ແຈ້ງເຕືອນໃນແອັບຍັງເຮັດວຽກປົກກະຕິ)
 */

/** ຊ່ອງແຈ້ງເຕືອນ Android ຄວາມສຳຄັນສູງ (ເດັ້ງຂຶ້ນຈໍ) — ສ້າງໃນ MainActivity.kt ຂອງແອັບ oacbroker, ຊື່ຕ້ອງກົງກັນ */
const ANDROID_CHANNEL = "oac_alerts";
/**
 * ສຽງເວົ້າພາສາລາວຂອງແຈ້ງເຕືອນ — ໄຟລ໌ຢູ່ໃນແອັບ: Android res/raw/<sound> + ຊ່ອງແຈ້ງເຕືອນຂອງມັນ (ສຽງຂອງຊ່ອງ Android
 * ຕັ້ງໄດ້ຕອນສ້າງຊ່ອງເທົ່ານັ້ນ — MainActivity.kt), iOS Runner/<sound>.caf. ເຄື່ອງທີ່ປິດສຽງເວົ້າໃນແອັບ (voice = 0) ໄດ້ສຽງທຳມະດາ
 */
export const VOICES = {
  /** ເຕືອນກົດອອກວຽກ — ສຽງຍິງ / ຊາຍ ຕາມເພດພະນັກງານ (checkoutReminder.ts) */
  checkout: { sound: "checkout_reminder", channel: "oac_checkout" },
  checkout_male: { sound: "checkout_reminder_male", channel: "oac_checkout_male" },
} as const;
export type Voice = keyof typeof VOICES;

/** FCM ຮັບບໍ່ເກີນ 500 token ຕໍ່ຄັ້ງ */
const BATCH = 500;
/** token ທີ່ເຄື່ອງຖອນແອັບ / ໝົດອາຍຸ — ລຶບອອກຈາກ tbl_device_token */
const DEAD_TOKEN = new Set(["messaging/registration-token-not-registered", "messaging/invalid-registration-token"]);

export type PushMessage = {
  employee_id: number;
  title: string;
  body?: string | null;
  /** ໃຫ້ app ເປີດໜ້າທີ່ກ່ຽວຂ້ອງເມື່ອກົດ (ຄືກັບແຖວຂອງ GET /notification/me) */
  data: { id: string; type: string; ref: string };
  /** ສຽງເວົ້າແທນສຽງແຈ້ງເຕືອນທຳມະດາ */
  voice?: Voice;
};

let messaging: Messaging | null | undefined;

/** ເປີດ Firebase ເທື່ອດຽວ — ບໍ່ມີກະແຈ = null (log ເທື່ອດຽວ) */
const client = () => {
  if (messaging !== undefined) return messaging;
  const file = path.resolve(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT || "firebase-service-account.json");
  try {
    if (!fs.existsSync(file)) {
      console.log(`ℹ️  push: ບໍ່ພົບ ${file} — ປິດແຈ້ງເຕືອນເດັ້ງຂຶ້ນຈໍ`);
      messaging = null;
      return messaging;
    }
    const app = getApps()[0] ?? initializeApp({ credential: cert(JSON.parse(fs.readFileSync(file, "utf8"))) });
    messaging = getMessaging(app);
  } catch (error) {
    console.error("❌ push: ເປີດ Firebase ບໍ່ໄດ້", error);
    messaging = null;
  }
  return messaging;
};

/**
 * ສົ່ງແຈ້ງເຕືອນເດັ້ງຂຶ້ນຈໍ — ບໍ່ throw (ຜູ້ເອີ້ນບໍ່ຕ້ອງ await): ລົ້ມເຫຼວ ແຄ່ log,
 * ແຈ້ງເຕືອນຍັງຢູ່ໃນ tbl_notification ໃຫ້ເຫັນໃນແອັບ
 */
export const sendPush = async (messages: PushMessage[]) => {
  const fcm = client();
  if (!fcm || !messages.length) return;
  try {
    const devices = await DeviceToken.findAll({
      where: { employee_id: { [Op.in]: [...new Set(messages.map((m) => m.employee_id))] } },
      attributes: ["token", "employee_id", "voice"],
      raw: true,
    });
    const devicesOf = new Map<number, typeof devices>();
    for (const d of devices) devicesOf.set(Number(d.employee_id), [...(devicesOf.get(Number(d.employee_id)) ?? []), d]);

    const dead: string[] = [];
    const send = async (m: PushMessage, tokens: string[], voice?: (typeof VOICES)[Voice]) => {
      for (let i = 0; i < tokens.length; i += BATCH) {
        const batch = tokens.slice(i, i + BATCH);
        const result = await fcm.sendEachForMulticast({
          tokens: batch,
          notification: { title: m.title, ...(m.body ? { body: m.body } : {}) },
          data: m.data,
          android: { priority: "high", notification: { channelId: voice?.channel ?? ANDROID_CHANNEL, sound: voice?.sound ?? "default" } },
          apns: { payload: { aps: { sound: voice ? `${voice.sound}.caf` : "default" } } },
        });
        result.responses.forEach((r, index) => {
          if (!r.success && r.error && DEAD_TOKEN.has(r.error.code)) dead.push(batch[index]);
        });
      }
    };
    for (const m of messages) {
      const mine = devicesOf.get(m.employee_id) ?? [];
      const voice = m.voice ? VOICES[m.voice] : undefined;
      const voiced = voice ? mine.filter((d) => Number(d.voice) !== 0) : [];
      await send(m, mine.filter((d) => !voiced.includes(d)).map((d) => d.token));
      await send(m, voiced.map((d) => d.token), voice);
    }
    if (dead.length) await DeviceToken.destroy({ where: { token: { [Op.in]: dead } } });
  } catch (error) {
    console.error("❌ push:", error);
  }
};
