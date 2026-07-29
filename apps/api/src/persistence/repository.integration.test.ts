import { randomBytes } from "node:crypto";

import { createSecretCipher } from "@afterhook/domain";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createPostgresRepository } from "./repository.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (databaseUrl === undefined) {
  throw new Error(
    "TEST_DATABASE_URL or DATABASE_URL is required for PostgreSQL integration tests.",
  );
}

const client = postgres(databaseUrl);
const repository = createPostgresRepository(
  databaseUrl,
  createSecretCipher(randomBytes(32).toString("base64")),
);

beforeEach(async () => {
  await client.unsafe('TRUNCATE TABLE "destinations", "endpoints"');
});

afterAll(async () => {
  await repository.close();
  await client.end();
});

describe("setup repository", () => {
  it("persists encrypted material while returning only safe endpoint metadata", async () => {
    const created = await repository.createEndpoint({ name: "Billing events" });
    const rows = await client<
      { secret_encrypted: string; secret_fingerprint: string }[]
    >`
      SELECT secret_encrypted, secret_fingerprint FROM endpoints
    `;

    expect(created.signingSecret).toMatch(/^ahsec_/);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.secret_encrypted).not.toContain(created.signingSecret);
    expect(rows[0]?.secret_fingerprint).toBe(
      created.endpoint.secretFingerprint,
    );
    await expect(repository.listEndpoints()).resolves.toEqual([
      created.endpoint,
    ]);
  });

  it("encrypts destination authorization and omits it from every safe read", async () => {
    const created = await repository.createDestination({
      name: "Billing receiver",
      url: "https://example.test/billing",
      authorization: "Bearer private-value",
    });
    const rows = await client<{ authorization_encrypted: string | null }[]>`
      SELECT authorization_encrypted FROM destinations
    `;

    expect(rows[0]?.authorization_encrypted).not.toContain(
      "Bearer private-value",
    );
    expect(created).toMatchObject({ hasAuthorization: true });
    expect(JSON.stringify(await repository.listDestinations())).not.toContain(
      "private-value",
    );
  });

  it("decrypts signing material only for the internal ingestion lookup", async () => {
    const created = await repository.createEndpoint({ name: "Billing events" });

    await expect(
      repository.findIngestionEndpoint(created.endpoint.slug),
    ).resolves.toEqual({
      id: created.endpoint.id,
      enabled: true,
      signingSecret: created.signingSecret,
    });
    await expect(
      repository.findIngestionEndpoint("missing-endpoint"),
    ).resolves.toBeNull();
  });
});
