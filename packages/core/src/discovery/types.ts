export type Difficulty = "beginner" | "intermediate" | "advanced";

export interface DiscoveredTopic {
  id: string;
  title: string;
  description: string;
  sourceUrl: string;
  category: string;
  tags: string[];
  discoveredAt: string;
  popularity: number;
  suggestedDifficulty: Difficulty;
  learningObjectives: string[];
  /** Origin adapter id: hackernews | github | arxiv | firecrawl | … */
  source: string;
  /** Raw snippet / markdown excerpt (untrusted). */
  excerpt?: string;
}

export interface TopicScoreBreakdown {
  uniqueness: number;
  learnability: number;
  actionability: number;
  freshness: number;
  signal: number;
  clarity: number;
  categoryFit: number;
  diversityBonus: number;
  total: number;
}

export interface ScoredTopic extends DiscoveredTopic {
  scores: TopicScoreBreakdown;
}

export interface DailyFeedTopic {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  difficulty: Difficulty;
  estimatedMinutes: number;
  languages: string[];
  requiredTechnologies: string[];
  learningObjectives: string[];
  projectRequirements: string[];
  verificationCriteria: string[];
  evergreen: false;
  popularity: number;
  environmentProfile: string;
  requiredServices: string[];
  sourceUrl: string;
  source: string;
  discoveredAt: string;
  scores: TopicScoreBreakdown;
}

export interface DailyFeed {
  schemaVersion: 1;
  generatedAt: string;
  date: string;
  sourcesUsed: string[];
  firecrawlUsed: boolean;
  topics: DailyFeedTopic[];
  quality: {
    candidateCount: number;
    acceptedCount: number;
    avgTotalScore: number;
    notes: string[];
  };
}

export interface TopicSource {
  id: string;
  fetchTopics(): Promise<DiscoveredTopic[]>;
}
