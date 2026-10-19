import { createFirecrawlSourceFromEnv } from "./firecrawl.js";
import { toDailyFeedTopic } from "./normalize.js";
import { rankAndSelect } from "./score.js";
import { defaultSources, dedupeTopics } from "./sources.js";
import type { DailyFeed, DiscoveredTopic, TopicSource } from "./types.js";

export interface PipelineInput {
  /** Seed catalog titles — used for uniqueness. */
  seedTitles: string[];
  seedTags?: string[];
  /** Max topics in the daily feed. */
  limit?: number;
  /** Extra sources (e.g. Firecrawl). */
  extraSources?: TopicSource[];
  /** Include Firecrawl when FIRECRAWL_API_KEY is set (default true). */
  useFirecrawlEnv?: boolean;
  githubToken?: string;
  now?: Date;
}

export interface PipelineResult {
  feed: DailyFeed;
  candidates: DiscoveredTopic[];
}

export async function runDiscoveryPipeline(input: PipelineInput): Promise<PipelineResult> {
  const now = input.now ?? new Date();
  const sources: TopicSource[] = [
    ...defaultSources({ githubToken: input.githubToken }),
    ...(input.extraSources ?? []),
  ];

  let firecrawlUsed = false;
  if (input.useFirecrawlEnv !== false) {
    const fc = createFirecrawlSourceFromEnv();
    if (fc) {
      sources.push(fc);
      firecrawlUsed = true;
    }
  }

  const sourcesUsed: string[] = [];
  const batches = await Promise.all(
    sources.map(async (s) => {
      try {
        const items = await s.fetchTopics();
        if (items.length) sourcesUsed.push(s.id);
        return items;
      } catch (err) {
        sourcesUsed.push(`${s.id}:error`);
        console.warn(`[discovery] ${s.id} failed:`, err instanceof Error ? err.message : err);
        return [] as DiscoveredTopic[];
      }
    }),
  );

  // If we intended Firecrawl but it errored, mark unused
  if (firecrawlUsed && sourcesUsed.includes("firecrawl:error")) {
    firecrawlUsed = false;
  } else if (firecrawlUsed && !sourcesUsed.includes("firecrawl")) {
    firecrawlUsed = false;
  }

  const candidates = dedupeTopics(batches.flat());
  const selected = rankAndSelect(
    candidates,
    {
      knownTitles: input.seedTitles,
      knownTags: input.seedTags ?? [],
    },
    input.limit ?? 12,
  );

  const topics = selected.map(toDailyFeedTopic);
  const avg =
    topics.length === 0
      ? 0
      : Math.round(topics.reduce((s, t) => s + t.scores.total, 0) / topics.length);

  const notes: string[] = [];
  if (!firecrawlUsed) {
    notes.push("Firecrawl skipped (set FIRECRAWL_API_KEY to enrich with scraped tutorials).");
  } else {
    notes.push("Firecrawl enrichment included.");
  }
  if (topics.length < 3) {
    notes.push("Low yield — seed catalog should remain the offline backup.");
  }
  const uniqueAvg =
    topics.length === 0
      ? 0
      : Math.round(topics.reduce((s, t) => s + t.scores.uniqueness, 0) / topics.length);
  notes.push(`Average uniqueness ${uniqueAvg}/100 vs seed catalog.`);
  notes.push(`Average learnability ${avgScore(topics.map((t) => t.scores.learnability))}/100.`);

  const feed: DailyFeed = {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    date: now.toISOString().slice(0, 10),
    sourcesUsed: [...new Set(sourcesUsed.filter((s) => !s.endsWith(":error")))],
    firecrawlUsed,
    topics,
    quality: {
      candidateCount: candidates.length,
      acceptedCount: topics.length,
      avgTotalScore: avg,
      notes,
    },
  };

  return { feed, candidates };
}

function avgScore(nums: number[]): number {
  if (!nums.length) return 0;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

/** Fetch live discoveries for the extension. Firecrawl runs when FIRECRAWL_API_KEY is set. */
export async function fetchLiveDiscoveries(opts?: {
  seedTitles: string[];
  seedTags?: string[];
  limit?: number;
  githubToken?: string;
}): Promise<DailyFeed> {
  const { feed } = await runDiscoveryPipeline({
    seedTitles: opts?.seedTitles ?? [],
    seedTags: opts?.seedTags,
    limit: opts?.limit ?? 8,
    githubToken: opts?.githubToken,
  });
  return feed;
}
