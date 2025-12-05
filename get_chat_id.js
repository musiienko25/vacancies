import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';

dotenv.config();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TELEGRAM_BOT_TOKEN) {
  console.error('❌ Помилка: TELEGRAM_BOT_TOKEN не встановлено в .env файлі');
  process.exit(1);
}

console.log('🤖 Бот запущено...');
console.log('📱 Надішліть будь-яке повідомлення вашому боту (@vacanciesReactBot)');
console.log('⏳ Очікую повідомлення...\n');

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const username = msg.chat.username || msg.chat.first_name || 'Користувач';
  
  console.log('\n✅ Повідомлення отримано!');
  console.log(`👤 Користувач: ${username}`);
  console.log(`🆔 Ваш Chat ID: ${chatId}`);
  console.log(`\n📝 Додайте цей Chat ID до вашого .env файлу:`);
  console.log(`TELEGRAM_CHAT_ID=${chatId}\n`);
  
  bot.sendMessage(chatId, `✅ Ваш Chat ID: ${chatId}\n\nТепер додайте цей ID до .env файлу як TELEGRAM_CHAT_ID`);
  
  // Зупиняємо бота після отримання Chat ID
  setTimeout(() => {
    console.log('🛑 Зупиняю бота...');
    process.exit(0);
  }, 2000);
});

bot.on('polling_error', (error) => {
  console.error('❌ Помилка polling:', error.message);
});



