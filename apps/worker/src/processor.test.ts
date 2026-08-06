import { describe, expect, it, vi } from "vitest";

import type { AttemptRepository } from "./attempt-repository.js";
import { reconcileRetrySchedules } from "./processor.js";

function repositoryWithSchedules(): AttemptRepository {
  return {
    claim: () => Promise.resolve(null),
    complete: () => Promise.resolve(null),
    listRetrySchedules: () =>
      Promise.resolve([
        {
          eventId: "75339b4d-bb60-43b6-93bd-30436cb6454a",
          attemptNumber: 2,
          scheduledAt: new Date("2026-08-06T01:00:02.000Z"),
        },
        {
          eventId: "39a92b9a-b6f5-4ea3-a06f-3f339669cbe2",
          attemptNumber: 3,
          scheduledAt: new Date("2026-08-06T00:59:59.000Z"),
        },
      ]),
    close: () => Promise.resolve(),
  };
}

describe("retry reconciliation", () => {
  it("restores PostgreSQL schedules with bounded non-negative delays", async () => {
    const scheduleRetry = vi.fn(() => Promise.resolve());

    await expect(
      reconcileRetrySchedules(
        repositoryWithSchedules(),
        scheduleRetry,
        new Date("2026-08-06T01:00:00.000Z"),
      ),
    ).resolves.toBe(2);
    expect(scheduleRetry.mock.calls).toEqual([
      ["75339b4d-bb60-43b6-93bd-30436cb6454a", 2, 2_000],
      ["39a92b9a-b6f5-4ea3-a06f-3f339669cbe2", 3, 0],
    ]);
  });
});
