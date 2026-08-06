import { defineConfig } from "@playwright/test";

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const redisUrl = process.env.TEST_REDIS_URL ?? process.env.REDIS_URL;
if (databaseUrl === undefined || redisUrl === undefined) {
  throw new Error("Database and Redis URLs are required for browser tests.");
}

export default defineConfig({
  testDir: "./apps/console/e2e",
  use: { baseURL: "http://127.0.0.1:5273" },
  webServer: [
    {
      command: "node apps/api/dist/index.js",
      port: 3101,
      env: {
        DATABASE_URL: databaseUrl,
        REDIS_URL: redisUrl,
        PORT: "3101",
        SECRET_ENCRYPTION_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
      },
    },
    {
      command:
        "npm --workspace @afterhook/console run dev -- --host 127.0.0.1 --port 5273",
      port: 5273,
      env: { API_PROXY_URL: "http://127.0.0.1:3101" },
    },
  ],
});
