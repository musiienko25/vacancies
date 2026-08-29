import dotenv from "dotenv";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".dev.vars", override: false });

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TELEGRAM_BOT_TOKEN) {
  console.error("❌ Помилка: TELEGRAM_BOT_TOKEN не встановлено в .env файлі");
  process.exit(1);
}

console.log("🤖 Очікую повідомлення вашому боту...");
console.log("📱 Надішліть будь-яке повідомлення боту в Telegram");
console.log("⏳ getUpdates...\n");

const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?timeout=50`;
const response = await fetch(url);
const data = await response.json();

if (!data.ok) {
  console.error("❌ Telegram API error:", data);
  process.exit(1);
}

const messages = (data.result || []).filter((u) => u.message);
if (messages.length === 0) {
  console.log("ℹ️  Повідомлень ще немає. Надішліть /start боту і запустіть команду ще раз.");
  process.exit(0);
}

const last = messages[messages.length - 1].message;
const chatId = last.chat.id;
const username = last.chat.username || last.chat.first_name || "Користувач";

console.log("✅ Повідомлення отримано!");
console.log(`👤 Користувач: ${username}`);
console.log(`🆔 Ваш Chat ID: ${chatId}`);
console.log(`\n📝 Додайте цей Chat ID до .env / .dev.vars:`);
console.log(`TELEGRAM_CHAT_ID=${chatId}\n`);
