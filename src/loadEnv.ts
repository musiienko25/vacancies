import "dotenv/config";
import type { Env } from "./types";

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export function loadEnv(): Env {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
  const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
  const MANUAL_TRIGGER_SECRET = process.env.MANUAL_TRIGGER_SECRET || "";
  const SEEN_FILE = process.env.SEEN_FILE || "./seen_vacancies.json";
  const search = process.env.DOU_SEARCH?.trim();
  const DOU_SEARCH = search ? search : "React";
  const ONLY_TODAY = parseBool(process.env.ONLY_TODAY, true);
  const CHECK_INTERVAL_MINUTES = parsePositiveInt(process.env.CHECK_INTERVAL_MINUTES, 5);
  const MAX_SEEN = parsePositiveInt(process.env.MAX_SEEN, 100);

  return {
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID,
    MANUAL_TRIGGER_SECRET,
    SEEN_FILE,
    DOU_SEARCH,
    ONLY_TODAY,
    CHECK_INTERVAL_MINUTES,
    MAX_SEEN,
  };
}
