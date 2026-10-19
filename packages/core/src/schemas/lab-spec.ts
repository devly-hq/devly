import { z } from "zod";

export const LabSpecSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  topic: z.string().min(1),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  language: z.string().min(1),
  targetDurationMinutes: z.number().int().positive(),
  learningObjectives: z.array(z.string()).min(1),
  projectRequirements: z.array(z.string()).min(1),
  verificationCriteria: z.array(z.string()).min(1),
  prerequisites: z.array(z.string()).default([]),
  requiredServices: z.array(z.string()).default([]),
  credentials: z
    .array(
      z.object({
        name: z.string(),
        required: z.boolean(),
        description: z.string(),
      }),
    )
    .default([]),
  resourceEstimates: z
    .object({
      memoryMb: z.number().optional(),
      diskMb: z.number().optional(),
      networkRequired: z.boolean().default(true),
    })
    .default({ networkRequired: true }),
  osSupport: z.array(z.enum(["darwin", "linux", "win32"])).default(["darwin", "linux", "win32"]),
  testExpectations: z.array(z.string()).default([]),
  demo: z
    .discriminatedUnion("kind", [
      z.object({
        kind: z.literal("http"),
        url: z.string(),
        expectedStatus: z.number().default(200),
        expectedBodyIncludes: z.string().optional(),
      }),
      z.object({
        kind: z.literal("cli"),
        command: z.string(),
        args: z.array(z.string()).default([]),
        expectedOutputIncludes: z.string().optional(),
      }),
      z.object({ kind: z.literal("none") }),
    ])
    .default({ kind: "none" }),
  learningMilestones: z.array(z.string()).default([]),
  expectedFiles: z.array(z.string()).default([]),
  securityConsiderations: z.array(z.string()).default([]),
  environmentProfile: z.string().default("python"),
});
export type LabSpec = z.infer<typeof LabSpecSchema>;

export const DevlyManifestCommandSchema = z.object({
  executable: z.string().min(1),
  args: z.array(z.string()).default([]),
  description: z.string().optional(),
});

export const DevlyManifestSchema = z.object({
  schemaVersion: z.literal(1),
  setup: z.array(DevlyManifestCommandSchema).default([]),
  test: z.array(DevlyManifestCommandSchema).default([]),
  start: z.array(DevlyManifestCommandSchema).default([]),
  stop: z.array(DevlyManifestCommandSchema).default([]),
  healthcheck: z
    .discriminatedUnion("kind", [
      z.object({
        kind: z.literal("http"),
        url: z.string(),
        expectedStatus: z.number().default(200),
        expectedBodyIncludes: z.string().optional(),
      }),
      z.object({
        kind: z.literal("command"),
        executable: z.string(),
        args: z.array(z.string()).default([]),
        expectedOutputIncludes: z.string().optional(),
      }),
      z.object({ kind: z.literal("none") }),
    ])
    .default({ kind: "none" }),
  ports: z.array(z.number().int()).default([]),
  services: z.array(z.string()).default([]),
  entryFiles: z.array(z.string()).default([]),
  lessonFile: z.string().default("LESSON.md"),
  concepts: z.array(z.string()).default([]),
});
export type DevlyManifest = z.infer<typeof DevlyManifestSchema>;

export function parseLabSpec(raw: unknown): LabSpec {
  return LabSpecSchema.parse(raw);
}

export function parseDevlyManifest(raw: unknown): DevlyManifest {
  return DevlyManifestSchema.parse(raw);
}
