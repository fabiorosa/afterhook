import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const algorithm = "aes-256-gcm";
const encryptionVersion = "v1";
const ivBytes = 12;
export const maxWebhookBodyBytes = 256 * 1024;
export const webhookTimestampToleranceSeconds = 5 * 60;
export const maximumAutomaticAttempts = 3;
export const retryBaseDelayMilliseconds = 1_000;
export const retryMaximumDelayMilliseconds = 30_000;
export const retryJitterRatio = 0.2;
const sensitivePayloadKeys = new Set([
  "apikey",
  "authorization",
  "clientsecret",
  "cookie",
  "password",
  "refreshtoken",
  "secret",
  "token",
  "accesstoken",
]);

export type DeliveryFailureInput = Readonly<{
  outcome: "http_failure" | "timed_out" | "network_failure";
  responseStatus: number | null;
}>;

export type DeliveryFailureClassification = "retryable" | "terminal";

export function classifyDeliveryFailure(
  failure: DeliveryFailureInput,
): DeliveryFailureClassification {
  if (failure.outcome !== "http_failure") return "retryable";
  const status = failure.responseStatus;
  if (status === null) return "terminal";
  return status === 408 || status === 425 || status === 429 || status >= 500
    ? "retryable"
    : "terminal";
}

export function calculateRetryDelayMilliseconds(
  completedAttemptNumber: number,
  randomValue = Math.random(),
): number {
  if (!Number.isInteger(completedAttemptNumber) || completedAttemptNumber < 1) {
    throw new Error("Completed attempt number must be a positive integer.");
  }
  if (randomValue < 0 || randomValue > 1) {
    throw new Error("Random value must be between zero and one.");
  }

  const exponential = Math.min(
    retryBaseDelayMilliseconds * 2 ** (completedAttemptNumber - 1),
    retryMaximumDelayMilliseconds,
  );
  const jitter = 1 - retryJitterRatio + randomValue * retryJitterRatio * 2;
  return Math.min(
    Math.round(exponential * jitter),
    retryMaximumDelayMilliseconds,
  );
}

export type RedactedPayloadValue =
  | null
  | boolean
  | number
  | string
  | RedactedPayloadValue[]
  | { [key: string]: RedactedPayloadValue };

export type SecretCipher = Readonly<{
  decrypt: (encrypted: string) => string;
  encrypt: (plaintext: string) => string;
}>;

export function createSigningSecret(): string {
  return `ahsec_${randomBytes(32).toString("base64url")}`;
}

export function fingerprintSecret(secret: string): string {
  return `sha256:${createHash("sha256").update(secret, "utf8").digest("hex").slice(0, 16)}`;
}

export function digestWebhookPayload(rawBody: Buffer | string): string {
  return `sha256:${createHash("sha256").update(rawBody).digest("hex")}`;
}

export function redactWebhookPayload(
  value: unknown,
  key?: string,
): RedactedPayloadValue {
  if (
    key !== undefined &&
    sensitivePayloadKeys.has(key.replace(/[^a-z0-9]/gi, "").toLowerCase())
  ) {
    return "[REDACTED]";
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactWebhookPayload(item));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redactWebhookPayload(entryValue, entryKey),
      ]),
    );
  }

  return "[UNSUPPORTED]";
}

export function createWebhookSignature(
  secret: string,
  timestamp: number,
  rawBody: Buffer | string,
): string {
  const digest = createHmac("sha256", secret)
    .update(`${String(timestamp)}.`, "utf8")
    .update(rawBody)
    .digest("hex");

  return `sha256=${digest}`;
}

export function verifyWebhookSignature(
  secret: string,
  timestamp: number,
  rawBody: Buffer | string,
  receivedSignature: string,
): boolean {
  const expected = Buffer.from(
    createWebhookSignature(secret, timestamp, rawBody),
    "utf8",
  );
  const received = Buffer.from(receivedSignature, "utf8");

  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

export function isWebhookTimestampFresh(timestamp: number, now: Date): boolean {
  const nowSeconds = Math.floor(now.getTime() / 1000);
  return Math.abs(nowSeconds - timestamp) <= webhookTimestampToleranceSeconds;
}

export function createEndpointSlug(name: string): string {
  const normalized = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (normalized.length < 3) {
    throw new Error("Endpoint name cannot produce a valid slug.");
  }

  return normalized.slice(0, 72).replace(/-+$/g, "");
}

export function createSecretCipher(encodedKey: string): SecretCipher {
  const key = Buffer.from(encodedKey, "base64");

  if (key.length !== 32) {
    throw new Error("SECRET_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  }

  return {
    encrypt(plaintext: string): string {
      const iv = randomBytes(ivBytes);
      const cipher = createCipheriv(algorithm, key, iv);
      const ciphertext = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
      ]);
      const tag = cipher.getAuthTag();

      return [
        encryptionVersion,
        iv.toString("base64url"),
        tag.toString("base64url"),
        ciphertext.toString("base64url"),
      ].join(".");
    },
    decrypt(encrypted: string): string {
      const [version, encodedIv, encodedTag, encodedCiphertext, ...remaining] =
        encrypted.split(".");
      if (
        version !== encryptionVersion ||
        encodedIv === undefined ||
        encodedTag === undefined ||
        encodedCiphertext === undefined ||
        remaining.length > 0
      ) {
        throw new Error("Encrypted secret has an invalid format.");
      }

      try {
        const decipher = createDecipheriv(
          algorithm,
          key,
          Buffer.from(encodedIv, "base64url"),
        );
        decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
        return Buffer.concat([
          decipher.update(Buffer.from(encodedCiphertext, "base64url")),
          decipher.final(),
        ]).toString("utf8");
      } catch {
        throw new Error("Encrypted secret could not be authenticated.");
      }
    },
  };
}
