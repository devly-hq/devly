import { describe, expect, it } from "vitest";
import {
  dedupeTopics,
  isTeachableCandidate,
  jaccard,
  rankAndSelect,
  scoreTopic,
  tokenize,
  toDailyFeedTopic,
  type DiscoveredTopic,
} from "@devly/core";

const sample = (over: Partial<DiscoveredTopic> = {}): DiscoveredTopic => ({
  id: "t1",
  title: "Build a local MCP server in Python",
  description: "Hands-on tutorial for MCP tools",
  sourceUrl: "https://github.com/example/mcp-server",
  category: "ai-engineering",
  tags: ["MCP", "Python"],
  discoveredAt: new Date().toISOString(),
  popularity: 70,
  suggestedDifficulty: "intermediate",
  learningObjectives: ["Expose a tool", "Connect a client", "Write a test"],
  source: "github",
  excerpt: "tutorial getting started MCP",
  ...over,
});

describe("discovery scoring", () => {
  it("tokenizes and computes jaccard", () => {
    expect(jaccard(tokenize("docker compose postgres"), tokenize("docker compose redis"))).toBeGreaterThan(0.3);
    expect(jaccard(tokenize("rag basics"), tokenize("kubernetes ingress"))).toBeLessThan(0.2);
  });

  it("scores learnable MCP topics highly and uniquely vs seed", () => {
    const scored = scoreTopic(sample(), {
      knownTitles: ["Learn Docker by containerizing an API", "RAG basics"],
      knownTags: ["Docker", "RAG"],
    });
    expect(scored.scores.learnability).toBeGreaterThan(50);
    expect(scored.scores.uniqueness).toBeGreaterThan(45);
    expect(scored.scores.total).toBeGreaterThan(55);
  });

  it("penalizes near-duplicate seed titles", () => {
    const scored = scoreTopic(
      sample({ title: "Learn Docker by containerizing an API" }),
      {
        knownTitles: ["Learn Docker by containerizing an API"],
        knownTags: ["Docker"],
      },
    );
    expect(scored.scores.uniqueness).toBeLessThan(45);
  });

  it("rejects hiring noise via learnability", () => {
    const scored = scoreTopic(
      sample({
        title: "Ask HN: Who is hiring?",
        description: "hiring remote jobs salary",
        sourceUrl: "https://news.ycombinator.com/item?id=1",
        source: "hackernews",
      }),
      { knownTitles: [], knownTags: [] },
    );
    expect(scored.scores.learnability).toBeLessThan(30);
  });

  it("rankAndSelect keeps unique diverse topics", () => {
    const picked = rankAndSelect(
      [
        sample({ id: "a", title: "Local MCP server workshop", category: "ai-engineering" }),
        sample({
          id: "b",
          title: "Docker Compose observability stack tutorial",
          category: "devops",
          sourceUrl: "https://github.com/example/obs",
          tags: ["Docker"],
          excerpt: "hands-on docker compose guide",
        }),
        sample({
          id: "c",
          title: "Learn Docker by containerizing an API",
          category: "devops",
          sourceUrl: "https://example.com/docker",
        }),
        sample({
          id: "d",
          title: "solid-glass",
          description: "cool thing",
          tags: [],
          sourceUrl: "https://github.com/example/solid-glass",
        }),
      ],
      {
        knownTitles: ["Learn Docker by containerizing an API"],
        knownTags: ["Docker"],
      },
      5,
    );
    expect(picked.find((p) => p.title.includes("containerizing"))).toBeUndefined();
    expect(picked.find((p) => p.id === "d")).toBeUndefined();
    expect(picked.length).toBeGreaterThanOrEqual(1);
  });

  it("rejects opaque non-teachable names", () => {
    expect(
      isTeachableCandidate(
        sample({ title: "solid-glass", description: "misc", tags: [], excerpt: "" }),
      ),
    ).toBe(false);
    expect(isTeachableCandidate(sample())).toBe(true);
  });

  it("dedupes by title+url", () => {
    const a = sample({ id: "1" });
    const b = sample({ id: "2" });
    expect(dedupeTopics([a, b])).toHaveLength(1);
  });

  it("normalizes to daily feed topic", () => {
    const scored = scoreTopic(sample(), { knownTitles: [], knownTags: [] });
    const daily = toDailyFeedTopic(scored);
    expect(daily.evergreen).toBe(false);
    expect(daily.sourceUrl).toMatch(/^https:/);
    expect(daily.learningObjectives.length).toBeGreaterThan(0);
    expect(daily.scores.total).toBeGreaterThan(0);
  });
});
