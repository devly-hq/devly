import type {
  AgentAvailability,
  AuthenticationResult,
  AgentExecutionRequest,
  AgentExecutionResult,
  CodingAgent,
} from "../types.js";
import { cancelSpawn, getVersion, runSpawn, which } from "../spawn-runner.js";

/**
 * Claude Code CLI adapter.
 * Uses officially supported non-interactive `-p` prompt mode.
 * Flags are conservative; lab-scoped cwd is the workspace.
 */
export class ClaudeCodeAgent implements CodingAgent {
  id = "claude-code";
  displayName = "Claude Code";
  capabilities = {
    supportsCodeGeneration: true,
    supportsFileEditing: true,
    supportsStreaming: true,
    supportsSessionResume: true,
    supportsStructuredOutput: true,
  };

  private sessions = new Map<string, string>();

  async detect(): Promise<AgentAvailability> {
    const path = await which("claude");
    if (!path) return { installed: false, error: "claude CLI not found on PATH" };
    const version = await getVersion("claude", ["--version"]);
    return { installed: true, authenticated: true, version, path };
  }

  async authenticate(): Promise<AuthenticationResult> {
    const avail = await this.detect();
    if (!avail.installed) return { ok: false, message: "Claude Code is not installed" };
    return { ok: true, message: "Use `claude` interactively if authentication is required" };
  }

  async execute(request: AgentExecutionRequest): Promise<AgentExecutionResult> {
    // --print / -p for non-interactive; permission mode constrained by cwd
    const args = [
      "-p",
      request.prompt,
      "--output-format",
      "text",
      "--allowedTools",
      "Read,Write,Edit,Bash,Glob,Grep",
    ];
    const result = await runSpawn("claude", args, request);
    return result;
  }

  async cancel(executionId: string): Promise<void> {
    await cancelSpawn(executionId);
  }

  async resume(executionId: string, prompt: string, workspace: string): Promise<AgentExecutionResult> {
    const sessionId = this.sessions.get(executionId);
    const args = sessionId
      ? ["-p", prompt, "--resume", sessionId, "--output-format", "text"]
      : ["-p", prompt, "--output-format", "text"];
    return runSpawn("claude", args, {
      executionId: `${executionId}-resume`,
      prompt,
      workspace,
    });
  }
}
