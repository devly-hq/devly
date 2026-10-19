import { z } from "zod";

export const CategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
});
export type Category = z.infer<typeof CategorySchema>;

export const TopicRecordSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  category: z.string(),
  tags: z.array(z.string()).default([]),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  estimatedMinutes: z.number().int().positive(),
  languages: z.array(z.string()).default([]),
  requiredTechnologies: z.array(z.string()).default([]),
  learningObjectives: z.array(z.string()).default([]),
  projectRequirements: z.array(z.string()).default([]),
  verificationCriteria: z.array(z.string()).default([]),
  evergreen: z.boolean().default(true),
  popularity: z.number().min(0).max(100).default(50),
  environmentProfile: z.string().default("python"),
  requiredServices: z.array(z.string()).default([]),
});
export type TopicRecord = z.infer<typeof TopicRecordSchema>;

export function loadCategories(raw: unknown): Category[] {
  return z.array(CategorySchema).parse(raw);
}

export function loadTopics(raw: unknown): TopicRecord[] {
  return z.array(TopicRecordSchema).parse(raw);
}

export function topicToLabSpecSeed(topic: TopicRecord, language?: string) {
  return {
    schemaVersion: 1 as const,
    id: topic.id,
    topic: topic.title,
    difficulty: topic.difficulty,
    language: language ?? topic.languages[0] ?? "python",
    targetDurationMinutes: topic.estimatedMinutes,
    learningObjectives: topic.learningObjectives,
    projectRequirements:
      topic.projectRequirements.length > 0
        ? topic.projectRequirements
        : [
            `Build a working project that teaches: ${topic.title}`,
            "Include automated tests",
            "Include a README and LESSON.md",
          ],
    verificationCriteria:
      topic.verificationCriteria.length > 0
        ? topic.verificationCriteria
        : ["Project starts successfully", "Automated tests pass"],
    prerequisites: [],
    requiredServices: topic.requiredServices,
    credentials: [],
    resourceEstimates: { networkRequired: true },
    osSupport: ["darwin", "linux", "win32"] as Array<"darwin" | "linux" | "win32">,
    testExpectations: ["Unit tests pass"],
    demo: { kind: "none" as const },
    learningMilestones: topic.learningObjectives,
    expectedFiles: ["README.md", "LESSON.md", "devly.json"],
    securityConsiderations: ["Do not hardcode secrets", "Run only inside the lab directory"],
    environmentProfile: topic.environmentProfile,
  };
}
