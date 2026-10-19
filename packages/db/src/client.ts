import "./env";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const LOCAL = "postgres://overwatch:overwatch@localhost:5433/overwatch";
/** Queries. On Vercel this is Supabase's transaction pooler (port 6543); elsewhere the session pooler or a direct connection. */
export const databaseUrl = () => process.env.DATABASE_URL || LOCAL;
/** Long-lived sessions (LISTEN, migrations), which a transaction pooler can't hold. Defaults to DATABASE_URL. */
export const directUrl = () => process.env.DIRECT_URL || databaseUrl();

export function connect(url: string, max: number) {
  const { hostname, port, searchParams } = new URL(url);
  const local = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  const txPooler = port === "6543";
  return postgres(url, {
    max,
    idle_timeout: 30,
    connect_timeout: 10,
    // Hosted Postgres needs TLS; an explicit ?sslmode= in the URL wins.
    ...(!local && !searchParams.has("sslmode") && { ssl: "require" as const }),
    // A transaction pooler hands each transaction a different backend, so prepared statements can't persist. It also
    // loses responses when queries are pipelined down one connection, which postgres.js does for parameterless queries
    // (they skip the describe round trip) whenever there are more queries than connections; the stuck query never
    // returns. 0 turns pipelining off entirely (1 still allows two in flight).
    prepare: !txPooler,
    ...(txPooler && { max_pipeline: 0 }),
  });
}

let _sql: postgres.Sql | undefined;
let _direct: postgres.Sql | undefined;
export function sql() {
  // Each Vercel function instance holds its own pool; keep it small so a traffic spike can't exhaust the database.
  _sql ??= connect(databaseUrl(), process.env.VERCEL ? 3 : 10);
  return _sql;
}
export function direct() {
  _direct ??= directUrl() === databaseUrl() ? sql() : connect(directUrl(), 2);
  return _direct;
}
export function db() {
  return drizzle(sql(), { schema });
}
export type Db = ReturnType<typeof db>;
export const CHANNEL = "overwatch_events";
