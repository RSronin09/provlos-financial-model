import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  // On Vercel, static files are served directly by the CDN from outputDirectory.
  // The serverless function only needs to handle /api/* routes.
  if (process.env.VERCEL) {
    return;
  }

  // Local production: serve from dist/public relative to the server bundle
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  app.use("/{*path}", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
