import serverless from "serverless-http";
import { initializeApp } from "../server/bootstrap";

let cached: ReturnType<typeof serverless> | null = null;

export default async function handler(req: any, res: any) {
  try {
    if (!cached) {
      const { app } = await initializeApp();
      cached = serverless(app);
    }
    return cached(req, res);
  } catch (err: any) {
    console.error("[handler] startup error:", err?.message ?? err);
    res.status(500).json({
      error: "Function startup failed",
      detail: err?.message ?? String(err),
    });
  }
}
