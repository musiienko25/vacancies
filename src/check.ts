import { douFeedUrl, fetchVacancies, isToday } from "./parser";
import { loadSeenVacancies, saveSeenVacancies, trimSeen } from "./storage";
import { delay, sendTelegramNotification } from "./telegram";
import type { CheckOptions, Env, SeenRecord, Vacancy } from "./types";

export const MAX_DELIVERY_ATTEMPTS = 5;

export interface CheckResult {
  found: number;
  newCount: number;
  newVacancies: Vacancy[];
  dryRun: boolean;
  seenCount: number;
  pendingCount: number;
}

function counts(records: SeenRecord[]): { seenCount: number; pendingCount: number } {
  return {
    seenCount: records.filter((record) => record.status === "sent").length,
    pendingCount: records.filter((record) => record.status === "pending").length,
  };
}

function isRetryable(record: SeenRecord): boolean {
  return record.status === "pending" && record.attempts < MAX_DELIVERY_ATTEMPTS;
}

export async function checkVacancies(env: Env, options: CheckOptions): Promise<CheckResult> {
  const dryRun = options.dryRun;
  const notify = options.notify ?? ((vacancy: Vacancy) => sendTelegramNotification(env, vacancy));
  const pauseMs = options.delayMs ?? 1000;

  console.log(`\n🔍 Перевірка вакансій на ${new Date().toLocaleString("uk-UA")}...`);
  if (dryRun) {
    console.log("🧪 DRY RUN: без Telegram і без запису seen");
  }
  console.log(`📡 URL: ${douFeedUrl(env.DOU_SEARCH)}`);
  console.log(`📅 Фільтрація за сьогодні: ${env.ONLY_TODAY ? "Увімкнено" : "Вимкнено"}`);

  const currentVacancies = options.vacancies ?? (await fetchVacancies(env.DOU_SEARCH));
  console.log(`📊 Знайдено вакансій: ${currentVacancies.length}`);

  const seenVacancies = await loadSeenVacancies(env);
  const seenIds = new Set(seenVacancies.map((record) => record.id));

  const fresh: Vacancy[] = [];
  for (const vacancy of currentVacancies) {
    if (seenIds.has(vacancy.id) || fresh.some((item) => item.id === vacancy.id)) continue;
    if (env.ONLY_TODAY && !isToday(vacancy.date)) continue;
    fresh.push(vacancy);
  }

  if (env.ONLY_TODAY && fresh.length > 0) {
    console.log(`📅 Відфільтровано: залишилось ${fresh.length} вакансій за сьогодні`);
  }

  const pendingNew: SeenRecord[] = fresh.map((vacancy) => ({
    ...vacancy,
    status: "pending",
    attempts: 0,
  }));

  if (fresh.length === 0) {
    console.log("✅ Нових вакансій не знайдено");
  } else {
    console.log(`🆕 Знайдено нових вакансій: ${fresh.length}`);
    for (const vacancy of fresh) {
      console.log(`  - ${vacancy.title} | ${vacancy.company} | ${vacancy.link}`);
    }
  }

  if (dryRun) {
    return {
      found: currentVacancies.length,
      newCount: fresh.length,
      newVacancies: fresh,
      dryRun,
      ...counts(seenVacancies),
    };
  }

  let seen = trimSeen([...seenVacancies, ...pendingNew], env.MAX_SEEN);
  if (pendingNew.length > 0) {
    await saveSeenVacancies(env, seen);
  }

  const toDeliver = seen.filter(isRetryable);
  if (toDeliver.length > 0 && fresh.length === 0) {
    console.log(`🔁 Повторюємо відправку: ${toDeliver.length}`);
  }

  for (const record of toDeliver) {
    try {
      await notify(record);
      seen = seen.map((item) => (item.id === record.id ? { ...item, status: "sent" as const } : item));
      await saveSeenVacancies(env, seen);
    } catch (error) {
      const attempts = record.attempts + 1;
      seen = seen.map((item) => (item.id === record.id ? { ...item, attempts } : item));
      await saveSeenVacancies(env, seen);
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Помилка при відправці сповіщення (спроба ${attempts}/${MAX_DELIVERY_ATTEMPTS}): ${message}`);
      if (attempts >= MAX_DELIVERY_ATTEMPTS) {
        console.error(`❌ Відправку припинено після ${attempts} спроб: ${record.title} (${record.id})`);
      }
    }

    if (pauseMs > 0) {
      await delay(pauseMs);
    }
  }

  seen = trimSeen(seen, env.MAX_SEEN);

  return {
    found: currentVacancies.length,
    newCount: fresh.length,
    newVacancies: fresh,
    dryRun,
    ...counts(seen),
  };
}
