import { deliveryJobSchema } from "@afterhook/contracts";
import { deliverWebhook } from "@afterhook/delivery";

import type { AttemptRepository } from "./attempt-repository.js";

type ScheduleRetry = (
  eventId: string,
  attemptNumber: number,
  delayMilliseconds: number,
) => Promise<void>;

export async function reconcileRetrySchedules(
  attempts: AttemptRepository,
  scheduleRetry: ScheduleRetry,
  now = new Date(),
): Promise<number> {
  const schedules = await attempts.listRetrySchedules();
  await Promise.all(
    schedules.map((schedule) =>
      scheduleRetry(
        schedule.eventId,
        schedule.attemptNumber,
        Math.max(0, schedule.scheduledAt.getTime() - now.getTime()),
      ),
    ),
  );
  return schedules.length;
}

export function createDeliveryProcessor(
  attempts: AttemptRepository,
  options: Readonly<{
    allowPrivateNetwork: boolean;
    scheduleRetry?: ScheduleRetry;
    now?: () => Date;
  }>,
) {
  return async (data: unknown): Promise<void> => {
    const { eventId } = deliveryJobSchema.parse(data);
    const claimed = await attempts.claim(eventId);
    if (claimed === null) return;

    const result = await deliverWebhook(claimed, {
      allowPrivateNetwork: options.allowPrivateNetwork,
    });
    const completed = await attempts.complete(claimed.attemptId, result);
    if (
      completed?.outcome === "retry_scheduled" &&
      options.scheduleRetry !== undefined
    ) {
      const now = options.now?.() ?? new Date();
      await options.scheduleRetry(
        completed.schedule.eventId,
        completed.schedule.attemptNumber,
        Math.max(0, completed.schedule.scheduledAt.getTime() - now.getTime()),
      );
    }
  };
}
