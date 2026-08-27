import * as cheerio from "cheerio";
import type { Vacancy } from "./types";

export const DOU_URL = "https://jobs.dou.ua/vacancies/?search=React&descr=1";
export const ONLY_TODAY = true;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";

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

export function isToday(dateString: string | undefined): boolean {
  if (!dateString) return false;

  const dateLower = dateString.toLowerCase().trim();

  if (dateLower.includes("сьогодні") || dateLower.includes("today")) {
    return true;
  }

  const months: Record<string, number> = {
    січня: 0,
    лютого: 1,
    березня: 2,
    квітня: 3,
    травня: 4,
    червня: 5,
    липня: 6,
    серпня: 7,
    вересня: 8,
    жовтня: 9,
    листопада: 10,
    грудня: 11,
  };

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

function loadHtml(html: string) {
  try {
    return cheerio.load(html);
  } catch (error) {
    console.warn("cheerio default parser failed, using htmlparser2:", error);
    return cheerio.load(html, { _useHtmlParser2: true } as Parameters<typeof cheerio.load>[1]);
  }
}

export async function fetchVacancies(): Promise<Vacancy[]> {
  const response = await fetch(DOU_URL, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(`DOU request failed: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const $ = loadHtml(html);
  const vacancies: Vacancy[] = [];

  $(".vt").each((_index, element) => {
    const $link = $(element);
    const $li = $link.closest("li.l-vacancy");

    const title = $link.text().trim();
    const link = $link.attr("href");
    const company = $li.find("a.company").text().trim();
    const location = $li.find("span.cities").text().trim();
    const date = $li.find("div.date").text().trim();

    if (title && link && link.includes("/vacancies/")) {
      const urlParts = link.split("/");
      const vacancyId = urlParts.find((part) => /^\d+$/.test(part)) || link;

      vacancies.push({
        id: vacancyId,
        title,
        link: link.startsWith("http") ? link : `https://jobs.dou.ua${link}`,
        company,
        location,
        date,
      });
    }
  });

  return vacancies;
}
