import { useEffect, useState } from "react";

import { request } from "./api.js";

type EventListItem = Readonly<{
  id: string;
  endpoint: Readonly<{ id: string; name: string; slug: string }>;
  idempotencyKey: string;
  status:
    | "RECEIVED"
    | "QUEUED"
    | "PROCESSING"
    | "DELIVERED"
    | "FAILED"
    | "DEAD_LETTER";
  receivedAt: string;
  attemptCount: number;
}>;

type EventDetail = EventListItem &
  Readonly<{
    payloadDigest: string;
    payloadRedacted: Record<string, unknown>;
    activities: readonly Readonly<{
      id: string;
      type: string;
      metadata: Record<string, unknown>;
      createdAt: string;
    }>[];
  }>;

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

const statusLabels: Record<EventListItem["status"], string> = {
  RECEIVED: "Received",
  QUEUED: "Queued",
  PROCESSING: "Processing",
  DELIVERED: "Delivered",
  FAILED: "Failed",
  DEAD_LETTER: "Dead letter",
};

function activityContent(activity: EventDetail["activities"][number]) {
  const duration = activity.metadata.durationMilliseconds;
  const responseStatus = activity.metadata.responseStatus;

  if (activity.type === "attempt.started") {
    return {
      title: "Delivery started",
      description:
        "Attempt 1 was committed before the destination request began.",
    };
  }
  if (activity.type === "attempt.succeeded") {
    return {
      title: "Destination accepted delivery",
      description: `The destination responded${typeof responseStatus === "number" ? ` with HTTP ${String(responseStatus)}` : " successfully"}${typeof duration === "number" ? ` in ${String(duration)} ms` : ""}.`,
    };
  }
  if (activity.type === "attempt.failed") {
    return {
      title: "Delivery failed",
      description: `The attempt ended safely${typeof responseStatus === "number" ? ` with HTTP ${String(responseStatus)}` : " without an accepted response"}${typeof duration === "number" ? ` after ${String(duration)} ms` : ""}. No retry was scheduled by this slice.`,
    };
  }
  return {
    title: "Webhook received",
    description:
      "Signature accepted and event committed to PostgreSQL before queue handoff.",
  };
}

function EventsLoading({ detail = false }: Readonly<{ detail?: boolean }>) {
  return (
    <div
      aria-label="Loading events"
      className={detail ? "detail-loading" : "event-loading"}
      role="status"
    >
      <span className="sr-only">Loading events</span>
      <div />
      <div />
      <div />
    </div>
  );
}

function EventList() {
  const [events, setEvents] = useState<EventListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadEvents() {
    setLoading(true);
    setError(null);
    try {
      setEvents(await request<EventListItem[]>("/v1/events"));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not load events.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadEvents();
  }, []);

  return (
    <>
      <section className="events-intro" aria-labelledby="events-title">
        <div>
          <p className="eyebrow">OPERATIONAL HISTORY</p>
          <h1 id="events-title">Received events</h1>
        </div>
        <p>
          Every accepted webhook has one stable identity. Received confirms
          durable storage, not destination delivery.
        </p>
      </section>
      {loading ? <EventsLoading /> : null}
      {!loading && error !== null ? (
        <section className="event-state" role="alert">
          <h2>Event history is unavailable</h2>
          <p>{error}</p>
          <button type="button" onClick={() => void loadEvents()}>
            Try again
          </button>
        </section>
      ) : null}
      {!loading && error === null && events.length === 0 ? (
        <section className="event-state event-empty">
          <p className="eyebrow">NO EVENTS YET</p>
          <h2>Your first accepted webhook will appear here.</h2>
          <p>
            Create an endpoint in Setup, then send a signed JSON request. The
            event will be stored before any delivery work begins.
          </p>
          <a className="primary-link" href="#setup">
            Open setup
          </a>
        </section>
      ) : null}
      {!loading && error === null && events.length > 0 ? (
        <section className="event-table" aria-label="Received events">
          <div className="event-table-heading" aria-hidden="true">
            <span>Event</span>
            <span>Endpoint</span>
            <span>Received</span>
            <span>Status</span>
          </div>
          {events.map((event) => (
            <a
              className="event-row"
              href={`#events/${event.id}`}
              key={event.id}
            >
              <span>
                <strong>{event.id.slice(0, 8)}</strong>
                <small>{event.idempotencyKey}</small>
              </span>
              <span>
                <strong>{event.endpoint.name}</strong>
                <small>/{event.endpoint.slug}</small>
              </span>
              <time dateTime={event.receivedAt}>
                {formatDate(event.receivedAt)}
              </time>
              <span
                className={`status-label status-${event.status.toLowerCase()}`}
              >
                {statusLabels[event.status]}
              </span>
            </a>
          ))}
        </section>
      ) : null}
    </>
  );
}

function EventDetailView({ eventId }: Readonly<{ eventId: string }>) {
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadEvent() {
    setLoading(true);
    setError(null);
    try {
      setEvent(await request<EventDetail>(`/v1/events/${eventId}`));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not load the event.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadEvent();
  }, [eventId]);

  if (loading) return <EventsLoading detail />;
  if (error !== null || event === null) {
    return (
      <section className="event-state detail-error" role="alert">
        <a className="back-link" href="#events">
          Back to events
        </a>
        <h1>Event unavailable</h1>
        <p>{error ?? "The event could not be found."}</p>
        <button type="button" onClick={() => void loadEvent()}>
          Try again
        </button>
      </section>
    );
  }

  return (
    <>
      <section className="detail-header" aria-labelledby="event-title">
        <a className="back-link" href="#events">
          Back to events
        </a>
        <div className="detail-title-row">
          <div>
            <p className="eyebrow">EVENT</p>
            <h1 id="event-title">{event.id.slice(0, 8)}</h1>
          </div>
          <span className={`status-label status-${event.status.toLowerCase()}`}>
            {statusLabels[event.status]}
          </span>
        </div>
        <p className="event-identity">{event.id}</p>
      </section>
      <div className="detail-layout">
        <section className="event-facts" aria-labelledby="facts-title">
          <h2 id="facts-title">Event record</h2>
          <dl>
            <div>
              <dt>Endpoint</dt>
              <dd>{event.endpoint.name}</dd>
            </div>
            <div>
              <dt>Idempotency key</dt>
              <dd>{event.idempotencyKey}</dd>
            </div>
            <div>
              <dt>Received at</dt>
              <dd>{formatDate(event.receivedAt)}</dd>
            </div>
            <div>
              <dt>Attempts</dt>
              <dd>{event.attemptCount}</dd>
            </div>
            <div className="wide-fact">
              <dt>Payload digest</dt>
              <dd>{event.payloadDigest}</dd>
            </div>
          </dl>
          <div className="payload-heading">
            <h2>Redacted payload</h2>
            <p>Credential-shaped fields are removed before storage.</p>
          </div>
          <pre>{JSON.stringify(event.payloadRedacted, null, 2)}</pre>
        </section>
        <section className="timeline" aria-labelledby="timeline-title">
          <p className="eyebrow">TIMELINE</p>
          <h2 id="timeline-title">What happened</h2>
          <ol>
            {event.activities.map((activity) => {
              const content = activityContent(activity);
              return (
                <li key={activity.id}>
                  <span className="timeline-marker" aria-hidden="true" />
                  <div>
                    <h3>{content.title}</h3>
                    <time dateTime={activity.createdAt}>
                      {formatDate(activity.createdAt)}
                    </time>
                    <p>{content.description}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </>
  );
}

export function EventsView({ eventId }: Readonly<{ eventId?: string }>) {
  return eventId === undefined ? (
    <EventList />
  ) : (
    <EventDetailView eventId={eventId} />
  );
}
