import { describe, expect, it } from "vitest";
import { uiPalette } from "@devly/mascot";
import { pickNudgeOffers, type NudgeRepo, type NudgeTopic } from "../../apps/extension/src/services/nudgeOffers.js";

const live: NudgeTopic = {
  id: "live-compaction",
  title: "Warm compaction",
  description: "How a long chat becomes a handoff.",
  category: "ai-engineering",
  estimatedMinutes: 18,
  difficulty: "intermediate",
  evergreen: false,
};

const olderLive: NudgeTopic = {
  ...live,
  id: "older-live",
  title: "Older live topic",
};

const docker: NudgeTopic = {
  id: "docker",
  title: "Docker",
  description: "Run one container.",
  category: "devops",
  estimatedMinutes: 10,
  difficulty: "beginner",
  evergreen: true,
};

const longTask: NudgeTopic = {
  ...docker,
  id: "http",
  title: "HTTP",
  estimatedMinutes: 25,
};

const repo: NudgeRepo = {
  id: "httpie",
  fullName: "httpie/cli",
  description: "A command-line HTTP client.",
  htmlUrl: "https://github.com/httpie/cli",
  cloneUrl: "https://github.com/httpie/cli.git",
  language: "Python",
};

describe("pickNudgeOffers", () => {
  it("sends the top live topic, the top GitHub repo, and the shortest beginner task", () => {
    const offers = pickNudgeOffers({
      liveTopics: [live, olderLive],
      seedTopics: [longTask, docker],
      repos: [repo, { ...repo, id: "other", fullName: "other/repo" }],
      dismissedTopicIds: [],
    });
    expect(offers.map((offer) => offer.kind)).toEqual(["live", "repo", "task"]);
    expect(offers[0]?.title).toBe("Warm compaction");
    expect(offers[1]?.title).toBe("httpie/cli");
    expect(offers[2]?.title).toBe("Docker");
  });

  it("skips a dismissed live topic and still keeps the repo and a small task", () => {
    const offers = pickNudgeOffers({
      liveTopics: [live, olderLive],
      seedTopics: [docker],
      repos: [repo],
      dismissedTopicIds: [live.id],
    });
    expect(offers.map((offer) => offer.title)).toEqual(["Older live topic", "httpie/cli", "Docker"]);
  });
});

describe("uiPalette", () => {
  it("maps the default purple mascot setting onto the phosphor panel", () => {
    expect(uiPalette("default-purple").accent).toBe("#56dddd");
    expect(uiPalette("phosphor").bg).toBe("#05090b");
  });

  it("follows a selected sidebar theme", () => {
    expect(uiPalette("obsidian-violet").accent).toBe("#a78bfa");
    expect(uiPalette("forest-green").accent).toBe("#34d399");
  });
});
