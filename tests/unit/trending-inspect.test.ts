import { describe, expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { containerNameInUse, hostPortInUse, inspectRepo, isMissingArmManifest } from "@devly/execution";
import { scoreRunnable, type TrendingRepo } from "@devly/core";

describe("inspectRepo", () => {
  it("detects docker-compose.yml", async () => {
    const dir = path.join(os.tmpdir(), `devly-inspect-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "docker-compose.yml"), "services:\n  web:\n    image: nginx\n");
    const plan = await inspectRepo(dir);
    expect(plan.kind).toBe("compose");
    expect(plan.usesDocker).toBe(true);
  });

  it("finds compose nested under docker/compose", async () => {
    const dir = path.join(os.tmpdir(), `devly-inspect-nested-${Date.now()}`);
    await mkdir(path.join(dir, "docker", "compose"), { recursive: true });
    await mkdir(path.join(dir, "testing", "compose"), { recursive: true });
    await writeFile(
      path.join(dir, "docker", "compose", "docker-compose.yml"),
      'services:\n  app:\n    image: nginx\n    ports:\n      - "8080:8080"\n',
    );
    await writeFile(path.join(dir, "testing", "compose", "docker-compose.yml"), "services: {}\n");
    const plan = await inspectRepo(dir);
    expect(plan.kind).toBe("compose");
    expect(plan.composeFile).toBe(path.join("docker", "compose", "docker-compose.yml"));
    expect(plan.suggestedPort).toBe(8080);
  });

  it("prefers the root compose file over an extras sample stack", async () => {
    const dir = path.join(os.tmpdir(), `devly-inspect-extras-${Date.now()}`);
    await mkdir(path.join(dir, "extras", "dcgoss"), { recursive: true });
    await writeFile(
      path.join(dir, "docker-compose.yml"),
      'services:\n  app:\n    image: nginx\n    ports:\n      - "8080:80"\n',
    );
    await writeFile(
      path.join(dir, "extras", "dcgoss", "docker-compose.yml"),
      "services:\n  db:\n    image: mysql:5.7\n",
    );
    const plan = await inspectRepo(dir);
    expect(plan.composeFile).toBe("docker-compose.yml");
  });

  it("recognizes a container name left from an earlier run", () => {
    const log = 'Error: The container name "/stirling-pdf" is already in use';
    expect(containerNameInUse(log)).toBe("stirling-pdf");
  });

  it("recognizes a host port that is already taken", () => {
    const log = "Bind for 0.0.0.0:8080 failed: port is already allocated";
    expect(hostPortInUse(log)).toBe(8080);
  });

  it("recognizes an arm64 image manifest miss", () => {
    const log =
      "Image mysql:5.7 Error no matching manifest for linux/arm64/v8 in the manifest list entries: no match for platform in manifest: not found";
    expect(isMissingArmManifest(log)).toBe(true);
  });

  it("detects package.json start script", async () => {
    const dir = path.join(os.tmpdir(), `devly-inspect-node-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "x", scripts: { start: "node index.js" } }),
    );
    const plan = await inspectRepo(dir);
    expect(plan.kind).toBe("node");
    expect(plan.suggestedPort).toBe(3000);
    expect(plan.start.length).toBe(1);
  });

  it("does not invent a website when start only launches a CLI", async () => {
    const dir = path.join(os.tmpdir(), `devly-inspect-cli-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "x", scripts: { start: "claude" } }),
    );
    const plan = await inspectRepo(dir);
    expect(plan.start).toEqual([]);
    expect(plan.suggestedPort).toBeUndefined();
    expect(plan.summary).toContain("claude");
  });
});

describe("scoreRunnable", () => {
  it("boosts compose hints", () => {
    const base: TrendingRepo = {
      id: "1",
      fullName: "a/b",
      description: "cool project with docker-compose",
      htmlUrl: "https://github.com/a/b",
      cloneUrl: "https://github.com/a/b.git",
      language: "TypeScript",
      stars: 1000,
      forks: 10,
      topics: [],
      pushedAt: new Date().toISOString(),
      discoveredAt: new Date().toISOString(),
      source: "github-search",
      runHints: ["compose"],
      category: "tools",
      popularity: 50,
    };
    expect(scoreRunnable(base)).toBeGreaterThan(scoreRunnable({ ...base, runHints: ["unknown"] }));
  });
});
