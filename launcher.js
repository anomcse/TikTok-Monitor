import { spawn } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function start(label, scriptPath) {
  const proc = spawn("node", [scriptPath], {
    cwd: __dirname,
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env
  });

  proc.stdout.on("data", (d) =>
    process.stdout.write(d.toString().replace(/^/gm, `[${label}] `))
  );
  proc.stderr.on("data", (d) =>
    process.stderr.write(d.toString().replace(/^/gm, `[${label}] `))
  );

  proc.on("exit", (code, signal) => {
    console.error(`[${label}] processo encerrado (code=${code} signal=${signal}) — reiniciando em 3s`);
    setTimeout(() => start(label, scriptPath), 3000);
  });

  return proc;
}

console.log("🚀 TTKLiveMonitor V1.0 — iniciando...");
start("BOT",       path.join(__dirname, "index.js"));
start("DASHBOARD", path.join(__dirname, "dashboard", "server.js"));

process.on("SIGINT",  () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
