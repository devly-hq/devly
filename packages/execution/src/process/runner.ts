import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { redactSecrets } from "@devly/core";

export interface CommandSpec {
  /** Stable id so callers can cancel this process. */
  id?: string;
  executable: string;
  args: string[];
  cwd: string;
  timeoutMs?: number;
  /** Kill only when the process goes silent for this long. */
  idleTimeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  description?: string;
  maxBuffer?: number;
}

export interface CommandRecord {
  id: string;
  executable: string;
  args: string[];
  cwd: string;
  startTime: string;
  endTime?: string;
  exitCode?: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  cancelled: boolean;
  description?: string;
}

const active = new Map<string, ChildProcess>();
const records = new Map<string, CommandRecord>();

export class ProcessRunner {
  async run(
    spec: CommandSpec,
    hooks?: { onStdout?: (c: string) => void; onStderr?: (c: string) => void },
  ): Promise<CommandRecord> {
    const id = spec.id ?? randomUUID();
    const record: CommandRecord = {
      id,
      executable: spec.executable,
      args: spec.args,
      cwd: spec.cwd,
      startTime: new Date().toISOString(),
      stdout: "",
      stderr: "",
      timedOut: false,
      cancelled: false,
      description: spec.description,
    };

    return new Promise((resolve) => {
      const child = spawn(spec.executable, spec.args, {
        cwd: spec.cwd,
        env: { ...process.env, ...spec.env },
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      active.set(id, child);
      records.set(id, record);
      const maxBuffer = spec.maxBuffer ?? 1_500_000;

      let idleTimer: ReturnType<typeof setTimeout> | undefined;
      const clearIdle = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = undefined;
      };
      const armIdle = () => {
        if (!spec.idleTimeoutMs || spec.idleTimeoutMs <= 0) return;
        clearIdle();
        idleTimer = setTimeout(() => {
          record.timedOut = true;
          this.kill(id);
        }, spec.idleTimeoutMs);
      };
      const stopTimers = () => {
        if (timer) clearTimeout(timer);
        clearIdle();
      };

      const timer =
        spec.timeoutMs && spec.timeoutMs > 0
          ? setTimeout(() => {
              record.timedOut = true;
              this.kill(id);
            }, spec.timeoutMs)
          : undefined;
      armIdle();

      child.stdout.on("data", (buf: Buffer) => {
        armIdle();
        const chunk = redactSecrets(buf.toString("utf8"));
        if (record.stdout.length < maxBuffer) record.stdout += chunk;
        hooks?.onStdout?.(chunk);
      });
      child.stderr.on("data", (buf: Buffer) => {
        armIdle();
        const chunk = redactSecrets(buf.toString("utf8"));
        if (record.stderr.length < maxBuffer) record.stderr += chunk;
        hooks?.onStderr?.(chunk);
      });

      child.on("error", (err) => {
        stopTimers();
        active.delete(id);
        records.delete(id);
        record.endTime = new Date().toISOString();
        record.exitCode = null;
        record.stderr += String(err);
        resolve(record);
      });

      child.on("close", (code, signal) => {
        stopTimers();
        active.delete(id);
        records.delete(id);
        if ((signal === "SIGTERM" || signal === "SIGKILL") && !record.timedOut) {
          record.cancelled = true;
        }
        record.endTime = new Date().toISOString();
        record.exitCode = code;
        resolve(record);
      });
    });
  }

  kill(id: string): void {
    const child = active.get(id);
    const record = records.get(id);
    if (record && !record.timedOut) record.cancelled = true;
    if (!child) return;
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { shell: false });
    } else {
      try {
        child.kill("SIGTERM");
        setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch {
            /* ignore */
          }
        }, 2000);
      } catch {
        /* ignore */
      }
    }
    active.delete(id);
  }

  killAll(): void {
    for (const id of [...active.keys()]) this.kill(id);
  }
}

export const defaultRunner = new ProcessRunner();

/** Short probe used by env detection and Docker bootstrap. */
export async function runCaptured(
  executable: string,
  args: string[],
  options?: { timeoutMs?: number; env?: NodeJS.ProcessEnv; cwd?: string },
): Promise<{ code: number | null; out: string; timedOut: boolean }> {
  const record = await defaultRunner.run({
    executable,
    args,
    cwd: options?.cwd ?? process.cwd(),
    timeoutMs: options?.timeoutMs,
    env: options?.env,
  });
  const out = `${record.stdout}\n${record.stderr}${record.timedOut ? "\n[timed out]" : ""}`.trim();
  return { code: record.exitCode ?? null, out, timedOut: record.timedOut };
}
