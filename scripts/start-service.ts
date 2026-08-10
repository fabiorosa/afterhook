import { spawn } from "node:child_process";

const role = process.env.AFTERHOOK_SERVICE_ROLE;

const commands: Readonly<Record<string, readonly [string, ...string[]]>> = {
  api: ["node", "apps/api/dist/index.js"],
  destination: ["node", "apps/destination/dist/index.js"],
  worker: ["node", "apps/worker/dist/index.js"],
};

const command = role === undefined ? undefined : commands[role];
if (command === undefined) {
  throw new Error(
    "AFTERHOOK_SERVICE_ROLE must be api, destination, or worker.",
  );
}

if (role === "api") {
  await new Promise<void>((resolve, reject) => {
    const migration = spawn(
      "npm",
      ["--workspace", "@afterhook/api", "run", "db:migrate"],
      { env: process.env, stdio: "inherit" },
    );
    migration.once("error", reject);
    migration.once("exit", (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(`Database migration exited with code ${String(code)}.`),
        );
    });
  });
}

const child = spawn(command[0], command.slice(1), {
  env: process.env,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => child.kill(signal));
}

child.once("exit", (code, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal);
    return;
  }

  process.exitCode = code ?? 1;
});
