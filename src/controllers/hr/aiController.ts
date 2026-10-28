import Anthropic from "@anthropic-ai/sdk";
import moment from "moment";
import { Request, Response } from "express";
import { Op } from "sequelize";
import AiUsage from "../../models/aiUsage";
import WorkPlan from "../../models/workPlanModel";
import { sendError } from "../bansi/bansiHelpers";
import { selfEmployee } from "./attendanceController";
import { planOf } from "./myWorkPlanController";
import { findCompany, holidaysBetween, isWorkday, todayLao, workRulesOf } from "./workCalendar";

/**
 * ຜູ້ຊ່ວຍ AI ໃນເມນູແຜນວຽກຂອງແອັບພະນັກງານ (Claude) — ຊ່ວຍວາງແຜນ, ສະຫຼຸບວຽກ, ຖາມ-ຕອບ ກ່ຽວກັບແຜນວຽກຂອງຕົນເອງ.
 * ກະແຈ ANTHROPIC_API_KEY ຢູ່ .env ຂອງເຊີບເວີເທົ່ານັ້ນ (ບໍ່ມີ = ປິດ). ແອັບສົ່ງບົດສົນທະນາທັງໝົດມາທຸກເທື່ອ (ເຊີບເວີບໍ່ເກັບ);
 * ແຜນທີ່ AI ສະເໜີ ສົ່ງກັບໄປໃຫ້ແອັບສະແດງ — ພະນັກງານກົດບັນທຶກເອງຜ່ານ POST /employee/me/workplan
 */

const MODEL = "claude-opus-5-5";
/** ຈຳນວນຄຳຖາມຕໍ່ຄົນຕໍ່ມື້ — ກັນຄ່າໃຊ້ຈ່າຍບານປາຍ */
const DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT) || 30;
/** ບົດສົນທະນາທີ່ສົ່ງໃຫ້ AI (ຂໍ້ຄວາມຫຼ້າສຸດ) */
const MAX_TURNS = 12;
const MAX_USER_TEXT = 2000;
const MAX_ASSISTANT_TEXT = 4000;
/** ແຜນທີ່ສະເໜີໄດ້ຕໍ່ຄຳຕອບ */
const MAX_PLANS = 10;
/** ຂໍ້ມູນແຜນວຽກທີ່ໃຫ້ AI ອ່ານ: ຍ້ອນຫຼັງ / ລ່ວງໜ້າ (ມື້) */
const PAST_DAYS = 45;
const AHEAD_DAYS = 60;

const SYSTEM = `You are "ຜູ້ຊ່ວຍ AI", the assistant inside OAC HR, the staff app of OAC Insurance Broker (Laos). You help one employee with their own work plans: planning work, summarizing what they have done, and answering questions about their plans.

Always reply in Lao, warm and concise — short paragraphs or "•" bullet lines, no Markdown headings or tables. The employee's data and today's date follow below; rely only on that data and never invent plans, progress or dates. When something isn't in the data, say so.

Planning: when the employee asks for help planning or wants to add work, propose concrete plan items in "plans" — a short title (under 80 characters), a one-line note, and start_date / end_date as YYYY-MM-DD, no earlier than today, on workdays, with realistic durations. Explain the proposal briefly in "reply". The app shows the proposals with a save button, so don't say they are already saved. For every other answer, "plans" is an empty array.

Summaries: group work as done, in progress, overdue and upcoming, mention progress percentages and overdue items, and end with one or two suggested next steps.

Topics outside work plans (salary, leave balance, other employees, company policies not in the data): say briefly that you only help with work plans and point to the matching menu in the app (ເງິນເດືອນ, ຂໍລາພັກ, ປະຫວັດເຂົ້າວຽກ).`;

/** ຄຳຕອບຂອງ AI (structured output) */
const REPLY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "plans"],
  properties: {
    reply: { type: "string" },
    plans: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "note", "start_date", "end_date"],
        properties: {
          title: { type: "string" },
          note: { type: "string" },
          start_date: { type: "string" },
          end_date: { type: "string" },
        },
      },
    },
  },
};

type ProposedPlan = { title: string; note: string; start_date: string; end_date: string };

let anthropic: Anthropic | null | undefined;
/** ເປີດເທື່ອດຽວ — ບໍ່ມີກະແຈ = null (ປິດຜູ້ຊ່ວຍ AI) */
const client = () => {
  if (anthropic === undefined) anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ timeout: 90 * 1000, maxRetries: 1 }) : null;
  return anthropic;
};

const WEEKDAYS = ["ອາທິດ", "ຈັນ", "ອັງຄານ", "ພຸດ", "ພະຫັດ", "ສຸກ", "ເສົາ"];
const dayLabel = (date: string) => `${date} (ວັນ${WEEKDAYS[moment(date, "YYYY-MM-DD").day()]})`;
const clip = (text: unknown, max: number) => {
  const value = String(text ?? "").replace(/\s+/g, " ").trim();
  return value.length > max ? `${value.slice(0, max)}…` : value;
};

/** ຂໍ້ມູນຂອງພະນັກງານຄົນນີ້ທີ່ AI ອ່ານ: ມື້ນີ້, ເວລາເຮັດວຽກ, ວັນພັກ, ແຜນວຽກ (ລວມປະຫວັດອັບເດດຫຼ້າສຸດ) */
const contextOf = async (employee: any, today: string) => {
  const from = moment(today).subtract(PAST_DAYS, "days").format("YYYY-MM-DD");
  const to = moment(today).add(AHEAD_DAYS, "days").format("YYYY-MM-DD");
  const [company, holidays, rows] = await Promise.all([
    findCompany(),
    holidaysBetween(today, to),
    WorkPlan.findAll({
      where: {
        employee_id: employee._uuid,
        status: 1,
        start_date: { [Op.lte]: to },
        [Op.or]: [{ done: 0 }, { end_date: { [Op.gte]: from } }],
      },
      order: [["start_date", "ASC"], ["createdAt", "ASC"]],
      limit: 120,
    }),
  ]);
  const rules = workRulesOf(company);
  const plans = rows.map((r) => planOf(r, true) as any).map((p) => {
    const state = p.done ? "ສຳເລັດແລ້ວ" : p.end_date < today ? "ກາຍກຳນົດ" : p.start_date > today ? "ຍັງບໍ່ເລີ່ມ" : "ກຳລັງເຮັດ";
    const updates = (p.updates ?? [])
      .filter((u: any) => u.note)
      .slice(-3)
      .map((u: any) => `${String(u.at).slice(0, 10)} ${u.progress}%: ${clip(u.note, 160)}`);
    return [
      `- ${clip(p.title, 120)} | ${p.start_date} → ${p.end_date} | ${state} ${p.progress}%`,
      p.note ? `  ລາຍລະອຽດ: ${clip(p.note, 240)}` : null,
      updates.length ? `  ອັບເດດ: ${updates.join(" / ")}` : null,
    ].filter(Boolean).join("\n");
  });
  const name = [employee.first_name, employee.last_name].filter(Boolean).join(" ");
  const job = [employee.position?.position_name, employee.department?.depart_name].filter(Boolean).join(", ");
  return [
    `ມື້ນີ້: ${dayLabel(today)}`,
    `ພະນັກງານ: ${name}${job ? ` (${job})` : ""}`,
    `ເວລາເຮັດວຽກ: ${rules.start}–${rules.end}; ວັນພັກປະຈຳອາທິດ: ${rules.daysOff.map((d) => `ວັນ${WEEKDAYS[d]}`).join(", ") || "ບໍ່ມີ"}`,
    `ວັນພັກ ${AHEAD_DAYS} ມື້ຂ້າງໜ້າ: ${[...holidays].map(([d, n]) => `${d} ${n}`).join("; ") || "ບໍ່ມີ"}`,
    `ແຜນວຽກ (${PAST_DAYS} ມື້ຜ່ານມາ ຮອດ ${AHEAD_DAYS} ມື້ຂ້າງໜ້າ, ລວມແຜນເກົ່າທີ່ຍັງບໍ່ສຳເລັດ):`,
    plans.length ? plans.join("\n") : "- (ຍັງບໍ່ມີແຜນວຽກ)",
  ].join("\n");
};

/** ບົດສົນທະນາຈາກແອັບ — ສະລັບ user / assistant, ເລີ່ມ ແລະ ຈົບດ້ວຍ user */
const historyOf = (raw: unknown): Anthropic.Beta.BetaMessageParam[] | null => {
  if (!Array.isArray(raw) || !raw.length) return null;
  const turns = raw.slice(-MAX_TURNS).map((m: any) => ({
    role: m?.role === "assistant" ? ("assistant" as const) : ("user" as const),
    content: String(m?.content ?? "").trim().slice(0, m?.role === "assistant" ? MAX_ASSISTANT_TEXT : MAX_USER_TEXT),
  }));
  while (turns.length && turns[0].role !== "user") turns.shift();
  if (!turns.length || turns[turns.length - 1].role !== "user" || turns.some((t) => !t.content)) return null;
  return turns;
};

/** ແຜນທີ່ AI ສະເໜີ — ຕັດອັນທີ່ວັນທີຜິດ / ກ່ອນມື້ນີ້ອອກ ແລະ ເລື່ອນໄປມື້ເຮັດວຽກ */
const plansOf = (raw: unknown, today: string, rules: ReturnType<typeof workRulesOf>, holidays: Map<string, string>): ProposedPlan[] => {
  if (!Array.isArray(raw)) return [];
  const valid = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && moment(d, "YYYY-MM-DD", true).isValid();
  return raw
    .map((p: any) => ({
      title: clip(p?.title, 120),
      note: clip(p?.note, 500),
      start_date: String(p?.start_date ?? ""),
      end_date: String(p?.end_date ?? ""),
    }))
    .filter((p) => p.title && valid(p.start_date) && valid(p.end_date) && p.start_date >= today && p.end_date >= p.start_date)
    .map((p) => {
      // ມື້ເລີ່ມກົງວັນພັກ = ເລື່ອນໄປມື້ເຮັດວຽກຖັດໄປ (ບໍ່ເກີນມື້ສຸດທ້າຍ)
      let start = p.start_date;
      for (let i = 0; i < 14 && start < p.end_date && !isWorkday(start, rules, holidays); i++) start = moment(start).add(1, "day").format("YYYY-MM-DD");
      return { ...p, start_date: start };
    })
    .slice(0, MAX_PLANS);
};

const ERROR_MESSAGE = "ຜູ້ຊ່ວຍ AI ຕອບບໍ່ໄດ້ຕອນນີ້ — ລອງໃໝ່ອີກຄັ້ງ";

/**
 * ອ່ານຄຳຕອບເປັນສຽງພາສາລາວ — Azure AI Speech (ສຽງ lo-LA Neural): AZURE_SPEECH_KEY + AZURE_SPEECH_REGION ໃນ .env
 * (ບໍ່ມີ = ປິດ, ແອັບບໍ່ສະແດງປຸ່ມ 🔊). ໂທລະສັບບໍ່ມີສຽງອ່ານພາສາລາວໃນເຄື່ອງ ຈຶ່ງຕ້ອງອ່ານຢູ່ເຊີບເວີ
 */
const speech = () => {
  const key = process.env.AZURE_SPEECH_KEY;
  return key
    ? { key, region: process.env.AZURE_SPEECH_REGION || "southeastasia", voice: process.env.AZURE_SPEECH_VOICE || "lo-LA-KeomanyNeural" }
    : null;
};
/** ຕົວອັກສອນທີ່ອ່ານໄດ້ຕໍ່ເທື່ອ / ຕໍ່ຄົນຕໍ່ມື້ */
const MAX_SPEAK = 1500;
const DAILY_SPEECH = Number(process.env.AI_DAILY_SPEECH_CHARS) || 20000;
const xmlEscape = (text: string) => text.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

/**
 * POST /app/ai/chat { messages: [{ role: "user" | "assistant", content }] } — ຄຳຕອບ { reply, plans, left }
 * (left = ຖາມໄດ້ອີກຈັກເທື່ອມື້ນີ້). ພະນັກງານເຫັນສະເພາະຂໍ້ມູນຂອງຕົນເອງ
 */
export const aiChat = async (req: Request, res: Response) => {
  try {
    const ai = client();
    if (!ai) {
      res.status(503).json({ message: "ຜູ້ຊ່ວຍ AI ຍັງບໍ່ໄດ້ເປີດໃຊ້ — ຕິດຕໍ່ HR" });
      return;
    }
    const self = await selfEmployee(req);
    if ("code" in self) {
      res.status(self.code).json({ message: self.message });
      return;
    }
    const messages = historyOf(req.body?.messages);
    if (!messages) {
      res.status(400).json({ message: "ກະລຸນາພິມຄຳຖາມ" });
      return;
    }
    const today = todayLao();
    const [usage] = await AiUsage.findOrCreate({ where: { employee_id: self.employee._uuid, usage_date: today } });
    if (usage.requests >= DAILY_LIMIT) {
      res.status(429).json({ message: `ມື້ນີ້ຖາມຄົບ ${DAILY_LIMIT} ເທື່ອແລ້ວ — ຖາມໃໝ່ໄດ້ມື້ອື່ນ` });
      return;
    }

    const context = await contextOf(self.employee, today);
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await ai.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        // ຄຳສັ່ງຄົງທີ່ cache ໄດ້; ຂໍ້ມູນຂອງພະນັກງານ (ປ່ຽນທຸກມື້) ຢູ່ຫຼັງ
        system: [
          { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
          { type: "text", text: context },
        ],
        messages,
        output_config: { effort: "low", format: { type: "json_schema", schema: REPLY_SCHEMA } },
      });
    } catch (error) {
      console.error("❌ ai chat:", error);
      if (error instanceof Anthropic.RateLimitError) res.status(429).json({ message: "ຜູ້ຊ່ວຍ AI ມີຄົນໃຊ້ຫຼາຍ — ລອງໃໝ່ໃນອີກບໍ່ເທົ່າໃດນາທີ" });
      else if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) res.status(503).json({ message: "ກະແຈຂອງຜູ້ຊ່ວຍ AI ໃຊ້ບໍ່ໄດ້ — ຕິດຕໍ່ HR" });
      else if (error instanceof Anthropic.APIConnectionError) res.status(504).json({ message: "ເຊື່ອມຕໍ່ຜູ້ຊ່ວຍ AI ບໍ່ໄດ້ — ລອງໃໝ່" });
      else res.status(502).json({ message: ERROR_MESSAGE });
      return;
    }

    const used = response.usage;
    await usage.increment({
      requests: 1,
      input_tokens: (used.input_tokens ?? 0) + (used.cache_read_input_tokens ?? 0) + (used.cache_creation_input_tokens ?? 0),
      output_tokens: used.output_tokens ?? 0,
    });
    const left = Math.max(0, DAILY_LIMIT - usage.requests - 1);

    if (response.stop_reason === "refusal") {
      res.status(200).json({ reply: "ຂໍອະໄພ ຂ້ອຍຕອບຄຳຖາມນີ້ບໍ່ໄດ້ — ລອງຖາມກ່ຽວກັບແຜນວຽກແບບອື່ນ", plans: [], left });
      return;
    }
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    let parsed: { reply?: unknown; plans?: unknown };
    try {
      parsed = JSON.parse(text);
    } catch {
      console.error("❌ ai chat: ອ່ານຄຳຕອບບໍ່ໄດ້", response.stop_reason, text.slice(0, 200));
      res.status(502).json({ message: ERROR_MESSAGE });
      return;
    }
    const rules = workRulesOf(await findCompany());
    const holidays = await holidaysBetween(today, moment(today).add(AHEAD_DAYS * 2, "days").format("YYYY-MM-DD"));
    res.status(200).json({
      reply: String(parsed.reply ?? "").trim() || ERROR_MESSAGE,
      plans: plansOf(parsed.plans, today, rules, holidays),
      left,
      // ອ່ານເປັນສຽງໄດ້ (POST /app/ai/speak)
      speak: !!speech(),
    });
  } catch (error) {
    sendError(res, error, "Error in AI chat");
  }
};

/**
 * POST /app/ai/speak { text } — ຄຳຕອບຂອງຜູ້ຊ່ວຍ AI ເປັນສຽງພາສາລາວ (audio/wav 24kHz mono — ແອັບຫຼິ້ນຜ່ານຊ່ອງ "oac/voice")
 */
export const aiSpeak = async (req: Request, res: Response) => {
  try {
    const tts = speech();
    if (!tts) {
      res.status(503).json({ message: "ການອ່ານເປັນສຽງຍັງບໍ່ໄດ້ເປີດໃຊ້" });
      return;
    }
    const self = await selfEmployee(req);
    if ("code" in self) {
      res.status(self.code).json({ message: self.message });
      return;
    }
    // ອ່ານເປັນປະໂຫຍກ: ຕັດເຄື່ອງໝາຍລາຍການ "•" ອອກ
    const text = String(req.body?.text ?? "").replace(/[•*#]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_SPEAK);
    if (!text) {
      res.status(400).json({ message: "ບໍ່ມີຂໍ້ຄວາມໃຫ້ອ່ານ" });
      return;
    }
    const [usage] = await AiUsage.findOrCreate({ where: { employee_id: self.employee._uuid, usage_date: todayLao() } });
    if (usage.speech_chars + text.length > DAILY_SPEECH) {
      res.status(429).json({ message: "ມື້ນີ້ຟັງສຽງຄົບແລ້ວ — ອ່ານເປັນຕົວໜັງສືໄດ້ຢູ່" });
      return;
    }
    const answer = await fetch(`https://${tts.region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": tts.key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "riff-24khz-16bit-mono-pcm",
        "User-Agent": "oac-hr",
      },
      body: `<speak version="1.0" xml:lang="lo-LA"><voice name="${tts.voice}">${xmlEscape(text)}</voice></speak>`,
      signal: AbortSignal.timeout(30 * 1000),
    });
    if (!answer.ok) {
      console.error("❌ ai speak:", answer.status, (await answer.text()).slice(0, 200));
      res.status(502).json({ message: "ອ່ານເປັນສຽງບໍ່ໄດ້ຕອນນີ້ — ລອງໃໝ່" });
      return;
    }
    const wav = Buffer.from(await answer.arrayBuffer());
    await usage.increment({ speech_chars: text.length });
    res.status(200).type("audio/wav").send(wav);
  } catch (error) {
    sendError(res, error, "Error in AI speak");
  }
};
