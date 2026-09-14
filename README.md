# DOU Вакансії Tracker

Cloudflare Worker з Cron Trigger: парсить вакансії React на [DOU](https://jobs.dou.ua), зберігає вже бачені id у Workers KV і надсилає нові в Telegram.

Немає постійно працюючого HTTP-сервера, Railway, Render, Vercel чи Fly.

## Як це працює

1. Cloudflare Cron `*/10 * * * *` будить GitHub Actions (`workflow_dispatch`) — так уникаємо «зависання» GitHub schedule.
2. GitHub runner качає RSS (його IP DOU не блокує) і робить `POST /ingest` на Worker.
3. Worker парсить RSS, KV, Telegram.
4. Фільтр: тільки вакансії за сьогодні (календарний день `Europe/Kyiv`).
5. Нова вакансія = id ще немає в KV `seen_vacancies` (останні 100 записів).
6. Id записується в KV **до** Telegram, щоб retry не дублював повідомлення.

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

GitHub → Settings → Secrets and variables → Actions:

- `WORKER_URL` = `https://dou-vacancy-tracker.musiienko.workers.dev`
- `MANUAL_TRIGGER_SECRET` = той самий, що в Worker

Щоб Cloudflare Cron **будив** Actions кожні 10 хвилин (інакше GitHub schedule зависає):

1. GitHub → Settings → Developer settings → Personal access tokens → Fine-grained  
   - Resource owner: ваш акаунт  
   - Repository: `vacancies`  
   - Permissions → **Actions**: Read and write  
2. Скопіюйте токен і в проєкті:

```bash
npx wrangler secret put GITHUB_DISPATCH_TOKEN
npx wrangler deploy
```

3. Dashboard → Worker → Triggers → **Test** scheduled — у GitHub Actions має з’явитись новий run **Fetch DOU RSS**.

```bash
npx wrangler secret list
```

Ручний запуск на проді (той самий код, що Cron):

```bash
curl -X POST "https://dou-vacancy-tracker.musiienko.workers.dev/ingest?secret=YOUR_MANUAL_TRIGGER_SECRET&dry=1" \
  -H "Content-Type: application/rss+xml" \
  --data-binary @<(curl -fsSL "https://jobs.dou.ua/vacancies/feeds/?search=React&descr=1")
```

## Що перевірити після деплою

Локальний Cron Cloudflare не емулює як прод-розклад. Після `wrangler deploy`:

1. Dashboard → Worker → Settings → Triggers: `*/10 * * * *`.
2. Triggers → Test scheduled: у логах Worker `GitHub workflow fetch-dou.yml dispatched`, у GitHub — новий run.
3. Telegram лише для нових за сьогодні; повторний ingest `newCount: 0`.

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
