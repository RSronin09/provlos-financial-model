import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createServer } from "http";

const __dirname = dirname(fileURLToPath(import.meta.url));

let cached: any = null;

export default async function handler(req: any, res: any) {
  try {
    if (!cached) {
      const bundlePath = join(__dirname, "..", "dist", "server.cjs");
      // Dynamic import works for both ESM and CJS files in Node 18+
      const mod = await import(bundlePath);
      const initializeApp = mod.initializeApp ?? mod.default?.initializeApp;
      const { app } = await initializeApp();
      // Inline serverless adapter — avoids require("serverless-http")
      cached = (rq: any, rs: any) =>
        new Promise<void>((resolve) => {
          const server = createServer(app);
          // @ts-ignore
          server.emit("request", rq, rs);
          rs.on("finish", resolve);
          rs.on("close", resolve);
        });
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
