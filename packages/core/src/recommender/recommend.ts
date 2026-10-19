export interface RecommendTopic {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  difficulty: "beginner" | "intermediate" | "advanced";
  estimatedMinutes: number;
  languages: string[];
  requiredTechnologies: string[];
  learningObjectives: string[];
  evergreen: boolean;
  popularity: number;
}

export interface RecommendInput {
  topics: RecommendTopic[];
  interests: string[];
  experienceLevel: "beginner" | "intermediate" | "advanced";
  preferredLanguages: string[];
  completedTopicIds: string[];
  savedTopicIds: string[];
  hiddenTopicIds: string[];
  knownTopicIds: string[];
  recentlyShownIds: string[];
  dateSeed: string; // YYYY-MM-DD (or date + rotation nonce)
  count?: number;
  /**
   * When true (Refresh button), hard-skip recently shown ids and shuffle with
   * the full dateSeed so each refresh yields a different set.
   */
  rotate?: boolean;
}

const LEVEL_RANK = { beginner: 0, intermediate: 1, advanced: 2 } as const;

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededShuffle<T>(items: T[], seed: string): T[] {
  const arr = [...items];
  let s = hashSeed(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

function scoreTopic(topic: RecommendTopic, input: RecommendInput): number {
  if (input.hiddenTopicIds.includes(topic.id)) return -Infinity;
  if (input.knownTopicIds.includes(topic.id)) return -Infinity;
  if (input.completedTopicIds.includes(topic.id)) return -1000;
  if (input.rotate && input.recentlyShownIds.includes(topic.id)) return -Infinity;

  let score = topic.popularity;

  if (input.interests.includes(topic.category)) score += 40;
  for (const tag of topic.tags) {
    if (input.interests.includes(tag)) score += 10;
  }

  const levelDelta = Math.abs(LEVEL_RANK[topic.difficulty] - LEVEL_RANK[input.experienceLevel]);
  score += levelDelta === 0 ? 25 : levelDelta === 1 ? 10 : -15;

  const langMatch = topic.languages.some((l) =>
    input.preferredLanguages.map((x) => x.toLowerCase()).includes(l.toLowerCase()),
  );
  if (langMatch || topic.languages.length === 0) score += 15;

  if (input.savedTopicIds.includes(topic.id)) score += 20;
  if (input.recentlyShownIds.includes(topic.id)) score -= 80;
  // Live/discovered topics are non-evergreen — prefer them when present,
  // while slot 0 in recommendTopics still pulls an easy evergreen beginner.
  if (!topic.evergreen) score += 28;

  return score;
}

/**
 * Pick daily recommendations:
 * one easy evergreen topic, one live discovery when the feed has one, then practical and surprise.
 * On rotate (Refresh), skip fixed slots and draw a fresh shuffled set excluding recent ids.
 */
export function recommendTopics(input: RecommendInput): RecommendTopic[] {
  const count = input.count ?? 3;
  const scored = input.topics
    .map((t) => ({ topic: t, score: scoreTopic(t, input) }))
    .filter((x) => x.score > -500)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    // Rotate exhausted the pool — fall back without hard recent exclude
    if (input.rotate && input.recentlyShownIds.length > 0) {
      return recommendTopics({ ...input, recentlyShownIds: [], rotate: false, dateSeed: input.dateSeed + ":wrap" });
    }
    return [];
  }

  const shuffled = seededShuffle(scored, input.dateSeed);
  const picked: RecommendTopic[] = [];
  const used = new Set<string>();

  if (input.rotate) {
    // Pure rotation: take top of shuffled eligible list — different seed ⇒ different order
    for (const item of shuffled) {
      if (picked.length >= count) break;
      if (!used.has(item.topic.id)) {
        picked.push(item.topic);
        used.add(item.topic.id);
      }
    }
    return picked.slice(0, count);
  }

  const fundamental = shuffled.find((x) => x.topic.evergreen && x.topic.difficulty === "beginner");
  if (fundamental) {
    picked.push(fundamental.topic);
    used.add(fundamental.topic.id);
  }

  const daily = shuffled.find((x) => !x.topic.evergreen && !used.has(x.topic.id));
  if (daily) {
    picked.push(daily.topic);
    used.add(daily.topic.id);
  }

  const practical = scored.find(
    (x) =>
      !used.has(x.topic.id) &&
      (input.interests.includes(x.topic.category) || x.topic.difficulty === input.experienceLevel),
  );
  if (practical) {
    picked.push(practical.topic);
    used.add(practical.topic.id);
  }

  const surprisePool = shuffled.filter((x) => !used.has(x.topic.id));
  const surprise = surprisePool[hashSeed(input.dateSeed + ":surprise") % Math.max(surprisePool.length, 1)];
  if (surprise && !used.has(surprise.topic.id)) {
    picked.push(surprise.topic);
    used.add(surprise.topic.id);
  }

  for (const item of scored) {
    if (picked.length >= count) break;
    if (!used.has(item.topic.id)) {
      picked.push(item.topic);
      used.add(item.topic.id);
    }
  }

  return picked.slice(0, count);
}

export function searchTopics(topics: RecommendTopic[], query: string): RecommendTopic[] {
  const q = query.trim().toLowerCase();
  if (!q) return topics;
  return topics
    .filter((t) => {
      const hay = [t.title, t.description, t.category, ...t.tags, ...t.languages].join(" ").toLowerCase();
      return hay.includes(q);
    })
    .slice(0, 50);
}
