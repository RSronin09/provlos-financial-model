import fs from "fs";
import path from "path";

/**
 * Repo is often imported with Git root as the Vercel project root; the app then
 * lives in `logistics-model/`. When the project root is already `logistics-model`,
 * paths are relative to cwd.
 */
export function vercelAppRoot(): string {
  const cwd = process.cwd();
  const nestedPkg = path.join(cwd, "logistics-model", "package.json");
  if (fs.existsSync(nestedPkg)) {
    return path.join(cwd, "logistics-model");
  }
  return cwd;
}
