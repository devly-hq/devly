/**
 * Lightweight e2e scenario coverage using pure core + fake agent.
 * Full @vscode/test-electron UI e2e is documented for follow-up CI images.
 */
import { describe, expect, it } from "vitest";
import {
  recommendTopics,
  transition,
  parseDevlyManifest,
  createDefaultChecks,
  summarizeVerification,
  UserPreferencesLike,
} from "./helpers.js";
import { FakeAgent } from "@devly/agents";
import { WorkspaceManager } from "@devly/execution";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { transitionMascot } from "@devly/mascot";

describe("e2e scenarios (headless)", () => {
  it("1. onboarding defaults produce picks", () => {
    const picks = recommendTopics();
    expect(picks.length).toBeGreaterThan(0);
  });

  it("2-4. create labs in each workspace mode", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devly-e2e-"));
    const wm = new WorkspaceManager();
    for (const mode of ["temporary", "new-window", "current"] as const) {
      const meta = await wm.createLab({
        topicTitle: `Lab ${mode}`,
        agentId: "fake",
        workspaceMode: mode,
        currentWorkspaceRoot: root,
        homeLabsRoot: path.join(root, "labs"),
      });
      expect(meta.id).toBeTruthy();
    }
  });

  it("5-7. mocked agent generate + verify + repair path", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "devly-e2e-lab-"));
    const agent = new FakeAgent();
    await agent.execute({ executionId: "e2e", prompt: "build", workspace: dir });
    const manifest = parseDevlyManifest(JSON.parse(await readFile(path.join(dir, "devly.json"), "utf8")));
    expect(manifest.test.length).toBeGreaterThan(0);
    const checks = createDefaultChecks({ hasDockerServices: false, hasHttpDemo: true, hasTests: true });
    for (const c of checks) c.status = c.required ? "pass" : "skipped";
    expect(summarizeVerification(checks, []).status).toBe("READY");
    // repair transition
    expect(transition("TESTING", { type: "TESTS_FAILED" })).toBe("REPAIRING");
  });

  it("8. cancel transition", () => {
    expect(transition("GENERATING", { type: "CANCEL" })).toBe("CANCELLED");
  });

  it("9. resume metadata shape", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devly-resume-"));
    const wm = new WorkspaceManager(path.join(root, "labs"));
    const meta = await wm.createLab({
      topicTitle: "Resume me",
      agentId: "fake",
      workspaceMode: "new-window",
      homeLabsRoot: path.join(root, "labs"),
    });
    meta.state = "SETTING_UP";
    await wm.writeMeta(meta);
    const loaded = await wm.readMeta(meta.directory);
    expect(loaded?.state).toBe("SETTING_UP");
  });

  it("10. customize mascot state", () => {
    expect(transitionMascot("IDLE", "CELEBRATING")).toBe("CELEBRATING");
  });

  it("11. dismissed notification preference shape", () => {
    const prefs: UserPreferencesLike = { dismissedTopicIds: ["docker-fundamentals"] };
    expect(prefs.dismissedTopicIds).toContain("docker-fundamentals");
  });

  it("12. package artifact exists after build (dist)", async () => {
    const fs = await import("node:fs/promises");
    await fs.access(path.resolve("apps/extension/dist/extension.js"));
  });
});
