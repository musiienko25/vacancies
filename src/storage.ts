import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DeliveryStatus, Env, SeenRecord } from "./types";

export class SeenFileCorruptError extends Error {
  constructor(filePath: string, cause: unknown) {
    super(`Seen file is corrupt: ${filePath}`);
    this.name = "SeenFileCorruptError";
    this.cause = cause;
  }
}

async function ensureParentDir(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
}

function toSeenRecord(value: unknown): SeenRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<SeenRecord>;
  if (typeof record.id !== "string" || record.id.length === 0) return null;

  const status: DeliveryStatus = record.status === "pending" ? "pending" : "sent";
  const attempts =
    typeof record.attempts === "number" && Number.isFinite(record.attempts) && record.attempts >= 0
      ? Math.floor(record.attempts)
      : 0;

  return {
    id: record.id,
    title: typeof record.title === "string" ? record.title : "",
    link: typeof record.link === "string" ? record.link : "",
    company: typeof record.company === "string" ? record.company : "",
    location: typeof record.location === "string" ? record.location : "",
    date: typeof record.date === "string" ? record.date : "",
    status,
    attempts,
  };
}

/** Keep every pending record. Drop the oldest sent records beyond `maxSeen`. */
export function trimSeen(records: SeenRecord[], maxSeen: number): SeenRecord[] {
  const sentCount = records.filter((record) => record.status === "sent").length;
  let drop = Math.max(0, sentCount - maxSeen);
  const kept: SeenRecord[] = [];
  for (const record of records) {
    if (record.status === "sent" && drop > 0) {
      drop -= 1;
      continue;
    }
    kept.push(record);
  }
  return kept;
}

export async function loadSeenVacancies(env: Env): Promise<SeenRecord[]> {
  let data: string;
  try {
    data = await readFile(env.SEEN_FILE, "utf8");
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? (error as NodeJS.ErrnoException).code : undefined;
    if (code === "ENOENT") return [];
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch (error) {
    throw new SeenFileCorruptError(env.SEEN_FILE, error);
  }

  if (!Array.isArray(parsed)) {
    throw new SeenFileCorruptError(env.SEEN_FILE, new Error("expected a JSON array"));
  }

  return parsed.flatMap((item) => {
    const record = toSeenRecord(item);
    return record ? [record] : [];
  });
}

export async function saveSeenVacancies(env: Env, vacancies: SeenRecord[]): Promise<void> {
  const trimmed = trimSeen(vacancies, env.MAX_SEEN);
  await ensureParentDir(env.SEEN_FILE);
  const tmp = `${env.SEEN_FILE}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(trimmed, null, 2), "utf8");
  try {
    await rename(tmp, env.SEEN_FILE);
  } catch (error) {
    await unlink(tmp).catch(() => undefined);
    throw error;
  }
}
