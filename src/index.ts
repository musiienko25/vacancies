import { checkVacancies } from "./check";
import { parseRssXml } from "./parser";
import type { Env, Vacancy } from "./types";

function isDryRun(request: Request): boolean {
  const url = new URL(request.url);
  return url.searchParams.get("dry") === "1";
}

function isAuthorized(request: Request, env: Env): boolean {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret") || request.headers.get("x-manual-secret") || "";
  return Boolean(env.MANUAL_TRIGGER_SECRET) && secret === env.MANUAL_TRIGGER_SECRET;
}

async function runCheck(env: Env, dryRun: boolean, vacancies?: Vacancy[]): Promise<Response> {
  try {
    const result = await checkVacancies(env, { dryRun, vacancies });
    return Response.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("❌ Помилка при перевірці вакансій:", message);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    try {
      await checkVacancies(env, { dryRun: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("❌ Помилка при перевірці вакансій:", message);
    }
  },

  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (!isAuthorized(request, env)) {
      return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    if (url.pathname === "/ingest" && request.method === "POST") {
      const xml = await request.text();
      if (!xml.includes("<item>")) {
        return Response.json({ success: false, error: "Body is not DOU RSS" }, { status: 400 });
      }
      const vacancies = parseRssXml(xml);
      return runCheck(env, isDryRun(request), vacancies);
    }

    if (url.pathname !== "/run") {
      return new Response("Not found", { status: 404 });
    }

    return runCheck(env, isDryRun(request));
  },
} satisfies ExportedHandler<Env>;
