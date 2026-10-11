import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const url = () => process.env.DATABASE_URL ?? "postgres://overwatch:overwatch@localhost:5433/overwatch";
let _sql: postgres.Sql | undefined;
export function sql() {
  _sql ??= postgres(url(), { max: 10, idle_timeout: 30 });
  return _sql;
}
export function db() {
  return drizzle(sql(), { schema });
}
export type Db = ReturnType<typeof db>;
export const CHANNEL = "overwatch_events";
