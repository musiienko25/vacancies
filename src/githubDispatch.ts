import type { Env } from "./types";

export async function dispatchGithubIngest(env: Env): Promise<void> {
  if (!env.GITHUB_DISPATCH_TOKEN) {
    throw new Error("GITHUB_DISPATCH_TOKEN is not set");
  }

  const repo = env.GITHUB_REPO || "musiienko25/vacancies";
  const workflow = env.GITHUB_WORKFLOW || "fetch-dou.yml";
  const url = `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "dou-vacancy-tracker",
    },
    body: JSON.stringify({ ref: "main" }),
  });

  if (response.status !== 204) {
    const body = await response.text();
    throw new Error(`GitHub workflow_dispatch failed: ${response.status} ${body}`);
  }

  console.log(`GitHub workflow ${workflow} dispatched`);
}
