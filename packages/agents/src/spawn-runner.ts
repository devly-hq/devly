import { defaultRunner } from "@devly/execution";
import type { AgentExecutionRequest, AgentExecutionResult } from "./types.js";

const PROBE_MS = 4_000;

export async function runSpawn(
  executable: string,
  args: string[],
  request: AgentExecutionRequest,
): Promise<AgentExecutionResult> {
  const record = await defaultRunner.run(
    {
      id: request.executionId,
      executable,
      args,
      cwd: request.workspace,
      timeoutMs: request.timeoutMs,
      maxBuffer: 2_000_000,
    },
    { onStdout: request.onStdout, onStderr: request.onStderr },
  );

  const combined = `${record.stdout}\n${record.stderr}`.toLowerCase();
  let errorKind: AgentExecutionResult["errorKind"];
  if (record.stderr.includes("ENOENT")) errorKind = "not_installed";
  else if (record.timedOut) errorKind = "timeout";
  else if (combined.includes("usage limit") || combined.includes("rate limit") || combined.includes("quota"))
    errorKind = "usage_limit";
  else if (combined.includes("not logged in") || combined.includes("unauthorized") || combined.includes("auth"))
    errorKind = "auth";

  return {
    executionId: request.executionId,
    exitCode: record.exitCode ?? null,
    stdout: record.stdout,
    stderr: record.stderr,
    timedOut: record.timedOut,
    cancelled: record.cancelled,
    errorKind,
    errorMessage: record.timedOut
      ? "Execution timed out"
      : record.stderr.includes("ENOENT")
        ? record.stderr
        : undefined,
  };
}

export async function cancelSpawn(executionId: string): Promise<void> {
  defaultRunner.kill(executionId);
}

export async function which(command: string): Promise<string | undefined> {
  const finder = process.platform === "win32" ? "where" : "which";
  const record = await defaultRunner.run({
    executable: finder,
    args: [command],
    cwd: process.cwd(),
    timeoutMs: PROBE_MS,
  });
  if (record.exitCode !== 0) return undefined;
  return record.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
}

export async function getVersion(executable: string, args: string[] = ["--version"]): Promise<string | undefined> {
  const record = await defaultRunner.run({
    executable,
    args,
    cwd: process.cwd(),
    timeoutMs: PROBE_MS,
  });
  if (record.timedOut || record.stderr.includes("ENOENT")) return undefined;
  const line = `${record.stdout}\n${record.stderr}`.trim().split(/\r?\n/)[0];
  return line || undefined;
}
