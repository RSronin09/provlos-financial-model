import express, { type Express } from "express";
import fs from "fs";
import path from "path";

function distPublicPath(): string {
  if (process.env.VERCEL) {
    return path.join(process.cwd(), "dist", "public");
  }
  return path.resolve(__dirname, "public");
}

export function serveStatic(app: Express) {
  const distPath = distPublicPath();
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("/{*path}", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
