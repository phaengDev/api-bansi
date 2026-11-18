/**
 * ກວດເຄື່ອງມືຂອງຜູ້ຊ່ວຍ AI ໂດຍບໍ່ເອີ້ນ Claude (ບໍ່ເສຍເງິນ) ແລະ ບໍ່ autoSync:
 *   npx ts-node src/scripts/aiToolsCheck.ts <ລະຫັດພະນັກງານ (_uuid)>
 * ພິມສະເພາະຂະໜາດ ແລະ ຊື່ຊ່ອງ — ບໍ່ພິມຂໍ້ມູນ (ເງິນເດືອນ, ເບີໂທ…)
 */
import "dotenv/config";
import { aiTools } from "../controllers/hr/aiTools";
import { EMPLOYEE_TOKEN } from "../middleware/auth";
import { todayLao } from "../controllers/hr/workCalendar";

const keysOf = (text: string) => {
  try {
    const value = JSON.parse(text);
    if (Array.isArray(value)) return `array(${value.length})`;
    if (value && typeof value === "object") {
      if ("error" in value) return `ERROR: ${value.error}`;
      return Object.entries(value)
        .map(([k, v]) => (Array.isArray(v) ? `${k}[${v.length}]` : v && typeof v === "object" ? `${k}{${Object.keys(v).slice(0, 6).join(",")}}` : k))
        .slice(0, 10)
        .join(" ");
    }
    return typeof value;
  } catch {
    return `text (${text.split("\n").length} lines)`;
  }
};

const main = async () => {
  const id = Number(process.argv[2]);
  const req: any = { user: { sub: id, typ: EMPLOYEE_TOKEN }, headers: {}, query: {}, params: {} };
  const today = todayLao();
  const tools = aiTools(req, id, today, () => 0);
  const args: Record<string, object> = { search_my_notes: { query: "a" }, propose_plans: { plans: [] } };
  for (const tool of tools as any[]) {
    const started = Date.now();
    const out = String(await tool.run(args[tool.name] ?? {}));
    console.log(`${tool.name.padEnd(24)} ${String(out.length).padStart(6)} chars ${String(Date.now() - started).padStart(5)}ms  ${keysOf(out)}`);
  }
  process.exit(0);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
