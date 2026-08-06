import {
  createDestinationInputSchema,
  createEndpointInputSchema,
  createdEndpointResponseSchema,
  destinationResponseSchema,
  endpointResponseSchema,
  endpointSlugSchema,
  eventDetailSchema,
  eventFilterSchema,
  eventInspectionErrorSchema,
  eventListItemSchema,
  ingestionErrorSchema,
  ingestionReceiptSchema,
  manualRetryErrorSchema,
  manualRetryInputSchema,
  manualRetryResponseSchema,
  systemHealthSchema,
  webhookHeadersSchema,
  webhookPayloadSchema,
} from "@afterhook/contracts";
import {
  digestWebhookPayload,
  isWebhookTimestampFresh,
  maxWebhookBodyBytes,
  redactWebhookPayload,
  verifyWebhookSignature,
} from "@afterhook/domain";
import type { EventQueue } from "@afterhook/orchestration";
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";

import {
  DestinationUnavailableError,
  type SetupRepository,
} from "./persistence/repository.js";

const endpointListSchema = z.array(endpointResponseSchema);
const destinationListSchema = z.array(destinationResponseSchema);
const ingestionParamsSchema = z.object({ slug: endpointSlugSchema });
const eventListSchema = z.array(eventListItemSchema);
const eventParamsSchema = z.object({ eventId: z.uuid() });

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

type ServerOptions = Readonly<{
  now?: () => Date;
  eventQueue?: EventQueue;
}>;

function ingestionError(
  error:
    | "INVALID_REQUEST"
    | "ENDPOINT_NOT_FOUND"
    | "SIGNATURE_REJECTED"
    | "PAYLOAD_TOO_LARGE"
    | "IDEMPOTENCY_CONFLICT"
    | "QUEUE_UNAVAILABLE"
    | "DESTINATION_UNAVAILABLE"
    | "INTERNAL_ERROR",
  message: string,
) {
  return ingestionErrorSchema.parse({ error, message });
}

function getErrorCode(error: unknown): string | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }

  return undefined;
}

function parseOrReply<T>(
  schema: z.ZodType<T>,
  input: unknown,
  reply: { code: (status: number) => { send: (body: unknown) => unknown } },
): T | undefined {
  const parsed = schema.safeParse(input);
  if (parsed.success) {
    return parsed.data;
  }

  reply.code(400).send({
    error: "VALIDATION_ERROR",
    message: "Request validation failed.",
    issues: parsed.error.issues,
  });
  return undefined;
}

export function buildServer(
  repository: SetupRepository,
  options: ServerOptions = {},
): FastifyInstance {
  const app = Fastify({ logger: false });
  const now = options.now ?? (() => new Date());
  const eventQueue = options.eventQueue ?? {
    enqueue: () => Promise.resolve(),
    enqueueRetry: () => Promise.resolve(),
    enqueueManual: () => Promise.resolve(),
    readWorkerHeartbeat: () => Promise.resolve(null),
    close: () => Promise.resolve(),
  };

  app.removeContentTypeParser("application/json");
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer", bodyLimit: maxWebhookBodyBytes },
    (request, body, done) => {
      const rawBody = Buffer.isBuffer(body) ? body : Buffer.from(body);
      request.rawBody = rawBody;
      try {
        done(null, JSON.parse(rawBody.toString("utf8")) as unknown);
      } catch {
        const error = new SyntaxError("Invalid JSON body.") as SyntaxError & {
          statusCode: number;
        };
        error.statusCode = 400;
        done(error);
      }
    },
  );

  app.setErrorHandler((error, _request, reply) => {
    const code = getErrorCode(error);
    if (code === "FST_ERR_CTP_BODY_TOO_LARGE") {
      return reply
        .code(413)
        .send(
          ingestionError(
            "PAYLOAD_TOO_LARGE",
            `JSON payload must be at most ${String(maxWebhookBodyBytes)} bytes.`,
          ),
        );
    }
    if (
      error instanceof SyntaxError ||
      code === "FST_ERR_CTP_INVALID_MEDIA_TYPE"
    ) {
      return reply
        .code(code === "FST_ERR_CTP_INVALID_MEDIA_TYPE" ? 415 : 400)
        .send(
          ingestionError("INVALID_REQUEST", "A valid JSON body is required."),
        );
    }

    return reply
      .code(500)
      .send(
        ingestionError("INTERNAL_ERROR", "The request could not be processed."),
      );
  });

  app.get("/health", async () => {
    try {
      const heartbeat = await eventQueue.readWorkerHeartbeat();
      return systemHealthSchema.parse({
        status: heartbeat === null ? "degraded" : "ok",
        worker: {
          status: heartbeat === null ? "unavailable" : "healthy",
          lastSeenAt: heartbeat?.recordedAt ?? null,
        },
      });
    } catch {
      return systemHealthSchema.parse({
        status: "degraded",
        worker: { status: "unavailable", lastSeenAt: null },
      });
    }
  });

  app.get("/v1/endpoints", async () =>
    endpointListSchema.parse(await repository.listEndpoints()),
  );
  app.get("/v1/destinations", async () =>
    destinationListSchema.parse(await repository.listDestinations()),
  );
  app.get("/v1/events", async (request, reply) => {
    const filters = parseOrReply(eventFilterSchema, request.query, reply);
    if (filters === undefined) return;
    return eventListSchema.parse(await repository.listEvents(filters));
  });
  app.get("/v1/events/:eventId", async (request, reply) => {
    const params = eventParamsSchema.safeParse(request.params);
    const event = params.success
      ? await repository.findEventDetail(params.data.eventId)
      : null;

    if (event === null) {
      return reply.code(404).send(
        eventInspectionErrorSchema.parse({
          error: "EVENT_NOT_FOUND",
          message: "The event could not be found.",
        }),
      );
    }

    return eventDetailSchema.parse(event);
  });

  app.post("/v1/events/:eventId/retry", async (request, reply) => {
    const params = eventParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(404).send(
        manualRetryErrorSchema.parse({
          error: "EVENT_NOT_FOUND",
          message: "The event could not be found.",
        }),
      );
    }
    const input = manualRetryInputSchema.safeParse(request.body);
    if (!input.success) {
      return reply.code(400).send({
        error: "VALIDATION_ERROR",
        message: "Request validation failed.",
        issues: input.error.issues,
      });
    }

    const result = await repository.requestManualRetry(
      params.data.eventId,
      now(),
    );
    if (result.outcome === "not_found") {
      return reply.code(404).send(
        manualRetryErrorSchema.parse({
          error: "EVENT_NOT_FOUND",
          message: "The event could not be found.",
        }),
      );
    }
    if (result.outcome === "not_allowed") {
      return reply.code(409).send(
        manualRetryErrorSchema.parse({
          error: "RETRY_NOT_ALLOWED",
          message:
            "Manual retry is unavailable while delivery is active or already succeeded.",
        }),
      );
    }
    if (result.outcome === "rate_limited") {
      return reply.code(429).send(
        manualRetryErrorSchema.parse({
          error: "RETRY_RATE_LIMITED",
          message: "Wait a few seconds before requesting another manual retry.",
        }),
      );
    }

    try {
      await eventQueue.enqueueManual(result.eventId, result.attemptNumber);
    } catch {
      // PostgreSQL retains the retry reservation for worker reconciliation.
    }
    return reply.code(202).send(
      manualRetryResponseSchema.parse({
        accepted: true,
        eventId: result.eventId,
        attemptNumber: result.attemptNumber,
        status: "QUEUED",
      }),
    );
  });

  app.post("/v1/endpoints", async (request, reply) => {
    const input = parseOrReply(createEndpointInputSchema, request.body, reply);
    if (input === undefined) return;

    const created = await repository.createEndpoint(input);
    return reply.code(201).send(
      createdEndpointResponseSchema.parse({
        ...created.endpoint,
        signingSecret: created.signingSecret,
      }),
    );
  });

  app.post("/v1/destinations", async (request, reply) => {
    const input = parseOrReply(
      createDestinationInputSchema,
      request.body,
      reply,
    );
    if (input === undefined) return;

    return reply
      .code(201)
      .send(
        destinationResponseSchema.parse(
          await repository.createDestination(input),
        ),
      );
  });

  app.post("/v1/endpoints/:slug/events", async (request, reply) => {
    if (
      request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !==
      "application/json"
    ) {
      return reply
        .code(415)
        .send(
          ingestionError(
            "INVALID_REQUEST",
            "Content-Type must be application/json.",
          ),
        );
    }

    const params = ingestionParamsSchema.safeParse(request.params);
    const headers = webhookHeadersSchema.safeParse({
      timestamp: request.headers["x-afterhook-timestamp"],
      signature: request.headers["x-afterhook-signature"],
      idempotencyKey: request.headers["idempotency-key"],
    });
    const payload = webhookPayloadSchema.safeParse(request.body);
    const rawBody = request.rawBody;

    if (
      !params.success ||
      !headers.success ||
      !payload.success ||
      rawBody === undefined
    ) {
      return reply
        .code(400)
        .send(
          ingestionError(
            "INVALID_REQUEST",
            "Slug, signed-request headers, and a JSON object are required.",
          ),
        );
    }

    const endpoint = await repository.findIngestionEndpoint(params.data.slug);
    if (!endpoint?.enabled) {
      return reply
        .code(404)
        .send(
          ingestionError(
            "ENDPOINT_NOT_FOUND",
            "No enabled endpoint accepts this request.",
          ),
        );
    }

    if (
      !isWebhookTimestampFresh(headers.data.timestamp, now()) ||
      !verifyWebhookSignature(
        endpoint.signingSecret,
        headers.data.timestamp,
        rawBody,
        headers.data.signature,
      )
    ) {
      return reply
        .code(401)
        .send(
          ingestionError(
            "SIGNATURE_REJECTED",
            "The webhook signature or timestamp was rejected.",
          ),
        );
    }

    const payloadDigest = digestWebhookPayload(rawBody);
    let persisted;
    try {
      persisted = await repository.persistEvent({
        endpointId: endpoint.id,
        idempotencyKey: headers.data.idempotencyKey,
        payloadDigest,
        payloadRedacted: redactWebhookPayload(payload.data),
        rawPayload: rawBody.toString("utf8"),
        receivedAt: now(),
      });
    } catch (error) {
      if (error instanceof DestinationUnavailableError) {
        return reply
          .code(503)
          .send(
            ingestionError(
              "DESTINATION_UNAVAILABLE",
              "Create an enabled destination before accepting events.",
            ),
          );
      }
      throw error;
    }

    if (persisted.outcome === "conflict") {
      return reply
        .code(409)
        .send(
          ingestionError(
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key is already associated with another payload.",
          ),
        );
    }

    try {
      await eventQueue.enqueue(persisted.eventId);
    } catch {
      return reply
        .code(503)
        .send(
          ingestionError(
            "QUEUE_UNAVAILABLE",
            "The event was stored, but queue handoff is temporarily unavailable. Retry with the same idempotency key.",
          ),
        );
    }

    return reply.code(persisted.outcome === "created" ? 202 : 200).send(
      ingestionReceiptSchema.parse({
        accepted: true,
        eventId: persisted.eventId,
        endpointId: endpoint.id,
        idempotencyKey: headers.data.idempotencyKey,
        payloadDigest,
        duplicate: persisted.outcome === "existing",
      }),
    );
  });

  return app;
}
