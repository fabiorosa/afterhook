import {
  buildAttemptDiagnostics,
  type SafeDiagnosticAttempt,
} from "./diagnostics.js";

type CopyFeedback = Readonly<{
  target: string;
  kind: "success" | "error";
}>;

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function AttemptHistory({
  eventId,
  attempts,
  copyFeedback,
  onCopy,
}: Readonly<{
  eventId: string;
  attempts: readonly SafeDiagnosticAttempt[];
  copyFeedback: CopyFeedback | null;
  onCopy: (target: string, value: string) => Promise<void>;
}>) {
  return (
    <section className="attempts" aria-labelledby="attempts-title">
      <div className="attempts-heading">
        <h2 id="attempts-title">Delivery attempts</h2>
        <p>Append-only evidence from PostgreSQL.</p>
      </div>
      {attempts.length === 0 ? (
        <p className="attempts-empty">No delivery attempt has started.</p>
      ) : (
        <ol>
          {attempts.map((attempt) => (
            <li key={attempt.id}>
              <div className="attempt-title">
                <div>
                  <span>Attempt {attempt.attemptNumber}</span>
                  <strong>{attempt.status.replaceAll("_", " ")}</strong>
                </div>
                <button
                  className="quiet-button diagnostic-copy"
                  type="button"
                  onClick={() =>
                    void onCopy(
                      attempt.id,
                      buildAttemptDiagnostics(eventId, attempt),
                    )
                  }
                >
                  Copy diagnostics
                </button>
              </div>
              <dl>
                <div>
                  <dt>Trigger</dt>
                  <dd>{attempt.trigger}</dd>
                </div>
                <div>
                  <dt>HTTP</dt>
                  <dd>{attempt.responseStatus ?? "Not recorded"}</dd>
                </div>
                <div>
                  <dt>Duration</dt>
                  <dd>
                    {attempt.durationMilliseconds === null
                      ? "Not recorded"
                      : `${String(attempt.durationMilliseconds)} ms`}
                  </dd>
                </div>
                <div>
                  <dt>Started</dt>
                  <dd>
                    {attempt.startedAt === null
                      ? "Not started"
                      : formatDate(attempt.startedAt)}
                  </dd>
                </div>
              </dl>
              {attempt.safeErrorMessage !== null ? (
                <p className="attempt-error">{attempt.safeErrorMessage}</p>
              ) : null}
              {copyFeedback?.target === attempt.id ? (
                <p
                  className={`copy-feedback copy-${copyFeedback.kind}`}
                  role={copyFeedback.kind === "error" ? "alert" : "status"}
                >
                  {copyFeedback.kind === "success"
                    ? "Attempt diagnostics copied"
                    : "Attempt diagnostics could not be copied"}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
