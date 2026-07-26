import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined) {
  throw new Error("DATABASE_URL is required for Drizzle.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/persistence/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: databaseUrl },
});
