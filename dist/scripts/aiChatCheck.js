"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * ຖາມຜູ້ຊ່ວຍ AI 1 ຄຳຖາມຜ່ານ handler ຈິງ (ເອີ້ນ Claude — ເສຍເງິນແທ້, ນັບເປັນ 1 ຄຳຖາມຂອງພະນັກງານຄົນນັ້ນ) ບໍ່ autoSync:
 *   npx ts-node src/scripts/aiChatCheck.ts <ລະຫັດພະນັກງານ (_uuid)> "<ຄຳຖາມ>"
 * ພິມຄຳຕອບ, ແຜນທີ່ສະເໜີ, ເວລາ ແລະ token ທີ່ໃຊ້ (ຈາກ tbl_ai_usage)
 */
require("dotenv/config");
const aiUsage_1 = __importDefault(require("../models/aiUsage"));
const aiController_1 = require("../controllers/hr/aiController");
const workCalendar_1 = require("../controllers/hr/workCalendar");
const auth_1 = require("../middleware/auth");
const main = async () => {
    const id = Number(process.argv[2]);
    const question = process.argv[3];
    const where = { employee_id: id, usage_date: (0, workCalendar_1.todayLao)() };
    const before = await aiUsage_1.default.findOne({ where });
    const req = { user: { sub: id, typ: auth_1.EMPLOYEE_TOKEN }, headers: {}, query: {}, params: {}, body: { messages: [{ role: "user", content: question }] } };
    const started = Date.now();
    const body = await new Promise((resolve) => {
        let status = 200;
        const res = {
            status(code) {
                status = code;
                return res;
            },
            json(value) {
                resolve({ status, ...value });
                return res;
            },
        };
        (0, aiController_1.aiChat)(req, res);
    });
    const after = await aiUsage_1.default.findOne({ where });
    console.log(`status ${body.status} · ${((Date.now() - started) / 1000).toFixed(1)}s`);
    console.log(body.reply ?? body.message);
    if (body.plans?.length)
        console.log("plans:", JSON.stringify(body.plans, null, 1));
    const input = (after?.input_tokens ?? 0) - (before?.input_tokens ?? 0);
    const output = (after?.output_tokens ?? 0) - (before?.output_tokens ?? 0);
    console.log(`tokens: input ${input}, output ${output} · left ${body.left}`);
    process.exit(0);
};
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
