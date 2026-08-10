import { createSecretCipher } from "@afterhook/domain";
import {
  createEventQueue,
  createRedisConnection,
} from "@afterhook/orchestration";
import fastifyStatic from "@fastify/static";
import { fileURLToPath } from "node:url";

import { createPostgresRepository } from "./persistence/repository.js";
import { buildServer } from "./server.js";

const databaseUrl = process.env.DATABASE_URL;
const encryptionKey = process.env.SECRET_ENCRYPTION_KEY;
const redisUrl = process.env.REDIS_URL;

if (
  databaseUrl === undefined ||
  encryptionKey === undefined ||
  redisUrl === undefined
) {
  throw new Error(
    "DATABASE_URL, SECRET_ENCRYPTION_KEY, and REDIS_URL are required.",
  );
}

const cipher = createSecretCipher(encryptionKey);
const repository = createPostgresRepository(databaseUrl, cipher);
const redis = createRedisConnection(redisUrl);
const eventQueue = createEventQueue(redis);
const app = buildServer(repository, {
  eventQueue,
  demo: {
    enabled: process.env.AFTERHOOK_DEMO_ENABLED === "true",
    destinationOrigin:
      process.env.AFTERHOOK_DEMO_DESTINATION_ORIGIN ?? "http://127.0.0.1:3201",
  },
});

if (process.env.AFTERHOOK_SERVE_CONSOLE === "true") {
  await app.register(fastifyStatic, {
    root: fileURLToPath(new URL("../../console/dist", import.meta.url)),
  });
}

app.addHook("onClose", async () => {
  await eventQueue.close();
  await redis.quit();
});

await app.listen({
  host: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 3001),
});
