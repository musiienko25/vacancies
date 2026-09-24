import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { checkVacancies } from "../src/check";
import { SeenFileCorruptError, trimSeen } from "../src/storage";
import type { Env, SeenRecord, Vacancy } from "../src/types";

function vacancy(id: string): Vacancy {
  return {
    id,
    title: `Role ${id}`,
    link: `https://jobs.dou.ua/vacancies/${id}`,
    company: "Acme",
    location: "Київ",
    date: "сьогодні",
  };
}

async function makeEnv(maxSeen = 100): Promise<Env> {
  const dir = await mkdtemp(path.join(tmpdir(), "dou-seen-"));
  return {
    TELEGRAM_BOT_TOKEN: "token",
    TELEGRAM_CHAT_ID: "1",
    MANUAL_TRIGGER_SECRET: "secret",
    SEEN_FILE: path.join(dir, "seen.json"),
    DOU_SEARCH: "React",
    ONLY_TODAY: false,
    CHECK_INTERVAL_MINUTES: 10,
    MAX_SEEN: maxSeen,
  };
}

async function readSeen(env: Env): Promise<SeenRecord[]> {
  const raw = await readFile(env.SEEN_FILE, "utf8");
  return JSON.parse(raw) as SeenRecord[];
}

test("a failed send stays pending and the next successful tick sends once", async () => {
  const env = await makeEnv();
  const item = vacancy("42");
  let calls = 0;

  await checkVacancies(env, {
    dryRun: false,
    vacancies: [item],
    delayMs: 0,
    notify: async () => {
      calls += 1;
      throw new Error("telegram down");
    },
  });

  assert.equal(calls, 1);
  const pending = await readSeen(env);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].status, "pending");
  assert.equal(pending[0].attempts, 1);

  await checkVacancies(env, {
    dryRun: false,
    vacancies: [item],
    delayMs: 0,
    notify: async () => {
      calls += 1;
    },
  });

  assert.equal(calls, 2);
  const sent = await readSeen(env);
  assert.equal(sent[0].status, "sent");

  await checkVacancies(env, {
    dryRun: false,
    vacancies: [item],
    delayMs: 0,
    notify: async () => {
      calls += 1;
    },
  });

  assert.equal(calls, 2);
});

test("pending records are not dropped when sent history is trimmed", async () => {
  const env = await makeEnv(1);
  const older: SeenRecord = { ...vacancy("older"), status: "sent", attempts: 0 };
  const recent: SeenRecord = { ...vacancy("recent"), status: "sent", attempts: 0 };
  await writeFile(env.SEEN_FILE, JSON.stringify([older, recent]));

  await checkVacancies(env, {
    dryRun: false,
    vacancies: [vacancy("new")],
    delayMs: 0,
    notify: async () => {
      throw new Error("telegram down");
    },
  });

  const saved = await readSeen(env);
  assert.deepEqual(
    saved.map((record) => record.id),
    ["recent", "new"],
  );
  assert.equal(saved.find((record) => record.id === "new")?.status, "pending");
});

test("delivery stops after 5 failed attempts", async () => {
  const env = await makeEnv();
  const pending: SeenRecord = { ...vacancy("1"), status: "pending", attempts: 4 };
  await writeFile(env.SEEN_FILE, JSON.stringify([pending]));
  let calls = 0;

  const notify = async () => {
    calls += 1;
    throw new Error("telegram down");
  };

  await checkVacancies(env, { dryRun: false, vacancies: [], delayMs: 0, notify });
  assert.equal(calls, 1);
  assert.equal((await readSeen(env))[0].attempts, 5);
  assert.equal((await readSeen(env))[0].status, "pending");

  await checkVacancies(env, { dryRun: false, vacancies: [], delayMs: 0, notify });
  assert.equal(calls, 1);
});

test("legacy seen records without status are treated as already sent", async () => {
  const env = await makeEnv();
  await writeFile(env.SEEN_FILE, JSON.stringify([vacancy("7")]));
  let calls = 0;

  await checkVacancies(env, {
    dryRun: false,
    vacancies: [vacancy("7")],
    delayMs: 0,
    notify: async () => {
      calls += 1;
    },
  });

  assert.equal(calls, 0);
});

test("a corrupt seen file is left untouched", async () => {
  const env = await makeEnv();
  await writeFile(env.SEEN_FILE, "{");

  await assert.rejects(
    () => checkVacancies(env, { dryRun: false, vacancies: [], delayMs: 0, notify: async () => undefined }),
    SeenFileCorruptError,
  );

  assert.equal(await readFile(env.SEEN_FILE, "utf8"), "{");
});

test("trimSeen drops oldest sent records and keeps every pending one", () => {
  const records: SeenRecord[] = [
    { ...vacancy("a"), status: "sent", attempts: 0 },
    { ...vacancy("b"), status: "pending", attempts: 2 },
    { ...vacancy("c"), status: "sent", attempts: 0 },
  ];

  assert.deepEqual(
    trimSeen(records, 1).map((record) => record.id),
    ["b", "c"],
  );
});
