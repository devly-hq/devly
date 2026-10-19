import type {
  AgentAvailability,
  AuthenticationResult,
  AgentExecutionRequest,
  AgentExecutionResult,
  CodingAgent,
} from "../types.js";

/**
 * Manual handoff for Antigravity / unsupported agents.
 * Writes the prompt to PROMPT.md and waits for the user to finish.
 */
export class ManualHandoffAgent implements CodingAgent {
  id = "manual";
  displayName = "Manual Handoff";
  capabilities = {
    supportsCodeGeneration: false,
    supportsFileEditing: false,
    supportsStreaming: false,
    supportsSessionResume: false,
    supportsStructuredOutput: false,
  };

  async detect(): Promise<AgentAvailability> {
    return { installed: true, authenticated: true, version: "manual" };
  }

  async authenticate(): Promise<AuthenticationResult> {
    return { ok: true };
  }

  async execute(request: AgentExecutionRequest): Promise<AgentExecutionResult> {
    const { writeFile, mkdir } = await import("node:fs/promises");
    const path = await import("node:path");
    await mkdir(request.workspace, { recursive: true });
    await writeFile(path.join(request.workspace, "PROMPT.md"), request.prompt, "utf8");
    request.onStdout?.(
      "Manual handoff: wrote PROMPT.md. Open this folder in your agent, complete the lab, then click Resume/Verify in Devly.\n",
    );
    return {
      executionId: request.executionId,
      exitCode: 0,
      stdout: "manual-handoff",
      stderr: "",
      timedOut: false,
      cancelled: false,
    };
  }

  async cancel(): Promise<void> {
    /* no-op */
  }
}
