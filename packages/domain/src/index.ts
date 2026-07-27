import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const algorithm = "aes-256-gcm";
const encryptionVersion = "v1";
const ivBytes = 12;

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
