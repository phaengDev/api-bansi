"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAttendanceVoice = exports.durationText = void 0;
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const bansiHelpers_1 = require("../bansi/bansiHelpers");
const attendanceController_1 = require("./attendanceController");
/**
 * ສຽງເວົ້າພາສາລາວຂອງການເຂົ້າ-ອອກວຽກ (app) — Gemini TTS ສ້າງສຽງຕາມນາທີຈິງ ແລະ ເພດຂອງພະນັກງານ:
 * - GET /app/voice/attendance?kind=late|early&minutes= — "ທ່ານເຂົ້າວຽກຊ້າ … ນາທີ" / "ທ່ານອອກວຽກກ່ອນເວລາ … ຊົ່ວໂມງ … ນາທີ" (audio/wav)
 * ຍິງ (gender 2) = GEMINI_VOICE_FEMALE (Kore), ອື່ນໆ = GEMINI_VOICE_MALE (Charon) — ຄືກັບແອັບ (ໜ້າໂປຣໄຟລ໌).
 * ປະໂຫຍກທີ່ສ້າງແລ້ວເກັບໄວ້ private/voice-cache (ໃຊ້ຊ້ຳ ບໍ່ເອີ້ນ Gemini ອີກ — ໄວ ແລະ ບໍ່ເປືອງໂຄຕ້າ).
 * ບໍ່ຕັ້ງ GEMINI_API_KEY = ປິດ (503)
 */
const CACHE_DIR = path_1.default.join(__dirname, "..", "..", "private", "voice-cache");
const API = "https://generativelanguage.googleapis.com/v1beta/interactions";
/** ນາທີສູງສຸດທີ່ອ່ານ (12 ຊົ່ວໂມງ) */
const MAX_MINUTES = 12 * 60;
/** Gemini ສົ່ງ PCM ດິບ (ບໍ່ມີຫົວ WAV) = 24 kHz, 16-bit, mono */
const PCM_RATE = 24000;
const LEADS = { late: "ທ່ານເຂົ້າວຽກຊ້າ", early: "ທ່ານອອກວຽກກ່ອນເວລາ" };
const UNITS = ["", "ໜຶ່ງ", "ສອງ", "ສາມ", "ສີ່", "ຫ້າ", "ຫົກ", "ເຈັດ", "ແປດ", "ເກົ້າ"];
/** 1–99 ເປັນຄຳລາວ: 21 = ຊາວເອັດ, 35 = ສາມສິບຫ້າ (ອ່ານເປັນທຳມະຊາດກວ່າຕົວເລກ) */
const laoNumber = (n) => {
    if (n < 10)
        return UNITS[n];
    const tens = Math.floor(n / 10);
    const unit = n % 10;
    const head = tens === 1 ? "ສິບ" : tens === 2 ? "ຊາວ" : `${UNITS[tens]}ສິບ`;
    return head + (unit === 0 ? "" : unit === 1 ? "ເອັດ" : UNITS[unit]);
};
/** 85 → "ໜຶ່ງ ຊົ່ວໂມງ ຊາວຫ້າ ນາທີ" (ບໍ່ອ່ານສ່ວນທີ່ເປັນ 0) */
const durationText = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return [hours ? `${laoNumber(hours)} ຊົ່ວໂມງ` : "", rest ? `${laoNumber(rest)} ນາທີ` : ""].filter(Boolean).join(" ");
};
exports.durationText = durationText;
const voiceOf = (gender) => Number(gender) === 2 ? process.env.GEMINI_VOICE_FEMALE || "Kore" : process.env.GEMINI_VOICE_MALE || "Charon";
/** ຫົວ WAV ໃຫ້ PCM ດິບ */
const wavOf = (pcm) => {
    const header = Buffer.alloc(44);
    header.write("RIFF", 0);
    header.writeUInt32LE(36 + pcm.length, 4);
    header.write("WAVEfmt ", 8);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(PCM_RATE, 24);
    header.writeUInt32LE(PCM_RATE * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write("data", 36);
    header.writeUInt32LE(pcm.length, 40);
    return Buffer.concat([header, pcm]);
};
/** error ຂອງ Gemini → ລະຫັດ + ຂໍ້ຄວາມທີ່ສະແດງໃນແອັບ */
class VoiceError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
const synthesize = async (text, voice, key) => {
    let answer;
    try {
        answer = await fetch(API, {
            method: "POST",
            headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-tts",
                input: [{ type: "user_input", content: [{ type: "text", text }] }],
                response_format: { type: "audio" },
                generation_config: { speech_config: [{ voice }] },
            }),
            signal: AbortSignal.timeout(30 * 1000),
        });
    }
    catch {
        throw new VoiceError(504, "ສ້າງສຽງບໍ່ທັນ — ລອງໃໝ່");
    }
    if (answer.status === 429)
        throw new VoiceError(429, "ໃຊ້ສຽງເວົ້າເຕັມໂຄຕ້າແລ້ວ — ລອງໃໝ່ພາຍຫຼັງ");
    if (answer.status === 400 || answer.status === 401 || answer.status === 403) {
        console.error("❌ Gemini TTS:", answer.status, (await answer.text()).slice(0, 300));
        throw new VoiceError(503, "ກະແຈສຽງເວົ້າໃຊ້ບໍ່ໄດ້ — ຕິດຕໍ່ HR");
    }
    if (!answer.ok)
        throw new VoiceError(502, "ສ້າງສຽງບໍ່ສຳເລັດ — ລອງໃໝ່");
    const data = await answer.json();
    const audio = (data?.steps ?? [])
        .filter((s) => s?.type === "model_output")
        .flatMap((s) => s?.content ?? [])
        .filter((c) => c?.type === "audio" && c?.data)
        .pop();
    if (!audio)
        throw new VoiceError(502, "ສ້າງສຽງບໍ່ສຳເລັດ — ລອງໃໝ່");
    const bytes = Buffer.from(audio.data, "base64");
    return bytes.subarray(0, 4).toString() === "RIFF" ? bytes : wavOf(bytes);
};
/** ຄຳຂໍທີ່ກຳລັງສ້າງປະໂຫຍກດຽວກັນ — ລໍຖ້າອັນດຽວກັນ ບໍ່ເອີ້ນ Gemini ຊ້ຳ */
const pending = new Map();
/** ສຽງຂອງປະໂຫຍກ — ມີໃນ cache = ອ່ານໄຟລ໌, ບໍ່ມີ = ສ້າງແລ້ວບັນທຶກ */
const speechOf = (text, voice, key) => {
    const model = process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-tts";
    const name = `${voice}-${crypto_1.default.createHash("sha1").update(`${model}|${text}`).digest("hex").slice(0, 20)}.wav`;
    const file = path_1.default.join(CACHE_DIR, name);
    const running = pending.get(name);
    if (running)
        return running;
    const job = (async () => {
        try {
            return await fs_1.default.promises.readFile(file);
        }
        catch {
            const wav = await synthesize(text, voice, key);
            await fs_1.default.promises.mkdir(CACHE_DIR, { recursive: true });
            // ຂຽນໄຟລ໌ຊົ່ວຄາວກ່ອນ ແລ້ວປ່ຽນຊື່ — ບໍ່ມີໄຟລ໌ຂຽນບໍ່ຄົບຄ້າງໄວ້
            const temp = `${file}.${process.pid}.tmp`;
            await fs_1.default.promises.writeFile(temp, wav);
            await fs_1.default.promises.rename(temp, file);
            return wav;
        }
    })().finally(() => pending.delete(name));
    pending.set(name, job);
    return job;
};
/** GET /app/voice/attendance?kind=late|early&minutes= */
const getAttendanceVoice = async (req, res) => {
    try {
        const self = await (0, attendanceController_1.selfEmployee)(req);
        if ("code" in self) {
            res.status(self.code).json({ message: self.message });
            return;
        }
        const key = process.env.GEMINI_API_KEY?.trim();
        if (!key) {
            res.status(503).json({ message: "ສຽງເວົ້າຍັງບໍ່ໄດ້ເປີດໃຊ້ — ຕິດຕໍ່ HR" });
            return;
        }
        const kind = String(req.query.kind ?? "");
        const minutes = Number(req.query.minutes);
        if (!(kind in LEADS) || !Number.isInteger(minutes) || minutes < 1 || minutes > MAX_MINUTES) {
            res.status(400).json({ message: "ຂໍ້ມູນສຽງບໍ່ຖືກຕ້ອງ" });
            return;
        }
        const wav = await speechOf(`${LEADS[kind]} ${(0, exports.durationText)(minutes)}`, voiceOf(self.employee.gender), key);
        res.setHeader("Cache-Control", "private, max-age=604800");
        res.type("audio/wav").send(wav);
    }
    catch (error) {
        if (error instanceof VoiceError) {
            res.status(error.code).json({ message: error.message });
            return;
        }
        (0, bansiHelpers_1.sendError)(res, error, "Error creating attendance voice");
    }
};
exports.getAttendanceVoice = getAttendanceVoice;
