/**
 * ຖາມຜູ້ຊ່ວຍ AI 1 ຄຳຖາມຜ່ານ handler ຈິງ (ເອີ້ນ Claude — ເສຍເງິນແທ້, ນັບເປັນ 1 ຄຳຖາມຂອງພະນັກງານຄົນນັ້ນ) ບໍ່ autoSync:
 *   npx ts-node src/scripts/aiChatCheck.ts <ລະຫັດພະນັກງານ (_uuid)> "<ຄຳຖາມ>"
 * ພິມຄຳຕອບ, ແຜນທີ່ສະເໜີ, ເວລາ ແລະ token ທີ່ໃຊ້ (ຈາກ tbl_ai_usage)
 */
import "dotenv/config";
import AiUsage from "../models/aiUsage";
import { aiChat } from "../controllers/hr/aiController";
import { todayLao } from "../controllers/hr/workCalendar";
import { EMPLOYEE_TOKEN } from "../middleware/auth";

const main = async () => {
  const id = Number(process.argv[2]);
  const question = process.argv[3];
  const where = { employee_id: id, usage_date: todayLao() };
  const before = await AiUsage.findOne({ where });
  const req: any = { user: { sub: id, typ: EMPLOYEE_TOKEN }, headers: {}, query: {}, params: {}, body: { messages: [{ role: "user", content: question }] } };
  const started = Date.now();
  const body = await new Promise<any>((resolve) => {
    let status = 200;
    const res: any = {
      status(code: number) {
        status = code;
        return res;
      },
      json(value: any) {
        resolve({ status, ...value });
        return res;
      },
    };
    aiChat(req, res);
  });
  const after = await AiUsage.findOne({ where });
  console.log(`status ${body.status} · ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log(body.reply ?? body.message);
  if (body.plans?.length) console.log("plans:", JSON.stringify(body.plans, null, 1));
  const input = (after?.input_tokens ?? 0) - (before?.input_tokens ?? 0);
  const output = (after?.output_tokens ?? 0) - (before?.output_tokens ?? 0);
  console.log(`tokens: input ${input}, output ${output} · left ${body.left}`);
  process.exit(0);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
