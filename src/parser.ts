import * as cheerio from "cheerio";
import type { Vacancy } from "./types";

export const DOU_URL =
  "https://jobs.dou.ua/vacancies/feeds/?search=React&descr=1";
export const ONLY_TODAY = true;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const UA_MONTHS = [
  "січня",
  "лютого",
  "березня",
  "квітня",
  "травня",
  "червня",
  "липня",
  "серпня",
  "вересня",
  "жовтня",
  "листопада",
  "грудня",
] as const;

function kyivNowParts(): { day: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Kyiv",
    day: "numeric",
    month: "numeric",
  }).formatToParts(new Date());

  const day = Number(parts.find((p) => p.type === "day")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value) - 1;
  return { day, month };
}

function kyivPartsFromDate(date: Date): { day: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Kyiv",
    day: "numeric",
    month: "numeric",
  }).formatToParts(date);

  const day = Number(parts.find((p) => p.type === "day")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value) - 1;
  return { day, month };
}

function formatUaDate(date: Date): string {
  const { day, month } = kyivPartsFromDate(date);
  return `${day} ${UA_MONTHS[month]}`;
}

export function isToday(dateString: string | undefined): boolean {
  if (!dateString) return false;

  const dateLower = dateString.toLowerCase().trim();

  if (dateLower.includes("сьогодні") || dateLower.includes("today")) {
    return true;
  }

  const parsed = Date.parse(dateString);
  if (!Number.isNaN(parsed)) {
    const pub = kyivPartsFromDate(new Date(parsed));
    const today = kyivNowParts();
    return pub.day === today.day && pub.month === today.month;
  }

  const months: Record<string, number> = Object.fromEntries(
    UA_MONTHS.map((name, index) => [name, index]),
  );

  const { day: todayDay, month: todayMonth } = kyivNowParts();

  for (const [monthName, monthIndex] of Object.entries(months)) {
    if (dateLower.includes(monthName)) {
      const dayMatch = dateString.match(/^(\d+)/);
      if (dayMatch) {
        const day = parseInt(dayMatch[1], 10);
        if (day === todayDay && monthIndex === todayMonth) {
          return true;
        }
      }
    }
  }

  return false;
}

/** RSS title: "{title} в {company}, {location}" */
function parseRssTitle(rawTitle: string): {
  title: string;
  company: string;
  location: string;
} {
  const match = rawTitle.match(/^(.+?) в (.+?), (.+)$/);
  if (!match) {
    return { title: rawTitle.trim(), company: "", location: "" };
  }

  return {
    title: match[1].trim(),
    company: match[2].trim(),
    location: match[3].trim(),
  };
}

function vacancyIdFromLink(link: string): string {
  const match = link.match(/\/vacancies\/(\d+)/);
  return match?.[1] || link;
}

function cleanLink(link: string): string {
  try {
    const url = new URL(link);
    url.searchParams.delete("utm_source");
    return url.toString();
  } catch {
    return link.split("?")[0];
  }
}

function vacancyFromFeedItem(rawTitle: string, link: string, pubDate: string): Vacancy | null {
  if (!rawTitle || !link || !link.includes("/vacancies/")) {
    return null;
  }

  const { title, company, location } = parseRssTitle(rawTitle);
  const published = pubDate ? new Date(pubDate) : null;
  const date =
    published && !Number.isNaN(published.getTime()) ? formatUaDate(published) : pubDate;

  return {
    id: vacancyIdFromLink(link),
    title,
    link: cleanLink(link),
    company,
    location,
    date,
  };
}

export function parseRssXml(xml: string): Vacancy[] {
  const $ = cheerio.load(xml, { xml: true });
  const vacancies: Vacancy[] = [];

  $("item").each((_index, element) => {
    const $item = $(element);
    const vacancy = vacancyFromFeedItem(
      $item.find("title").first().text().trim(),
      $item.find("link").first().text().trim(),
      $item.find("pubDate").first().text().trim(),
    );
    if (vacancy) vacancies.push(vacancy);
  });

  return vacancies;
}

/** Jina markdown of the same RSS: heading + RFC822 date after the item body. */
function parseJinaMarkdown(markdown: string): Vacancy[] {
  const vacancies: Vacancy[] = [];
  const parts = markdown.split(/\n(?=### \[)/);

  for (const part of parts) {
    const heading = part.match(/### \[([^\]]+)\]\((https:\/\/jobs\.dou\.ua\/[^)\s]+)\)/);
    if (!heading) continue;
    const dateMatch = part.match(
      /([A-Z][a-z]{2}, \d{1,2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} [+-]\d{4})/,
    );
    const vacancy = vacancyFromFeedItem(heading[1], heading[2], dateMatch?.[1] ?? "");
    if (vacancy) vacancies.push(vacancy);
  }

  return vacancies;
}

const DOU_HEADERS = {
  "User-Agent": USER_AGENT,
  Accept: "application/rss+xml, application/xml, text/xml, */*",
  "Accept-Language": "uk-UA,uk;q=0.9,en;q=0.8",
};

async function fetchViaJina(apiKey: string): Promise<Vacancy[]> {
  const response = await fetch(`https://r.jina.ai/${DOU_URL}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
      "User-Agent": USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`jina fallback failed: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as { data?: { content?: string } };
  const content = payload.data?.content;
  if (!content) {
    throw new Error("jina fallback returned empty content");
  }

  const vacancies = parseJinaMarkdown(content);
  if (vacancies.length === 0) {
    throw new Error("jina fallback parsed 0 vacancies");
  }
  return vacancies;
}

export async function fetchVacancies(env?: { JINA_API_KEY?: string }): Promise<Vacancy[]> {
  const response = await fetch(DOU_URL, { headers: DOU_HEADERS });

  if (response.ok) {
    return parseRssXml(await response.text());
  }

  if (env?.JINA_API_KEY) {
    console.warn(`DOU RSS ${response.status}, using authenticated jina fallback`);
    return fetchViaJina(env.JINA_API_KEY);
  }

  throw new Error(
    `DOU request failed: ${response.status} ${response.statusText}. Cloudflare IP is blocked; POST RSS to /ingest or set JINA_API_KEY.`,
  );
}
