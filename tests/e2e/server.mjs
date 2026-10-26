// No credentials or external services: test the real browser's IndexedDB.
import { spawn } from "node:child_process";
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3100",
  ],
  { stdio: "inherit", env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } },
);
const close = () => {
  child.kill("SIGTERM");
};
process.on("SIGTERM", close);
process.on("SIGINT", close);
child.on("exit", (code) => process.exit(code ?? 0));
