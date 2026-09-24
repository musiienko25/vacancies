import http from "node:http";
import { checkVacancies } from "./check";
import { loadEnv } from "./loadEnv";
import type { Env } from "./types";

const PORT = Number(process.env.PORT || 3000);

const env = loadEnv();
const intervalMs = env.CHECK_INTERVAL_MINUTES * 60_000;
let running = false;

const health = {
  lastSuccessAt: null as string | null,
  lastError: null as string | null,
  seenCount: 0,
  pendingCount: 0,
};

function isAuthorized(reqUrl: URL, request: http.IncomingMessage, currentEnv: Env): boolean {
  const secret =
    reqUrl.searchParams.get("secret") ||
    (typeof request.headers["x-manual-secret"] === "string" ? request.headers["x-manual-secret"] : "") ||
    "";
  return Boolean(currentEnv.MANUAL_TRIGGER_SECRET) && secret === currentEnv.MANUAL_TRIGGER_SECRET;
}

async function runTick(dryRun: boolean) {
  if (running) {
    console.log("⏳ Попередня перевірка ще йде — пропускаємо тік");
    return { skipped: true as const };
  }
  running = true;
  try {
    const result = await checkVacancies(env, { dryRun });
    health.lastSuccessAt = new Date().toISOString();
    health.lastError = null;
    health.seenCount = result.seenCount;
    health.pendingCount = result.pendingCount;
    return { skipped: false as const, ...result };
  } catch (error) {
    health.lastError = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    running = false;
  }
}

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function scheduleTicks() {
  setInterval(() => {
    void runTick(false).catch((error) => {
      console.error("❌ Interval check failed:", error instanceof Error ? error.message : error);
    });
  }, intervalMs);
}

const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host || `127.0.0.1:${PORT}`;
    const url = new URL(req.url || "/", `http://${host}`);

    if (req.method === "GET" && url.pathname === "/") {
      sendJson(res, 200, {
        ok: true,
        service: "dou-vacancy-tracker",
        intervalMinutes: env.CHECK_INTERVAL_MINUTES,
        search: env.DOU_SEARCH,
        onlyToday: env.ONLY_TODAY,
        lastSuccessAt: health.lastSuccessAt,
        lastError: health.lastError,
        seenCount: health.seenCount,
        pendingCount: health.pendingCount,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/run") {
      if (!isAuthorized(url, req, env)) {
        sendJson(res, 401, { success: false, error: "Unauthorized" });
        return;
      }
      const dryRun = url.searchParams.get("dry") === "1";
      try {
        const result = await runTick(dryRun);
        sendJson(res, 200, { success: true, ...result });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("❌ Помилка при перевірці вакансій:", message);
        sendJson(res, 500, { success: false, error: message });
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    sendJson(res, 500, { success: false, error: message });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 DOU vacancy tracker (Railway)");
  console.log(`🌐 Listening on 0.0.0.0:${PORT}`);
  console.log(`📁 SEEN_FILE: ${env.SEEN_FILE}`);
  console.log(`🔎 Search: ${env.DOU_SEARCH}`);
  console.log(`📅 Only today: ${env.ONLY_TODAY}`);
  console.log(`⏰ Interval: ${env.CHECK_INTERVAL_MINUTES} min`);

  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    console.warn("⚠️  Telegram не налаштовано (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)");
  } else {
    console.log("✅ Telegram налаштовано");
  }

  if (!env.MANUAL_TRIGGER_SECRET) {
    console.warn("⚠️  MANUAL_TRIGGER_SECRET порожній — /run буде 401");
  }

  void runTick(false)
    .then(() => {
      scheduleTicks();
    })
    .catch((error) => {
      console.error("❌ Initial check failed:", error instanceof Error ? error.message : error);
      scheduleTicks();
    });
});
