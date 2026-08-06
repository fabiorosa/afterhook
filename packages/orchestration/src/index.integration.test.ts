import { Queue } from "bullmq";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createEventQueue,
  createRedisConnection,
  createWorkerHeartbeat,
  deliveryQueueName,
  workerHeartbeatKey,
} from "./index.js";

const redisUrl = process.env.TEST_REDIS_URL;
if (redisUrl === undefined) {
  throw new Error("TEST_REDIS_URL is required for Redis integration tests.");
}
const testRedisUrl = redisUrl;

const connections: ReturnType<typeof createRedisConnection>[] = [];
const queues: { close: () => Promise<void> }[] = [];

function connection() {
  const redis = createRedisConnection(testRedisUrl);
  connections.push(redis);
  return redis;
}

beforeEach(async () => {
  const redis = connection();
  await redis.flushdb();
});

afterEach(async () => {
  await Promise.all(queues.splice(0).map((queue) => queue.close()));
  await Promise.all(
    connections.splice(0).map(async (redis) => {
      if (redis.status !== "end") await redis.quit();
    }),
  );
});

describe("BullMQ event handoff", () => {
  it("stores one identifier-only job for duplicate event handoffs", async () => {
    const producer = createEventQueue(connection());
    queues.push(producer);
    const inspector = new Queue(deliveryQueueName, {
      connection: connection(),
    });
    queues.push(inspector);
    const eventId = "75339b4d-bb60-43b6-93bd-30436cb6454a";

    await producer.enqueue(eventId);
    await producer.enqueue(eventId);

    const waiting = await inspector.getJobs(["wait"]);
    expect(waiting).toHaveLength(1);
    expect(waiting[0]?.id).toBe(eventId);
    expect(waiting[0]?.data).toEqual({ eventId });
  });

  it("renews a bounded heartbeat and lets it expire after shutdown", async () => {
    const redis = connection();
    const heartbeat = createWorkerHeartbeat(redis, {
      workerId: "worker-integration",
      ttlMilliseconds: 240,
      intervalMilliseconds: 60,
      now: () => new Date("2026-08-05T23:59:00.000Z"),
    });

    await heartbeat.start();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(JSON.parse((await redis.get(workerHeartbeatKey)) ?? "null")).toEqual(
      {
        workerId: "worker-integration",
        recordedAt: "2026-08-05T23:59:00.000Z",
      },
    );
    expect(await redis.pttl(workerHeartbeatKey)).toBeGreaterThan(100);

    await heartbeat.stop();
    await new Promise((resolve) => setTimeout(resolve, 280));
    expect(await redis.get(workerHeartbeatKey)).toBeNull();
  });
});
