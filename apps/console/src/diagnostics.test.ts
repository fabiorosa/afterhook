import { describe, expect, it } from "vitest";

import {
  buildAttemptDiagnostics,
  buildEventDiagnostics,
} from "./diagnostics.js";

const attempt = {
  id: "17bfabde-4c6c-4722-a3a2-6c9c9e77e49c",
  attemptNumber: 2,
  trigger: "MANUAL" as const,
  status: "TERMINAL_FAILURE" as const,
  scheduledAt: "2026-08-06T04:00:00.000Z",
  startedAt: "2026-08-06T04:00:01.000Z",
  finishedAt: "2026-08-06T04:00:02.000Z",
  durationMilliseconds: 820,
  responseStatus: 400,
  errorCode: "HTTP_FAILURE",
  safeErrorMessage: "The destination did not accept the delivery.",
};

describe("safe diagnostics", () => {
  it("builds deterministic event and attempt evidence", () => {
    const eventId = "75339b4d-bb60-43b6-93bd-30436cb6454a";
    const eventText = buildEventDiagnostics({
      id: eventId,
      status: "FAILED",
      endpoint: { slug: "billing-events-ab12cd" },
      idempotencyKey: "invoice-4200",
      receivedAt: "2026-08-06T03:59:00.000Z",
      attempts: [attempt],
    });

    expect(eventText).toContain(`Event: ${eventId}`);
    expect(eventText).toContain("Endpoint: /billing-events-ab12cd");
    expect(eventText).toContain("Attempt: 2");
    expect(buildAttemptDiagnostics(eventId, attempt)).toContain(
      "Safe error: The destination did not accept the delivery.",
    );
  });

  it("cannot include payload, authorization, bodies, or headers", () => {
    const eventWithPrivateFields = {
      id: "75339b4d-bb60-43b6-93bd-30436cb6454a",
      status: "DELIVERED",
      endpoint: { slug: "billing-events-ab12cd" },
      idempotencyKey: "invoice-4200",
      receivedAt: "2026-08-06T03:59:00.000Z",
      attempts: [attempt],
      payloadRedacted: { token: "private-payload" },
      authorization: "Bearer private-authorization",
      responseHeaders: { cookie: "private-cookie" },
    };
    const diagnostics = buildEventDiagnostics(eventWithPrivateFields);

    expect(diagnostics).not.toContain("private-payload");
    expect(diagnostics).not.toContain("private-authorization");
    expect(diagnostics).not.toContain("private-cookie");
  });
});
