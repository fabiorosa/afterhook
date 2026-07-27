import {
  createDestinationInputSchema,
  createEndpointInputSchema,
  createdEndpointResponseSchema,
  destinationResponseSchema,
  endpointResponseSchema,
} from "@afterhook/contracts";
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";

import type { SetupRepository } from "./persistence/repository.js";

const endpointListSchema = z.array(endpointResponseSchema);
const destinationListSchema = z.array(destinationResponseSchema);

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

export function buildServer(repository: SetupRepository): FastifyInstance {
  const app = Fastify({ logger: false });

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

  return app;
}
