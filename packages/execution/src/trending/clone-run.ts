import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import net from "node:net";
import { defaultRunner, type CommandRecord } from "../process/runner.js";
import { isDeniedCommand } from "../process/denylist.js";
import { containerNameInUse, dockerManager, hostPortInUse, isMissingArmManifest } from "../docker/manager.js";
import { ensureDockerReady, type DockerBootstrapPhase } from "../docker/bootstrap.js";
import { detectEnvironment } from "../env/detect.js";
import { inspectRepo, type RunPlan } from "./inspect.js";
import { relocateBusyPort } from "../net/ports.js";
import { pathExists } from "../workspace/manager.js";

/** Long-running servers (node/python) — detach so Try Live doesn't wait forever. */
function startDetached(
  executable: string,
  args: string[],
  cwd: string,
  description: string,
): { record: CommandRecord; pid?: number } {
  const id = randomUUID();
  const child = spawn(executable, args, {
    cwd,
    env: process.env,
    shell: false,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  return {
    pid: child.pid,
    record: {
      id,
      executable,
      args,
      cwd,
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      exitCode: 0,
      stdout: `detached pid=${child.pid ?? "?"}`,
      stderr: "",
      timedOut: false,
      cancelled: false,
      description,
    },
  };
}

function waitForPort(port: number, timeoutMs: number): Promise<boolean> {
  const started = Date.now();
  return new Promise((resolve) => {
    const attempt = () => {
      const socket = net.connect({ host: "127.0.0.1", port });
      let settled = false;
      const finish = (open: boolean) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (open || Date.now() - started >= timeoutMs) {
          resolve(open);
          return;
        }
        setTimeout(attempt, 400);
      };
      socket.setTimeout(700);
      socket.once("connect", () => finish(true));
      socket.once("timeout", () => finish(false));
      socket.once("error", () => finish(false));
    };
    attempt();
  });
}

function stopDetached(pid: number | undefined): void {
  if (!pid) return;
  try {
    process.kill(pid);
  } catch {
    /* already gone */
  }
}

export interface CloneRunOptions {
  fullName: string;
  cloneUrl: string;
  htmlUrl: string;
  labId?: string;
  homeLabsRoot?: string;
  onLog?: (chunk: string) => void;
  onPhase?: (phase: string, detail: string) => void;
  /** When true, skip start (clone+inspect only). */
  cloneOnly?: boolean;
  /** Install/start Docker automatically when the repo needs it (default true). */
  bootstrapDocker?: boolean;
  /** Re-run a folder that was already cloned, after an agent fix. */
  directory?: string;
}

export interface CloneRunResult {
  labId: string;
  directory: string;
  plan: RunPlan;
  clone: CommandRecord;
  setup: CommandRecord[];
  start: CommandRecord[];
  demoUrl?: string;
  live: boolean;
  message: string;
  dockerBootstrapped?: boolean;
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "repo"
  );
}

async function writePortOverride(
  directory: string,
  composeFile: string,
  hostPort: number,
): Promise<{ file: string; hostPort: number } | undefined> {
  const text = await readFile(path.join(directory, composeFile), "utf8");
  const found = new RegExp(`["']?${hostPort}:(\\d{2,5})["']?`).exec(text);
  if (!found) return undefined;
  const services = [...text.slice(0, found.index).matchAll(/^  ([A-Za-z0-9_.-]+):\s*$/gm)];
  const service = services.at(-1)?.[1];
  const containerPort = found[1];
  if (!service || !containerPort) return undefined;
  const next = hostPort < 65000 ? hostPort + 1 : hostPort - 1;
  const rel = path.join(".devly", "port-override.yml");
  await mkdir(path.join(directory, ".devly"), { recursive: true });
  await writeFile(
    path.join(directory, rel),
    `services:\n  ${service}:\n    ports: !override\n      - "${next}:${containerPort}"\n`,
    "utf8",
  );
  return { file: rel, hostPort: next };
}

function failedCloneRun(partial: Omit<CloneRunResult, "live">): CloneRunResult {
  return { ...partial, live: false };
}

function assertHttpsGitUrl(url: string): void {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error("Invalid clone URL");
  }
  if (u.protocol !== "https:") throw new Error("Only HTTPS git clones are allowed");
  if (u.hostname !== "github.com") throw new Error("Only github.com clones are allowed in v1");
}

/** Delete trending clones that are no longer in My Labs. Never touches a kept directory. */
export async function pruneTrendingClones(keepDirectories: string[], homeLabsRoot?: string): Promise<void> {
  const root = path.resolve(homeLabsRoot ?? path.join(os.homedir(), "DevlyLabs"), "trending");
  const keep = new Set(keepDirectories.map((dir) => path.resolve(dir)));
  let names: string[];
  try {
    names = await readdir(root);
  } catch {
    return;
  }
  for (const name of names) {
    if (!name.startsWith("trend-")) continue;
    const dir = path.resolve(root, name);
    if (dir !== root && !dir.startsWith(root + path.sep)) continue;
    if (keep.has(dir)) continue;
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Clone a GitHub repo into ~/DevlyLabs/trending/… and try to run it.
 */
export async function cloneAndRunRepo(opts: CloneRunOptions): Promise<CloneRunResult> {
  assertHttpsGitUrl(opts.cloneUrl);
  const env = await detectEnvironment();
  if (!env.git) throw new Error("git is not installed");

  const home = opts.homeLabsRoot ?? path.join(os.homedir(), "DevlyLabs");
  const stamp = randomBytes(3).toString("hex");
  const labId = opts.labId ?? `trend-${slugify(opts.fullName)}-${stamp}`;
  const directory = opts.directory ?? path.join(home, "trending", labId);
  await mkdir(path.dirname(directory), { recursive: true });

  const log = opts.onLog ?? (() => undefined);

  if (opts.directory) {
    opts.onPhase?.("setup", `Running ${opts.fullName} again after the fix…`);
    log(`Running ${opts.fullName} again in the same folder…\n`);
  } else {
    opts.onPhase?.("cloning", `Cloning ${opts.fullName}… this can take a few minutes for large repos.`);
    log(`Cloning ${opts.fullName}…\n`);
  }
  const clone = opts.directory
    ? {
        id: labId,
        executable: "git",
        args: [],
        cwd: directory,
        startTime: new Date().toISOString(),
        exitCode: 0,
        stdout: "",
        stderr: "",
        timedOut: false,
        cancelled: false,
        description: "already cloned",
      }
    : await defaultRunner.run(
    {
      executable: "git",
      args: ["clone", "--progress", "--depth", "1", opts.cloneUrl, directory],
      cwd: home,
      timeoutMs: 5 * 60_000,
      description: `git clone ${opts.fullName}`,
    },
    { onStdout: log, onStderr: log },
  );
  if (clone.exitCode !== 0) {
    throw new Error(`git clone failed (exit ${clone.exitCode}): ${clone.stderr.slice(-500)}`);
  }

  // Ownership marker so deleteLab safety checks pass
  const metaDir = path.join(directory, ".devly");
  await mkdir(metaDir, { recursive: true });
  await writeFile(
    path.join(metaDir, "lab.json"),
    JSON.stringify(
      {
        id: labId,
        topicTitle: opts.fullName,
        topicId: `trending:${opts.fullName}`,
        directory,
        workspaceMode: "new-window",
        agentId: "try-live",
        state: "SETTING_UP",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        cloneUrl: opts.cloneUrl,
        htmlUrl: opts.htmlUrl,
        mode: "try-live",
      },
      null,
      2,
    ),
    "utf8",
  );

  const plan = await inspectRepo(directory);
  log(`Detected run path: ${plan.summary}\n`);

  if (opts.cloneOnly || plan.kind === "unsupported") {
    return {
      labId,
      directory,
      plan,
      clone,
      setup: [],
      start: [],
      live: false,
      message:
        plan.kind === "unsupported"
          ? `Cloned ${opts.fullName}. No automatic run path found — open the folder to explore.`
          : `Cloned ${opts.fullName}.`,
    };
  }

  let dockerBootstrapped = false;
  if (plan.usesDocker) {
    const daemonUp = env.dockerDaemonRunning;
    if (!daemonUp) {
      if (opts.bootstrapDocker === false) {
        return {
          labId,
          directory,
          plan,
          clone,
          setup: [],
          start: [],
          live: false,
          message: `Cloned ${opts.fullName}. Needs Docker (${plan.summary}) but Docker is not running.`,
        };
      }
      opts.onPhase?.("docker", "Setting up Docker for you…");
      log("This repo needs Docker. Installing/starting it for you — hang tight.\n");
      const boot = await ensureDockerReady({
        onLog: log,
        onPhase: (p: DockerBootstrapPhase, detail) => opts.onPhase?.(`docker:${p}`, detail),
        allowInstall: true,
        waitTimeoutMs: 5 * 60_000,
      });
      dockerBootstrapped = boot.installed || boot.started;
      if (!boot.ok) {
        return {
          labId,
          directory,
          plan,
          clone,
          setup: [],
          start: [],
          live: false,
          dockerBootstrapped,
          message: `Cloned ${opts.fullName}. ${boot.message}`,
        };
      }
      log(`${boot.message}\n`);
    }
  }

  const setupRecs: CommandRecord[] = [];
  for (const cmd of plan.setup) {
    const denial = isDeniedCommand({ executable: cmd.executable, args: cmd.args, cwd: directory }, directory);
    if (denial) throw new Error(denial);
    opts.onPhase?.("setup", cmd.description);
    log(`${cmd.description}…\n`);
    const rec = await defaultRunner.run(
      {
        executable: cmd.executable,
        args: cmd.args,
        cwd: directory,
        timeoutMs: 10 * 60_000,
        description: cmd.description,
      },
      { onStdout: log, onStderr: log },
    );
    setupRecs.push(rec);
    if (rec.exitCode !== 0) {
      return failedCloneRun({
        labId,
        directory,
        plan,
        clone,
        setup: setupRecs,
        start: [],
        message: `Setup failed: ${cmd.description} (exit ${rec.exitCode})`,
      });
    }
  }

  const startRecs: CommandRecord[] = [];
  let publishedPort = plan.suggestedPort;
  let pageReady = plan.kind === "compose" || plan.kind === "dockerfile";
  if (plan.kind === "compose" && plan.composeFile) {
    opts.onPhase?.(
      "starting",
      "Building in Docker. Large apps compile inside the image and can take 20–40 minutes.",
    );
    log("Building in Docker. This stays running while the image compiles.\n");
    let composeEnv: Record<string, string> | undefined;
    let extraComposeFiles: string[] = [];
    const composeUp = () =>
      dockerManager.up({
        labId,
        cwd: directory,
        composeFile: plan.composeFile,
        extraComposeFiles,
        env: composeEnv,
        onLog: log,
      });
    let up = await composeUp();
    startRecs.push(up);
    const composeLog = () => `${up.stdout}\n${up.stderr}`;
    if (up.exitCode !== 0 && isMissingArmManifest(composeLog())) {
      opts.onPhase?.("starting", "No Apple Silicon image. Retrying with linux/amd64…");
      log("This image has no Apple Silicon build. Retrying with linux/amd64…\n");
      composeEnv = { DOCKER_DEFAULT_PLATFORM: "linux/amd64" };
      up = await composeUp();
      startRecs.push(up);
    }
    const staleName = up.exitCode !== 0 ? containerNameInUse(composeLog()) : undefined;
    if (staleName) {
      opts.onPhase?.("starting", `Removing the old ${staleName} container and starting again…`);
      log(`A container named ${staleName} was already there. Removing it and starting again.\n`);
      await defaultRunner.run({
        executable: "docker",
        args: ["rm", "-f", staleName],
        cwd: directory,
        timeoutMs: 30_000,
        description: `docker rm ${staleName}`,
      });
      up = await composeUp();
      startRecs.push(up);
    }
    const takenPort = up.exitCode !== 0 ? hostPortInUse(composeLog()) : undefined;
    if (takenPort && plan.composeFile) {
      const moved = await writePortOverride(directory, plan.composeFile, takenPort);
      if (moved) {
        opts.onPhase?.("starting", `Port ${takenPort} is taken. Using ${moved.hostPort} instead…`);
        log(`Port ${takenPort} is already in use. Starting on ${moved.hostPort} instead.\n`);
        extraComposeFiles = [moved.file];
        publishedPort = moved.hostPort;
        up = await composeUp();
        startRecs.push(up);
      }
    }
    if (up.exitCode !== 0) {
      const detail = `${up.stderr}\n${up.stdout}`.trim().split(/\r?\n/).slice(-6).join("\n");
      const message = up.timedOut
        ? "Devly stopped the Docker build while it was still compiling. The project did not fail."
        : up.exitCode === 130
          ? "The Docker build was interrupted while it was still compiling."
          : `docker compose up failed (exit ${up.exitCode})${detail ? `\n${detail}` : ""}`;
      return failedCloneRun({
        labId,
        directory,
        plan,
        clone,
        setup: setupRecs,
        start: startRecs,
        message,
      });
    }
  } else if (plan.kind === "node" || plan.kind === "python") {
    if (publishedPort) {
      const relocated = await relocateBusyPort({ port: publishedPort, commands: plan.start });
      if (relocated.moved) {
        const line = `Port ${publishedPort} is already in use. Starting on ${relocated.port}.`;
        opts.onPhase?.("starting", line);
        log(`${line}\n`);
        publishedPort = relocated.port;
      } else if (relocated.blocked) {
        return failedCloneRun({
          labId,
          directory,
          plan,
          clone,
          setup: setupRecs,
          start: startRecs,
          message: `Port ${publishedPort} is already in use. Devly could not move the start command to a free port.`,
        });
      }
    }
    if (plan.start.length === 0) {
      return failedCloneRun({
        labId,
        directory,
        plan,
        clone,
        setup: setupRecs,
        start: startRecs,
        message: plan.summary,
      });
    }
    const pids: number[] = [];
    for (const cmd of plan.start) {
      const denial = isDeniedCommand({ executable: cmd.executable, args: cmd.args, cwd: directory }, directory);
      if (denial) throw new Error(denial);
      opts.onPhase?.("starting", `${cmd.description}…`);
      log(`${cmd.description} (background)…\n`);
      const started = startDetached(cmd.executable, cmd.args, directory, cmd.description);
      startRecs.push(started.record);
      if (started.pid) pids.push(started.pid);
    }
    if (publishedPort) {
      opts.onPhase?.("starting", `Waiting for a page on port ${publishedPort}…`);
      pageReady = await waitForPort(publishedPort, 12_000);
      if (!pageReady) {
        for (const pid of pids) stopDetached(pid);
        return failedCloneRun({
          labId,
          directory,
          plan,
          clone,
          setup: setupRecs,
          start: startRecs,
          message: `${plan.start.map((cmd) => cmd.description).join(", ")} did not open a page on port ${publishedPort}.`,
        });
      }
    } else {
      pageReady = false;
    }
  } else {
    for (const cmd of plan.start) {
      const denial = isDeniedCommand({ executable: cmd.executable, args: cmd.args, cwd: directory }, directory);
      if (denial) throw new Error(denial);
      opts.onPhase?.("starting", `${cmd.description}…`);
      log(`${cmd.description}…\n`);
      const rec = await defaultRunner.run(
        {
          executable: cmd.executable,
          args: cmd.args,
          cwd: directory,
          timeoutMs: 3 * 60_000,
          description: cmd.description,
        },
        { onStdout: log, onStderr: log },
      );
      startRecs.push(rec);
      if (rec.exitCode !== 0) {
        return failedCloneRun({
          labId,
          directory,
          plan,
          clone,
          setup: setupRecs,
          start: startRecs,
          message: `Start failed: ${cmd.description} (exit ${rec.exitCode})`,
        });
      }
    }
  }

  const port = publishedPort ?? (pageReady ? 8080 : undefined);
  const demoUrl = pageReady && port ? `http://127.0.0.1:${port}` : undefined;
  if (!pageReady) {
    return failedCloneRun({
      labId,
      directory,
      plan,
      clone,
      setup: setupRecs,
      start: startRecs,
      message: plan.summary || `${opts.fullName} did not open a page.`,
    });
  }
  await writeFile(
    path.join(metaDir, "lab.json"),
    JSON.stringify(
      {
        id: labId,
        topicTitle: opts.fullName,
        topicId: `trending:${opts.fullName}`,
        directory,
        workspaceMode: "new-window",
        agentId: "try-live",
        state: "READY",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        demoUrl,
        cloneUrl: opts.cloneUrl,
        htmlUrl: opts.htmlUrl,
        mode: "try-live",
        runKind: plan.kind,
      },
      null,
      2,
    ),
    "utf8",
  );

  // Sanity: directory still there
  if (!(await pathExists(directory))) {
    throw new Error("Clone directory missing after start");
  }

  return {
    labId,
    directory,
    plan,
    clone,
    setup: setupRecs,
    start: startRecs,
    demoUrl,
    live: true,
    dockerBootstrapped,
    message: dockerBootstrapped
      ? `Docker is ready and ${opts.fullName} is running. Open ${demoUrl} — you can try it now.`
      : `It's running. Open ${demoUrl} — you can try ${opts.fullName} now.`,
  };
}
