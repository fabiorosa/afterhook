import { useEffect, useState } from "react";

import { request } from "./api.js";

type DemoScenario = "success" | "timeout" | "retryable-failure";

const scenarios: readonly Readonly<{
  value: DemoScenario;
  label: string;
  description: string;
}>[] = [
  {
    value: "success",
    label: "Successful delivery",
    description: "The destination accepts the first attempt.",
  },
  {
    value: "timeout",
    label: "Destination timeout",
    description: "A bounded request times out and enters recovery.",
  },
  {
    value: "retryable-failure",
    label: "Retryable failure",
    description: "Three HTTP 503 responses exhaust automatic retries.",
  },
];

export function DemoControls({
  onReset,
}: Readonly<{ onReset: () => Promise<void> }>) {
  const [enabled, setEnabled] = useState(false);
  const [pending, setPending] = useState<DemoScenario | "reset" | null>(null);
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    void request<{ enabled: boolean }>("/v1/demo")
      .then((status) => {
        setEnabled(status.enabled);
      })
      .catch(() => {
        setEnabled(false);
      });
  }, []);

  if (!enabled) return null;

  async function launch(scenario: DemoScenario) {
    setPending(scenario);
    setFeedback(null);
    try {
      const result = await request<{ eventId: string; duplicate: boolean }>(
        "/v1/demo/events",
        { method: "POST", body: JSON.stringify({ scenario }) },
      );
      setFeedback({
        kind: "success",
        message: result.duplicate
          ? "This deterministic scenario already exists. Opening its event."
          : "Demo event stored and queued. Opening its live timeline.",
      });
      window.location.hash = `events/${result.eventId}`;
    } catch (caught) {
      setFeedback({
        kind: "error",
        message:
          caught instanceof Error
            ? caught.message
            : "Demo event could not start.",
      });
    } finally {
      setPending(null);
    }
  }

  async function reset() {
    setPending("reset");
    setFeedback(null);
    try {
      const result = await request<{ deletedEvents: number }>(
        "/v1/demo/reset",
        {
          method: "POST",
          body: "{}",
        },
      );
      await onReset();
      setFeedback({
        kind: "success",
        message: `${String(result.deletedEvents)} demo event${result.deletedEvents === 1 ? "" : "s"} removed. Ordinary records were preserved.`,
      });
    } catch (caught) {
      setFeedback({
        kind: "error",
        message:
          caught instanceof Error
            ? caught.message
            : "Demo data could not be reset.",
      });
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="demo-controls" aria-labelledby="demo-title">
      <div className="demo-heading">
        <div>
          <p className="eyebrow">FICTIONAL DATA ONLY</p>
          <h2 id="demo-title">Run a delivery scenario</h2>
        </div>
        <button
          className="quiet-button demo-reset"
          disabled={pending !== null}
          type="button"
          onClick={() => void reset()}
        >
          {pending === "reset" ? "Resetting…" : "Reset demo data"}
        </button>
      </div>
      <div className="demo-scenarios">
        {scenarios.map((scenario) => (
          <button
            className="demo-scenario"
            disabled={pending !== null}
            key={scenario.value}
            type="button"
            onClick={() => void launch(scenario.value)}
          >
            <strong>
              {pending === scenario.value ? "Starting…" : scenario.label}
            </strong>
            <span>{scenario.description}</span>
          </button>
        ))}
      </div>
      {feedback !== null ? (
        <p
          className={`demo-feedback demo-${feedback.kind}`}
          role={feedback.kind === "error" ? "alert" : "status"}
        >
          {feedback.message}
        </p>
      ) : null}
    </section>
  );
}
