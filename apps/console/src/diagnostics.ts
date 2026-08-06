export type SafeDiagnosticAttempt = Readonly<{
  id: string;
  attemptNumber: number;
  trigger: "AUTOMATIC" | "MANUAL";
  status:
    | "SCHEDULED"
    | "RUNNING"
    | "SUCCEEDED"
    | "RETRYABLE_FAILURE"
    | "TERMINAL_FAILURE"
    | "TIMED_OUT";
  scheduledAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMilliseconds: number | null;
  responseStatus: number | null;
  errorCode: string | null;
  safeErrorMessage: string | null;
}>;

export type SafeDiagnosticEvent = Readonly<{
  id: string;
  status: string;
  endpoint: Readonly<{ slug: string }>;
  idempotencyKey: string;
  receivedAt: string;
  attempts: readonly SafeDiagnosticAttempt[];
}>;

function recorded(value: string | number | null): string {
  return value === null ? "not recorded" : String(value);
}

export function buildAttemptDiagnostics(
  eventId: string,
  attempt: SafeDiagnosticAttempt,
): string {
  return [
    "AfterHook delivery attempt",
    `Event: ${eventId}`,
    `Attempt: ${String(attempt.attemptNumber)}`,
    `Attempt ID: ${attempt.id}`,
    `Trigger: ${attempt.trigger}`,
    `Status: ${attempt.status}`,
    `Scheduled: ${attempt.scheduledAt}`,
    `Started: ${recorded(attempt.startedAt)}`,
    `Finished: ${recorded(attempt.finishedAt)}`,
    `Duration ms: ${recorded(attempt.durationMilliseconds)}`,
    `HTTP status: ${recorded(attempt.responseStatus)}`,
    `Error code: ${recorded(attempt.errorCode)}`,
    `Safe error: ${recorded(attempt.safeErrorMessage)}`,
  ].join("\n");
}

export function buildEventDiagnostics(event: SafeDiagnosticEvent): string {
  const header = [
    "AfterHook event diagnostics",
    `Event: ${event.id}`,
    `Status: ${event.status}`,
    `Endpoint: /${event.endpoint.slug}`,
    `Idempotency key: ${event.idempotencyKey}`,
    `Received: ${event.receivedAt}`,
    `Attempts: ${String(event.attempts.length)}`,
  ].join("\n");
  const attempts = event.attempts.map((attempt) =>
    buildAttemptDiagnostics(event.id, attempt),
  );
  return attempts.length === 0 ? header : [header, ...attempts].join("\n\n");
}
