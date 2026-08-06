import { hostname } from "node:os";

import { createSecretCipher } from "@afterhook/domain";
import {
  createRedisConnection,
  createWorkerHeartbeat,
  deliveryQueueName,
} from "@afterhook/orchestration";
import { Worker } from "bullmq";

import { createAttemptRepository } from "./attempt-repository.js";
import { createDeliveryProcessor } from "./processor.js";

const redisUrl = process.env.REDIS_URL;
const databaseUrl = process.env.DATABASE_URL;
const encryptionKey = process.env.SECRET_ENCRYPTION_KEY;
if (
  redisUrl === undefined ||
  databaseUrl === undefined ||
  encryptionKey === undefined
) {
  throw new Error(
    "REDIS_URL, DATABASE_URL, and SECRET_ENCRYPTION_KEY are required.",
  );
}

const workerId = process.env.AFTERHOOK_WORKER_ID ?? `worker@${hostname()}`;
const redis = createRedisConnection(redisUrl);
const heartbeat = createWorkerHeartbeat(redis, { workerId });
const attempts = createAttemptRepository(
  databaseUrl,
  createSecretCipher(encryptionKey),
);
const processDelivery = createDeliveryProcessor(attempts, {
  allowPrivateNetwork: process.env.ALLOW_PRIVATE_DESTINATIONS === "true",
});
const worker = new Worker(
  deliveryQueueName,
  (job) => processDelivery(job.data),
  { connection: redis, concurrency: 1 },
);

await heartbeat.start();
console.info(JSON.stringify({ event: "worker.ready", workerId }));

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await worker.close();
  await heartbeat.stop();
  await attempts.close();
  await redis.quit();
  console.info(JSON.stringify({ event: "worker.stopped", workerId }));
}

process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());
