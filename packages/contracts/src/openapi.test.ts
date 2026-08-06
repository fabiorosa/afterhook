import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const contractUrl = new URL("../../../docs/openapi.yaml", import.meta.url);

describe("published OpenAPI contract", () => {
  it("documents every public Fastify route and the redaction boundary", async () => {
    const contract = await readFile(contractUrl, "utf8");

    for (const route of [
      "/health:",
      "/v1/demo:",
      "/v1/demo/events:",
      "/v1/demo/reset:",
      "/v1/endpoints:",
      "/v1/destinations:",
      "/v1/endpoints/{slug}/events:",
      "/v1/events:",
      "/v1/events/{eventId}:",
      "/v1/events/{eventId}/retry:",
    ]) {
      expect(contract).toContain(route);
    }

    expect(contract).toContain("openapi: 3.1.0");
    expect(contract).toContain("raw payloads");
    expect(contract).toContain("AFTERHOOK_DEMO_ENABLED=true");
  });
});
