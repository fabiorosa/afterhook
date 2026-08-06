import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  calculateRetryDelayMilliseconds,
  classifyDeliveryFailure,
  createSecretCipher,
  createSigningSecret,
  createWebhookSignature,
  digestWebhookPayload,
  fingerprintSecret,
  isWebhookTimestampFresh,
  maxWebhookBodyBytes,
  redactWebhookPayload,
  verifyWebhookSignature,
  webhookTimestampToleranceSeconds,
} from "./index.js";

describe("secret boundary", () => {
  const key = randomBytes(32).toString("base64");

  it("generates a non-empty server secret with the public prefix", () => {
    const secret = createSigningSecret();

    expect(secret).toMatch(/^ahsec_[A-Za-z0-9_-]{43}$/);
    expect(createSigningSecret()).not.toBe(secret);
  });

  it("creates a stable non-secret fingerprint", () => {
    const fingerprint = fingerprintSecret("ahsec_example");

    expect(fingerprint).toBe("sha256:7e6e94371aac9d3a");
    expect(fingerprint).not.toContain("ahsec_example");
  });

  it("encrypts with a distinct authenticated AES-GCM envelope and decrypts it", () => {
    const cipher = createSecretCipher(key);
    const secret = "Bearer value-that-must-not-be-stored-in-plain-text";
    const encrypted = cipher.encrypt(secret);

    expect(encrypted).toMatch(
      /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
    );
    expect(encrypted).not.toContain(secret);
    expect(cipher.decrypt(encrypted)).toBe(secret);
    expect(cipher.encrypt(secret)).not.toBe(encrypted);
  });

  it("rejects a malformed or tampered encrypted secret", () => {
    const cipher = createSecretCipher(key);
    const encrypted = cipher.encrypt("secret");
    const [version, iv, tag, ciphertext] = encrypted.split(".") as [
      string,
      string,
      string,
      string,
    ];
    const alteredTag = `${tag.startsWith("A") ? "B" : "A"}${tag.slice(1)}`;

    expect(() => cipher.decrypt("v1.bad")).toThrow("invalid format");
    expect(() =>
      cipher.decrypt(`${version}.${iv}.${alteredTag}.${ciphertext}`),
    ).toThrow("could not be authenticated");
  });

  it("requires exactly a 256-bit encryption key", () => {
    expect(() =>
      createSecretCipher(randomBytes(31).toString("base64")),
    ).toThrow("exactly 32 bytes");
  });
});

describe("signed ingestion boundary", () => {
  const secret = "ahsec_test-signing-secret";
  const timestamp = 1785292800;
  const rawBody = Buffer.from('{"event":"invoice.paid","amount":4200}');

  it("creates a stable payload digest and HMAC over exact bytes", () => {
    const signature = createWebhookSignature(secret, timestamp, rawBody);

    expect(digestWebhookPayload(rawBody)).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/);
    expect(verifyWebhookSignature(secret, timestamp, rawBody, signature)).toBe(
      true,
    );
    expect(
      verifyWebhookSignature(
        secret,
        timestamp,
        Buffer.from(`${rawBody.toString("utf8")} `),
        signature,
      ),
    ).toBe(false);
  });

  it("rejects altered, malformed, or wrong-length signatures safely", () => {
    const signature = createWebhookSignature(secret, timestamp, rawBody);

    expect(
      verifyWebhookSignature(secret, timestamp + 1, rawBody, signature),
    ).toBe(false);
    expect(
      verifyWebhookSignature(secret, timestamp, rawBody, "sha256=short"),
    ).toBe(false);
  });

  it("accepts timestamps only inside the inclusive replay window", () => {
    const now = new Date(timestamp * 1000);

    expect(isWebhookTimestampFresh(timestamp, now)).toBe(true);
    expect(
      isWebhookTimestampFresh(
        timestamp - webhookTimestampToleranceSeconds,
        now,
      ),
    ).toBe(true);
    expect(
      isWebhookTimestampFresh(
        timestamp - webhookTimestampToleranceSeconds - 1,
        now,
      ),
    ).toBe(false);
    expect(maxWebhookBodyBytes).toBe(262_144);
  });

  it("redacts credential-shaped values at every payload depth", () => {
    expect(
      redactWebhookPayload({
        event: "invoice.paid",
        token: "private",
        nested: {
          authorization: "Bearer private",
          clientSecret: "private",
          amount: 4200,
        },
        items: [{ api_key: "private", access_token: "private" }],
      }),
    ).toEqual({
      event: "invoice.paid",
      token: "[REDACTED]",
      nested: {
        authorization: "[REDACTED]",
        clientSecret: "[REDACTED]",
        amount: 4200,
      },
      items: [{ api_key: "[REDACTED]", access_token: "[REDACTED]" }],
    });
  });
});

describe("automatic retry policy", () => {
  it("classifies transient transport and documented HTTP failures", () => {
    expect(
      classifyDeliveryFailure({ outcome: "timed_out", responseStatus: null }),
    ).toBe("retryable");
    expect(
      classifyDeliveryFailure({
        outcome: "network_failure",
        responseStatus: null,
      }),
    ).toBe("retryable");
    for (const responseStatus of [408, 425, 429, 500, 503]) {
      expect(
        classifyDeliveryFailure({ outcome: "http_failure", responseStatus }),
      ).toBe("retryable");
    }
  });

  it("classifies other non-success HTTP outcomes as terminal", () => {
    for (const responseStatus of [300, 400, 401, 404, 422]) {
      expect(
        classifyDeliveryFailure({ outcome: "http_failure", responseStatus }),
      ).toBe("terminal");
    }
  });

  it("calculates deterministic bounded exponential delays with jitter", () => {
    expect(calculateRetryDelayMilliseconds(1, 0)).toBe(800);
    expect(calculateRetryDelayMilliseconds(1, 0.5)).toBe(1_000);
    expect(calculateRetryDelayMilliseconds(2, 1)).toBe(2_400);
    expect(calculateRetryDelayMilliseconds(20, 1)).toBe(30_000);
    expect(() => calculateRetryDelayMilliseconds(0, 0.5)).toThrow(
      /positive integer/,
    );
    expect(() => calculateRetryDelayMilliseconds(1, 2)).toThrow(
      /between zero and one/,
    );
  });
});
