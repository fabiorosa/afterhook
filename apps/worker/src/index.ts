import { hostname } from "node:os";

import {
  createRedisConnection,
  createWorkerHeartbeat,
} from "@afterhook/orchestration";

const redisUrl = process.env.REDIS_URL;
if (redisUrl === undefined) {
  throw new Error("REDIS_URL is required.");
}

const workerId = process.env.AFTERHOOK_WORKER_ID ?? `worker@${hostname()}`;
const redis = createRedisConnection(redisUrl);
const heartbeat = createWorkerHeartbeat(redis, { workerId });

await heartbeat.start();
console.info(JSON.stringify({ event: "worker.ready", workerId }));

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await heartbeat.stop();
  await redis.quit();
  console.info(JSON.stringify({ event: "worker.stopped", workerId }));
}

process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());
