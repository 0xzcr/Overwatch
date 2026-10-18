import "./src/env";
import { defineConfig } from "drizzle-kit";
export default defineConfig({ schema: "./src/schema.ts", out: "./migrations", dialect: "postgresql", dbCredentials: { url: process.env.DIRECT_URL || process.env.DATABASE_URL || "postgres://overwatch:overwatch@localhost:5433/overwatch" } });
