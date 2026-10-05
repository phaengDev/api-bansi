import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import routes from "./routes/routes";
dotenv.config();
const app = express();
app.use(
  cors({
    origin: "*",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json()); // parse JSON requests
app.use(express.urlencoded({ extended: true }));
// Express 5: req.body ເປັນ undefined ຖ້າ request ບໍ່ມີ body — controller ທີ່ destructure req.body ຈະ crash
app.use((req, _res, next) => {
  req.body ??= {};
  next();
});
// Routes
app.use("/api", routes);
app.use("/image", express.static(path.resolve(__dirname, "uploads/")));

// Health check
app.get("/", (req, res) => {
  res.send("✅ API is running...");
});
export default app;
