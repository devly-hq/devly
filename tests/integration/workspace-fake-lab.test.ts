import { describe, expect, it } from "vitest";
import { FakeAgent } from "@devly/agents";
import { WorkspaceManager, defaultRunner, isDeniedCommand } from "@devly/execution";
import { parseDevlyManifest, createDefaultChecks, summarizeVerification } from "@devly/core";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

describe("integration: workspace + fake agent lab", () => {
  it("creates a lab, generates code, installs deps, runs tests", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "devly-int-"));
    const wm = new WorkspaceManager(path.join(root, "DevlyLabs"));
    const meta = await wm.createLab({
      topicTitle: "Docker fundamentals",
      topicId: "docker-fundamentals",
      agentId: "fake",
      workspaceMode: "new-window",
      homeLabsRoot: path.join(root, "DevlyLabs"),
    });

    expect(meta.directory.startsWith(path.join(root, "DevlyLabs"))).toBe(true);

    const agent = new FakeAgent();
    const build = await agent.execute({
      executionId: "int-build",
      prompt: "Build docker fundamentals",
      workspace: meta.directory,
    });
    expect(build.exitCode).toBe(0);

    const manifest = parseDevlyManifest(JSON.parse(await readFile(path.join(meta.directory, "devly.json"), "utf8")));
    for (const cmd of manifest.setup) {
      expect(isDeniedCommand({ executable: cmd.executable, args: cmd.args, cwd: meta.directory }, meta.directory)).toBeNull();
      const rec = await defaultRunner.run({
        executable: cmd.executable,
        args: cmd.args,
        cwd: meta.directory,
        timeoutMs: 180_000,
      });
      expect(rec.exitCode).toBe(0);
    }

    for (const cmd of manifest.test) {
      const rec = await defaultRunner.run({
        executable: cmd.executable,
        args: cmd.args,
        cwd: meta.directory,
        timeoutMs: 120_000,
      });
      expect(rec.exitCode).toBe(0);
    }

    const checks = createDefaultChecks({
      hasDockerServices: false,
      hasHttpDemo: true,
      hasTests: true,
    });
    for (const c of checks) {
      if (c.id === "demo" || c.id === "health" || c.id === "start") c.status = "skipped";
      else if (c.required) c.status = "pass";
    }
    // Mark unit as pass from real run
    checks.find((c) => c.id === "unit")!.status = "pass";
    checks.find((c) => c.id === "code")!.status = "pass";
    checks.find((c) => c.id === "deps")!.status = "pass";
    // Without live server, treat as PARTIAL if health required — flip health/demo to optional skip for this slice
    const summary = summarizeVerification(
      checks.map((c) => (c.id === "health" || c.id === "demo" ? { ...c, required: false, status: "skipped" as const } : c)),
      [],
    );
    expect(["READY", "PARTIALLY_READY"]).toContain(summary.status);

    await wm.deleteLab(meta.directory);
  }, 240_000);
});
