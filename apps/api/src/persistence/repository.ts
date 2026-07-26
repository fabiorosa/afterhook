import { randomBytes } from "node:crypto";

import type {
  CreateDestinationInput,
  DestinationResponse,
  EndpointResponse,
} from "@afterhook/contracts";
import {
  createEndpointSlug,
  createSigningSecret,
  fingerprintSecret,
  type SecretCipher,
} from "@afterhook/domain";
import { asc } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { destinations, endpoints } from "./schema.js";

export type SetupRepository = Readonly<{
  createDestination: (
    input: CreateDestinationInput,
  ) => Promise<DestinationResponse>;
  createEndpoint: (input: {
    name: string;
  }) => Promise<{ endpoint: EndpointResponse; signingSecret: string }>;
  listDestinations: () => Promise<DestinationResponse[]>;
  listEndpoints: () => Promise<EndpointResponse[]>;
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
