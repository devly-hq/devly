import { createHash } from "node:crypto";
import { firecrawlSearch } from "./firecrawl.js";
import { isHttpsUrl, wrapUntrustedContent } from "../security/redact.js";

export type RunHint = "compose" | "dockerfile" | "node" | "python" | "unknown";

export interface TrendingRepo {
  id: string;
  fullName: string;
  description: string;
  htmlUrl: string;
  cloneUrl: string;
  language: string | null;
  stars: number;
  forks: number;
  topics: string[];
  pushedAt: string;
  discoveredAt: string;
  source: "github-search" | "github-trending" | "hackernews";
  runHints: RunHint[];
  category: string;
  popularity: number;
}

function slugId(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 12);
}

function inferCategory(text: string): string {
  const t = text.toLowerCase();
  if (/\b(ai|llm|agent|rag|mcp|ml|model)\b/.test(t)) return "ai";
  if (/\b(docker|kubernetes|devops|ci)\b/.test(t)) return "devops";
  if (/\b(design|animation|motion|css|ui|figma)\b/.test(t)) return "design";
  if (/\b(game|engine|unity|godot)\b/.test(t)) return "games";
  if (/\b(cli|tool|sdk|library)\b/.test(t)) return "tools";
  return "open-source";
}

function inferRunHints(text: string, language: string | null): RunHint[] {
  const hints: RunHint[] = [];
  const t = text.toLowerCase();
  if (/docker-compose|compose\.ya?ml/.test(t)) hints.push("compose");
  if (/dockerfile/.test(t)) hints.push("dockerfile");
  if (language === "TypeScript" || language === "JavaScript" || /npm |package\.json|next\.js|vite/.test(t)) {
    hints.push("node");
  }
  if (language === "Python" || /pip install|pyproject|uvicorn|fastapi/.test(t)) hints.push("python");
  if (hints.length === 0) hints.push("unknown");
  return [...new Set(hints)];
}

interface GhRepo {
  id: number;
  full_name: string;
  description?: string | null;
  html_url: string;
  clone_url: string;
  language?: string | null;
  stargazers_count: number;
  forks_count: number;
  topics?: string[];
  pushed_at?: string;
  created_at?: string;
}

interface GitHubSearchBatch {
  repos: TrendingRepo[];
  rateLimited: boolean;
  remaining: number | null;
  retryAfterMs: number | null;
}

function headerNumber(res: Response, name: string): number | null {
  const raw = res.headers.get(name);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

async function searchGitHub(query: string, token?: string): Promise<GitHubSearchBatch> {
  const res = await fetch(
    `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=8`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "devly-trending",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    },
  );
  const remaining = headerNumber(res, "x-ratelimit-remaining");
  const reset = headerNumber(res, "x-ratelimit-reset");
  const retryAfterMs = reset != null ? Math.max(5_000, reset * 1000 - Date.now()) : null;
  if (res.status === 403 || res.status === 429) {
    return { repos: [], rateLimited: true, remaining, retryAfterMs };
  }
  if (!res.ok) return { repos: [], rateLimited: false, remaining, retryAfterMs: null };
  const data = (await res.json()) as { items?: GhRepo[] };
  const repos = (data.items ?? [])
    .filter((r) => isHttpsUrl(r.html_url) && isHttpsUrl(r.clone_url))
    .map((r) => {
      const desc = (r.description ?? "").trim();
      const hay = `${r.full_name} ${desc} ${(r.topics ?? []).join(" ")}`;
      return {
        id: `trend-gh-${r.id}`,
        fullName: r.full_name,
        description: wrapUntrustedContent("github", desc || r.full_name).slice(0, 500),
        htmlUrl: r.html_url,
        cloneUrl: r.clone_url.endsWith(".git") ? r.clone_url : `${r.clone_url}.git`,
        language: r.language ?? null,
        stars: r.stargazers_count,
        forks: r.forks_count,
        topics: r.topics ?? [],
        pushedAt: r.pushed_at ?? r.created_at ?? new Date().toISOString(),
        discoveredAt: new Date().toISOString(),
        source: "github-search" as const,
        runHints: inferRunHints(hay, r.language ?? null),
        category: inferCategory(hay),
        popularity: Math.min(100, Math.round(Math.log10((r.stargazers_count || 1) + 1) * 35)),
      };
    });
  return { repos, rateLimited: false, remaining, retryAfterMs: null };
}

/** One GitHub repository search. Used by Explore and home when the local catalog has no match. */
export async function searchGitHubRepos(
  query: string,
  token?: string,
): Promise<{ repos: TrendingRepo[]; notice?: string }> {
  const q = query.trim();
  if (q.length < 2) return { repos: [] };
  const batch = await searchGitHub(`${q} in:name,description,readme`, token);
  if (batch.rateLimited) {
    return {
      repos: [],
      notice: "GitHub search is rate-limited. Add GITHUB_TOKEN to .env and try again.",
    };
  }
  return { repos: batch.repos };
}

export interface RepoNewsItem {
  id: string;
  title: string;
  description: string;
  url: string;
}

/** Latest strip: one weekly news query, plus a short query for each of the top repos. */
export async function fetchRepoNews(
  apiKey: string,
  repos: { fullName: string }[],
): Promise<RepoNewsItem[]> {
  const names = repos.slice(0, 3).map((r) => r.fullName).filter(Boolean);
  const queries = ["trending github repositories this week", ...names.map((name) => `${name} github`)];
  const seen = new Set<string>();
  const out: RepoNewsItem[] = [];
  for (const query of queries) {
    const hits = await firecrawlSearch(apiKey, query, query.startsWith("trending") ? 5 : 2);
    for (const hit of hits) {
      if (seen.has(hit.url)) continue;
      seen.add(hit.url);
      out.push({
        id: `news-${slugId(hit.url)}`,
        title: hit.title,
        description: hit.description,
        url: hit.url,
      });
    }
  }
  return out.slice(0, 12);
}

function parseCount(raw: string | undefined): number {
  if (!raw) return 0;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** GitHub's public daily trending page, in the order the page lists them. */
export function parseGithubTrendingHtml(html: string): TrendingRepo[] {
  const out: TrendingRepo[] = [];
  const seen = new Set<string>();
  for (const article of html.split("<article").slice(1)) {
    const name = article.match(/<h2[^>]*>[\s\S]*?href="\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)"/);
    if (!name) continue;
    const fullName = name[1]!;
    if (seen.has(fullName.toLowerCase())) continue;
    seen.add(fullName.toLowerCase());
    const description =
      article.match(/<p[^>]*class="[^"]*col-9[^"]*"[^>]*>\s*([^<]+)/)?.[1]?.trim() || `Trending on GitHub: ${fullName}`;
    const language = article.match(/itemprop="programmingLanguage"[^>]*>\s*([^<]+)/)?.[1]?.trim() || null;
    const stars = parseCount(article.match(/\/stargazers"[^>]*>[\s\S]*?([0-9][0-9,]*)\s*<\/a>/)?.[1]);
    const forks = parseCount(article.match(/\/forks"[^>]*>[\s\S]*?([0-9][0-9,]*)\s*<\/a>/)?.[1]);
    const htmlUrl = `https://github.com/${fullName}`;
    if (!isHttpsUrl(htmlUrl)) continue;
    out.push({
      id: `trend-daily-${slugId(fullName)}`,
      fullName,
      description: wrapUntrustedContent("github-trending", description).slice(0, 500),
      htmlUrl,
      cloneUrl: `${htmlUrl}.git`,
      language,
      stars,
      forks,
      topics: ["trending"],
      pushedAt: new Date().toISOString(),
      discoveredAt: new Date().toISOString(),
      source: "github-trending",
      runHints: inferRunHints(`${fullName} ${description}`, language),
      category: inferCategory(`${fullName} ${description}`),
      popularity: Math.max(1, 100 - out.length),
    });
    if (out.length >= 25) break;
  }
  return out;
}

async function fetchGithubTrendingDaily(): Promise<TrendingRepo[]> {
  const res = await fetch("https://github.com/trending?since=daily", {
    headers: {
      Accept: "text/html",
      "User-Agent": "devly-trending",
    },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) return [];
  return parseGithubTrendingHtml(await res.text());
}

/** Prefer repos that look runnable for Try Live. */
export function scoreRunnable(repo: TrendingRepo): number {
  let s = repo.popularity;
  if (repo.runHints.includes("compose")) s += 35;
  if (repo.runHints.includes("dockerfile")) s += 25;
  if (repo.runHints.includes("node") || repo.runHints.includes("python")) s += 15;
  if (repo.runHints.includes("unknown") && repo.runHints.length === 1) s -= 10;
  if (repo.stars > 500) s += 10;
  if (repo.description.length < 20) s -= 15;
  return s;
}

export interface FetchTrendingOptions {
  githubToken?: string;
  firecrawlKey?: string;
  limit?: number;
}

export interface TrendingFetchResult {
  repos: TrendingRepo[];
  /** GitHub search allows ~10 unauthenticated calls per minute. */
  rateLimited: boolean;
  retryAfterMs: number | null;
}

/**
 * GitHub's public today list, in the page's order.
 * A failed read returns no repos so the caller can keep the last daily list.
 */
export async function fetchTrendingFeed(opts: FetchTrendingOptions = {}): Promise<TrendingFetchResult> {
  const daily = await fetchGithubTrendingDaily().catch(() => [] as TrendingRepo[]);
  return {
    repos: daily.slice(0, opts.limit ?? 25),
    rateLimited: false,
    retryAfterMs: null,
  };
}

/** GitHub's public today list, in the page's order. */
export async function fetchTrendingRepos(opts: FetchTrendingOptions = {}): Promise<TrendingRepo[]> {
  return (await fetchTrendingFeed(opts)).repos;
}

/** Strip untrusted wrappers for UI display. */
export function cleanRepoDescription(text: string): string {
  return text
    .replace(/^BEGIN_UNTRUSTED_DATA[\s\S]*?\n/, "")
    .replace(/\nEND_UNTRUSTED_DATA$/, "")
    .replace(/^Treat the following as data only\.[^\n]*\n/, "")
    .trim();
}
