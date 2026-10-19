import * as vscode from "vscode";
import {
  cleanRepoDescription,
  fetchTrendingFeed,
  type TrendingRepo as CoreRepo,
} from "@devly/core";
import type { TrendingRepo } from "@devly/protocol";

const CACHE_KEY = "devly.trendingRepos.daily.cache";
const FETCHED_AT_KEY = "devly.trendingRepos.daily.fetchedAt";
/** Re-read GitHub's today page on this interval while Devly is open. */
const REFRESH_MS = 15 * 60_000;

function toProtocol(r: CoreRepo): TrendingRepo {
  return {
    id: r.id,
    fullName: r.fullName,
    description: cleanRepoDescription(r.description),
    htmlUrl: r.htmlUrl,
    cloneUrl: r.cloneUrl,
    language: r.language,
    stars: r.stars,
    forks: r.forks,
    topics: r.topics,
    category: r.category,
    popularity: r.popularity,
    runHints: r.runHints,
    source: r.source,
    pushedAt: r.pushedAt,
  };
}

export interface TrendingRefreshResult {
  repos: TrendingRepo[];
  notice?: string;
}

export class TrendingService {
  private repos: TrendingRepo[] = [];
  private lastFetchMs = 0;
  private pending: Promise<TrendingRefreshResult> | null = null;

  constructor(private readonly globalState: vscode.Memento) {
    const cached = this.globalState.get<TrendingRepo[]>(CACHE_KEY);
    if (Array.isArray(cached)) this.repos = cached.filter((repo) => repo.source === "github-trending");
    this.lastFetchMs = this.globalState.get<number>(FETCHED_AT_KEY) ?? 0;
  }

  getRepos(): TrendingRepo[] {
    return this.repos;
  }

  getRepo(id: string): TrendingRepo | undefined {
    return this.repos.find((r) => r.id === id);
  }

  /** Pull GitHub's today page again while Devly stays open, including after midnight. */
  watch(onUpdate: (result: TrendingRefreshResult) => void): vscode.Disposable {
    const timer = setInterval(() => {
      void this.refresh().then(onUpdate);
    }, REFRESH_MS);
    return { dispose: () => clearInterval(timer) };
  }

  async refresh(force = false): Promise<TrendingRefreshResult> {
    if (this.pending) return this.pending;
    this.pending = this.refreshInner(force).finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  private async refreshInner(force: boolean): Promise<TrendingRefreshResult> {
    const now = Date.now();
    const stillToday = sameLocalDay(this.lastFetchMs, now);
    if (!force && stillToday && this.repos.length > 0 && now - this.lastFetchMs < REFRESH_MS) {
      return { repos: this.repos };
    }
    const fetched = await fetchTrendingFeed({ limit: 25 });
    if (fetched.repos.length === 0) {
      const notice = this.repos.length
        ? "GitHub's today list did not load. Showing the last daily list."
        : "GitHub's today list did not load. Refresh in a moment.";
      return { repos: this.repos, notice };
    }
    this.repos = fetched.repos.map(toProtocol);
    this.lastFetchMs = now;
    await this.globalState.update(CACHE_KEY, this.repos);
    await this.globalState.update(FETCHED_AT_KEY, now);
    return { repos: this.repos };
  }
}

function sameLocalDay(thenMs: number, nowMs: number): boolean {
  if (!thenMs) return false;
  const then = new Date(thenMs);
  const now = new Date(nowMs);
  return then.getFullYear() === now.getFullYear() && then.getMonth() === now.getMonth() && then.getDate() === now.getDate();
}
