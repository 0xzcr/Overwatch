import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, sql } from "./client";
await migrate(db(), { migrationsFolder: new URL("../migrations", import.meta.url).pathname });
console.log("migrations applied");
await sql().end();
