import { buildLocalDestination } from "./server.js";

const app = buildLocalDestination();
await app.listen({
  host: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 3201),
});
