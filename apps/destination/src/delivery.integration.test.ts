import { deliverWebhook } from "@afterhook/delivery";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildLocalDestination } from "./server.js";

const eventId = "75339b4d-bb60-43b6-93bd-30436cb6454a";
let receivedAuthorization: unknown;
let app = buildLocalDestination();
let origin = "";

beforeEach(async () => {
  receivedAuthorization = undefined;
  app = buildLocalDestination({
    timeoutDelayMilliseconds: 500,
    onReceive: (headers) => {
      receivedAuthorization = headers.authorization;
    },
  });
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  origin = address;
});

afterEach(async () => {
  await app.close();
});

describe("bounded HTTP delivery", () => {
  it("sends exact JSON metadata and keeps authorization out of the result", async () => {
    const pinnedUrl = `${origin}/success`.replace(
      "127.0.0.1",
      "destination.test",
    );
    const result = await deliverWebhook(
      {
        eventId,
        url: pinnedUrl,
        body: '{"event":"invoice.paid"}',
        authorization: "Bearer private-value",
      },
      {
        allowPrivateNetwork: true,
        resolve: () => Promise.resolve([{ address: "127.0.0.1", family: 4 }]),
      },
    );

    expect(result.outcome).toBe("succeeded");
    expect(result.responseStatus).toBe(204);
    expect(receivedAuthorization).toBe("Bearer private-value");
    expect(JSON.stringify(result)).not.toContain("private-value");
  });

  it("times out without leaking socket details", async () => {
    const result = await deliverWebhook(
      { eventId, url: `${origin}/timeout`, body: "{}" },
      { allowPrivateNetwork: true, timeoutMilliseconds: 50 },
    );

    expect(result).toMatchObject({
      outcome: "timed_out",
      responseStatus: null,
    });
  });

  it("does not follow redirects or retain oversized responses", async () => {
    const redirected = await deliverWebhook(
      { eventId, url: `${origin}/redirect`, body: "{}" },
      { allowPrivateNetwork: true },
    );
    const oversized = await deliverWebhook(
      { eventId, url: `${origin}/large`, body: "{}" },
      { allowPrivateNetwork: true },
    );

    expect(redirected).toMatchObject({
      outcome: "http_failure",
      responseStatus: 302,
    });
    expect(oversized).toMatchObject({
      outcome: "succeeded",
      responseStatus: 200,
    });
    expect(JSON.stringify(oversized)).not.toContain("x".repeat(100));
  });
});
