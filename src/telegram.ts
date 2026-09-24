import type { Env, Vacancy } from "./types";

export function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeAttr(text: string): string {
  return escapeHtml(text).replaceAll('"', "&quot;");
}

export function formatVacancyMessage(vacancy: Vacancy): string {
  const company = vacancy.company || "Компанія не вказана";
  const location = vacancy.location || "Локація не вказана";
  const date = vacancy.date || "Дата не вказана";
  const href = escapeAttr(vacancy.link);

  return (
    `🆕 Нова вакансія!\n\n` +
    `📌 ${escapeHtml(vacancy.title)}\n` +
    `🏢 ${escapeHtml(company)}\n` +
    `📍 ${escapeHtml(location)}\n` +
    `📅 ${escapeHtml(date)}\n\n` +
    `🔗 <a href="${href}">${escapeHtml(vacancy.link)}</a>`
  );
}

type TelegramErrorBody = {
  parameters?: { retry_after?: number };
};

export async function sendTelegramNotification(
  env: Env,
  vacancy: Vacancy,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    console.log("Telegram не налаштовано. Пропускаємо сповіщення.");
    return;
  }

  await postMessage(env, formatVacancyMessage(vacancy), true, fetcher);
  console.log(`✅ Сповіщення відправлено: ${vacancy.title}`);
}

async function postMessage(env: Env, text: string, allowRetry: boolean, fetcher: typeof fetch): Promise<void> {
  const response = await fetcher(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_CHAT_ID,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: false,
    }),
  });

  if (response.status === 429 && allowRetry) {
    const retryAfter = await readRetryAfterSeconds(response);
    await delay(retryAfter * 1000);
    await postMessage(env, text, false, fetcher);
    return;
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram sendMessage failed: ${response.status} ${body}`);
  }
}

async function readRetryAfterSeconds(response: Response): Promise<number> {
  try {
    const body = (await response.json()) as TelegramErrorBody;
    const retryAfter = body.parameters?.retry_after;
    if (typeof retryAfter === "number" && Number.isFinite(retryAfter) && retryAfter >= 0) {
      return retryAfter;
    }
  } catch {
    // Fall through to a short wait.
  }
  return 1;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { delay };
