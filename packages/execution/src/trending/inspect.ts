import { access, readFile, readdir } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

export type RunKind = "compose" | "dockerfile" | "node" | "python" | "unsupported";

export interface RunPlan {
  kind: RunKind;
  setup: Array<{ executable: string; args: string[]; description: string }>;
  start: Array<{ executable: string; args: string[]; description: string }>;
  usesDocker: boolean;
  composeFile?: string;
  suggestedPort?: number;
  summary: string;
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

const SERVER_HINT =
  /\b(next|vite|nuxt|astro|remix|react-scripts|webpack-dev-server|http-server|serve|nodemon|ts-node|tsx|node|nest|express|uvicorn|flask|gunicorn|streamlit|gradio|ng|http\.server)\b/;

/** A package script that actually listens for a browser. `claude` does not. */
export function pageFromScript(script: string): { port: number } | undefined {
  const text = script.trim();
  if (!text || /^(claude|codex|gemini|aider|gh|code)$/i.test(text)) return undefined;
  const mentionsPort = /(?:--port(?:=|\s+)|-p\s+)(\d{2,5})|:(\d{2,5})\b/.test(text);
  if (!SERVER_HINT.test(text) && !mentionsPort) return undefined;
  const explicit = text.match(/(?:--port(?:=|\s+)|-p\s+)(\d{2,5})/) ?? text.match(/:(\d{2,5})\b/);
  if (explicit) return { port: Number(explicit[1]) };
  if (/\bvite\b/.test(text)) return { port: 5173 };
  if (/\b(uvicorn|flask|gunicorn|streamlit|http\.server)\b/.test(text)) return { port: 8000 };
  return { port: 3000 };
}

function serverScriptName(scripts: Record<string, string> | undefined): "start" | "dev" | undefined {
  if (!scripts) return undefined;
  if (scripts.start && pageFromScript(scripts.start)) return "start";
  if (scripts.dev && pageFromScript(scripts.dev)) return "dev";
  return undefined;
}

const COMPOSE_NAMES = new Set([
  "docker-compose.yml",
  "docker-compose.yaml",
  "compose.yml",
  "compose.yaml",
]);

const SKIP_DIRS = new Set([".git", "node_modules", "testing", "test", "tests", "dist", "build"]);

/** Walk a few levels. Prefer the project's real compose file over test fixtures. */
async function findComposeFile(root: string): Promise<string | undefined> {
  const found: string[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 3 || found.length > 40) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".") || SKIP_DIRS.has(e.name)) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(abs, depth + 1);
      } else if (COMPOSE_NAMES.has(e.name)) {
        found.push(path.relative(root, abs));
      }
    }
  }

  await walk(root, 0);
  if (found.length === 0) return undefined;
  found.sort((a, b) => scoreComposePath(b) - scoreComposePath(a));
  return found[0];
}

const EXAMPLE_COMPOSE = [
  "extras/",
  "examples/",
  "example/",
  "docs/",
  "ci/",
  "integration-tests/",
  "testdata/",
  "hack/",
];

function scoreComposePath(rel: string): number {
  const n = rel.replace(/\\/g, "/");
  let s = 100 - n.split("/").length * 10;
  if (n === "docker-compose.yml" || n === "compose.yml") s += 50;
  if (n.includes("docker/compose/docker-compose.yml")) s += 80;
  if (n.includes("ultra-lite") || n.includes("fat") || n.includes("test")) s -= 40;
  // Sample stacks (dcgoss, wordpress demos) are not the app.
  if (EXAMPLE_COMPOSE.some((d) => n.includes(d))) s -= 120;
  return s;
}

async function hostPortFromCompose(root: string, rel: string): Promise<number | undefined> {
  try {
    const text = await readFile(path.join(root, rel), "utf8");
    const m = text.match(/["']?(\d{2,5}):(\d{2,5})["']?/);
    if (m) return Number(m[1]);
  } catch {
    /* ignore */
  }
  return undefined;
}

async function readJson<T>(p: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(p, "utf8")) as T;
  } catch {
    return undefined;
  }
}

/**
 * Deterministic run-plan detection for a cloned repo.
 * Prefers Docker Compose → Dockerfile → Node → Python.
 */
export async function inspectRepo(root: string): Promise<RunPlan> {
  const composeFile = await findComposeFile(root);
  if (composeFile) {
    const port = (await hostPortFromCompose(root, composeFile)) ?? 8080;
    return {
      kind: "compose",
      usesDocker: true,
      composeFile,
      setup: [],
      start: [
        {
          executable: "docker",
          args: ["compose", "-f", composeFile, "up", "-d", "--remove-orphans", "--build"],
          description: `docker compose -f ${composeFile} up --build`,
        },
      ],
      suggestedPort: port,
      summary: `Docker Compose (${composeFile}) on :${port}`,
    };
  }

  if (await exists(path.join(root, "Dockerfile"))) {
    let containerPort = 80;
    try {
      const df = await readFile(path.join(root, "Dockerfile"), "utf8");
      const exp = df.match(/^\s*EXPOSE\s+(\d+)/im);
      if (exp) containerPort = Number(exp[1]);
    } catch {
      /* default 80 */
    }
    const hostPort = 8080;
    return {
      kind: "dockerfile",
      usesDocker: true,
      setup: [
        {
          executable: "docker",
          args: ["build", "-t", "devly-try-live", "."],
          description: "docker build",
        },
      ],
      start: [
        {
          executable: "docker",
          args: [
            "run",
            "-d",
            "--rm",
            "--name",
            "devly-try-live",
            "-p",
            `${hostPort}:${containerPort}`,
            "devly-try-live",
          ],
          description: `docker run -p ${hostPort}:${containerPort}`,
        },
      ],
      suggestedPort: hostPort,
      summary: `Dockerfile build + run on :${hostPort}`,
    };
  }

  const pkg = await readJson<{
    scripts?: Record<string, string>;
    packageManager?: string;
  }>(path.join(root, "package.json"));
  if (pkg) {
    const hasLockPnpm = await exists(path.join(root, "pnpm-lock.yaml"));
    const hasLockYarn = await exists(path.join(root, "yarn.lock"));
    const pm = hasLockPnpm ? "pnpm" : hasLockYarn ? "yarn" : "npm";
    const install =
      pm === "pnpm"
        ? { executable: "pnpm", args: ["install"], description: "pnpm install" }
        : pm === "yarn"
          ? { executable: "yarn", args: ["install"], description: "yarn install" }
          : { executable: "npm", args: ["install"], description: "npm install" };

    const serverScript = serverScriptName(pkg.scripts);
    if (serverScript) {
      const command = pkg.scripts?.[serverScript] ?? "";
      const page = pageFromScript(command);
      const startArgs =
        pm === "npm" ? ["run", serverScript] : pm === "yarn" ? [serverScript] : ["run", serverScript];
      return {
        kind: "node",
        usesDocker: false,
        setup: [install],
        start: [
          {
            executable: pm,
            args: startArgs,
            description: `${pm} ${startArgs.join(" ")}`,
          },
        ],
        suggestedPort: page?.port,
        summary: page
          ? `Node (${pm} ${serverScript}) on :${page.port}`
          : `Node (${pm} ${serverScript})`,
      };
    }
    const named = pkg.scripts?.start ?? pkg.scripts?.dev;
    if (named) {
      return {
        kind: "node",
        usesDocker: false,
        setup: [],
        start: [],
        summary: `This project does not open a website. Its start script runs "${named.trim()}".`,
      };
    }
  }

  const hasPyproject = await exists(path.join(root, "pyproject.toml"));
  const hasReq = await exists(path.join(root, "requirements.txt"));
  if (hasPyproject || hasReq) {
    const setup = hasReq
      ? [
          {
            executable: "python3",
            args: ["-m", "pip", "install", "-r", "requirements.txt"],
            description: "pip install -r requirements.txt",
          },
        ]
      : [];
    // Prefer common entrypoints
    let startCmd = {
      executable: "python3",
      args: ["-m", "http.server", "8000"],
      description: "python3 -m http.server 8000 (fallback)",
    };
    if (await exists(path.join(root, "main.py"))) {
      startCmd = { executable: "python3", args: ["main.py"], description: "python3 main.py" };
    } else if (await exists(path.join(root, "app.py"))) {
      startCmd = { executable: "python3", args: ["app.py"], description: "python3 app.py" };
    }
    return {
      kind: "python",
      usesDocker: false,
      setup,
      start: [startCmd],
      suggestedPort: 8000,
      summary: "Python local run",
    };
  }

  return {
    kind: "unsupported",
    usesDocker: false,
    setup: [],
    start: [],
    summary: "No clear run path (no compose/Dockerfile/package.json/python entry)",
  };
}
