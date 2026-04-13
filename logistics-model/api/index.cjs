const serverless = require("serverless-http");
const path = require("path");

let cached = null;

module.exports = async function handler(req, res) {
  try {
    if (!cached) {
      const bundlePath = path.join(__dirname, "..", "dist", "server.cjs");
      const { initializeApp } = require(bundlePath);
      const { app } = await initializeApp();
      cached = serverless(app);
    }
    return cached(req, res);
  } catch (err) {
    console.error("[handler] startup error:", err?.message ?? err);
    res.status(500).json({
      error: "Function startup failed",
      detail: err?.message ?? String(err),
    });
  }
};
