import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, sql } from "./client";
import { repoRoot } from "./env";
await migrate(db(), { migrationsFolder: `${repoRoot()}/packages/db/migrations` });
console.log("migrations applied");
await sql().end();
