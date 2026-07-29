import { createSecretCipher } from "@afterhook/domain";

import { createPostgresRepository } from "./persistence/repository.js";
import { buildServer } from "./server.js";

const databaseUrl = process.env.DATABASE_URL;
const encryptionKey = process.env.SECRET_ENCRYPTION_KEY;

if (databaseUrl === undefined || encryptionKey === undefined) {
  throw new Error("DATABASE_URL and SECRET_ENCRYPTION_KEY are required.");
}

const cipher = createSecretCipher(encryptionKey);
const repository = createPostgresRepository(databaseUrl, cipher);
const app = buildServer(repository);

await app.listen({ host: "127.0.0.1", port: Number(process.env.PORT ?? 3001) });
