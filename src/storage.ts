import type { Env, Vacancy } from "./types";

export const SEEN_KEY = "seen_vacancies";
export const MAX_SEEN = 100;

export async function loadSeenVacancies(env: Env): Promise<Vacancy[]> {
  const data = await env.SEEN_KV.get(SEEN_KEY);
  if (!data) return [];
  try {
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.error("Failed to parse seen_vacancies from KV, starting empty");
    return [];
  }
}

export async function saveSeenVacancies(env: Env, vacancies: Vacancy[]): Promise<void> {
  const trimmed = vacancies.slice(-MAX_SEEN);
  await env.SEEN_KV.put(SEEN_KEY, JSON.stringify(trimmed));
}
