# DOU Вакансії Tracker

Cloudflare Worker з Cron Trigger: парсить вакансії React на [DOU](https://jobs.dou.ua), зберігає вже бачені id у Workers KV і надсилає нові в Telegram.

Немає постійно працюючого HTTP-сервера, Railway, Render, Vercel чи Fly.

## Як це працює

1. Cron `*/10 * * * *` викликає `scheduled()`.
2. Worker завантажує `https://jobs.dou.ua/vacancies/?search=react`.
3. Cheerio парсить `.vt` / `li.l-vacancy` (той самий parser, що раніше).
4. Фільтр: тільки вакансії за сьогодні (календарний день `Europe/Kyiv`).
5. Нова вакансія = id ще немає в KV `seen_vacancies` (останні 100 записів).
6. Id записується в KV **до** Telegram, щоб retry Cron не дублював повідомлення.
7. Той самий текст повідомлення, що раніше.

Ручний запуск використовує той самий `checkVacancies()`, що й Cron.

## Структура

```
src/
  index.ts       # scheduled() + GET /run (секрет)
  check.ts       # оркестрація
  parser.ts      # DOU fetch + cheerio
  telegram.ts    # Telegram Bot API
  storage.ts     # Workers KV
scripts/
  check.mjs      # npm run check / check:dry
wrangler.jsonc   # Cron */10 * * * * і KV binding
get_chat_id.js   # локально отримати TELEGRAM_CHAT_ID
```

## Локально

```bash
npm install
cp .env.example .env
cp .dev.vars.example .dev.vars
```

Заповніть `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `MANUAL_TRIGGER_SECRET` в `.env` і `.dev.vars` (wrangler читає `.dev.vars`).

```bash
npm run get-chat-id   # після /start боту в Telegram
npm run check:dry     # DOU → parser → нові вакансії в console; без Telegram і KV
npm run check         # повний flow, включно з Telegram і локальним KV
```

Повторний `npm run check` одразу після першого має знайти 0 нових і нічого не відправити.

`wrangler dev` піднімає Worker локально. Ручний HTTP:

```bash
curl "http://localhost:8787/run?secret=YOUR_MANUAL_TRIGGER_SECRET"
curl "http://localhost:8787/run?secret=YOUR_MANUAL_TRIGGER_SECRET&dry=1"
# той самий код, що Cron:
curl "http://127.0.0.1:8787/cdn-cgi/local/scheduled"
```

## Деплой (скопіюйте команди)

```bash
npm install
npx wrangler login

npx wrangler kv namespace create SEEN_KV
npx wrangler kv namespace create SEEN_KV --preview
```

Вставте `id` і `preview_id` з виводу в `wrangler.jsonc` → `kv_namespaces[0]`.

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
npx wrangler secret put MANUAL_TRIGGER_SECRET

npx wrangler deploy
```

У виводі `wrangler deploy` перевірте рядок Cron: `*/10 * * * *`.

```bash
npx wrangler secret list
```

Ручний запуск на проді (той самий код, що Cron):

```bash
curl "https://<worker>.workers.dev/run?secret=YOUR_MANUAL_TRIGGER_SECRET"
```

## Що перевірити після деплою

Локальний Cron Cloudflare не емулює як прод-розклад. Після `wrangler deploy`:

1. Dashboard → Worker → Settings → Triggers: `*/10 * * * *`.
2. `curl` на `/run?secret=...` — має пройти DOU → parse → KV → Telegram.
3. Workers → Logs: DOU відповідь, кількість вакансій, KV put, Telegram 200.
4. Другий `/run` одразу: `newCount: 0`, без повторних повідомлень.
5. Triggers → Test (scheduled) або почекати наступні 10 хвилин.
6. Якщо `exceededCpu` у логах часто — cheerio на Free (10 ms CPU) перевищив ліміт; `fetch`/KV/Telegram не рахуються як CPU. Рідкісні перевищення Cloudflare зазвичай толерує.

KV не дозволяє `cacheTtl: 0` (мінімум 30 с). Читання `seen_vacancies` йде без cacheTtl; захист від дублів — запис id у KV **до** відправки Telegram.

## Cloudflare resources

- 1 Worker
- 1 KV namespace (`SEEN_KV`) + preview
- Cron Trigger у `wrangler.jsonc` (`*/10 * * * *`)

## Secrets

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `MANUAL_TRIGGER_SECRET`

## Налаштування

Пошук, фільтр «сьогодні» і селектори — у `src/parser.ts` (`DOU_URL`, `ONLY_TODAY`). Ліміт seen — `MAX_SEEN = 100` у `src/storage.ts` (як раніше `slice(-100)`). Не збільшуйте «очищення» так, щоб старі вакансії знову вважалися новими.

## Після міграції

Змінені: `package.json`, `.gitignore`, `.env.example`, `get_chat_id.js`, `README.md`.

Створені: `src/index.ts`, `src/check.ts`, `src/parser.ts`, `src/telegram.ts`, `src/storage.ts`, `src/types.ts`, `scripts/check.mjs`, `wrangler.jsonc`, `tsconfig.json`, `.dev.vars.example`.

Видалені: `index.js`, `test.js`, `fly.toml`, `DEPLOY.md`, `.github/workflows/check-vacancies.yml`, `supabase/functions/check-vacancies/index.ts`.

Додані npm: `wrangler`, `@cloudflare/workers-types`. Залишені: `cheerio`, `dotenv` (лише для `get_chat_id.js`).

Прибрані npm: `axios`, `node-telegram-bot-api`.

## Ліцензія

MIT
