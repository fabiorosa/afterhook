import {
  createDestinationInputSchema,
  createEndpointInputSchema,
  createdEndpointResponseSchema,
  destinationResponseSchema,
  endpointResponseSchema,
  endpointSlugSchema,
  ingestionErrorSchema,
  ingestionReceiptSchema,
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
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";

import type { SetupRepository } from "./persistence/repository.js";

const endpointListSchema = z.array(endpointResponseSchema);
const destinationListSchema = z.array(destinationResponseSchema);
const ingestionParamsSchema = z.object({ slug: endpointSlugSchema });

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

type ServerOptions = Readonly<{
  now?: () => Date;
}>;

function ingestionError(
  error:
    | "INVALID_REQUEST"
    | "ENDPOINT_NOT_FOUND"
    | "SIGNATURE_REJECTED"
    | "PAYLOAD_TOO_LARGE"
    | "IDEMPOTENCY_CONFLICT"
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

  app.get("/health", () => ({ status: "ok" }));

  app.get("/v1/endpoints", async () =>
    endpointListSchema.parse(await repository.listEndpoints()),
  );
  app.get("/v1/destinations", async () =>
    destinationListSchema.parse(await repository.listDestinations()),
  );

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
    const persisted = await repository.persistEvent({
      endpointId: endpoint.id,
      idempotencyKey: headers.data.idempotencyKey,
      payloadDigest,
      payloadRedacted: redactWebhookPayload(payload.data),
      receivedAt: now(),
    });

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
