import type {
  AgentAvailability,
  AuthenticationResult,
  AgentExecutionRequest,
  AgentExecutionResult,
  CodingAgent,
} from "../types.js";
import { cancelSpawn, getVersion, runSpawn, which } from "../spawn-runner.js";

/**
 * Cursor CLI adapter (cursor-agent).
 * Built and ready; reports not installed when binary is missing.
 */
export class CursorAgent implements CodingAgent {
  id = "cursor";
  displayName = "Cursor Agent";
  capabilities = {
    supportsCodeGeneration: true,
    supportsFileEditing: true,
    supportsStreaming: true,
    supportsSessionResume: false,
    supportsStructuredOutput: true,
  };

  async detect(): Promise<AgentAvailability> {
    const path = (await which("cursor-agent")) ?? (await which("agent"));
    if (!path) return { installed: false, error: "cursor-agent not found on PATH" };
    const version = await getVersion(path, ["--version"]);
    return { installed: true, authenticated: true, version, path };
  }

  async authenticate(): Promise<AuthenticationResult> {
    const avail = await this.detect();
    if (!avail.installed) return { ok: false, message: "Cursor Agent CLI is not installed" };
    return { ok: true };
  }

  async execute(request: AgentExecutionRequest): Promise<AgentExecutionResult> {
    const binary = (await which("cursor-agent")) ?? "cursor-agent";
    const args = ["-p", request.prompt, "--output-format", "text"];
    return runSpawn(binary, args, request);
  }

  async cancel(executionId: string): Promise<void> {
    await cancelSpawn(executionId);
  }
}
