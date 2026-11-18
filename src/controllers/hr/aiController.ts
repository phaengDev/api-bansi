import Anthropic from "@anthropic-ai/sdk";
import moment from "moment";
import { Request, Response } from "express";
import AiUsage from "../../models/aiUsage";
import { sendError } from "../bansi/bansiHelpers";
import { aiTools, ProposedPlan } from "./aiTools";
import { selfEmployee } from "./attendanceController";
import { findCompany, holidaysBetween, isWorkday, todayLao, workRulesOf } from "./workCalendar";

/**
 * ຜູ້ຊ່ວຍ AI ຂອງແອັບພະນັກງານ (Claude) — ຖາມ-ຕອບທຸກຢ່າງທີ່ແອັບມີ ກ່ຽວກັບຕົນເອງ (ການເຂົ້າວຽກ, ວັນລາ, ເງິນເດືອນ,
 * ເບີກເງິນ, OT, ວັນພັກ, ບໍລິສັດ, ວຽກ / ແຜນວຽກ, ທີມ, ບັນຊີ, ໂນດ…) + ຊ່ວຍວາງແຜນວຽກ.
 * AI ອ່ານຂໍ້ມູນຜ່ານເຄື່ອງມື (aiTools.ts) ທີ່ເອີ້ນ endpoint "ຂອງຂ້ອຍ" ດ້ວຍ token ຂອງຄົນທີ່ຖາມ — ເຫັນສະເພາະຂໍ້ມູນຂອງຕົນເອງ.
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
/** ວັນພັກລ່ວງໜ້າ (ມື້) ທີ່ໃຊ້ເລື່ອນມື້ເລີ່ມຂອງແຜນທີ່ສະເໜີ */
const AHEAD_DAYS = 120;
/** ຮອບ AI ↔ ເຄື່ອງມື ຕໍ່ຄຳຖາມ — ກັນ loop ບໍ່ຈົບ / ຄ່າໃຊ້ຈ່າຍ */
const MAX_ROUNDS = 6;

const SYSTEM = `You are "ຜູ້ຊ່ວຍ AI", the assistant inside OAC HR, the staff app of OAC Insurance Broker (Laos). You answer one employee's questions about anything the app holds for them, and help them plan their work.

Use the tools to look up the employee's data before you answer: attendance, leave types and balances, salary and payslips, salary advances, overtime, forgot-scan requests, public holidays, company working hours and uniforms, tasks and work plans, work history, colleagues and the org chart, birthdays, their personal money ledger and notes. Pick the tools that answer the question and call independent ones together. Never guess a number, date or name: if the data doesn't contain it, say so. Questions about "this month" or "this year" mean the dates below.

The tools return only this employee's own records, plus the colleague directory and org chart that every employee can see in the app. Never reveal or estimate another employee's salary, attendance or leave.

You can read data but you cannot change it. When the employee wants to act (request leave, scan in or out, report a forgotten scan, request an advance, update a plan), tell them where in the app: bottom bar ວັນລາພັກ, ວັນພັກ, ໜ້າຫຼັກ (the big middle button), ເຄື່ອງແບບ, ໂປຣໄຟລ໌; home page icons ແຜນວຽກ, ຂໍລາພັກ, ຄຳຮ້ອງ, ເງິນເດືອນ, ບັນຊີ, ປະຫວັດເຂົ້າວຽກ, ປະຫວັດການເຮັດວຽກ, ໂນດ, ທີມງານ; scanning is on the home page's today card; salary advances are in ໂປຣໄຟລ໌ and ເງິນເດືອນ.

Planning: when the employee asks for help planning or wants to add work, check their plans and the calendar, then call propose_plans with concrete items (short title, one-line note, start_date / end_date as YYYY-MM-DD, from today on, on workdays, realistic durations) and explain them briefly. The app shows them with a save button, so don't say they are saved.

Summaries of work: group as done, in progress, overdue and upcoming, mention progress and overdue items, and end with one or two next steps.

Reply in Lao, warm and concise: short paragraphs or "•" bullet lines, no Markdown headings, tables or bold. Write money as ₭ with thousands separators (₭ 1,500,000) and dates as day month year in Lao.`;

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

/** ຂໍ້ມູນສັ້ນທີ່ປ່ຽນທຸກມື້ / ທຸກຄົນ (ຢູ່ຫຼັງ cache) — ສ່ວນທີ່ເຫຼືອ AI ອ່ານຜ່ານເຄື່ອງມື */
const contextOf = (employee: any, today: string) => {
  const name = [employee.first_name, employee.last_name].filter(Boolean).join(" ");
  const job = [employee.position?.position_name, employee.department?.depart_name].filter(Boolean).join(", ");
  return [
    `ມື້ນີ້: ${dayLabel(today)}; ເດືອນນີ້ ${today.slice(0, 7)}; ປີນີ້ ${today.slice(0, 4)}`,
    `ພະນັກງານທີ່ຖາມ: ${name} (${employee.emp_code ?? ""})${job ? ` — ${job}` : ""}`,
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
const TOO_MANY_ROUNDS = "ຄຳຖາມນີ້ຕ້ອງຊອກຂໍ້ມູນຫຼາຍເກີນ — ລອງຖາມໃຫ້ແຄບລົງ ເຊັ່ນ ລະບຸເດືອນ ຫຼື ເລື່ອງດຽວ";

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

    const rules = workRulesOf(await findCompany());
    const holidays = await holidaysBetween(today, moment(today).add(AHEAD_DAYS, "days").format("YYYY-MM-DD"));
    const proposed: ProposedPlan[] = [];
    const tools = aiTools(req, self.employee._uuid, today, (raw) => {
      const valid = plansOf(raw, today, rules, holidays).slice(0, MAX_PLANS - proposed.length);
      proposed.push(...valid);
      return valid.length;
    });

    // ຮອບ AI → ເຄື່ອງມື → AI … ຈົນຕອບ (ສູງສຸດ MAX_ROUNDS); ນັບ token ທຸກຮອບ
    let final: Anthropic.Beta.BetaMessage | undefined;
    const spent = { input: 0, output: 0 };
    try {
      const runner = ai.beta.messages.toolRunner({
        model: MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        // ເຄື່ອງມື + ຄຳສັ່ງ ຄົງທີ່ (cache ຂ້າມຄຳຖາມ ແລະ ຂ້າມຄົນ); ມື້ນີ້ / ຊື່ ຢູ່ຫຼັງ
        system: [
          { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
          { type: "text", text: contextOf(self.employee, today) },
        ],
        // ຮອບຕໍ່ໄປອ່ານບົດສົນທະນາ + ຜົນເຄື່ອງມືຂອງຮອບກ່ອນຈາກ cache
        cache_control: { type: "ephemeral" },
        tools,
        messages,
        output_config: { effort: "low" },
        max_iterations: MAX_ROUNDS,
      });
      for await (const message of runner) {
        final = message;
        const used = message.usage;
        spent.input += (used.input_tokens ?? 0) + (used.cache_read_input_tokens ?? 0) + (used.cache_creation_input_tokens ?? 0);
        spent.output += used.output_tokens ?? 0;
      }
    } catch (error) {
      console.error("❌ ai chat:", error);
      if (spent.input || spent.output) await usage.increment({ input_tokens: spent.input, output_tokens: spent.output });
      if (error instanceof Anthropic.RateLimitError) res.status(429).json({ message: "ຜູ້ຊ່ວຍ AI ມີຄົນໃຊ້ຫຼາຍ — ລອງໃໝ່ໃນອີກບໍ່ເທົ່າໃດນາທີ" });
      else if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) res.status(503).json({ message: "ກະແຈຂອງຜູ້ຊ່ວຍ AI ໃຊ້ບໍ່ໄດ້ — ຕິດຕໍ່ HR" });
      else if (error instanceof Anthropic.APIConnectionError) res.status(504).json({ message: "ເຊື່ອມຕໍ່ຜູ້ຊ່ວຍ AI ບໍ່ໄດ້ — ລອງໃໝ່" });
      else res.status(502).json({ message: ERROR_MESSAGE });
      return;
    }

    await usage.increment({ requests: 1, input_tokens: spent.input, output_tokens: spent.output });
    const left = Math.max(0, DAILY_LIMIT - usage.requests - 1);
    const plans = proposed.slice(0, MAX_PLANS);

    if (!final || final.stop_reason === "refusal") {
      res.status(200).json({ reply: "ຂໍອະໄພ ຂ້ອຍຕອບຄຳຖາມນີ້ບໍ່ໄດ້ — ລອງຖາມແບບອື່ນ", plans: [], left });
      return;
    }
    const text = final.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
    // ຮອບໝົດ ແຕ່ AI ຍັງຢາກໃຊ້ເຄື່ອງມື = ຍັງບໍ່ໄດ້ຕອບ
    const reply = text || (final.stop_reason === "tool_use" ? TOO_MANY_ROUNDS : ERROR_MESSAGE);
    res.status(200).json({
      reply,
      plans,
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
