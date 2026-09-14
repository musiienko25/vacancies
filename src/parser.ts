import * as cheerio from "cheerio";
import { fetchUrlViaTlsSocket } from "./socketFetch";
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

const DOU_HEADERS = {
  "User-Agent": USER_AGENT,
  Accept: "application/rss+xml, application/xml, text/xml, */*",
  "Accept-Language": "uk-UA,uk;q=0.9,en;q=0.8",
};

export async function fetchVacancies(_env?: { JINA_API_KEY?: string }): Promise<Vacancy[]> {
  const response = await fetch(DOU_URL, { headers: DOU_HEADERS });

  if (response.ok) {
    return parseRssXml(await response.text());
  }

  console.warn(`DOU RSS via fetch ${response.status}, trying TLS socket`);
  try {
    const socketRes = await fetchUrlViaTlsSocket(DOU_URL);
    if (socketRes.status >= 200 && socketRes.status < 300 && socketRes.body.includes("<item>")) {
      console.log("DOU RSS via TLS socket OK");
      return parseRssXml(socketRes.body);
    }
    throw new Error(
      `DOU fetch ${response.status}; socket ${socketRes.status} (${socketRes.body.slice(0, 80).replace(/\s+/g, " ")})`,
    );
  } catch (error) {
    const socketNote = error instanceof Error ? error.message : String(error);
    throw new Error(
      `DOU blocked from Cloudflare (${socketNote}). GitHub /ingest still works; Jina is not used.`,
    );
  }
}
