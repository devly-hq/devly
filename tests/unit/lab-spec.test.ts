import { describe, expect, it } from "vitest";
import { parseDevlyManifest, parseLabSpec } from "@devly/core";

describe("schemas", () => {
  it("parses a valid lab spec", () => {
    const spec = parseLabSpec({
      schemaVersion: 1,
      id: "rag-basics",
      topic: "Build a RAG application",
      difficulty: "intermediate",
      language: "python",
      targetDurationMinutes: 15,
      learningObjectives: ["embeddings"],
      projectRequirements: ["working app"],
      verificationCriteria: ["tests pass"],
    });
    expect(spec.id).toBe("rag-basics");
    expect(spec.demo.kind).toBe("none");
  });

  it("parses a valid manifest", () => {
    const m = parseDevlyManifest({
      schemaVersion: 1,
      setup: [{ executable: "pip", args: ["install", "-r", "requirements.txt"] }],
      test: [{ executable: "pytest", args: [] }],
      start: [{ executable: "python", args: ["app.py"] }],
      healthcheck: { kind: "http", url: "http://127.0.0.1:8080/health", expectedStatus: 200 },
      ports: [8080],
    });
    expect(m.ports).toEqual([8080]);
  });

  it("rejects invalid schema version", () => {
    expect(() => parseLabSpec({ schemaVersion: 2, id: "x" })).toThrow();
  });
});
