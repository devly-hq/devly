import { defaultRunner, type CommandRecord } from "../process/runner.js";

export interface DockerComposeOptions {
  labId: string;
  cwd: string;
  composeFile?: string;
  /** Later files override the first. Used for a port remap. */
  extraComposeFiles?: string[];
  env?: Record<string, string>;
  onLog?: (chunk: string) => void;
}

/** True when a pull failed because the image has no linux/arm64 build. */
export function isMissingArmManifest(text: string): boolean {
  return /no matching manifest for linux\/arm64|no match for platform in manifest/i.test(text);
}

/** Container name from "The container name \"/x\" is already in use". */
export function containerNameInUse(text: string): string | undefined {
  const match = text.match(/container name ["']\/?([^"']+)["'] is already in use/i);
  return match?.[1];
}

/** Host port from a Docker bind failure. */
export function hostPortInUse(text: string): number | undefined {
  const match = text.match(/(?:bind for [^:\s]+:|0\.0\.0\.0:)(\d{2,5}).*(?:failed|address already in use)|port is already allocated/i);
  if (!match?.[1]) {
    const loose = text.match(/:(\d{2,5}): bind: address already in use/i);
    return loose ? Number(loose[1]) : undefined;
  }
  return Number(match[1]);
}

function projectName(labId: string): string {
  return `devly-${labId}`.toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 50);
}

export class DockerManager {
  async up(options: DockerComposeOptions): Promise<CommandRecord> {
    const project = projectName(options.labId);
    const args = ["compose", "-p", project];
    if (options.composeFile) args.push("-f", options.composeFile);
    for (const extra of options.extraComposeFiles ?? []) args.push("-f", extra);
    args.push("up", "-d", "--remove-orphans");
    return defaultRunner.run(
      {
        executable: "docker",
        args,
        cwd: options.cwd,
        env: {
          ...options.env,
          COMPOSE_PROJECT_NAME: project,
          // Label hint for ownership (compose may honor labels in yaml)
          DEVLY_LAB_ID: options.labId,
        },
        // Image builds (Gradle, npm) keep printing for a long time. 10 minutes
        // was killing healthy Stirling-PDF compiles with exit 130.
        timeoutMs: 45 * 60_000,
        idleTimeoutMs: 8 * 60_000,
        description: "docker compose up",
      },
      { onStdout: options.onLog, onStderr: options.onLog },
    );
  }

  async down(options: DockerComposeOptions): Promise<CommandRecord> {
    const project = projectName(options.labId);
    const args = ["compose", "-p", project];
    if (options.composeFile) args.push("-f", options.composeFile);
    args.push("down", "--remove-orphans");
    return defaultRunner.run(
      {
        executable: "docker",
        args,
        cwd: options.cwd,
        env: { ...options.env, COMPOSE_PROJECT_NAME: project },
        timeoutMs: 5 * 60_000,
        description: "docker compose down",
      },
      { onStdout: options.onLog, onStderr: options.onLog },
    );
  }

  async ps(options: DockerComposeOptions): Promise<CommandRecord> {
    const project = projectName(options.labId);
    return defaultRunner.run({
      executable: "docker",
      args: ["compose", "-p", project, "ps", "--format", "json"],
      cwd: options.cwd,
      timeoutMs: 30_000,
      description: "docker compose ps",
    });
  }

  /** Best-effort cleanup of containers labeled by this lab. */
  async cleanupLabeled(labId: string, onLog?: (c: string) => void): Promise<CommandRecord> {
    const list = await defaultRunner.run({
      executable: "docker",
      args: ["ps", "-aq", "--filter", `label=devly.lab=${labId}`],
      cwd: process.cwd(),
      timeoutMs: 30_000,
    });
    const ids = list.stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (ids.length === 0) return list;
    return defaultRunner.run(
      {
        executable: "docker",
        args: ["rm", "-f", ...ids],
        cwd: process.cwd(),
        timeoutMs: 60_000,
        description: "remove labeled containers",
      },
      { onStdout: onLog, onStderr: onLog },
    );
  }
}

export const dockerManager = new DockerManager();
