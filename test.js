import axios from 'axios';
import * as cheerio from 'cheerio';
import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';

dotenv.config();

const DOU_URL = 'https://jobs.dou.ua/vacancies/?search=react';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

console.log('🧪 Тестування застосунку для відстеження вакансій DOU\n');
console.log('=' .repeat(50));

// Тест 1: Перевірка конфігурації
console.log('\n📋 Тест 1: Перевірка конфігурації');
console.log(`URL: ${DOU_URL}`);
console.log(`Telegram Bot Token: ${TELEGRAM_BOT_TOKEN ? '✅ Встановлено' : '❌ Не встановлено'}`);
console.log(`Telegram Chat ID: ${TELEGRAM_CHAT_ID && TELEGRAM_CHAT_ID !== 'your_chat_id_here' ? '✅ Встановлено' : '❌ Не встановлено'}`);

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID || TELEGRAM_CHAT_ID === 'your_chat_id_here') {
  console.log('\n⚠️  УВАГА: Telegram не налаштовано повністю!');
  console.log('   Запустіть: npm run get-chat-id');
}

// Тест 2: Парсинг DOU
console.log('\n📋 Тест 2: Парсинг сторінки DOU');
try {
  console.log('⏳ Завантаження сторінки...');
  const response = await axios.get(DOU_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    },
    timeout: 10000
  });

  console.log(`✅ Сторінка завантажена (статус: ${response.status})`);

  const $ = cheerio.load(response.data);
  const vacancies = [];

  $('.vt').each((index, element) => {
    const $link = $(element);
    const $li = $link.closest('li.l-vacancy');
    
    const title = $link.text().trim();
    const link = $link.attr('href');
    const company = $li.find('a.company').text().trim();
    const location = $li.find('span.cities').text().trim();
    const date = $li.find('div.date').text().trim();

    if (title && link && link.includes('/vacancies/')) {
      const urlParts = link.split('/');
      const vacancyId = urlParts.find(part => /^\d+$/.test(part)) || link;
      vacancies.push({
        id: vacancyId,
        title,
        link: link.startsWith('http') ? link : `https://jobs.dou.ua${link}`,
        company,
        location,
        date
      });
    }
  });

  console.log(`✅ Знайдено вакансій: ${vacancies.length}`);
  
  if (vacancies.length > 0) {
    console.log('\n📌 Приклад знайденої вакансії:');
    const example = vacancies[0];
    console.log(`   Назва: ${example.title}`);
    console.log(`   Компанія: ${example.company || 'Не вказано'}`);
    console.log(`   Локація: ${example.location || 'Не вказано'}`);
    console.log(`   Посилання: ${example.link}`);
  } else {
    console.log('⚠️  Вакансії не знайдено. Можливо, змінилася структура сторінки.');
  }

} catch (error) {
  console.error(`❌ Помилка при парсингу: ${error.message}`);
  if (error.response) {
    console.error(`   Статус: ${error.response.status}`);
  }
}

// Тест 3: Перевірка Telegram бота
console.log('\n📋 Тест 3: Перевірка Telegram бота');
if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID && TELEGRAM_CHAT_ID !== 'your_chat_id_here') {
  try {
    const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });
    
    console.log('⏳ Відправка тестового повідомлення...');
    await bot.sendMessage(
      TELEGRAM_CHAT_ID,
      '🧪 Тестове повідомлення від застосунку відстеження вакансій!\n\nЯкщо ви бачите це повідомлення, все працює правильно! ✅',
      { parse_mode: 'HTML' }
    );
    console.log('✅ Тестове повідомлення відправлено успішно!');
    console.log('   Перевірте ваш Telegram - ви маєте отримати повідомлення.');
  } catch (error) {
    console.error(`❌ Помилка при відправці повідомлення: ${error.message}`);
    if (error.response) {
      console.error(`   Деталі: ${JSON.stringify(error.response.body, null, 2)}`);
    }
    console.log('\n💡 Можливі причини:');
    console.log('   - Chat ID неправильний');
    console.log('   - Ви не почали діалог з ботом (надішліть /start боту)');
    console.log('   - Токен бота неправильний');
  }
} else {
  console.log('⏭️  Пропущено (Telegram не налаштовано)');
}

// Тест 4: Перевірка збереження стану
console.log('\n📋 Тест 4: Перевірка збереження стану');
try {
  const fs = await import('fs/promises');
  const path = await import('path');
  const { fileURLToPath } = await import('url');
  
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const stateFile = path.join(__dirname, 'seen_vacancies.json');
  
  try {
    const data = await fs.readFile(stateFile, 'utf-8');
    const seenVacancies = JSON.parse(data);
    console.log(`✅ Файл стану існує (${seenVacancies.length} збережених вакансій)`);
  } catch (error) {
    console.log('ℹ️  Файл стану ще не створено (це нормально для першого запуску)');
  }
} catch (error) {
  console.error(`❌ Помилка: ${error.message}`);
}

console.log('\n' + '='.repeat(50));
console.log('✅ Тестування завершено!\n');
console.log('💡 Якщо всі тести пройшли успішно, можете запустити:');
console.log('   npm start\n');

