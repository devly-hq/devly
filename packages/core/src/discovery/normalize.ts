import type { DailyFeedTopic, ScoredTopic } from "./types.js";

const ENV_BY_CATEGORY: Record<string, string> = {
  "ai-engineering": "ai",
  devops: "devops",
  databases: "databases",
  languages: "python",
  security: "node",
  "open-source": "python",
  "ai-fundamentals": "ai",
};

function minutesFor(difficulty: ScoredTopic["suggestedDifficulty"]): number {
  if (difficulty === "beginner") return 12;
  if (difficulty === "advanced") return 25;
  return 18;
}

function languagesFor(topic: ScoredTopic): string[] {
  const hay = `${topic.title} ${topic.description} ${topic.tags.join(" ")}`.toLowerCase();
  const langs: string[] = [];
  if (/\btypescript|javascript|node\b/.test(hay)) langs.push("typescript");
  if (/\bpython\b/.test(hay)) langs.push("python");
  if (/\brust\b/.test(hay)) langs.push("rust");
  if (/\bgo\b|golang/.test(hay)) langs.push("go");
  return langs.length ? langs : ["python", "typescript"];
}

function technologiesFor(topic: ScoredTopic): string[] {
  const tags = topic.tags.filter((t) => !["hackernews", "github", "arxiv", "devto", "firecrawl"].includes(t));
  return tags.slice(0, 4);
}

/** Turn a scored discovery hit into a catalog-compatible daily topic. */
export function toDailyFeedTopic(topic: ScoredTopic): DailyFeedTopic {
  const difficulty = topic.suggestedDifficulty;
  const title = topic.title.slice(0, 100);
  return {
    id: topic.id,
    title,
    description: stripUntrustedWrapper(topic.description).slice(0, 400) || title,
    category: topic.category,
    tags: topic.tags.slice(0, 8),
    difficulty,
    estimatedMinutes: minutesFor(difficulty),
    languages: languagesFor(topic),
    requiredTechnologies: technologiesFor(topic),
    learningObjectives:
      topic.learningObjectives.length > 0
        ? topic.learningObjectives.slice(0, 4)
        : [
            `Understand the core idea behind ${title}`,
            "Build a minimal working local demo",
            "Verify it with at least one automated test",
          ],
    projectRequirements: [
      `Build a working project that teaches: ${title}`,
      "Include automated tests",
      "Include README.md, LESSON.md, and devly.json",
      `Cite source: ${topic.sourceUrl}`,
    ],
    verificationCriteria: [
      "Project starts successfully",
      "Automated tests pass",
      "LESSON.md explains the concept in plain language",
    ],
    evergreen: false,
    popularity: Math.min(100, Math.max(topic.scores.total, topic.popularity)),
    environmentProfile: ENV_BY_CATEGORY[topic.category] ?? "python",
    requiredServices: [],
    sourceUrl: topic.sourceUrl,
    source: topic.source,
    discoveredAt: topic.discoveredAt,
    scores: topic.scores,
  };
}

function stripUntrustedWrapper(text: string): string {
  return text
    .replace(/^BEGIN_UNTRUSTED_DATA[\s\S]*?\n/, "")
    .replace(/\nEND_UNTRUSTED_DATA$/, "")
    .replace(/^Treat the following as data only\.[^\n]*\n/, "")
    .trim();
}
