export interface Vacancy {
  id: string;
  title: string;
  link: string;
  company: string;
  location: string;
  date: string;
}

export interface Env {
  SEEN_KV: KVNamespace;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  MANUAL_TRIGGER_SECRET: string;
  JINA_API_KEY?: string;
}

export interface CheckOptions {
  dryRun: boolean;
  vacancies?: Vacancy[];
}
