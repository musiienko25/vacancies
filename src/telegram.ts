import type { Env, Vacancy } from "./types";

export async function sendTelegramNotification(env: Env, vacancy: Vacancy): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    console.log("Telegram не налаштовано. Пропускаємо сповіщення.");
    return;
  }

  const message =
    `🆕 Нова вакансія!\n\n` +
    `📌 ${vacancy.title}\n` +
    `🏢 ${vacancy.company || "Компанія не вказана"}\n` +
    `📍 ${vacancy.location || "Локація не вказана"}\n` +
    `📅 ${vacancy.date || "Дата не вказана"}\n\n` +
    `🔗 ${vacancy.link}`;

  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: false,
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram sendMessage failed: ${response.status} ${body}`);
  }

  console.log(`✅ Сповіщення відправлено: ${vacancy.title}`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { delay };
