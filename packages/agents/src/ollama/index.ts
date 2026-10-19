import type {
  AgentAvailability,
  AuthenticationResult,
  AgentExecutionRequest,
  AgentExecutionResult,
  CodingAgent,
} from "../types.js";

/**
 * Ollama local HTTP adapter — used for explanations when available.
 */
export class OllamaAgent implements CodingAgent {
  id = "ollama";
  displayName = "Ollama";
  capabilities = {
    supportsCodeGeneration: false,
    supportsFileEditing: false,
    supportsStreaming: true,
    supportsSessionResume: false,
    supportsStructuredOutput: false,
  };

  constructor(private baseUrl = "http://127.0.0.1:11434") {}

  async detect(): Promise<AgentAvailability> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(4_000) });
      if (!res.ok) return { installed: false, error: `Ollama HTTP ${res.status}` };
      return { installed: true, authenticated: true, version: "local" };
    } catch {
      return { installed: false, error: "Ollama is not running" };
    }
  }

  async authenticate(): Promise<AuthenticationResult> {
    const d = await this.detect();
    return d.installed ? { ok: true } : { ok: false, message: d.error };
  }

  async execute(request: AgentExecutionRequest): Promise<AgentExecutionResult> {
    try {
      const res = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "llama3.2", prompt: request.prompt, stream: false }),
      });
      if (!res.ok) throw new Error(`Ollama ${res.status}`);
      const data = (await res.json()) as { response?: string };
      const text = data.response ?? "";
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
        errorKind: "not_installed",
        errorMessage: String(err),
      };
    }
  }

  async cancel(): Promise<void> {
    /* no-op */
  }
}
