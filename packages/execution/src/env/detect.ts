import os from "node:os";
import { runCaptured } from "../process/runner.js";

export interface EnvReport {
  platform: NodeJS.Platform;
  arch: string;
  dockerInstalled: boolean;
  dockerDaemonRunning: boolean;
  dockerComposeV2: boolean;
  node: string | undefined;
  python: string | undefined;
  uv: string | undefined;
  go: string | undefined;
  git: string | undefined;
  freeDiskHintMb?: number;
}

async function whichVersion(bin: string, args: string[] = ["--version"]): Promise<string | undefined> {
  const finder = process.platform === "win32" ? "where" : "which";
  const found = await runCaptured(finder, [bin], { timeoutMs: 8_000 });
  if (found.code !== 0) return undefined;
  const ver = await runCaptured(bin, args, { timeoutMs: 8_000 });
  return ver.out.split(/\r?\n/)[0];
}

export async function detectEnvironment(): Promise<EnvReport> {
  const dockerWhich = await runCaptured(process.platform === "win32" ? "where" : "which", ["docker"], {
    timeoutMs: 8_000,
  });
  const dockerInstalled = dockerWhich.code === 0;
  let dockerDaemonRunning = false;
  let dockerComposeV2 = false;
  if (dockerInstalled) {
    const info = await runCaptured("docker", ["info"], { timeoutMs: 3_000 });
    dockerDaemonRunning = info.code === 0;
    const compose = await runCaptured("docker", ["compose", "version"], { timeoutMs: 3_000 });
    dockerComposeV2 = compose.code === 0;
  }

  return {
    platform: process.platform,
    arch: os.arch(),
    dockerInstalled,
    dockerDaemonRunning,
    dockerComposeV2,
    node: await whichVersion("node"),
    python: (await whichVersion("python3")) ?? (await whichVersion("python")),
    uv: await whichVersion("uv"),
    go: await whichVersion("go", ["version"]),
    git: await whichVersion("git"),
  };
}

export function formatAvailableTools(env: EnvReport): string {
  const parts = [
    `os=${env.platform}/${env.arch}`,
    env.node ? `node=${env.node}` : "node=missing",
    env.python ? `python=${env.python}` : "python=missing",
    env.uv ? `uv=${env.uv}` : "uv=missing",
    env.go ? `go=${env.go}` : "go=missing",
    env.git ? `git=${env.git}` : "git=missing",
    `docker=${env.dockerInstalled ? (env.dockerDaemonRunning ? "running" : "installed-daemon-stopped") : "missing"}`,
    `compose=${env.dockerComposeV2 ? "v2" : "missing"}`,
  ];
  return parts.join(", ");
}
