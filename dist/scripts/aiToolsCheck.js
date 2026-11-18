"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * ກວດເຄື່ອງມືຂອງຜູ້ຊ່ວຍ AI ໂດຍບໍ່ເອີ້ນ Claude (ບໍ່ເສຍເງິນ) ແລະ ບໍ່ autoSync:
 *   npx ts-node src/scripts/aiToolsCheck.ts <ລະຫັດພະນັກງານ (_uuid)>
 * ພິມສະເພາະຂະໜາດ ແລະ ຊື່ຊ່ອງ — ບໍ່ພິມຂໍ້ມູນ (ເງິນເດືອນ, ເບີໂທ…)
 */
require("dotenv/config");
const aiTools_1 = require("../controllers/hr/aiTools");
const auth_1 = require("../middleware/auth");
const workCalendar_1 = require("../controllers/hr/workCalendar");
const keysOf = (text) => {
    try {
        const value = JSON.parse(text);
        if (Array.isArray(value))
            return `array(${value.length})`;
        if (value && typeof value === "object") {
            if ("error" in value)
                return `ERROR: ${value.error}`;
            return Object.entries(value)
                .map(([k, v]) => (Array.isArray(v) ? `${k}[${v.length}]` : v && typeof v === "object" ? `${k}{${Object.keys(v).slice(0, 6).join(",")}}` : k))
                .slice(0, 10)
                .join(" ");
        }
        return typeof value;
    }
    catch {
        return `text (${text.split("\n").length} lines)`;
    }
};
const main = async () => {
    const id = Number(process.argv[2]);
    const req = { user: { sub: id, typ: auth_1.EMPLOYEE_TOKEN }, headers: {}, query: {}, params: {} };
    const today = (0, workCalendar_1.todayLao)();
    const tools = (0, aiTools_1.aiTools)(req, id, today, () => 0);
    const args = { search_my_notes: { query: "a" }, propose_plans: { plans: [] } };
    for (const tool of tools) {
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
