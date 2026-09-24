import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Env, Vacancy } from "./types";

export const MAX_SEEN = 100;

async function ensureParentDir(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
}

export async function loadSeenVacancies(env: Env): Promise<Vacancy[]> {
  try {
    const data = await readFile(env.SEEN_FILE, "utf8");
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? (error as NodeJS.ErrnoException).code : undefined;
    if (code === "ENOENT") return [];
    console.error("Failed to read seen vacancies, starting empty:", error);
    return [];
  }
}

export async function saveSeenVacancies(env: Env, vacancies: Vacancy[]): Promise<void> {
  const trimmed = vacancies.slice(-MAX_SEEN);
  await ensureParentDir(env.SEEN_FILE);
  await writeFile(env.SEEN_FILE, JSON.stringify(trimmed, null, 2), "utf8");
}
