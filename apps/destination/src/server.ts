import Fastify, { type FastifyInstance } from "fastify";

type DestinationOptions = Readonly<{
  timeoutDelayMilliseconds?: number;
  onReceive?: (headers: Readonly<Record<string, unknown>>) => void;
}>;

export function buildLocalDestination(
  options: DestinationOptions = {},
): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: 256 * 1024 });
  const deliveriesByEvent = new Map<string, number>();

  app.post("/success", (request, reply) => {
    options.onReceive?.(request.headers);
    return reply.code(204).send();
  });
  app.post("/timeout", async (_request, reply) => {
    await new Promise((resolve) =>
      setTimeout(resolve, options.timeoutDelayMilliseconds ?? 10_000),
    );
    return reply.code(204).send();
  });
  app.post("/redirect", (_request, reply) => reply.redirect("/success", 302));
  app.post("/large", (_request, reply) =>
    reply.type("text/plain").send("x".repeat(70 * 1024)),
  );
  app.post("/flaky", (request, reply) => {
    const eventId = String(request.headers["x-afterhook-event-id"] ?? "");
    const deliveryNumber = (deliveriesByEvent.get(eventId) ?? 0) + 1;
    deliveriesByEvent.set(eventId, deliveryNumber);
    return reply.code(deliveryNumber < 3 ? 503 : 204).send();
  });
  app.post("/manual-recovery", (request, reply) => {
    const eventId = String(request.headers["x-afterhook-event-id"] ?? "");
    const deliveryNumber = (deliveriesByEvent.get(eventId) ?? 0) + 1;
    deliveriesByEvent.set(eventId, deliveryNumber);
    return reply.code(deliveryNumber < 4 ? 503 : 204).send();
  });
  app.post("/always-fail", (_request, reply) => reply.code(503).send());
  app.post("/terminal", (_request, reply) => reply.code(400).send());

  return app;
}
