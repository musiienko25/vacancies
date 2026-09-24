import assert from "node:assert/strict";
import { test } from "node:test";
import { escapeHtml, formatVacancyMessage, sendTelegramNotification } from "../src/telegram";
import type { Env, Vacancy } from "../src/types";

const vacancy: Vacancy = {
  id: "1",
  title: "Dev <React> & Node",
  link: 'https://jobs.dou.ua/vacancies/1/?q="a"',
  company: "A & B",
  location: "Київ",
  date: "24 вересня",
};

const env: Env = {
  TELEGRAM_BOT_TOKEN: "token",
  TELEGRAM_CHAT_ID: "42",
  MANUAL_TRIGGER_SECRET: "secret",
  SEEN_FILE: "./seen.json",
  DOU_SEARCH: "React",
  ONLY_TODAY: true,
  CHECK_INTERVAL_MINUTES: 10,
  MAX_SEEN: 100,
};

test("escapeHtml escapes characters that break Telegram HTML", () => {
  assert.equal(escapeHtml(`A & B <C>`), "A &amp; B &lt;C&gt;");
});

test("formatVacancyMessage keeps the link clickable and escapes text", () => {
  const message = formatVacancyMessage(vacancy);
  assert.match(message, /Dev &lt;React&gt; &amp; Node/);
  assert.match(message, /A &amp; B/);
  assert.match(message, /<a href="https:\/\/jobs\.dou\.ua\/vacancies\/1\/\?q=&quot;a&quot;">/);
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("sendTelegramNotification retries a 429 once", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    if (calls === 1) return jsonResponse(429, { parameters: { retry_after: 0 } });
    return jsonResponse(200, {});
  };

  await sendTelegramNotification(env, vacancy, fetcher);
  assert.equal(calls, 2);
});

test("sendTelegramNotification throws when the 429 retry also fails", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    return jsonResponse(429, { parameters: { retry_after: 0 } });
  };

  await assert.rejects(() => sendTelegramNotification(env, vacancy, fetcher), /Telegram sendMessage failed: 429/);
  assert.equal(calls, 2);
});
