import "dotenv/config";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { watchListSchema } from "@overwatch/core";

export function loadWatchList(path = new URL("../config/protocols.yaml", import.meta.url)) {
  return watchListSchema.parse(parse(readFileSync(path, "utf8")));
}

export function table(rows: Record<string, string | number | boolean>[]) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]!);
  const w = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c]).length)));
  const line = (vals: string[]) => vals.map((v, i) => v.padEnd(w[i]!)).join("  ");
  console.log(line(cols));
  console.log(w.map((n) => "-".repeat(n)).join("  "));
  for (const r of rows) console.log(line(cols.map((c) => String(r[c]))));
}
