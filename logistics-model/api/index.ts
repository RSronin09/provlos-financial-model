import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

const serverless = require("serverless-http");

let cached: any = null;

export default async function handler(req: any, res: any) {
  try {
    if (!cached) {
      const bundlePath = join(__dirname, "..", "dist", "server.cjs");
      const { initializeApp } = require(bundlePath);
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
