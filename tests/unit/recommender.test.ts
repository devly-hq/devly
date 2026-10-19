import { describe, expect, it } from "vitest";
import { recommendTopics, searchTopics } from "@devly/core";

const topics = [
  {
    id: "docker-fundamentals",
    title: "Docker",
    description: "containers",
    category: "devops",
    tags: ["Docker"],
    difficulty: "beginner" as const,
    estimatedMinutes: 10,
    languages: ["python"],
    requiredTechnologies: ["Docker"],
    learningObjectives: [],
    evergreen: true,
    popularity: 90,
  },
  {
    id: "rag-basics",
    title: "RAG",
    description: "retrieval",
    category: "ai-engineering",
    tags: ["RAG"],
    difficulty: "intermediate" as const,
    estimatedMinutes: 15,
    languages: ["python"],
    requiredTechnologies: [],
    learningObjectives: [],
    evergreen: true,
    popularity: 95,
  },
  {
    id: "trending-repo-tour",
    title: "Trending repo",
    description: "oss",
    category: "open-source",
    tags: ["github"],
    difficulty: "beginner" as const,
    estimatedMinutes: 15,
    languages: ["python"],
    requiredTechnologies: [],
    learningObjectives: [],
    evergreen: false,
    popularity: 55,
  },
];

describe("recommendTopics", () => {
  it("returns up to 3 picks and is stable for a date seed", () => {
    const input = {
      topics,
      interests: ["ai-engineering", "devops"],
      experienceLevel: "beginner" as const,
      preferredLanguages: ["python"],
      completedTopicIds: [],
      savedTopicIds: [],
      hiddenTopicIds: [],
      knownTopicIds: [],
      recentlyShownIds: [],
      dateSeed: "2026-10-13",
      count: 3,
    };
    const a = recommendTopics(input);
    const b = recommendTopics(input);
    expect(a).toHaveLength(3);
    expect(a.map((t) => t.id)).toEqual(b.map((t) => t.id));
  });

  it("excludes hidden and known topics", () => {
    const picks = recommendTopics({
      topics,
      interests: ["devops"],
      experienceLevel: "beginner",
      preferredLanguages: ["python"],
      completedTopicIds: [],
      savedTopicIds: [],
      hiddenTopicIds: ["docker-fundamentals"],
      knownTopicIds: ["rag-basics"],
      recentlyShownIds: [],
      dateSeed: "2026-10-13",
    });
    expect(picks.find((p) => p.id === "docker-fundamentals")).toBeUndefined();
    expect(picks.find((p) => p.id === "rag-basics")).toBeUndefined();
  });

  it("rotate hard-skips recently shown and changes with seed", () => {
    const base = {
      topics,
      interests: ["ai-engineering", "devops"],
      experienceLevel: "beginner" as const,
      preferredLanguages: ["python"],
      completedTopicIds: [],
      savedTopicIds: [],
      hiddenTopicIds: [],
      knownTopicIds: [],
      count: 2,
    };
    const first = recommendTopics({
      ...base,
      recentlyShownIds: [],
      dateSeed: "2026-10-13:r1",
      rotate: true,
    });
    const second = recommendTopics({
      ...base,
      recentlyShownIds: first.map((t) => t.id),
      dateSeed: "2026-10-13:r2",
      rotate: true,
    });
    expect(first).toHaveLength(2);
    expect(second.every((t) => !first.some((f) => f.id === t.id))).toBe(true);
  });
});

describe("searchTopics", () => {
  it("filters by query", () => {
    expect(searchTopics(topics, "rag")).toHaveLength(1);
    expect(searchTopics(topics, "nope")).toHaveLength(0);
  });
});
