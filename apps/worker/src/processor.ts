import { deliveryJobSchema } from "@afterhook/contracts";
import { deliverWebhook } from "@afterhook/delivery";

import type { AttemptRepository } from "./attempt-repository.js";

export function createDeliveryProcessor(
  attempts: AttemptRepository,
  options: Readonly<{ allowPrivateNetwork: boolean }>,
) {
  return async (data: unknown): Promise<void> => {
    const { eventId } = deliveryJobSchema.parse(data);
    const claimed = await attempts.claim(eventId);
    if (claimed === null) return;

    const result = await deliverWebhook(claimed, {
      allowPrivateNetwork: options.allowPrivateNetwork,
    });
    await attempts.complete(claimed.attemptId, result);
  };
}
