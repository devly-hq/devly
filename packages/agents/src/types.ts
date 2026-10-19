export interface AgentCapabilities {
  supportsCodeGeneration: boolean;
  supportsFileEditing: boolean;
  supportsStreaming: boolean;
  supportsSessionResume: boolean;
  supportsStructuredOutput: boolean;
}

export interface AgentAvailability {
  installed: boolean;
  authenticated?: boolean;
  version?: string;
  path?: string;
  error?: string;
}

export interface AuthenticationResult {
  ok: boolean;
  message?: string;
}

export interface AgentExecutionRequest {
  executionId: string;
  prompt: string;
  workspace: string;
  timeoutMs?: number;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}

export interface AgentExecutionResult {
  executionId: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  cancelled: boolean;
  sessionId?: string;
  errorKind?: "auth" | "usage_limit" | "not_installed" | "timeout" | "unknown";
  errorMessage?: string;
}

export interface CodingAgent {
  id: string;
  displayName: string;
  capabilities: AgentCapabilities;
  detect(): Promise<AgentAvailability>;
  authenticate(): Promise<AuthenticationResult>;
  execute(request: AgentExecutionRequest): Promise<AgentExecutionResult>;
  cancel(executionId: string): Promise<void>;
  resume?(executionId: string, prompt: string, workspace: string): Promise<AgentExecutionResult>;
}
