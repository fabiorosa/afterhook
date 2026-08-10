import { buildLocalDestination } from "./server.js";

const app = buildLocalDestination();
await app.listen({
  host:
    process.env.AFTERHOOK_DESTINATION_HOST ?? process.env.HOST ?? "127.0.0.1",
  port: Number(
    process.env.AFTERHOOK_DESTINATION_PORT ?? process.env.PORT ?? 3201,
  ),
});
