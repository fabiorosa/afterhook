import { type SyntheticEvent, useEffect, useState } from "react";

import { request } from "./api.js";
import { EventsView } from "./events-view.js";

type Endpoint = Readonly<{
  id: string;
  name: string;
  slug: string;
  enabled: boolean;
  secretFingerprint: string;
}>;
type Destination = Readonly<{
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  hasAuthorization: boolean;
}>;
type CreatedEndpoint = Endpoint & Readonly<{ signingSecret: string }>;

function CopyButton({
  value,
  label,
}: Readonly<{ value: string; label: string }>) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  return (
    <button
      className="copy-button"
      type="button"
      onClick={() => {
        void navigator.clipboard
          .writeText(value)
          .then(() => {
            setCopied(true);
            setCopyFailed(false);
          })
          .catch(() => {
            setCopyFailed(true);
          });
      }}
    >
      {copied ? "Copied" : label}
      {copyFailed ? " Copy failed" : ""}
    </button>
  );
}

function SetupView() {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedEndpoint | null>(null);
  const [endpointName, setEndpointName] = useState("");
  const [destinationName, setDestinationName] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [authorization, setAuthorization] = useState("");
  const [saving, setSaving] = useState<"endpoint" | "destination" | null>(null);

  async function loadSetup() {
    setLoading(true);
    setError(null);
    try {
      const [loadedEndpoints, loadedDestinations] = await Promise.all([
        request<Endpoint[]>("/v1/endpoints"),
        request<Destination[]>("/v1/destinations"),
      ]);
      setEndpoints(loadedEndpoints);
      setDestinations(loadedDestinations);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not load setup.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSetup();
  }, []);

  async function submitEndpoint(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving("endpoint");
    setError(null);
    try {
      const result = await request<CreatedEndpoint>("/v1/endpoints", {
        method: "POST",
        body: JSON.stringify({ name: endpointName }),
      });
      setEndpoints((current) => [...current, result]);
      setCreated(result);
      setEndpointName("");
      setNotice("Endpoint created. Save the secret before dismissing it.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not create endpoint.",
      );
    } finally {
      setSaving(null);
    }
  }

  async function submitDestination(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving("destination");
    setError(null);
    try {
      const result = await request<Destination>("/v1/destinations", {
        method: "POST",
        body: JSON.stringify({
          name: destinationName,
          url: destinationUrl,
          authorization: authorization || undefined,
        }),
      });
      setDestinations((current) => [...current, result]);
      setDestinationName("");
      setDestinationUrl("");
      setAuthorization("");
      setNotice(
        "Destination created. Its authorization value is stored encrypted.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not create destination.",
      );
    } finally {
      setSaving(null);
    }
  }

  return (
    <>
      <section className="intro" aria-labelledby="setup-title">
        <p className="eyebrow">FIRST CONNECTION</p>
        <h1 id="setup-title">Set up a safe path for every webhook.</h1>
        <p className="lede">
          Create an inbound endpoint and an HTTP destination. Secrets are
          encrypted at rest and only shown when created.
        </p>
      </section>
      {error !== null ? (
        <div className="alert" role="alert">
          {error}
        </div>
      ) : null}
      {notice !== null ? (
        <div className="notice" role="status">
          {notice}
        </div>
      ) : null}
      {created !== null ? (
        <section className="secret-reveal" aria-labelledby="secret-title">
          <div>
            <p className="eyebrow">SAVE THIS NOW</p>
            <h2 id="secret-title">Signing secret for {created.name}</h2>
          </div>
          <code>{created.signingSecret}</code>
          <div className="secret-actions">
            <CopyButton value={created.signingSecret} label="Copy secret" />
            <button
              className="quiet-button"
              type="button"
              onClick={() => {
                setCreated(null);
              }}
            >
              I saved it
            </button>
          </div>
          <p>
            After you dismiss this panel, AfterHook will keep only an encrypted
            value and this fingerprint: {created.secretFingerprint}.
          </p>
        </section>
      ) : null}
      <section
        className="workspace"
        aria-label="Setup forms and configured records"
      >
        <form
          className="setup-form"
          onSubmit={(event) => {
            void submitEndpoint(event);
          }}
        >
          <div>
            <p className="eyebrow">INBOUND</p>
            <h2>Create endpoint</h2>
            <p>
              We generate its stable URL-safe slug and signing secret on the
              server.
            </p>
          </div>
          <label>
            Endpoint name
            <input
              required
              minLength={3}
              maxLength={80}
              value={endpointName}
              onChange={(event) => {
                setEndpointName(event.target.value);
              }}
              placeholder="Billing events"
            />
          </label>
          <button type="submit" disabled={saving !== null}>
            {saving === "endpoint" ? "Creating…" : "Create endpoint"}
          </button>
        </form>
        <form
          className="setup-form"
          onSubmit={(event) => {
            void submitDestination(event);
          }}
        >
          <div>
            <p className="eyebrow">OUTBOUND</p>
            <h2>Create destination</h2>
            <p>
              Authorization is optional and is never sent back to this console.
            </p>
          </div>
          <label>
            Destination name
            <input
              required
              minLength={3}
              maxLength={80}
              value={destinationName}
              onChange={(event) => {
                setDestinationName(event.target.value);
              }}
              placeholder="Billing receiver"
            />
          </label>
          <label>
            HTTP URL
            <input
              required
              type="url"
              value={destinationUrl}
              onChange={(event) => {
                setDestinationUrl(event.target.value);
              }}
              placeholder="https://example.com/hooks"
            />
          </label>
          <label>
            Authorization <span>optional</span>
            <input
              value={authorization}
              onChange={(event) => {
                setAuthorization(event.target.value);
              }}
              placeholder="Bearer …"
            />
          </label>
          <button type="submit" disabled={saving !== null}>
            {saving === "destination" ? "Creating…" : "Create destination"}
          </button>
        </form>
      </section>
      <section className="records" aria-live="polite">
        <div className="records-heading">
          <p className="eyebrow">CURRENT SETUP</p>
          <h2>Configured records</h2>
          <button
            className="quiet-button"
            type="button"
            onClick={() => void loadSetup()}
          >
            Refresh
          </button>
        </div>
        {loading ? <p className="state-copy">Loading configuration…</p> : null}
        {!loading && endpoints.length === 0 && destinations.length === 0 ? (
          <p className="state-copy">
            Nothing is configured yet. Start with an endpoint, then add its
            destination.
          </p>
        ) : null}
        {!loading && (endpoints.length > 0 || destinations.length > 0) ? (
          <div className="record-grid">
            <div>
              <h3>Endpoints</h3>
              {endpoints.map((item) => (
                <article className="record" key={item.id}>
                  <strong>{item.name}</strong>
                  <span>/{item.slug}</span>
                  <small>{item.secretFingerprint}</small>
                </article>
              ))}
            </div>
            <div>
              <h3>Destinations</h3>
              {destinations.map((item) => (
                <article className="record" key={item.id}>
                  <strong>{item.name}</strong>
                  <span>{item.url}</span>
                  <small>
                    {item.hasAuthorization
                      ? "Authorization encrypted"
                      : "No authorization"}
                  </small>
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </>
  );
}

function readRoute(): { view: "events" | "setup"; eventId?: string } {
  const hash = window.location.hash.replace(/^#/, "");
  if (hash === "setup") return { view: "setup" };
  if (hash.startsWith("events/")) {
    const eventId = hash.slice("events/".length);
    return eventId === "" ? { view: "events" } : { view: "events", eventId };
  }
  return { view: "events" };
}

export function App() {
  const [route, setRoute] = useState(readRoute);

  useEffect(() => {
    const handleRoute = () => {
      setRoute(readRoute());
    };
    window.addEventListener("hashchange", handleRoute);
    return () => {
      window.removeEventListener("hashchange", handleRoute);
    };
  }, []);

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="#events" aria-label="AfterHook events home">
          AfterHook
        </a>
        <nav aria-label="Primary navigation">
          <a
            aria-current={route.view === "events" ? "page" : undefined}
            href="#events"
          >
            Events
          </a>
          <a
            aria-current={route.view === "setup" ? "page" : undefined}
            href="#setup"
          >
            Setup
          </a>
        </nav>
      </header>
      {route.view === "setup" ? (
        <SetupView />
      ) : route.eventId === undefined ? (
        <EventsView />
      ) : (
        <EventsView eventId={route.eventId} />
      )}
    </main>
  );
}
