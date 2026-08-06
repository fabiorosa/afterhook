import {
  deliveryJobSchema,
  workerHeartbeatSchema,
  type DeliveryJob,
  type WorkerHeartbeat,
} from "@afterhook/contracts";
import { Queue } from "bullmq";
import { Redis } from "ioredis";

export const deliveryQueueName = "afterhook-delivery";
export const workerHeartbeatKey = "afterhook:worker:heartbeat";

export type RedisConnection = Redis;

export type EventQueue = Readonly<{
  enqueue: (eventId: string) => Promise<void>;
  readWorkerHeartbeat: () => Promise<WorkerHeartbeat | null>;
  close: () => Promise<void>;
}>;

export function createRedisConnection(redisUrl: string): RedisConnection {
  return new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: null,
  });
}

export function createEventQueue(connection: RedisConnection): EventQueue {
  const queue = new Queue<DeliveryJob>(deliveryQueueName, { connection });

  return {
    async enqueue(eventId) {
      const job = deliveryJobSchema.parse({ eventId });
      await queue.add("deliver-event", job, {
        jobId: eventId,
        removeOnComplete: false,
        removeOnFail: false,
      });
    },
    async readWorkerHeartbeat() {
      const stored = await connection.get(workerHeartbeatKey);
      if (stored === null) return null;
      try {
        return workerHeartbeatSchema.parse(JSON.parse(stored) as unknown);
      } catch {
        return null;
      }
    },
    async close() {
      await queue.close();
    },
  };
}

type WorkerHeartbeatOptions = Readonly<{
  workerId: string;
  ttlMilliseconds?: number;
  intervalMilliseconds?: number;
  now?: () => Date;
}>;

export type WorkerHeartbeatPublisher = Readonly<{
  start: () => Promise<void>;
  stop: () => Promise<void>;
  publish: () => Promise<WorkerHeartbeat>;
}>;

export function createWorkerHeartbeat(
  connection: RedisConnection,
  options: WorkerHeartbeatOptions,
): WorkerHeartbeatPublisher {
  const ttlMilliseconds = options.ttlMilliseconds ?? 15_000;
  const intervalMilliseconds = options.intervalMilliseconds ?? 5_000;
  const now = options.now ?? (() => new Date());
  let timer: NodeJS.Timeout | undefined;

  if (intervalMilliseconds >= ttlMilliseconds) {
    throw new Error("Heartbeat interval must be shorter than its TTL.");
  }

  async function publish(): Promise<WorkerHeartbeat> {
    const heartbeat = workerHeartbeatSchema.parse({
      workerId: options.workerId,
      recordedAt: now().toISOString(),
    });
    await connection.set(
      workerHeartbeatKey,
      JSON.stringify(heartbeat),
      "PX",
      ttlMilliseconds,
    );
    return heartbeat;
  }

  return {
    async start() {
      if (timer !== undefined) return;
      await publish();
      timer = setInterval(() => {
        void publish().catch(() => undefined);
      }, intervalMilliseconds);
      timer.unref();
    },
    stop() {
      if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
      return Promise.resolve();
    },
    publish,
  };
}
