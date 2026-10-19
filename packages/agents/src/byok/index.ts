import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  AgentAvailability,
  AuthenticationResult,
  AgentExecutionRequest,
  AgentExecutionResult,
  CodingAgent,
} from "../types.js";

export interface ByokConfig {
  provider: "openai" | "anthropic";
  apiKey: string;
  model?: string;
}

/**
 * BYOK adapter for explanations and constrained file writing.
 * Does not claim full autonomous agent parity; used mainly for Ask Shade / specs.
 */
export class ByokAgent implements CodingAgent {
  id = "byok";
  displayName = "Bring Your Own API Key";
  capabilities = {
    supportsCodeGeneration: true,
    supportsFileEditing: true,
    supportsStreaming: false,
    supportsSessionResume: false,
    supportsStructuredOutput: true,
  };

  constructor(private getConfig: () => Promise<ByokConfig | undefined>) {}

  async detect(): Promise<AgentAvailability> {
    const cfg = await this.getConfig();
    return {
      installed: Boolean(cfg?.apiKey),
      authenticated: Boolean(cfg?.apiKey),
      version: cfg?.provider,
      error: cfg?.apiKey ? undefined : "No API key configured in Devly settings",
    };
  }

  async authenticate(): Promise<AuthenticationResult> {
    const cfg = await this.getConfig();
    return cfg?.apiKey
      ? { ok: true }
      : { ok: false, message: "Store an API key via Devly SecretStorage settings" };
  }

  async execute(request: AgentExecutionRequest): Promise<AgentExecutionResult> {
    const cfg = await this.getConfig();
    if (!cfg?.apiKey) {
      return {
        executionId: request.executionId,
        exitCode: 1,
        stdout: "",
        stderr: "Missing API key",
        timedOut: false,
        cancelled: false,
        errorKind: "auth",
        errorMessage: "Missing API key",
      };
    }

    try {
      const text = await this.chat(cfg, request.prompt);
      // If the model returns a fenced JSON plan, pass it through.
      request.onStdout?.(text);
      // For file-writing prompts, prefer FakeAgent for CI; BYOK explanation path stores reply.
      await mkdir(request.workspace, { recursive: true });
      await writeFile(path.join(request.workspace, ".devly-byok-reply.md"), text, "utf8");
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
    /* HTTP requests are short-lived in MVP */
  }

  private async chat(cfg: ByokConfig, prompt: string): Promise<string> {
    if (cfg.provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": cfg.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: cfg.model ?? "claude-sonnet-4-20250514",
          max_tokens: 4096,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
      const data = (await res.json()) as { content?: Array<{ text?: string }> };
      return data.content?.map((c) => c.text ?? "").join("\n") ?? "";
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model ?? "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI API ${res.status}`);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content ?? "";
  }
}
