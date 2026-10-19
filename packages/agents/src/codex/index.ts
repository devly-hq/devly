import type {
  AgentAvailability,
  AuthenticationResult,
  AgentExecutionRequest,
  AgentExecutionResult,
  CodingAgent,
} from "../types.js";
import { cancelSpawn, getVersion, runSpawn, which } from "../spawn-runner.js";

/**
 * OpenAI Codex CLI adapter.
 * Uses `codex exec` with workspace-write sandbox scoped to the lab directory.
 */
export class CodexAgent implements CodingAgent {
  id = "codex";
  displayName = "OpenAI Codex";
  capabilities = {
    supportsCodeGeneration: true,
    supportsFileEditing: true,
    supportsStreaming: true,
    supportsSessionResume: true,
    supportsStructuredOutput: true,
  };

  async detect(): Promise<AgentAvailability> {
    const path = await which("codex");
    if (!path) return { installed: false, error: "codex CLI not found on PATH" };
    const version = await getVersion("codex", ["--version"]);
    return { installed: true, authenticated: true, version, path };
  }

  async authenticate(): Promise<AuthenticationResult> {
    const avail = await this.detect();
    if (!avail.installed) return { ok: false, message: "Codex is not installed" };
    return { ok: true, message: "Authenticate via `codex` if needed" };
  }

  async execute(request: AgentExecutionRequest): Promise<AgentExecutionResult> {
    const args = [
      "exec",
      "--json",
      "--sandbox",
      "workspace-write",
      "-C",
      request.workspace,
      request.prompt,
    ];
    return runSpawn("codex", args, request);
  }

  async cancel(executionId: string): Promise<void> {
    await cancelSpawn(executionId);
  }
}
