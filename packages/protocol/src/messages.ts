import { z } from "zod";

export const ExperienceLevelSchema = z.enum(["beginner", "intermediate", "advanced"]);
export type ExperienceLevel = z.infer<typeof ExperienceLevelSchema>;

export const LearningModeSchema = z.enum(["watch", "do"]);
export type LearningMode = z.infer<typeof LearningModeSchema>;

export const WorkspaceChoiceSchema = z.enum(["current", "new-window", "temporary"]);
export type WorkspaceChoice = z.infer<typeof WorkspaceChoiceSchema>;

export const LabStateSchema = z.enum([
  "CREATED",
  "PLANNING",
  "WAITING_FOR_APPROVAL",
  "GENERATING",
  "SETTING_UP",
  "TESTING",
  "REPAIRING",
  "STARTING",
  "VERIFYING",
  "READY",
  "PARTIALLY_READY",
  "FAILED",
  "CANCELLED",
]);
export type LabState = z.infer<typeof LabStateSchema>;

export const TopicSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  category: z.string(),
  tags: z.array(z.string()).default([]),
  difficulty: ExperienceLevelSchema,
  estimatedMinutes: z.number().int().positive(),
  languages: z.array(z.string()).default([]),
  requiredTechnologies: z.array(z.string()).default([]),
  learningObjectives: z.array(z.string()).default([]),
  evergreen: z.boolean().default(true),
  popularity: z.number().min(0).max(100).default(50),
});
export type Topic = z.infer<typeof TopicSchema>;

export const TrendingRepoSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  description: z.string(),
  htmlUrl: z.string().url(),
  cloneUrl: z.string().url(),
  language: z.string().nullable(),
  stars: z.number().int().nonnegative(),
  forks: z.number().int().nonnegative().default(0),
  topics: z.array(z.string()).default([]),
  category: z.string(),
  popularity: z.number().min(0).max(100),
  runHints: z.array(z.enum(["compose", "dockerfile", "node", "python", "unknown"])).default([]),
  source: z.enum(["github-search", "github-trending", "hackernews"]),
  pushedAt: z.string().optional(),
});
export type TrendingRepo = z.infer<typeof TrendingRepoSchema>;

export const LiveHitSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  url: z.string().url(),
  kind: z.enum(["news", "model", "topic"]),
  meta: z.string().optional(),
  /** How hard this model is to run on a normal computer. */
  tag: z.enum(["Easy", "Minutes", "Hard"]).optional(),
});
export type LiveHit = z.infer<typeof LiveHitSchema>;

export const UserPreferencesSchema = z.object({
  interests: z.array(z.string()).default([]),
  experienceLevel: ExperienceLevelSchema.default("beginner"),
  preferredLanguages: z.array(z.string()).default(["python", "typescript"]),
  defaultAgentId: z.string().optional(),
  learningMode: LearningModeSchema.default("watch"),
  workspacePreference: WorkspaceChoiceSchema.default("new-window"),
  dailySuggestions: z.boolean().default(true),
  quietHoursStart: z.number().int().min(0).max(23).optional(),
  quietHoursEnd: z.number().int().min(0).max(23).optional(),
  onboardingComplete: z.boolean().default(false),
  maxRepairAttempts: z.number().int().min(0).max(10).default(3),
  notificationSnoozeUntil: z.string().optional(),
  dismissedTopicIds: z.array(z.string()).default([]),
  hiddenTopicIds: z.array(z.string()).default([]),
  knownTopicIds: z.array(z.string()).default([]),
  savedTopicIds: z.array(z.string()).default([]),
});
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

export const MascotPreferencesSchema = z.object({
  name: z.string().default("Shade"),
  theme: z.string().default("default-purple"),
  outfit: z.string().default("none"),
  eyeColor: z.string().default("#a78bfa"),
  animationIntensity: z.enum(["off", "subtle", "normal"]).default("normal"),
  speechFrequency: z.enum(["rare", "normal", "chatty"]).default("normal"),
  personality: z
    .enum(["calm", "friendly", "witty", "sarcastic", "enthusiastic", "minimal"])
    .default("friendly"),
  hidden: z.boolean().default(false),
});
export type MascotPreferences = z.infer<typeof MascotPreferencesSchema>;

export const AgentInfoSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  installed: z.boolean(),
  authenticated: z.boolean().optional(),
  version: z.string().optional(),
  capabilities: z.object({
    supportsCodeGeneration: z.boolean(),
    supportsFileEditing: z.boolean(),
    supportsStreaming: z.boolean(),
    supportsSessionResume: z.boolean(),
    supportsStructuredOutput: z.boolean(),
  }),
});
export type AgentInfo = z.infer<typeof AgentInfoSchema>;

export const LabSummarySchema = z.object({
  id: z.string(),
  topicId: z.string().optional(),
  topicTitle: z.string(),
  directory: z.string(),
  workspaceMode: WorkspaceChoiceSchema,
  agentId: z.string(),
  state: LabStateSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  demoUrl: z.string().optional(),
});
export type LabSummary = z.infer<typeof LabSummarySchema>;

export const VerificationCheckSchema = z.object({
  id: z.string(),
  label: z.string(),
  required: z.boolean(),
  status: z.enum(["pending", "pass", "fail", "skipped"]),
  detail: z.string().optional(),
});
export type VerificationCheck = z.infer<typeof VerificationCheckSchema>;

export const ExecutionPlanCommandSchema = z.object({
  id: z.string(),
  executable: z.string(),
  args: z.array(z.string()),
  description: z.string(),
});
export type ExecutionPlanCommand = z.infer<typeof ExecutionPlanCommandSchema>;

export const ExecutionPlanSchema = z.object({
  architecture: z.string(),
  files: z.array(z.string()),
  dependencies: z.array(z.string()),
  services: z.array(z.string()),
  commands: z.array(ExecutionPlanCommandSchema),
  verificationPlan: z.array(z.string()),
});
export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;

/** Messages from webview → extension host */
export const WebviewToHostSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ready") }),
  z.object({ type: z.literal("getBootstrap") }),
  z.object({
    type: z.literal("completeOnboarding"),
    preferences: UserPreferencesSchema,
  }),
  z.object({ type: z.literal("updatePreferences"), preferences: UserPreferencesSchema.partial() }),
  z.object({
    type: z.literal("updateMascot"),
    preferences: MascotPreferencesSchema.partial(),
  }),
  z.object({ type: z.literal("refreshPicks") }),
  z.object({ type: z.literal("saveTopic"), topicId: z.string() }),
  z.object({ type: z.literal("hideTopic"), topicId: z.string() }),
  z.object({ type: z.literal("markKnown"), topicId: z.string() }),
  z.object({ type: z.literal("searchTopics"), query: z.string() }),
  z.object({
    type: z.literal("searchLive"),
    query: z.string(),
    scope: z.enum(["github", "live"]),
  }),
  z.object({ type: z.literal("refreshLive") }),
  z.object({ type: z.literal("getTopic"), topicId: z.string() }),
  z.object({ type: z.literal("customTopic"), text: z.string().min(3).max(500) }),
  z.object({
    type: z.literal("startLab"),
    topicId: z.string().optional(),
    customTopic: z.string().optional(),
    agentId: z.string(),
    workspaceMode: WorkspaceChoiceSchema,
    learningMode: LearningModeSchema,
  }),
  z.object({ type: z.literal("approvePlan"), labId: z.string() }),
  z.object({ type: z.literal("rejectPlan"), labId: z.string() }),
  z.object({ type: z.literal("cancelLab"), labId: z.string() }),
  z.object({ type: z.literal("repairLab"), labId: z.string() }),
  z.object({ type: z.literal("stopServices"), labId: z.string() }),
  z.object({ type: z.literal("deleteLab"), labId: z.string() }),
  z.object({ type: z.literal("openLab"), labId: z.string() }),
  z.object({ type: z.literal("resumeLab"), labId: z.string() }),
  z.object({ type: z.literal("openFile"), labId: z.string(), relativePath: z.string(), line: z.number().optional() }),
  z.object({
    type: z.literal("askShade"),
    labId: z.string().optional(),
    question: z.string(),
    code: z.string().optional(),
    filePath: z.string().optional(),
  }),
  z.object({ type: z.literal("navigate"), page: z.string() }),
  z.object({ type: z.literal("detectAgents") }),
  z.object({ type: z.literal("openExternal"), url: z.string().url() }),
  z.object({ type: z.literal("refreshTrending") }),
  z.object({
    type: z.literal("tryLiveRepo"),
    repoId: z.string(),
    fullName: z.string(),
    cloneUrl: z.string().url(),
    htmlUrl: z.string().url(),
    description: z.string().max(500).optional(),
  }),
  z.object({
    type: z.literal("setupModel"),
    title: z.string().min(1).max(200),
    url: z.string().url(),
  }),
]);
export type WebviewToHost = z.infer<typeof WebviewToHostSchema>;

/** Messages from extension host → webview */
export const HostToWebviewSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("bootstrap"),
    preferences: UserPreferencesSchema,
    mascot: MascotPreferencesSchema,
    picks: z.array(TopicSchema),
    categories: z.array(z.object({ id: z.string(), name: z.string(), description: z.string() })),
    agents: z.array(AgentInfoSchema),
    labs: z.array(LabSummarySchema),
    trendingRepos: z.array(TrendingRepoSchema).default([]),
    progress: z.object({
      completedTopicIds: z.array(z.string()),
      streakDays: z.number(),
      lastCompletedAt: z.string().optional(),
    }),
  }),
  z.object({ type: z.literal("picks"), picks: z.array(TopicSchema) }),
  z.object({ type: z.literal("searchResults"), results: z.array(TopicSchema) }),
  z.object({
    type: z.literal("repoSearchResults"),
    repos: z.array(TrendingRepoSchema),
    notice: z.string().optional(),
  }),
  z.object({ type: z.literal("repoNews"), items: z.array(LiveHitSchema) }),
  z.object({
    type: z.literal("liveHits"),
    hits: z.array(LiveHitSchema),
    notice: z.string().optional(),
  }),
  z.object({ type: z.literal("liveTopics"), topics: z.array(TopicSchema) }),
  z.object({ type: z.literal("topicDetail"), topic: TopicSchema }),
  z.object({
    type: z.literal("trendingRepos"),
    repos: z.array(TrendingRepoSchema),
    notice: z.string().optional(),
  }),
  z.object({ type: z.literal("agents"), agents: z.array(AgentInfoSchema) }),
  z.object({ type: z.literal("labs"), labs: z.array(LabSummarySchema) }),
  z.object({
    type: z.literal("labUpdate"),
    lab: LabSummarySchema,
    plan: ExecutionPlanSchema.optional(),
    checks: z.array(VerificationCheckSchema).optional(),
    logs: z.string().optional(),
    lessonMarkdown: z.string().optional(),
  }),
  z.object({ type: z.literal("logChunk"), labId: z.string(), chunk: z.string() }),
  z.object({ type: z.literal("shadeState"), state: z.string(), line: z.string().optional() }),
  z.object({ type: z.literal("askShadeReply"), answer: z.string() }),
  z.object({
    type: z.literal("tryLiveStatus"),
    labId: z.string(),
    phase: z.string(),
    message: z.string(),
    title: z.string().optional(),
    url: z.string().optional(),
    estimate: z.string().optional(),
  }),
  z.object({ type: z.literal("error"), message: z.string(), details: z.string().optional() }),
  z.object({ type: z.literal("toast"), message: z.string(), level: z.enum(["info", "warn", "error"]).default("info") }),
]);
export type HostToWebview = z.infer<typeof HostToWebviewSchema>;

export function parseWebviewMessage(raw: unknown): WebviewToHost | null {
  const result = WebviewToHostSchema.safeParse(raw);
  return result.success ? result.data : null;
}

export function parseHostMessage(raw: unknown): HostToWebview | null {
  const result = HostToWebviewSchema.safeParse(raw);
  return result.success ? result.data : null;
}
