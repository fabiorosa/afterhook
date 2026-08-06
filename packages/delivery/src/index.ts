import { lookup } from "node:dns/promises";
import { performance } from "node:perf_hooks";

import ipaddr from "ipaddr.js";
import { Agent, request } from "undici";

export const defaultDeliveryTimeoutMilliseconds = 5_000;
export const maxDeliveryResponseBytes = 64 * 1024;
export const maxRetryAfterMilliseconds = 30_000;

export type DeliveryCommand = Readonly<{
  eventId: string;
  url: string;
  body: string;
  authorization?: string;
}>;

export type DeliveryResult = Readonly<{
  outcome: "succeeded" | "http_failure" | "timed_out" | "network_failure";
  responseStatus: number | null;
  durationMilliseconds: number;
  retryAfterMilliseconds?: number | null;
}>;

type ResolvedAddress = Readonly<{ address: string; family: 4 | 6 }>;
type DeliveryOptions = Readonly<{
  allowPrivateNetwork?: boolean;
  timeoutMilliseconds?: number;
  resolve?: (hostname: string) => Promise<ResolvedAddress[]>;
  now?: () => Date;
}>;

const locallyAllowedRanges = new Set(["loopback", "private", "uniqueLocal"]);

export function isDeliveryAddressAllowed(
  address: string,
  allowPrivateNetwork = false,
): boolean {
  try {
    const parsed = ipaddr.process(address);
    const range = parsed.range();
    return (
      range === "unicast" ||
      (allowPrivateNetwork && locallyAllowedRanges.has(range))
    );
  } catch {
    return false;
  }
}

export function parseDestinationUrl(value: string): URL {
  const url = new URL(value);
  if (!new Set(["http:", "https:"]).has(url.protocol)) {
    throw new Error("Destination URL must use HTTP or HTTPS.");
  }
  if (url.username !== "" || url.password !== "") {
    throw new Error("Destination URL must not contain credentials.");
  }
  return url;
}

async function resolvePublicAddresses(hostname: string) {
  const resolved = await lookup(hostname, { all: true, verbatim: true });
  return resolved.map(({ address, family }) => ({
    address,
    family: family === 6 ? (6 as const) : (4 as const),
  }));
}

function isTimeout(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = "code" in error ? String(error.code) : "";
  if (
    error.name === "AbortError" ||
    error.name === "TimeoutError" ||
    new Set([
      "UND_ERR_CONNECT_TIMEOUT",
      "UND_ERR_HEADERS_TIMEOUT",
      "UND_ERR_BODY_TIMEOUT",
    ]).has(code)
  ) {
    return true;
  }
  return "cause" in error && isTimeout(error.cause);
}

export function parseRetryAfterMilliseconds(
  value: string | string[] | undefined,
  now = new Date(),
): number | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (candidate === undefined) return null;
  const seconds = Number(candidate);
  const milliseconds = Number.isFinite(seconds)
    ? seconds * 1_000
    : Date.parse(candidate) - now.getTime();
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return null;
  return Math.min(Math.round(milliseconds), maxRetryAfterMilliseconds);
}

export async function deliverWebhook(
  command: DeliveryCommand,
  options: DeliveryOptions = {},
): Promise<DeliveryResult> {
  const started = performance.now();
  const timeoutMilliseconds =
    options.timeoutMilliseconds ?? defaultDeliveryTimeoutMilliseconds;

  try {
    const url = parseDestinationUrl(command.url);
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    const addresses = await (options.resolve ?? resolvePublicAddresses)(
      hostname,
    );
    const approved = addresses.filter(({ address }) =>
      isDeliveryAddressAllowed(address, options.allowPrivateNetwork),
    );
    if (approved.length === 0 || approved.length !== addresses.length) {
      throw new Error("Destination address is not allowed.");
    }
    const selected = approved[0];
    if (selected === undefined) throw new Error("Destination did not resolve.");

    const dispatcher = new Agent({
      connect: {
        lookup(_hostname, lookupOptions, callback) {
          if (lookupOptions.all === true) {
            callback(null, [selected]);
            return;
          }
          callback(null, selected.address, selected.family);
        },
      },
    });
    try {
      const response = await request(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-afterhook-event-id": command.eventId,
          ...(command.authorization === undefined
            ? {}
            : { authorization: command.authorization }),
        },
        body: command.body,
        dispatcher,
        headersTimeout: timeoutMilliseconds,
        bodyTimeout: timeoutMilliseconds,
        signal: AbortSignal.timeout(timeoutMilliseconds),
      });
      await response.body.dump({ limit: maxDeliveryResponseBytes });
      return {
        outcome:
          response.statusCode >= 200 && response.statusCode < 300
            ? "succeeded"
            : "http_failure",
        responseStatus: response.statusCode,
        durationMilliseconds: Math.round(performance.now() - started),
        retryAfterMilliseconds: parseRetryAfterMilliseconds(
          response.headers["retry-after"],
          options.now?.() ?? new Date(),
        ),
      };
    } finally {
      await dispatcher.close();
    }
  } catch (error) {
    return {
      outcome: isTimeout(error) ? "timed_out" : "network_failure",
      responseStatus: null,
      durationMilliseconds: Math.round(performance.now() - started),
      retryAfterMilliseconds: null,
    };
  }
}
