import * as vscode from "vscode";
import {
  fetchLiveDiscoveries,
  type DailyFeed,
  type DailyFeedTopic,
  type TopicRecord,
} from "@devly/core";

const CACHE_KEY = "devly.dailyFeed.cache";
const FETCHED_AT_KEY = "devly.dailyFeed.fetchedAt";

export function dailyTopicToRecord(t: DailyFeedTopic): TopicRecord {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    category: t.category,
    tags: t.tags,
    difficulty: t.difficulty,
    estimatedMinutes: t.estimatedMinutes,
    languages: t.languages,
    requiredTechnologies: t.requiredTechnologies,
    learningObjectives: t.learningObjectives,
    projectRequirements: t.projectRequirements,
    verificationCriteria: t.verificationCriteria,
    evergreen: false,
    popularity: t.popularity,
    environmentProfile: t.environmentProfile,
    requiredServices: t.requiredServices,
  };
}

export class DiscoveryFeedService {
  private feed: DailyFeed | undefined;
  private lastFetchMs = 0;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly secrets: vscode.Memento,
  ) {}

  getCachedFeed(): DailyFeed | undefined {
    return this.feed;
  }

  getLiveTopics(): TopicRecord[] {
    return (this.feed?.topics ?? []).map(dailyTopicToRecord);
  }

  /** Load bundled daily.json if present (from CI discovery job). */
  async loadBundled(): Promise<DailyFeed | undefined> {
    try {
      const uri = vscode.Uri.joinPath(this.extensionUri, "content", "daily", "daily.json");
      const buf = await vscode.workspace.fs.readFile(uri);
      const parsed = JSON.parse(Buffer.from(buf).toString("utf8")) as DailyFeed;
      if (parsed?.schemaVersion === 1 && Array.isArray(parsed.topics)) {
        if (!this.feed) this.feed = parsed;
        return this.feed;
      }
    } catch {
      /* optional */
    }
    return undefined;
  }

  /** Restore last successful remote/live feed from workspace state. */
  restoreFromState(): void {
    const raw = this.secrets.get<DailyFeed>(CACHE_KEY);
    if (raw?.schemaVersion === 1 && Array.isArray(raw.topics)) {
      this.feed = raw;
    }
    this.lastFetchMs = this.secrets.get<number>(FETCHED_AT_KEY) ?? 0;
  }

  /**
   * Refresh discovery:
   * 1) optional remote dailyFeedUrl (Firecrawl-enriched from our backend/CI)
   * 2) else live public APIs (HN / GitHub / arXiv / Dev.to / Firecrawl when the key is loaded)
   */
  async refresh(opts: {
    seedTitles: string[];
    seedTags: string[];
    enabled: boolean;
    force?: boolean;
  }): Promise<{ feed?: DailyFeed; mode: "remote" | "live" | "bundled" | "cached" | "off" }> {
    if (!opts.enabled) {
      return { feed: this.feed, mode: "off" };
    }

    const now = Date.now();
    const stillToday = sameLocalDay(this.lastFetchMs, now);
    if (!opts.force && stillToday && this.feed && now - this.lastFetchMs < 30 * 60_000) {
      return { feed: this.feed, mode: "cached" };
    }

    const remoteUrl = vscode.workspace
      .getConfiguration("devly")
      .get<string>("dailyFeedUrl", "")
      .trim();

    if (remoteUrl.startsWith("https://")) {
      try {
        const res = await fetch(remoteUrl, { headers: { Accept: "application/json" } });
        if (res.ok) {
          const parsed = (await res.json()) as DailyFeed;
          if (parsed?.schemaVersion === 1 && Array.isArray(parsed.topics)) {
            this.feed = parsed;
            this.lastFetchMs = now;
            await this.secrets.update(CACHE_KEY, parsed);
            await this.secrets.update(FETCHED_AT_KEY, now);
            return { feed: parsed, mode: "remote" };
          }
        }
      } catch {
        /* fall through */
      }
    }

    try {
      const feed = await fetchLiveDiscoveries({
        seedTitles: opts.seedTitles,
        seedTags: opts.seedTags,
        limit: 10,
        githubToken: process.env.GITHUB_TOKEN,
      });
      if (feed.topics.length > 0) {
        this.feed = feed;
        this.lastFetchMs = now;
        await this.secrets.update(CACHE_KEY, feed);
        await this.secrets.update(FETCHED_AT_KEY, now);
        return { feed, mode: "live" };
      }
    } catch {
      /* fall through */
    }

    if (this.feed) return { feed: this.feed, mode: "cached" };
    const bundled = await this.loadBundled();
    if (bundled) return { feed: bundled, mode: "bundled" };
    return { feed: undefined, mode: "cached" };
  }
}

function sameLocalDay(thenMs: number, nowMs: number): boolean {
  if (!thenMs) return false;
  const then = new Date(thenMs);
  const now = new Date(nowMs);
  return then.getFullYear() === now.getFullYear() && then.getMonth() === now.getMonth() && then.getDate() === now.getDate();
}
