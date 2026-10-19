import type {
  AgentAvailability,
  AuthenticationResult,
  AgentExecutionRequest,
  AgentExecutionResult,
  CodingAgent,
} from "../types.js";

/**
 * VS Code Language Model API adapter.
 * Explanation-only: cannot edit files. Host injects the actual vscode.lm caller.
 */
export class VsCodeLmAgent implements CodingAgent {
  id = "vscode-lm";
  displayName = "VS Code Language Model";
  capabilities = {
    supportsCodeGeneration: false,
    supportsFileEditing: false,
    supportsStreaming: true,
    supportsSessionResume: false,
    supportsStructuredOutput: false,
  };

  constructor(
    private invoke?: (prompt: string) => Promise<string>,
    private isAvailable?: () => Promise<boolean>,
  ) {}

  async detect(): Promise<AgentAvailability> {
    const ok = this.isAvailable ? await this.isAvailable() : false;
    return {
      installed: ok,
      authenticated: ok,
      error: ok ? undefined : "No language model available in this editor",
    };
  }

  async authenticate(): Promise<AuthenticationResult> {
    const d = await this.detect();
    return d.installed ? { ok: true } : { ok: false, message: d.error };
  }

  async execute(request: AgentExecutionRequest): Promise<AgentExecutionResult> {
    if (!this.invoke) {
      return {
        executionId: request.executionId,
        exitCode: 1,
        stdout: "",
        stderr: "VS Code LM bridge not configured",
        timedOut: false,
        cancelled: false,
        errorKind: "not_installed",
      };
    }
    try {
      const text = await this.invoke(request.prompt);
      request.onStdout?.(text);
      return {
        executionId: request.executionId,
        exitCode: 0,
        stdout: text,
        stderr: "",
        timedOut: false,
        cancelled: false,
      };
    } catch (err) {
      return {
        executionId: request.executionId,
        exitCode: 1,
        stdout: "",
        stderr: String(err),
        timedOut: false,
        cancelled: false,
        errorKind: "unknown",
        errorMessage: String(err),
      };
    }
  }

  async cancel(): Promise<void> {
    /* no-op */
  }
}
