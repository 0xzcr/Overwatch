// Load the monorepo root .env regardless of the current working directory.
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

export function repoRoot(start = process.cwd()): string {
  let d = start;
  while (!existsSync(resolve(d, "pnpm-workspace.yaml"))) {
    const up = dirname(d);
    if (up === d) return start;
    d = up;
  }
  return d;
}
const root = repoRoot();
for (const f of [".env.local", ".env"]) if (existsSync(resolve(root, f))) config({ path: resolve(root, f) });
