import { describe, expect, it } from "vitest";
import { buildPromptVars, renderBuilderPrompt, renderPlannerPrompt } from "@devly/core";

describe("prompts", () => {
  it("renders planner and builder with variables", () => {
    const vars = buildPromptVars({
      TOPIC: "Docker fundamentals",
      WORKSPACE_PATH: "/tmp/lab",
      DIFFICULTY: "beginner",
      LANGUAGE: "python",
      LEARNING_OBJECTIVES: "- containers",
      PROJECT_REQUIREMENTS: "- Dockerfile",
      VERIFICATION_CRITERIA: "- health ok",
    });
    const planner = renderPlannerPrompt(vars);
    const builder = renderBuilderPrompt(vars);
    expect(planner).toContain("Docker fundamentals");
    expect(planner).toContain("/tmp/lab");
    expect(builder).toContain("devly.json");
    expect(builder).not.toContain("{{TOPIC}}");
  });
});
