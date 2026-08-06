import Fastify, { type FastifyInstance } from "fastify";

type DestinationOptions = Readonly<{
  timeoutDelayMilliseconds?: number;
  onReceive?: (headers: Readonly<Record<string, unknown>>) => void;
}>;

export function buildLocalDestination(
  options: DestinationOptions = {},
): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: 256 * 1024 });

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

  return app;
}
