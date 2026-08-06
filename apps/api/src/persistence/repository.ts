import { randomBytes } from "node:crypto";

import {
  eventStatusSchema,
  attemptStatusSchema,
  type CreateDestinationInput,
  type DestinationResponse,
  type EndpointResponse,
  type EventDetail,
  type EventFilter,
  type EventListItem,
} from "@afterhook/contracts";
import {
  createEndpointSlug,
  createSigningSecret,
  fingerprintSecret,
  getManualRetryEligibility,
  manualRetryCooldownMilliseconds,
  type SecretCipher,
} from "@afterhook/domain";
import { and, asc, count, desc, eq, inArray, max } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  activityEvents,
  deliveryAttempts,
  destinations,
  endpoints,
  events,
} from "./schema.js";

export type PersistEventInput = Readonly<{
  endpointId: string;
  idempotencyKey: string;
  payloadDigest: string;
  payloadRedacted: unknown;
  rawPayload?: string;
  receivedAt: Date;
}>;

export type PersistEventOutcome =
  | Readonly<{ outcome: "created" | "existing"; eventId: string }>
  | Readonly<{ outcome: "conflict" }>;

export type ManualRetryOutcome =
  | Readonly<{
      outcome: "accepted";
      eventId: string;
      attemptNumber: number;
    }>
  | Readonly<{ outcome: "not_found" }>
  | Readonly<{ outcome: "not_allowed" }>
  | Readonly<{ outcome: "rate_limited" }>;

export class DestinationUnavailableError extends Error {
  constructor() {
    super("An enabled destination is required.");
  }
}

export type SetupRepository = Readonly<{
  createDestination: (
    input: CreateDestinationInput,
  ) => Promise<DestinationResponse>;
  createEndpoint: (input: {
    name: string;
  }) => Promise<{ endpoint: EndpointResponse; signingSecret: string }>;
  listDestinations: () => Promise<DestinationResponse[]>;
  listEndpoints: () => Promise<EndpointResponse[]>;
  findIngestionEndpoint: (slug: string) => Promise<IngestionEndpoint | null>;
  persistEvent: (input: PersistEventInput) => Promise<PersistEventOutcome>;
  listEvents: (filters?: EventFilter) => Promise<EventListItem[]>;
  findEventDetail: (eventId: string) => Promise<EventDetail | null>;
  requestManualRetry: (
    eventId: string,
    requestedAt: Date,
  ) => Promise<ManualRetryOutcome>;
}>;

export type IngestionEndpoint = Readonly<{
  id: string;
  enabled: boolean;
  signingSecret: string;
}>;

type Database = PostgresJsDatabase;

function toIsoDate(value: Date): string {
  return value.toISOString();
}

function toEndpointResponse(
  row: typeof endpoints.$inferSelect,
): EndpointResponse {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    enabled: row.enabled,
    secretFingerprint: row.secretFingerprint,
    createdAt: toIsoDate(row.createdAt),
    updatedAt: toIsoDate(row.updatedAt),
  };
}

function toDestinationResponse(
  row: typeof destinations.$inferSelect,
): DestinationResponse {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    enabled: row.enabled,
    hasAuthorization: row.authorizationEncrypted !== null,
    createdAt: toIsoDate(row.createdAt),
    updatedAt: toIsoDate(row.updatedAt),
  };
}

function slugCandidate(name: string): string {
  return `${createEndpointSlug(name)}-${randomBytes(3).toString("hex")}`;
}

function toEventListItem(row: {
  id: string;
  endpointId: string;
  endpointName: string;
  endpointSlug: string;
  idempotencyKey: string;
  status: string;
  receivedAt: Date;
  attemptCount: number;
}): EventListItem {
  return {
    id: row.id,
    endpoint: {
      id: row.endpointId,
      name: row.endpointName,
      slug: row.endpointSlug,
    },
    idempotencyKey: row.idempotencyKey,
    status: eventStatusSchema.parse(row.status),
    receivedAt: toIsoDate(row.receivedAt),
    attemptCount: row.attemptCount,
  };
}

export function createSetupRepository(
  database: Database,
  cipher: SecretCipher,
): SetupRepository {
  return {
    async createEndpoint(input) {
      const signingSecret = createSigningSecret();
      const secretEncrypted = cipher.encrypt(signingSecret);
      const secretFingerprint = fingerprintSecret(signingSecret);

      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const [row] = await database
            .insert(endpoints)
            .values({
              name: input.name,
              slug: slugCandidate(input.name),
              secretEncrypted,
              secretFingerprint,
            })
            .returning();

          if (row !== undefined) {
            return { endpoint: toEndpointResponse(row), signingSecret };
          }
        } catch (error) {
          if (
            !(error instanceof Error) ||
            !error.message.includes("endpoints_slug")
          ) {
            throw error;
          }
        }
      }

      throw new Error("Could not allocate a unique endpoint slug.");
    },
    async listEndpoints() {
      const rows = await database
        .select()
        .from(endpoints)
        .orderBy(asc(endpoints.createdAt));
      return rows.map(toEndpointResponse);
    },
    async findIngestionEndpoint(slug) {
      const [row] = await database
        .select({
          id: endpoints.id,
          enabled: endpoints.enabled,
          secretEncrypted: endpoints.secretEncrypted,
        })
        .from(endpoints)
        .where(eq(endpoints.slug, slug))
        .limit(1);

      if (row === undefined) {
        return null;
      }

      return {
        id: row.id,
        enabled: row.enabled,
        signingSecret: cipher.decrypt(row.secretEncrypted),
      };
    },
    async persistEvent(input) {
      return database.transaction(async (transaction) => {
        const [destination] = await transaction
          .select({ id: destinations.id })
          .from(destinations)
          .where(eq(destinations.enabled, true))
          .orderBy(desc(destinations.createdAt), desc(destinations.id))
          .limit(1);

        if (destination === undefined) {
          throw new DestinationUnavailableError();
        }

        const [created] = await transaction
          .insert(events)
          .values({
            endpointId: input.endpointId,
            destinationId: destination.id,
            idempotencyKey: input.idempotencyKey,
            payloadDigest: input.payloadDigest,
            payloadRedacted: input.payloadRedacted,
            payloadEncrypted: cipher.encrypt(
              input.rawPayload ?? JSON.stringify(input.payloadRedacted),
            ),
            receivedAt: input.receivedAt,
          })
          .onConflictDoNothing({
            target: [events.endpointId, events.idempotencyKey],
          })
          .returning({ id: events.id });

        if (created !== undefined) {
          await transaction.insert(activityEvents).values({
            eventId: created.id,
            type: "event.received",
            metadata: { payloadDigest: input.payloadDigest },
            createdAt: input.receivedAt,
          });
          return { outcome: "created", eventId: created.id } as const;
        }

        const [existing] = await transaction
          .select({ id: events.id, payloadDigest: events.payloadDigest })
          .from(events)
          .where(
            and(
              eq(events.endpointId, input.endpointId),
              eq(events.idempotencyKey, input.idempotencyKey),
            ),
          )
          .limit(1);

        if (existing === undefined) {
          throw new Error("Idempotency reservation could not be read.");
        }

        return existing.payloadDigest === input.payloadDigest
          ? ({ outcome: "existing", eventId: existing.id } as const)
          : ({ outcome: "conflict" } as const);
      });
    },
    async listEvents(filters = {}) {
      const predicates = [
        filters.status === undefined
          ? undefined
          : eq(events.status, filters.status),
        filters.endpointId === undefined
          ? undefined
          : eq(events.endpointId, filters.endpointId),
      ].filter((predicate) => predicate !== undefined);
      const rows = await database
        .select({
          id: events.id,
          endpointId: endpoints.id,
          endpointName: endpoints.name,
          endpointSlug: endpoints.slug,
          idempotencyKey: events.idempotencyKey,
          status: events.status,
          receivedAt: events.receivedAt,
          attemptCount: count(deliveryAttempts.id),
        })
        .from(events)
        .innerJoin(endpoints, eq(events.endpointId, endpoints.id))
        .leftJoin(deliveryAttempts, eq(events.id, deliveryAttempts.eventId))
        .where(predicates.length === 0 ? undefined : and(...predicates))
        .groupBy(events.id, endpoints.id)
        .orderBy(desc(events.receivedAt), desc(events.id));

      return rows.map(toEventListItem);
    },
    async findEventDetail(eventId) {
      const [row] = await database
        .select({
          id: events.id,
          endpointId: endpoints.id,
          endpointName: endpoints.name,
          endpointSlug: endpoints.slug,
          idempotencyKey: events.idempotencyKey,
          status: events.status,
          receivedAt: events.receivedAt,
          payloadDigest: events.payloadDigest,
          payloadRedacted: events.payloadRedacted,
          attemptCount: count(deliveryAttempts.id),
        })
        .from(events)
        .innerJoin(endpoints, eq(events.endpointId, endpoints.id))
        .leftJoin(deliveryAttempts, eq(events.id, deliveryAttempts.eventId))
        .where(eq(events.id, eventId))
        .groupBy(events.id, endpoints.id)
        .limit(1);

      if (row === undefined) {
        return null;
      }

      const activities = await database
        .select({
          id: activityEvents.id,
          type: activityEvents.type,
          metadata: activityEvents.metadata,
          createdAt: activityEvents.createdAt,
        })
        .from(activityEvents)
        .where(eq(activityEvents.eventId, eventId))
        .orderBy(asc(activityEvents.createdAt), asc(activityEvents.id));
      const attempts = await database
        .select({
          id: deliveryAttempts.id,
          attemptNumber: deliveryAttempts.attemptNumber,
          trigger: deliveryAttempts.trigger,
          status: deliveryAttempts.status,
          scheduledAt: deliveryAttempts.scheduledAt,
          startedAt: deliveryAttempts.startedAt,
          finishedAt: deliveryAttempts.finishedAt,
          durationMilliseconds: deliveryAttempts.durationMs,
          responseStatus: deliveryAttempts.responseStatus,
          errorCode: deliveryAttempts.errorCode,
          safeErrorMessage: deliveryAttempts.safeErrorMessage,
        })
        .from(deliveryAttempts)
        .where(eq(deliveryAttempts.eventId, eventId))
        .orderBy(asc(deliveryAttempts.attemptNumber));

      return {
        ...toEventListItem(row),
        payloadDigest: row.payloadDigest,
        payloadRedacted: row.payloadRedacted as Record<string, unknown>,
        activities: activities.map((activity) => ({
          ...activity,
          metadata: activity.metadata as Record<string, unknown>,
          createdAt: toIsoDate(activity.createdAt),
        })),
        attempts: attempts.map((attempt) => ({
          ...attempt,
          trigger:
            attempt.trigger === "MANUAL"
              ? ("MANUAL" as const)
              : ("AUTOMATIC" as const),
          status: attemptStatusSchema.parse(attempt.status),
          scheduledAt: toIsoDate(attempt.scheduledAt),
          startedAt:
            attempt.startedAt === null ? null : toIsoDate(attempt.startedAt),
          finishedAt:
            attempt.finishedAt === null ? null : toIsoDate(attempt.finishedAt),
        })),
        manualRetry: getManualRetryEligibility(
          eventStatusSchema.parse(row.status),
        ),
      };
    },
    async requestManualRetry(eventId, requestedAt) {
      return database.transaction(async (transaction) => {
        const [event] = await transaction
          .select({ id: events.id, status: events.status })
          .from(events)
          .where(eq(events.id, eventId))
          .for("update")
          .limit(1);
        if (event === undefined) return { outcome: "not_found" } as const;

        const eligibility = getManualRetryEligibility(
          eventStatusSchema.parse(event.status),
        );
        if (!eligibility.allowed) return { outcome: "not_allowed" } as const;

        const [activeAttempts] = await transaction
          .select({ count: count(deliveryAttempts.id) })
          .from(deliveryAttempts)
          .where(
            and(
              eq(deliveryAttempts.eventId, eventId),
              inArray(deliveryAttempts.status, ["SCHEDULED", "RUNNING"]),
            ),
          );
        if ((activeAttempts?.count ?? 0) > 0) {
          return { outcome: "not_allowed" } as const;
        }

        const [lastManual] = await transaction
          .select({ createdAt: max(activityEvents.createdAt) })
          .from(activityEvents)
          .where(
            and(
              eq(activityEvents.eventId, eventId),
              eq(activityEvents.type, "retry.manual_requested"),
            ),
          );
        if (
          lastManual?.createdAt !== null &&
          lastManual?.createdAt !== undefined &&
          requestedAt.getTime() - lastManual.createdAt.getTime() <
            manualRetryCooldownMilliseconds
        ) {
          return { outcome: "rate_limited" } as const;
        }

        const [lastAttempt] = await transaction
          .select({ attemptNumber: max(deliveryAttempts.attemptNumber) })
          .from(deliveryAttempts)
          .where(eq(deliveryAttempts.eventId, eventId));
        const attemptNumber = (lastAttempt?.attemptNumber ?? 0) + 1;
        const [attempt] = await transaction
          .insert(deliveryAttempts)
          .values({
            eventId,
            attemptNumber,
            trigger: "MANUAL",
            status: "SCHEDULED",
            scheduledAt: requestedAt,
            startedAt: null,
          })
          .returning({ id: deliveryAttempts.id });
        if (attempt === undefined) {
          throw new Error("Manual retry attempt was not reserved.");
        }

        await transaction
          .update(events)
          .set({
            status: "QUEUED",
            completedAt: null,
            nextAttemptAt: requestedAt,
            updatedAt: requestedAt,
          })
          .where(eq(events.id, eventId));
        await transaction.insert(activityEvents).values({
          eventId,
          attemptId: attempt.id,
          type: "retry.manual_requested",
          metadata: { attemptNumber, trigger: "MANUAL" },
          createdAt: requestedAt,
        });

        return { outcome: "accepted", eventId, attemptNumber } as const;
      });
    },
    async createDestination(input) {
      const [row] = await database
        .insert(destinations)
        .values({
          name: input.name,
          url: input.url,
          authorizationEncrypted:
            input.authorization === undefined
              ? null
              : cipher.encrypt(input.authorization),
        })
        .returning();

      if (row === undefined) {
        throw new Error("Destination was not created.");
      }

      return toDestinationResponse(row);
    },
    async listDestinations() {
      const rows = await database
        .select()
        .from(destinations)
        .orderBy(asc(destinations.createdAt));
      return rows.map(toDestinationResponse);
    },
  };
}

export function createPostgresRepository(
  databaseUrl: string,
  cipher: SecretCipher,
): SetupRepository & { close: () => Promise<void> } {
  const client = postgres(databaseUrl, { max: 5 });
  const repository = createSetupRepository(drizzle(client), cipher);

  return { ...repository, close: () => client.end() };
}
