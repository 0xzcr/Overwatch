import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { direct } from "./client";
import { repoRoot } from "./env";
await migrate(drizzle(direct()), { migrationsFolder: `${repoRoot()}/packages/db/migrations` });
console.log("migrations applied");
await direct().end();
