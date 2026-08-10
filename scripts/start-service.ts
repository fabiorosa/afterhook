import { spawn } from "node:child_process";

const role = process.env.AFTERHOOK_SERVICE_ROLE;

const commands = {
  api: ["node", "apps/api/dist/index.js"],
  destination: ["node", "apps/destination/dist/index.js"],
  worker: ["node", "apps/worker/dist/index.js"],
} as const;

type ServiceRole = keyof typeof commands;

function isServiceRole(value: string | undefined): value is ServiceRole {
  return value !== undefined && value in commands;
}

if (role !== "all" && !isServiceRole(role)) {
  throw new Error(
    "AFTERHOOK_SERVICE_ROLE must be all, api, destination, or worker.",
  );
}

const roles: readonly ServiceRole[] =
  role === "all" ? ["destination", "worker", "api"] : [role];

if (roles.includes("api")) {
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

const children = roles.map((serviceRole) => {
  const command = commands[serviceRole];
  return spawn(command[0], command.slice(1), {
    env: process.env,
    stdio: "inherit",
  });
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    for (const child of children) child.kill(signal);
  });
}

for (const child of children) {
  child.once("exit", (code, signal) => {
    for (const sibling of children) {
      if (sibling !== child) sibling.kill("SIGTERM");
    }

    if (signal !== null) {
      process.kill(process.pid, signal);
      return;
    }

    process.exitCode = code ?? 1;
  });
}
