import axios from 'axios';
import * as cheerio from 'cheerio';
import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Конфігурація
const DOU_URL = 'https://jobs.dou.ua/vacancies/?search=react';
const STATE_FILE = path.join(__dirname, 'seen_vacancies.json');
const CHECK_INTERVAL = 30 * 60 * 1000; // 30 хвилин
const ONLY_TODAY = true; // Фільтрувати тільки вакансії за сьогодні

// Отримуємо токени з змінних оточення
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Ініціалізація Telegram бота
let bot = null;
if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
  bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });
}

/**
 * Перевіряє, чи дата вакансії відповідає сьогоднішній даті
 */
function isToday(dateString) {
  if (!dateString) return false;
  
  const dateLower = dateString.toLowerCase().trim();
  
  // Перевірка на "сьогодні"
  if (dateLower.includes('сьогодні') || dateLower.includes('today')) {
    return true;
  }
  
  // Словник місяців українською
  const months = {
    'січня': 0, 'лютого': 1, 'березня': 2, 'квітня': 3,
    'травня': 4, 'червня': 5, 'липня': 6, 'серпня': 7,
    'вересня': 8, 'жовтня': 9, 'листопада': 10, 'грудня': 11
  };
  
  // Парсимо дату у форматі "4 листопада" або "3 грудня"
  const today = new Date();
  const todayDay = today.getDate();
  const todayMonth = today.getMonth();
  
  // Шукаємо число та місяць у рядку
  for (const [monthName, monthIndex] of Object.entries(months)) {
    if (dateLower.includes(monthName)) {
      // Витягуємо число з початку рядка
      const dayMatch = dateString.match(/^(\d+)/);
      if (dayMatch) {
        const day = parseInt(dayMatch[1], 10);
        // Перевіряємо, чи це сьогоднішня дата
        if (day === todayDay && monthIndex === todayMonth) {
          return true;
        }
      }
    }
  }
  
  return false;
}

/**
 * Завантажує список вже побачених вакансій
 */
async function loadSeenVacancies() {
  try {
    const data = await fs.readFile(STATE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    // Якщо файл не існує, повертаємо порожній масив
    return [];
  }
}

/**
 * Зберігає список побачених вакансій
 */
async function saveSeenVacancies(vacancies) {
  await fs.writeFile(STATE_FILE, JSON.stringify(vacancies, null, 2), 'utf-8');
}

/**
 * Парсить сторінку DOU та отримує список вакансій
 */
async function fetchVacancies() {
  try {
    const response = await axios.get(DOU_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    const vacancies = [];

    // Парсимо вакансії зі сторінки
    // .vt - це сам тег <a>, а вся інформація знаходиться в батьківському <li>
    $('.vt').each((index, element) => {
      const $link = $(element);
      const $li = $link.closest('li.l-vacancy'); // Батьківський li з класом l-vacancy
      
      // Назва вакансії - текст посилання
      const title = $link.text().trim();
      // Посилання
      const link = $link.attr('href');
      
      // Інформація знаходиться в батьківському li
      const company = $li.find('a.company').text().trim();
      const location = $li.find('span.cities').text().trim();
      const date = $li.find('div.date').text().trim();

      // Перевіряємо, що це дійсно посилання на вакансію (містить /vacancies/)
      if (title && link && link.includes('/vacancies/')) {
        // Створюємо унікальний ID на основі посилання
        // Видаляємо query параметри та отримуємо ID з URL
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

    return vacancies;
  } catch (error) {
    console.error('Помилка при завантаженні вакансій:', error.message);
    throw error;
  }
}

/**
 * Відправляє сповіщення в Telegram
 */
async function sendTelegramNotification(vacancy) {
  if (!bot || !TELEGRAM_CHAT_ID) {
    console.log('Telegram не налаштовано. Пропускаємо сповіщення.');
    return;
  }

  const message = `🆕 Нова вакансія!\n\n` +
    `📌 ${vacancy.title}\n` +
    `🏢 ${vacancy.company || 'Компанія не вказана'}\n` +
    `📍 ${vacancy.location || 'Локація не вказана'}\n` +
    `📅 ${vacancy.date || 'Дата не вказана'}\n\n` +
    `🔗 ${vacancy.link}`;

  try {
    await bot.sendMessage(TELEGRAM_CHAT_ID, message, {
      parse_mode: 'HTML',
      disable_web_page_preview: false
    });
    console.log(`✅ Сповіщення відправлено: ${vacancy.title}`);
  } catch (error) {
    console.error('Помилка при відправці сповіщення:', error.message);
  }
}

/**
 * Головна функція перевірки вакансій
 */
async function checkVacancies() {
  console.log(`\n🔍 Перевірка вакансій на ${new Date().toLocaleString('uk-UA')}...`);
  
  try {
    // Завантажуємо поточні вакансії
    const currentVacancies = await fetchVacancies();
    console.log(`📊 Знайдено вакансій: ${currentVacancies.length}`);

    // Завантажуємо список вже побачених вакансій
    const seenVacancies = await loadSeenVacancies();
    const seenIds = new Set(seenVacancies.map(v => v.id));

    // Знаходимо нові вакансії
    let newVacancies = currentVacancies.filter(v => !seenIds.has(v.id));
    
    // Фільтруємо тільки вакансії за сьогодні, якщо включено
    if (ONLY_TODAY) {
      newVacancies = newVacancies.filter(v => isToday(v.date));
      if (newVacancies.length > 0) {
        console.log(`📅 Відфільтровано: залишилось ${newVacancies.length} вакансій за сьогодні`);
      }
    }

    if (newVacancies.length > 0) {
      console.log(`🆕 Знайдено нових вакансій: ${newVacancies.length}`);
      
      // Відправляємо сповіщення для кожної нової вакансії
      for (const vacancy of newVacancies) {
        await sendTelegramNotification(vacancy);
        // Невелика затримка, щоб не перевантажити Telegram API
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Оновлюємо список побачених вакансій
      const updatedSeenVacancies = [...seenVacancies, ...newVacancies];
      // Зберігаємо тільки останні 100 вакансій, щоб файл не розростався
      await saveSeenVacancies(updatedSeenVacancies.slice(-100));
    } else {
      console.log('✅ Нових вакансій не знайдено');
    }

  } catch (error) {
    console.error('❌ Помилка при перевірці вакансій:', error.message);
  }
}

/**
 * Запускає періодичну перевірку
 */
function startTracking() {
  console.log('🚀 Запуск відстеження вакансій...');
  console.log(`📡 URL: ${DOU_URL}`);
  console.log(`⏰ Інтервал перевірки: ${CHECK_INTERVAL / 1000 / 60} хвилин`);
  console.log(`📅 Фільтрація за сьогодні: ${ONLY_TODAY ? 'Увімкнено' : 'Вимкнено'}`);
  
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('⚠️  УВАГА: Telegram не налаштовано!');
    console.warn('   Встановіть TELEGRAM_BOT_TOKEN та TELEGRAM_CHAT_ID в .env файлі');
  } else {
    console.log('✅ Telegram налаштовано');
  }

  // Виконуємо першу перевірку одразу
  checkVacancies().then(() => {
    // Якщо запущено в GitHub Actions або одноразово - виходимо
    if (process.env.CI || process.argv.includes('--once')) {
      console.log('✅ Перевірка завершена. Вихід.');
      process.exit(0);
    }
    
    // Потім перевіряємо кожні CHECK_INTERVAL мілісекунд
    setInterval(checkVacancies, CHECK_INTERVAL);
  }).catch(error => {
    console.error('❌ Помилка при перевірці:', error);
    process.exit(1);
  });
}

// Запускаємо відстеження
startTracking();

