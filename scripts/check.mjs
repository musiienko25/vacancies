import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

function loadDevVars() {
  const vars = {};
  try {
    const text = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      vars[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
    }
  } catch {
    // wrangler still loads .dev.vars if present; secret fallback below
  }
  return vars;
}

const dryRun = process.argv.includes("--dry");
const secret = loadDevVars().MANUAL_TRIGGER_SECRET || "local-dev-secret";
const port = Number(process.env.CHECK_PORT || 8787);

const child = spawn(
  "npx",
  ["wrangler", "dev", "--ip", "127.0.0.1", "--port", String(port)],
  {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: new URL("..", import.meta.url),
    env: process.env,
  },
);

let output = "";
child.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  output += text;
  process.stdout.write(text);
});
child.stderr.on("data", (chunk) => {
  const text = chunk.toString();
  output += text;
  process.stderr.write(text);
});

function waitForReady(timeoutMs) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (
        /Ready on|Ready\s|localhost:|127\.0\.0\.1/.test(output) &&
        Date.now() - started > 1500
      ) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error("wrangler dev did not become ready in time"));
      }
    }, 200);
  });
}

function stopWorker() {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
}

try {
  await waitForReady(45_000);
  const url = `http://127.0.0.1:${port}/run?secret=${encodeURIComponent(secret)}${dryRun ? "&dry=1" : ""}`;
  console.log(`\n→ ${dryRun ? "DRY RUN" : "CHECK"} ${url.replace(secret, "***")}\n`);
  const response = await fetch(url);
  const text = await response.text();
  console.log(text);
  if (!response.ok) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  stopWorker();
  await new Promise((resolve) => {
    const t = setTimeout(resolve, 2000);
    child.on("exit", () => {
      clearTimeout(t);
      resolve();
    });
  });
}
