import { readFileSync } from "node:fs";
export interface Fixture {
  network: string;
  address: string;
  owner: string;
  lamports: number;
  data: Uint8Array;
}
export function fixture(name: string): Fixture {
  const j = JSON.parse(readFileSync(new URL(`../../../fixtures/${name}.json`, import.meta.url), "utf8"));
  return { ...j, data: Uint8Array.from(Buffer.from(j.data, "base64")) };
}
