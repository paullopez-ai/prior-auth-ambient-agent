import express from "express";
import healthRouter from "./routes/health.js";
import auditRouter from "./routes/audit.js";
import queueRouter from "./routes/queue.js";

const app = express();
app.use(express.json());

// CORS headers for local UI dev (UI runs on :3000, API on :8081)
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

app.use("/", healthRouter);
app.use("/", auditRouter);
app.use("/", queueRouter);

const PORT = parseInt(process.env.REVIEW_API_PORT ?? "8081", 10);

app.listen(PORT, () => {
  console.log(`[review-api] Listening on port ${PORT}`);
  console.log(`[review-api] MOCK_BQ=${process.env.MOCK_BQ ?? "false"}`);
});

export default app;
