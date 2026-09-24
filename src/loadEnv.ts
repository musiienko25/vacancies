import "dotenv/config";
import type { Env } from "./types";

export function loadEnv(): Env {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
  const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
  const MANUAL_TRIGGER_SECRET = process.env.MANUAL_TRIGGER_SECRET || "";
  const SEEN_FILE = process.env.SEEN_FILE || "./seen_vacancies.json";
  const JINA_API_KEY = process.env.JINA_API_KEY || undefined;

  return {
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID,
    MANUAL_TRIGGER_SECRET,
    SEEN_FILE,
    JINA_API_KEY,
  };
}
