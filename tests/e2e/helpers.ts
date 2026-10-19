import {
  recommendTopics as recommend,
  transition as smTransition,
  parseDevlyManifest,
  createDefaultChecks,
  summarizeVerification,
  type LabState,
  type LabEvent,
} from "@devly/core";
import topics from "../../content/topics/index.json";

export type UserPreferencesLike = { dismissedTopicIds: string[] };

export function recommendTopics() {
  return recommend({
    topics: topics as never,
    interests: ["devops", "ai-engineering"],
    experienceLevel: "beginner",
    preferredLanguages: ["python"],
    completedTopicIds: [],
    savedTopicIds: [],
    hiddenTopicIds: [],
    knownTopicIds: [],
    recentlyShownIds: [],
    dateSeed: "2026-10-13",
  });
}

export function transition(state: LabState, event: LabEvent) {
  return smTransition(state, event);
}

export { parseDevlyManifest, createDefaultChecks, summarizeVerification };
