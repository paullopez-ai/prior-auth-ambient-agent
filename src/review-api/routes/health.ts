import { Router, type Request, type Response } from "express";

const router = Router();

router.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "prior-auth-review-api",
    mockBq: process.env.MOCK_BQ === "true",
    timestamp: new Date().toISOString(),
  });
});

export default router;
