export interface NudgeTopic {
  id: string;
  title: string;
  description: string;
  category: string;
  estimatedMinutes: number;
  difficulty: "beginner" | "intermediate" | "advanced";
  evergreen: boolean;
}

export interface NudgeRepo {
  id: string;
  fullName: string;
  description: string;
  htmlUrl: string;
  cloneUrl: string;
  language: string | null;
}

export interface NudgeOffer {
  kind: "live" | "repo" | "task";
  id: string;
  title: string;
  subtitle: string;
  meta: string;
  topicId?: string;
  repo?: NudgeRepo;
}

/**
 * Three cards for one notification:
 * the highest-ranked live discovery, today's top GitHub repo, and one short seed lab.
 */
export function pickNudgeOffers(input: {
  liveTopics: NudgeTopic[];
  seedTopics: NudgeTopic[];
  repos: NudgeRepo[];
  dismissedTopicIds: string[];
}): NudgeOffer[] {
  const dismissed = new Set(input.dismissedTopicIds);
  const offers: NudgeOffer[] = [];

  const live = input.liveTopics.find((topic) => !dismissed.has(topic.id));
  if (live) {
    offers.push({
      kind: "live",
      id: `live:${live.id}`,
      title: live.title,
      subtitle: clip(live.description),
      meta: `${live.category} · ${live.estimatedMinutes} min`,
      topicId: live.id,
    });
  }

  const repo = input.repos[0];
  if (repo) {
    const language = repo.language ? `${repo.language} · ` : "";
    offers.push({
      kind: "repo",
      id: `repo:${repo.id}`,
      title: repo.fullName,
      subtitle: clip(repo.description) || "A repository people are using today.",
      meta: `${language}GitHub`,
      repo,
    });
  }

  const task = input.seedTopics
    .filter((topic) => topic.evergreen && topic.difficulty === "beginner" && !dismissed.has(topic.id) && topic.id !== live?.id)
    .sort((a, b) => a.estimatedMinutes - b.estimatedMinutes)[0];
  if (task) {
    offers.push({
      kind: "task",
      id: `task:${task.id}`,
      title: task.title,
      subtitle: clip(task.description),
      meta: `Practice · ${task.estimatedMinutes} min`,
      topicId: task.id,
    });
  }

  return offers;
}

function clip(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 160 ? `${clean.slice(0, 157)}…` : clean;
}
