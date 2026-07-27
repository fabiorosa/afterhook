import type {
  DestinationResponse,
  EndpointResponse,
} from "@afterhook/contracts";
import { afterEach, describe, expect, it } from "vitest";

import type { SetupRepository } from "./persistence/repository.js";
import { buildServer } from "./server.js";

const timestamp = "2026-07-26T00:00:00.000Z";
const endpoint: EndpointResponse = {
  id: "b102edbf-3ce2-4f4f-b7b3-607cefc2f5c8",
  name: "Billing events",
  slug: "billing-events-ab12cd",
  enabled: true,
  secretFingerprint: "sha256:0123456789abcdef",
  createdAt: timestamp,
  updatedAt: timestamp,
};
const destination: DestinationResponse = {
  id: "e30d2dc1-afef-4b92-9b6d-2cf8ca03c6c6",
  name: "Billing receiver",
  url: "https://example.test/hooks/billing",
  enabled: true,
  hasAuthorization: true,
  createdAt: timestamp,
  updatedAt: timestamp,
};

function createRepository(): SetupRepository {
  return {
    createEndpoint: () =>
      Promise.resolve({ endpoint, signingSecret: "ahsec_only_returned_once" }),
    createDestination: () => Promise.resolve(destination),
    listEndpoints: () => Promise.resolve([endpoint]),
    listDestinations: () => Promise.resolve([destination]),
  };
}

describe("setup HTTP contract", () => {
  const app = buildServer(createRepository());

  afterEach(async () => {
    await app.ready();
  });

  it("returns an endpoint secret only from creation", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/v1/endpoints",
      payload: { name: "Billing events" },
    });
    const listed = await app.inject({ method: "GET", url: "/v1/endpoints" });

    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      signingSecret: "ahsec_only_returned_once",
      secretFingerprint: endpoint.secretFingerprint,
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.body).not.toContain("ahsec_only_returned_once");
    expect(listed.body).not.toContain("secret_encrypted");
  });

  it("validates setup input and never reflects authorization", async () => {
    const invalid = await app.inject({
      method: "POST",
      url: "/v1/destinations",
      payload: { name: "x", url: "ftp://example.test" },
    });
    const created = await app.inject({
      method: "POST",
      url: "/v1/destinations",
      payload: {
        name: "Billing receiver",
        url: "https://example.test/hooks",
        authorization: "Bearer private-value",
      },
    });

    expect(invalid.statusCode).toBe(400);
    expect(created.statusCode).toBe(201);
    expect(created.body).not.toContain("private-value");
    expect(created.body).not.toContain("authorizationEncrypted");
  });
});
