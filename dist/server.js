"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const routes_1 = __importDefault(require("./routes/routes"));
const utils_1 = require("./utils");
dotenv_1.default.config();
const app = (0, express_1.default)();
// ຢູ່ຫຼັງ Cloudflare — req.protocol ອ່ານ X-Forwarded-Proto (https) ແທນ http ຂອງ tunnel
app.set("trust proxy", true);
app.use((0, cors_1.default)({
    origin: "*",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express_1.default.json()); // parse JSON requests
app.use(express_1.default.urlencoded({ extended: true }));
// Express 5: req.body ເປັນ undefined ຖ້າ request ບໍ່ມີ body — controller ທີ່ destructure req.body ຈະ crash
app.use((req, _res, next) => {
    req.body ?? (req.body = {});
    next();
});
app.use(utils_1.withImageBase);
// Routes
app.use("/api", routes_1.default);
app.use("/image", express_1.default.static(path_1.default.resolve(__dirname, "uploads/")));
// Health check
app.get("/", (req, res) => {
    res.send("✅ API is running...");
});
exports.default = app;
