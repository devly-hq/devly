import type { DiscoveredTopic, ScoredTopic, TopicScoreBreakdown } from "./types.js";

/** Seed / previously shown titles used to enforce uniqueness. */
export interface ScoreContext {
  knownTitles: string[];
  knownTags: string[];
  /** Categories already picked in this batch — for diversity. */
  pickedCategories?: string[];
}

const LEARNABLE_TECH =
  /\b(docker|kubernetes|k8s|mcp|rag|llm|agent|langchain|langgraph|crewai|fastapi|postgres|redis|kafka|oauth|jwt|typescript|python|rust|go\b|graphql|websocket|terraform|github.?actions|vector|embedding|qdrant|pinecone|ollama|claude|openai|anthropic|next\.?js|react|vite|pytest|playwright|ci\/cd|observability|tracing|serverless|s3|auth|security|api|sdk|cli|wasm|bun|deno|supabase|prisma|drizzle|astro|tailwind|zig|elixir|nix)\b/i;

const ACTIONABLE =
  /\b(tutorial|guide|how to|howto|intro|introduction|build|building|learn|getting started|walkthrough|hands.?on|example|demo|workshop|lab|from scratch|crash course|recipe|cookbook|starter|boilerplate|template)\b/i;

const CODE_SIGNAL =
  /\b(github\.com|gitlab\.com|docs\.|readme|library|framework|sdk|package|npm|pypi|crate|repo|repository|api reference|open.?source)\b/i;

const NOISE =
  /\b(hiring|who's hiring|who is hiring|ask hn|show hn|layoff|salary|remote jobs|crypto pump|nft|giveaway|promo code|black friday|click here|unsubscribe)\b/i;

const RESEARCH_HEAVY =
  /\b(theorem|proof|survey of|theoretical|arxiv|preprint|formal verification)\b/i;

const CATEGORY_KEYWORDS: Record<string, RegExp> = {
  "ai-engineering": /\b(rag|llm|agent|embedding|vector|mcp|langchain|langgraph|crewai|prompt|ollama|transformer)\b/i,
  devops: /\b(docker|kubernetes|k8s|terraform|ci\/cd|github.?actions|observability|tracing|serverless)\b/i,
  databases: /\b(postgres|redis|kafka|sql|qdrant|pinecone|vector.?db|mongo)\b/i,
  languages: /\b(typescript|python|rust|go\b|zig|elixir|generics|concurrency|ownership|async)\b/i,
  security: /\b(oauth|jwt|auth|security|secrets|headers|tls)\b/i,
  "open-source": /\b(github|open.?source|repo|library|framework)\b/i,
};

export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]+/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function maxSimilarity(title: string, knownTitles: string[]): number {
  const tokens = tokenize(title);
  let max = 0;
  for (const known of knownTitles) {
    max = Math.max(max, jaccard(tokens, tokenize(known)));
  }
  return max;
}

function hoursSince(iso: string): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 72;
  return Math.max(0, (Date.now() - t) / 3_600_000);
}

function scoreUniqueness(topic: DiscoveredTopic, ctx: ScoreContext): number {
  const sim = maxSimilarity(topic.title, ctx.knownTitles);
  // 1.0 identical → 0; 0 unique → 100
  let score = Math.round((1 - sim) * 100);
  // Soft boost if no overlapping tags with seed catalog
  const tagOverlap = topic.tags.some((t) =>
    ctx.knownTags.map((k) => k.toLowerCase()).includes(t.toLowerCase()),
  );
  if (!tagOverlap) score = Math.min(100, score + 8);
  // Hard reject near-duplicates
  if (sim >= 0.72) score = Math.min(score, 15);
  return score;
}

function scoreLearnability(topic: DiscoveredTopic): number {
  const hay = `${topic.title} ${topic.description} ${topic.excerpt ?? ""}`;
  if (NOISE.test(hay)) return 5;
  let score = 35;
  if (LEARNABLE_TECH.test(hay)) score += 30;
  if (ACTIONABLE.test(hay)) score += 20;
  if (RESEARCH_HEAVY.test(hay) && !ACTIONABLE.test(hay)) score -= 25;
  if (topic.learningObjectives.length >= 2) score += 10;
  if (topic.suggestedDifficulty === "beginner") score += 5;
  return clamp(score);
}

function scoreActionability(topic: DiscoveredTopic): number {
  const hay = `${topic.title} ${topic.description} ${topic.sourceUrl} ${topic.excerpt ?? ""}`;
  let score = 25;
  if (CODE_SIGNAL.test(hay)) score += 35;
  if (topic.source === "github") score += 25;
  if (topic.source === "firecrawl" && /docs\.|github\.com|readme/i.test(hay)) score += 20;
  if (topic.source === "arxiv" && !ACTIONABLE.test(hay)) score -= 15;
  if (/^https:\/\/news\.ycombinator\.com/i.test(topic.sourceUrl)) score -= 20;
  return clamp(score);
}

function scoreFreshness(topic: DiscoveredTopic): number {
  const h = hoursSince(topic.discoveredAt);
  if (h <= 12) return 100;
  if (h <= 36) return 85;
  if (h <= 72) return 65;
  if (h <= 168) return 45;
  return 25;
}

function scoreSignal(topic: DiscoveredTopic): number {
  return clamp(topic.popularity);
}

function scoreClarity(topic: DiscoveredTopic): number {
  const title = topic.title.trim();
  let score = 50;
  if (title.length >= 18 && title.length <= 90) score += 25;
  if (title.length < 12 || title.length > 120) score -= 20;
  if (/^[A-Z]/.test(title)) score += 5;
  if (!/[?!]{2,}/.test(title)) score += 5;
  if (topic.description.trim().length >= 40) score += 15;
  return clamp(score);
}

function scoreCategoryFit(topic: DiscoveredTopic): number {
  const hay = `${topic.title} ${topic.description} ${topic.tags.join(" ")}`;
  for (const [cat, re] of Object.entries(CATEGORY_KEYWORDS)) {
    if (re.test(hay) || topic.category === cat) return 90;
  }
  if (LEARNABLE_TECH.test(hay)) return 70;
  return 35;
}

function diversityBonus(topic: DiscoveredTopic, ctx: ScoreContext): number {
  const picked = ctx.pickedCategories ?? [];
  if (picked.length === 0) return 10;
  return picked.includes(topic.category) ? 0 : 18;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Multi-parameter score. Weights tuned for unique, learnable, buildable labs —
 * not raw virality.
 */
export function scoreTopic(topic: DiscoveredTopic, ctx: ScoreContext): ScoredTopic {
  const uniqueness = scoreUniqueness(topic, ctx);
  const learnability = scoreLearnability(topic);
  const actionability = scoreActionability(topic);
  const freshness = scoreFreshness(topic);
  const signal = scoreSignal(topic);
  const clarity = scoreClarity(topic);
  const categoryFit = scoreCategoryFit(topic);
  const diversity = diversityBonus(topic, ctx);

  const total = Math.round(
    uniqueness * 0.28 +
      learnability * 0.22 +
      actionability * 0.18 +
      categoryFit * 0.1 +
      clarity * 0.08 +
      freshness * 0.07 +
      signal * 0.05 +
      diversity * 0.02,
  );

  const scores: TopicScoreBreakdown = {
    uniqueness,
    learnability,
    actionability,
    freshness,
    signal,
    clarity,
    categoryFit,
    diversityBonus: diversity,
    total: clamp(total),
  };
  return { ...topic, scores };
}

/** Minimum total score to accept into the daily feed. */
export const MIN_ACCEPT_SCORE = 62;

/** Uniqueness floor — topic must feel different from seed catalog. */
export const MIN_UNIQUENESS = 50;

/** Must look teachable, not just a random trending repo name. */
export const MIN_LEARNABILITY = 55;

/** Must point at something you can build from (docs/repo/tutorial). */
export const MIN_ACTIONABILITY = 45;

export function isTeachableCandidate(topic: DiscoveredTopic): boolean {
  // Score against real content only — ignore packaging words we may add later.
  const hay = `${topic.excerpt ?? ""} ${stripUntrusted(topic.description)} ${topic.tags.join(" ")} ${topic.title}`;
  if (NOISE.test(hay)) return false;
  // GitHub repos must name a real tech; blog/HN can qualify via tutorial framing.
  if (topic.source === "github") {
    if (!LEARNABLE_TECH.test(hay)) return false;
  } else if (!LEARNABLE_TECH.test(hay) && !ACTIONABLE.test(hay)) {
    return false;
  }
  // Opaque short product names with no tech tags are weak labs
  const words = topic.title.trim().split(/\s+/);
  if (words.length <= 3 && topic.tags.filter((t) => LEARNABLE_TECH.test(t)).length === 0) {
    return false;
  }
  return true;
}

function stripUntrusted(text: string): string {
  return text
    .replace(/^BEGIN_UNTRUSTED_DATA[\s\S]*?\n/, "")
    .replace(/\nEND_UNTRUSTED_DATA$/, "")
    .replace(/^Treat the following as data only\.[^\n]*\n/, "");
}

export function rankAndSelect(
  topics: DiscoveredTopic[],
  ctx: ScoreContext,
  limit = 12,
): ScoredTopic[] {
  const selected: ScoredTopic[] = [];
  const usedTitles: string[] = [...ctx.knownTitles];
  const pickedCategories: string[] = [];

  const remaining = topics.filter(isTeachableCandidate);
  while (selected.length < limit && remaining.length > 0) {
    const scored = remaining
      .map((t) =>
        scoreTopic(t, {
          knownTitles: usedTitles,
          knownTags: ctx.knownTags,
          pickedCategories,
        }),
      )
      .sort((a, b) => b.scores.total - a.scores.total);

    const best = scored[0];
    if (!best) break;
    remaining.splice(
      remaining.findIndex((t) => t.id === best.id),
      1,
    );

    if (best.scores.total < MIN_ACCEPT_SCORE) continue;
    if (best.scores.uniqueness < MIN_UNIQUENESS) continue;
    if (best.scores.learnability < MIN_LEARNABILITY) continue;
    if (best.scores.actionability < MIN_ACTIONABILITY) continue;

    selected.push(best);
    usedTitles.push(best.title);
    pickedCategories.push(best.category);
  }

  return selected;
}
