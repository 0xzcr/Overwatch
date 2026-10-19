import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { connect, directUrl } from "./client";
import { repoRoot } from "./env";

// Its own single connection: the migrator runs BEGIN/COMMIT by hand, which postgres.js only allows with max: 1.
const conn = connect(directUrl(), 1);
try {
  await migrate(drizzle(conn), { migrationsFolder: `${repoRoot()}/packages/db/migrations` });
  console.log("migrations applied");
} finally {
  await conn.end();
}
