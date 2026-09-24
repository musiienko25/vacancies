import assert from "node:assert/strict";
import { test } from "node:test";
import { UA_MONTHS, isToday, parseRssXml } from "../src/parser";

function kyivDayMonth(offsetDays: number): { day: number; monthIndex: number } {
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [year, month, day] = formatted.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day));
  shifted.setUTCDate(shifted.getUTCDate() + offsetDays);
  return { day: shifted.getUTCDate(), monthIndex: shifted.getUTCMonth() };
}

test("isToday matches сьогодні, a Kyiv calendar day, and an RFC timestamp", () => {
  const today = kyivDayMonth(0);
  const yesterday = kyivDayMonth(-1);

  assert.equal(isToday("сьогодні"), true);
  assert.equal(isToday("Today"), true);
  assert.equal(isToday(`${today.day} ${UA_MONTHS[today.monthIndex]}`), true);
  assert.equal(isToday(`${yesterday.day} ${UA_MONTHS[yesterday.monthIndex]}`), false);
  assert.equal(isToday(new Date().toISOString()), true);
  assert.equal(isToday(new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()), false);
  assert.equal(isToday(undefined), false);
});

test("parseRssXml reads title, company, location, and vacancy id", () => {
  const xml = `<?xml version="1.0"?>
<rss><channel>
  <item>
    <title>React Developer в Acme, Київ</title>
    <link>https://jobs.dou.ua/vacancies/12345/?utm_source=rss</link>
    <pubDate>Thu, 24 Sep 2026 12:00:00 +0300</pubDate>
  </item>
</channel></rss>`;

  const [vacancy] = parseRssXml(xml);
  assert.equal(vacancy.id, "12345");
  assert.equal(vacancy.title, "React Developer");
  assert.equal(vacancy.company, "Acme");
  assert.equal(vacancy.location, "Київ");
  assert.equal(vacancy.link, "https://jobs.dou.ua/vacancies/12345/");
});
