import { describe, expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { collectProjectLesson, type RunPlan } from "@devly/execution";

const plan: RunPlan = {
  kind: "compose",
  usesDocker: true,
  composeFile: "docker-compose.yml",
  setup: [],
  start: [
    {
      executable: "docker",
      args: ["compose", "up", "-d"],
      description: "docker compose up",
    },
  ],
  summary: "Docker Compose",
};

describe("collectProjectLesson", () => {
  it("explains the project, the run, and the important files", async () => {
    const dir = path.join(os.tmpdir(), `devly-lesson-${Date.now()}`);
    await mkdir(path.join(dir, "src"), { recursive: true });
    await writeFile(
      path.join(dir, "README.md"),
      "# Demo\n\n[![badge](https://example.com/b.svg)](https://example.com)\n\nA small app that turns notes into a page.\n",
    );
    await writeFile(
      path.join(dir, "docker-compose.yml"),
      "services:\n  web:\n    image: nginx\n  api:\n    image: node\n",
    );
    await writeFile(path.join(dir, "src", "index.ts"), "// Receives each note and saves it.\nexport const start = true;\n");

    const lesson = await collectProjectLesson({
      title: "notes",
      directory: dir,
      mode: "try-live",
      plan,
      demoUrl: "http://127.0.0.1:8080",
      live: true,
    });

    expect(lesson.what).toContain("turns notes into a page");
    expect(lesson.how).toContain("downloaded notes from GitHub");
    expect(lesson.how).toContain("docker compose up");
    expect(lesson.used).toEqual(["Git", "Docker", "Docker Compose"]);
    expect(lesson.files.map((file) => file.path)).toEqual([
      "README.md",
      "docker-compose.yml",
      "src/index.ts",
    ]);
    expect(lesson.files[1]?.about).toContain("web");
    expect(lesson.files[2]?.about).toContain("Receives each note");
  });

  it("ignores a file path that leaves the project folder", async () => {
    const dir = path.join(os.tmpdir(), `devly-lesson-safe-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "README.md"), "A tiny lab.\n");
    const lesson = await collectProjectLesson({
      title: "lab",
      directory: dir,
      mode: "learn",
      preferredFiles: ["../secret.txt"],
      live: false,
    });
    expect(lesson.files.map((file) => file.path)).toEqual(["README.md"]);
    expect(lesson.used).not.toContain("Git");
    expect(lesson.how).toContain("did not stay running");
  });

  it("skips an italic tagline and uses the real description", async () => {
    const dir = path.join(os.tmpdir(), `devly-lesson-md-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, "README.md"),
      "# Job\n\n*The job search that runs on your machine.*\n\n<p>badge</p>\n\nAn AI-powered job application framework built on Claude Code.\n",
    );
    const lesson = await collectProjectLesson({
      title: "job",
      directory: dir,
      mode: "try-live",
      plan: {
        kind: "node",
        usesDocker: false,
        setup: [],
        start: [],
        summary: 'This project does not open a website. Its start script runs "claude".',
      },
      live: false,
    });
    expect(lesson.what).toContain("AI-powered job application framework");
    expect(lesson.what).not.toContain("*");
    expect(lesson.how).toContain("does not open a website");
    expect(lesson.demoUrl).toBeUndefined();
  });

  it("opens the dashboard instead of the health check and explains the files", async () => {
    const dir = path.join(os.tmpdir(), `devly-lesson-page-${Date.now()}`);
    await mkdir(path.join(dir, "warm_lab"), { recursive: true });
    await writeFile(path.join(dir, "README.md"), "A small lab.\n");
    await writeFile(
      path.join(dir, "LESSON.md"),
      [
        "# Idea",
        "",
        "An agent's conversation can grow beyond its available context. Compaction replaces older conversation with a handoff so work can continue. The upstream Hermes plugin asks the main model to write that handoff using its previous request prefix, followed by new messages and an instruction. A compatible server may reuse the prefix cache. The entire request is still sent; cache reuse is not guaranteed.",
        "",
        "The handoff has five sections.",
        "",
        "## Watch the example",
        "",
        "1. Select Watch warm path.",
        "2. Select Watch rejected reply.",
        "",
        "- `warm_lab/engine.py`: The compaction rules live here.",
      ].join("\n"),
    );
    await writeFile(path.join(dir, "warm_lab", "engine.py"), "def compact():\n    return []\n");
    const lesson = await collectProjectLesson({
      title: "hermes",
      directory: dir,
      mode: "learn",
      demoUrl: "http://127.0.0.1:8765/health",
      live: true,
      preferredFiles: ["warm_lab/engine.py"],
    });
    expect(lesson.demoUrl).toBe("http://127.0.0.1:8765/");
    expect(lesson.what).toContain("still sent");
    expect(lesson.what).toContain("five sections");
    expect(lesson.what.endsWith("st")).toBe(false);
    expect(lesson.tryIt).toContain("Watch warm path");
    expect(lesson.files.find((file) => file.path === "warm_lab/engine.py")?.about).toContain("compaction rules");
  });
});
