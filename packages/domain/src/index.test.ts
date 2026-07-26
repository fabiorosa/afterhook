import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  createSecretCipher,
  createSigningSecret,
  fingerprintSecret,
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
