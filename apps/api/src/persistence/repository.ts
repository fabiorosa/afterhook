import { randomBytes } from "node:crypto";

import {
  eventStatusSchema,
  type CreateDestinationInput,
  type DestinationResponse,
  type EndpointResponse,
  type EventDetail,
  type EventListItem,
} from "@afterhook/contracts";
import {
  createEndpointSlug,
  createSigningSecret,
  fingerprintSecret,
  type SecretCipher,
} from "@afterhook/domain";
import { and, asc, desc, eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { activityEvents, destinations, endpoints, events } from "./schema.js";

export type PersistEventInput = Readonly<{
  endpointId: string;
  idempotencyKey: string;
  payloadDigest: string;
  payloadRedacted: unknown;
  receivedAt: Date;
}>;

export type PersistEventOutcome =
  | Readonly<{ outcome: "created" | "existing"; eventId: string }>
  | Readonly<{ outcome: "conflict" }>;

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
  listEvents: () => Promise<EventListItem[]>;
  findEventDetail: (eventId: string) => Promise<EventDetail | null>;
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
    attemptCount: 0,
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
        const [created] = await transaction
          .insert(events)
          .values({
            endpointId: input.endpointId,
            idempotencyKey: input.idempotencyKey,
            payloadDigest: input.payloadDigest,
            payloadRedacted: input.payloadRedacted,
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
    async listEvents() {
      const rows = await database
        .select({
          id: events.id,
          endpointId: endpoints.id,
          endpointName: endpoints.name,
          endpointSlug: endpoints.slug,
          idempotencyKey: events.idempotencyKey,
          status: events.status,
          receivedAt: events.receivedAt,
        })
        .from(events)
        .innerJoin(endpoints, eq(events.endpointId, endpoints.id))
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
        })
        .from(events)
        .innerJoin(endpoints, eq(events.endpointId, endpoints.id))
        .where(eq(events.id, eventId))
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

      return {
        ...toEventListItem(row),
        payloadDigest: row.payloadDigest,
        payloadRedacted: row.payloadRedacted as Record<string, unknown>,
        activities: activities.map((activity) => ({
          ...activity,
          metadata: activity.metadata as Record<string, unknown>,
          createdAt: toIsoDate(activity.createdAt),
        })),
      };
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
