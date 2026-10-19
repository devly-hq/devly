import { describe, expect, it } from "vitest";
import { FakeAgent } from "@devly/agents";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

describe("FakeAgent", () => {
  it("writes a docker lab fixture", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "devly-fake-"));
    const agent = new FakeAgent();
    const result = await agent.execute({
      executionId: "t1",
      prompt: "Build a Docker fundamentals lab",
      workspace: dir,
    });
    expect(result.exitCode).toBe(0);
    const manifest = JSON.parse(await readFile(path.join(dir, "devly.json"), "utf8"));
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.healthcheck.kind).toBe("http");
  });
});
