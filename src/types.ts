export interface Vacancy {
  id: string;
  title: string;
  link: string;
  company: string;
  location: string;
  date: string;
}

export type DeliveryStatus = "pending" | "sent";

/** Persisted vacancy. Records without `status` (older files) are treated as sent. */
export interface SeenRecord extends Vacancy {
  status: DeliveryStatus;
  attempts: number;
}

export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  MANUAL_TRIGGER_SECRET: string;
  /** Absolute or relative path to seen JSON (Railway Volume: /data/seen_vacancies.json) */
  SEEN_FILE: string;
  /** DOU RSS search query. Default: React */
  DOU_SEARCH: string;
  /** When true, only vacancies dated today in Europe/Kyiv are notified. */
  ONLY_TODAY: boolean;
  CHECK_INTERVAL_MINUTES: number;
  MAX_SEEN: number;
}

export interface CheckOptions {
  dryRun: boolean;
  vacancies?: Vacancy[];
  /** Override Telegram delivery (tests). */
  notify?: (vacancy: Vacancy) => Promise<void>;
  /** Pause between sends. Default 1000. Tests pass 0. */
  delayMs?: number;
}
