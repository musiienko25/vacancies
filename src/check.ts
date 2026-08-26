import { DOU_URL, ONLY_TODAY, fetchVacancies, isToday } from "./parser";
import { loadSeenVacancies, saveSeenVacancies } from "./storage";
import { delay, sendTelegramNotification } from "./telegram";
import type { CheckOptions, Env, Vacancy } from "./types";

export interface CheckResult {
  found: number;
  newCount: number;
  newVacancies: Vacancy[];
  dryRun: boolean;
}

export async function checkVacancies(env: Env, options: CheckOptions): Promise<CheckResult> {
  const dryRun = options.dryRun;
  console.log(`\n🔍 Перевірка вакансій на ${new Date().toLocaleString("uk-UA")}...`);
  if (dryRun) {
    console.log("🧪 DRY RUN: без Telegram і без запису в KV");
  }
  console.log(`📡 URL: ${DOU_URL}`);
  console.log(`📅 Фільтрація за сьогодні: ${ONLY_TODAY ? "Увімкнено" : "Вимкнено"}`);

  const currentVacancies = await fetchVacancies();
  console.log(`📊 Знайдено вакансій: ${currentVacancies.length}`);

  const seenVacancies = await loadSeenVacancies(env);
  const seenIds = new Set(seenVacancies.map((v) => v.id));

  let newVacancies = currentVacancies.filter((v) => !seenIds.has(v.id));

  if (ONLY_TODAY) {
    newVacancies = newVacancies.filter((v) => isToday(v.date));
    if (newVacancies.length > 0) {
      console.log(`📅 Відфільтровано: залишилось ${newVacancies.length} вакансій за сьогодні`);
    }
  }

  if (newVacancies.length === 0) {
    console.log("✅ Нових вакансій не знайдено");
    return { found: currentVacancies.length, newCount: 0, newVacancies: [], dryRun };
  }

  console.log(`🆕 Знайдено нових вакансій: ${newVacancies.length}`);

  let seen = seenVacancies;
  for (const vacancy of newVacancies) {
    console.log(`  - ${vacancy.title} | ${vacancy.company} | ${vacancy.link}`);

    if (dryRun) {
      continue;
    }

    seen = [...seen, vacancy].slice(-100);
    await saveSeenVacancies(env, seen);

    try {
      await sendTelegramNotification(env, vacancy);
    } catch (error) {
      console.error("Помилка при відправці сповіщення:", error instanceof Error ? error.message : error);
    }

    await delay(1000);
  }

  return {
    found: currentVacancies.length,
    newCount: newVacancies.length,
    newVacancies,
    dryRun,
  };
}
