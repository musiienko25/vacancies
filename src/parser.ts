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

export async function fetchVacancies(): Promise<Vacancy[]> {
  const response = await fetch(DOU_URL, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/rss+xml, application/xml, text/xml, */*",
      "Accept-Language": "uk-UA,uk;q=0.9,en;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`DOU request failed: ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();
  const $ = cheerio.load(xml, { xml: true });
  const vacancies: Vacancy[] = [];

  $("item").each((_index, element) => {
    const $item = $(element);
    const rawTitle = $item.find("title").first().text().trim();
    const link = $item.find("link").first().text().trim();
    const pubDate = $item.find("pubDate").first().text().trim();

    if (!rawTitle || !link || !link.includes("/vacancies/")) {
      return;
    }

    const { title, company, location } = parseRssTitle(rawTitle);
    const published = pubDate ? new Date(pubDate) : null;
    const date =
      published && !Number.isNaN(published.getTime())
        ? formatUaDate(published)
        : pubDate;

    vacancies.push({
      id: vacancyIdFromLink(link),
      title,
      link: cleanLink(link),
      company,
      location,
      date,
    });
  });

  return vacancies;
}
