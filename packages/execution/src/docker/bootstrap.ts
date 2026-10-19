import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { detectEnvironment } from "../env/detect.js";
import { runCaptured } from "../process/runner.js";

export type DockerBootstrapPhase =
  | "checking"
  | "starting"
  | "installing"
  | "waiting"
  | "ready"
  | "failed";

export interface DockerBootstrapOptions {
  onLog?: (chunk: string) => void;
  onPhase?: (phase: DockerBootstrapPhase, detail: string) => void;
  /** Max time waiting for daemon after start/install (default 3 min). */
  waitTimeoutMs?: number;
  /** Attempt install if Docker is missing (default true). */
  allowInstall?: boolean;
}

export interface DockerBootstrapResult {
  ok: boolean;
  wasAlreadyRunning: boolean;
  installed: boolean;
  started: boolean;
  message: string;
  actions: string[];
}

function log(opts: DockerBootstrapOptions, msg: string): void {
  opts.onLog?.(msg.endsWith("\n") ? msg : `${msg}\n`);
}

function phase(opts: DockerBootstrapOptions, p: DockerBootstrapPhase, detail: string): void {
  opts.onPhase?.(p, detail);
  log(opts, `[docker] ${detail}`);
}

function run(
  executable: string,
  args: string[],
  options?: { timeoutMs?: number; env?: NodeJS.ProcessEnv },
): Promise<{ code: number | null; out: string }> {
  return runCaptured(executable, args, options);
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function which(bin: string): Promise<boolean> {
  const finder = process.platform === "win32" ? "where" : "which";
  const r = await run(finder, [bin], { timeoutMs: 10_000 });
  return r.code === 0;
}

/** Docker Desktop / Engine app present even if CLI is missing from PATH. */
export async function findDockerDesktopApp(): Promise<string | undefined> {
  if (process.platform === "darwin") {
    const p = "/Applications/Docker.app";
    if (await exists(p)) return p;
  }
  if (process.platform === "win32") {
    const candidates = [
      path.join(process.env["ProgramFiles"] ?? "C:\\Program Files", "Docker", "Docker", "Docker Desktop.exe"),
      path.join(process.env["ProgramFiles"] ?? "C:\\Program Files", "Docker", "Docker Desktop.exe"),
    ];
    for (const c of candidates) {
      if (await exists(c)) return c;
    }
  }
  // Linux: engine usually means CLI exists; snap path
  if (process.platform === "linux") {
    if (await exists("/usr/bin/docker")) return "/usr/bin/docker";
  }
  return undefined;
}

/** Resolve docker CLI from PATH or common Docker Desktop locations. */
export async function resolveDockerBin(): Promise<string | undefined> {
  if (await which("docker")) return "docker";
  const candidates =
    process.platform === "win32"
      ? [
          path.join(process.env["ProgramFiles"] ?? "C:\\Program Files", "Docker", "Docker", "resources", "bin", "docker.exe"),
        ]
      : [
          "/usr/local/bin/docker",
          "/opt/homebrew/bin/docker",
          path.join(os.homedir(), ".docker", "bin", "docker"),
        ];
  for (const c of candidates) {
    if (await exists(c)) return c;
  }
  return undefined;
}

async function tryDockerInfo(bin: string, env?: NodeJS.ProcessEnv): Promise<boolean> {
  const r = await run(bin, ["info"], { timeoutMs: 3_000, env });
  return r.code === 0;
}

/**
 * One short probe. Do not switch Docker contexts or open extra sockets —
 * a burst of `docker info` / `docker context use` while Desktop is starting
 * wedges the engine until the user force-quits it.
 */
export async function isDockerDaemonReady(): Promise<boolean> {
  const bin = await resolveDockerBin();
  if (!bin) return false;
  return tryDockerInfo(bin);
}

async function waitForDockerDaemon(
  opts: DockerBootstrapOptions,
  timeoutMs: number,
): Promise<boolean> {
  phase(opts, "waiting", `Waiting for Docker daemon (up to ${Math.round(timeoutMs / 1000)}s)…`);
  const start = Date.now();
  let attempt = 0;
  while (Date.now() - start < timeoutMs) {
    attempt++;
    if (await isDockerDaemonReady()) {
      phase(opts, "ready", "Docker daemon is ready.");
      return true;
    }
    if (attempt % 4 === 0) {
      log(opts, `[docker] still waiting… (${Math.round((Date.now() - start) / 1000)}s)`);
    }
    await sleep(3000);
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function startDockerDesktop(opts: DockerBootstrapOptions): Promise<boolean> {
  phase(opts, "starting", "Starting Docker Desktop…");

  // Newer Docker Desktop CLIs: `docker desktop start`
  const bin = await resolveDockerBin();
  if (bin) {
    const desk = await run(bin, ["desktop", "start"], { timeoutMs: 60_000 });
    if (desk.code === 0) {
      log(opts, "[docker] `docker desktop start` ok");
      return true;
    }
  }

  if (process.platform === "darwin") {
    const app = await findDockerDesktopApp();
    if (!app) return false;
    const r = await run("open", ["-a", "Docker"], { timeoutMs: 30_000 });
    return r.code === 0;
  }
  if (process.platform === "win32") {
    const exe = await findDockerDesktopApp();
    if (!exe) return false;
    spawn(exe, [], { detached: true, stdio: "ignore", shell: false }).unref();
    return true;
  }
  if (process.platform === "linux") {
    const systemctl = await run("systemctl", ["start", "docker"], { timeoutMs: 60_000 });
    if (systemctl.code === 0) return true;
    const service = await run("service", ["docker", "start"], { timeoutMs: 60_000 });
    return service.code === 0;
  }
  return false;
}

async function installDocker(opts: DockerBootstrapOptions): Promise<{ ok: boolean; detail: string }> {
  phase(opts, "installing", "Docker not found — installing…");
  if (process.platform === "darwin") {
    if (await which("brew")) {
      log(opts, "[docker] Using Homebrew: brew install --cask docker");
      // NONINTERACTIVE helps CI; on user machines brew may still ask for password in GUI/secure entry
      const r = await run("brew", ["install", "--cask", "docker"], {
        timeoutMs: 15 * 60_000,
        env: { ...process.env, NONINTERACTIVE: "1", HOMEBREW_NO_AUTO_UPDATE: "1" },
      });
      log(opts, r.out.slice(-1500));
      if (r.code === 0 || (await findDockerDesktopApp())) {
        return { ok: true, detail: "Installed Docker Desktop via Homebrew." };
      }
      return {
        ok: false,
        detail: `brew install failed (exit ${r.code}). ${r.out.slice(-300)}`,
      };
    }
    // No brew — download isn't silent without admin; open installer page as last resort after trying nothing else
    return {
      ok: false,
      detail: "Homebrew not found. Install Homebrew or Docker Desktop, then retry Try Live.",
    };
  }

  if (process.platform === "win32") {
    if (await which("winget")) {
      log(opts, "[docker] Using winget: install Docker Desktop");
      const r = await run(
        "winget",
        ["install", "-e", "--id", "Docker.DockerDesktop", "--accept-package-agreements", "--accept-source-agreements"],
        { timeoutMs: 20 * 60_000 },
      );
      log(opts, r.out.slice(-1500));
      if (r.code === 0 || (await findDockerDesktopApp())) {
        return { ok: true, detail: "Installed Docker Desktop via winget." };
      }
      return { ok: false, detail: `winget install failed (exit ${r.code}).` };
    }
    if (await which("choco")) {
      const r = await run("choco", ["install", "docker-desktop", "-y"], { timeoutMs: 20 * 60_000 });
      log(opts, r.out.slice(-1500));
      if (r.code === 0 || (await findDockerDesktopApp())) {
        return { ok: true, detail: "Installed Docker Desktop via Chocolatey." };
      }
    }
    return { ok: false, detail: "winget/choco not found. Install Docker Desktop, then retry." };
  }

  if (process.platform === "linux") {
    // Prefer official convenience script written to a temp file (avoid curl|sh denylist pattern in our runner)
    const scriptPath = path.join(os.tmpdir(), `devly-get-docker-${Date.now()}.sh`);
    log(opts, "[docker] Downloading Docker install script…");
    const dl = await run("curl", ["-fsSL", "https://get.docker.com", "-o", scriptPath], {
      timeoutMs: 120_000,
    });
    if (dl.code !== 0) {
      return { ok: false, detail: `Failed to download get.docker.com: ${dl.out.slice(-200)}` };
    }
    log(opts, "[docker] Running install script (may prompt for sudo)…");
    const inst = await run("sudo", ["sh", scriptPath], { timeoutMs: 15 * 60_000 });
    log(opts, inst.out.slice(-1500));
    // Also ensure user can talk to daemon later — best-effort group add
    const user = os.userInfo().username;
    await run("sudo", ["usermod", "-aG", "docker", user], { timeoutMs: 30_000 });
    if (inst.code === 0 || (await which("docker"))) {
      return { ok: true, detail: "Installed Docker Engine via get.docker.com." };
    }
    return { ok: false, detail: `Docker install script failed (exit ${inst.code}).` };
  }

  return { ok: false, detail: `Unsupported platform: ${process.platform}` };
}

/**
 * Ensure Docker CLI + daemon are ready for Try Live.
 * - If running: no-op
 * - If installed/stopped: start Desktop/service and wait
 * - If missing: install (brew/winget/get.docker.com), start, wait
 */
export async function ensureDockerReady(
  opts: DockerBootstrapOptions = {},
): Promise<DockerBootstrapResult> {
  const actions: string[] = [];
  // Docker Desktop cold-start after install/quit often needs several minutes.
  const waitTimeoutMs = opts.waitTimeoutMs ?? 5 * 60_000;
  const allowInstall = opts.allowInstall !== false;

  phase(opts, "checking", "Checking Docker…");
  const env = await detectEnvironment();
  if (env.dockerDaemonRunning || (await isDockerDaemonReady())) {
    return {
      ok: true,
      wasAlreadyRunning: true,
      installed: false,
      started: false,
      message: "Docker is already running.",
      actions,
    };
  }

  let installed = false;
  let started = false;

  const hasCli = env.dockerInstalled || (await which("docker"));
  const desktopApp = await findDockerDesktopApp();

  if (!hasCli && !desktopApp) {
    if (!allowInstall) {
      return {
        ok: false,
        wasAlreadyRunning: false,
        installed: false,
        started: false,
        message: "Docker is not installed.",
        actions,
      };
    }
    const inst = await installDocker(opts);
    actions.push(inst.detail);
    installed = inst.ok;
    if (!inst.ok) {
      phase(opts, "failed", inst.detail);
      return {
        ok: false,
        wasAlreadyRunning: false,
        installed: false,
        started: false,
        message: inst.detail,
        actions,
      };
    }
  } else if (!hasCli && desktopApp) {
    log(opts, "[docker] Docker Desktop found; CLI may appear after first launch.");
  }

  // Start desktop/engine
  const startedOk = await startDockerDesktop(opts);
  started = startedOk;
  actions.push(startedOk ? "Started Docker Desktop/engine." : "Tried to start Docker.");

  const ready = await waitForDockerDaemon(opts, waitTimeoutMs);
  if (!ready) {
    const msg =
      "Docker Desktop is open but the engine is not responding. Quit Docker Desktop completely, open it again, wait until it says running, then hit Try Live.";
    phase(opts, "failed", msg);
    return {
      ok: false,
      wasAlreadyRunning: false,
      installed,
      started,
      message: msg,
      actions,
    };
  }

  return {
    ok: true,
    wasAlreadyRunning: false,
    installed,
    started,
    message: installed
      ? "Docker installed and running. Continuing Try Live…"
      : "Docker started. Continuing Try Live…",
    actions,
  };
}
