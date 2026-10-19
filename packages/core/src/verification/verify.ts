export type CheckStatus = "pending" | "pass" | "fail" | "skipped";

export interface VerificationCheck {
  id: string;
  label: string;
  required: boolean;
  status: CheckStatus;
  detail?: string;
}

export interface EvidenceEntry {
  checkId: string;
  command?: string;
  exitCode?: number;
  logTail?: string;
  timestamp: string;
  ok: boolean;
  detail?: string;
}

export interface VerificationResult {
  status: "READY" | "PARTIALLY_READY" | "FAILED";
  checks: VerificationCheck[];
  evidence: EvidenceEntry[];
}

export function createDefaultChecks(options: {
  hasDockerServices: boolean;
  hasHttpDemo: boolean;
  hasTests: boolean;
}): VerificationCheck[] {
  return [
    { id: "code", label: "Code generated", required: true, status: "pending" },
    { id: "deps", label: "Dependencies installed", required: true, status: "pending" },
    {
      id: "docker",
      label: "Docker services started",
      required: options.hasDockerServices,
      status: options.hasDockerServices ? "pending" : "skipped",
    },
    {
      id: "unit",
      label: "Unit tests",
      required: options.hasTests,
      status: options.hasTests ? "pending" : "skipped",
    },
    { id: "start", label: "Application started", required: true, status: "pending" },
    {
      id: "health",
      label: "Application responding",
      required: options.hasHttpDemo,
      status: options.hasHttpDemo ? "pending" : "skipped",
    },
    {
      id: "demo",
      label: "Demo accessible",
      required: options.hasHttpDemo,
      status: options.hasHttpDemo ? "pending" : "skipped",
    },
  ];
}

export function summarizeVerification(checks: VerificationCheck[], evidence: EvidenceEntry[]): VerificationResult {
  const required = checks.filter((c) => c.required);
  const optional = checks.filter((c) => !c.required && c.status !== "skipped");

  const requiredFailed = required.some((c) => c.status === "fail" || c.status === "pending");
  const optionalFailed = optional.some((c) => c.status === "fail");

  if (requiredFailed) {
    return { status: "FAILED", checks, evidence };
  }
  if (optionalFailed) {
    return { status: "PARTIALLY_READY", checks, evidence };
  }
  return { status: "READY", checks, evidence };
}

export type FailureClass =
  | "dependency"
  | "compile"
  | "test_assertion"
  | "port"
  | "docker"
  | "timeout"
  | "credential"
  | "unknown";

export function classifyFailure(log: string): FailureClass {
  const l = log.toLowerCase();
  if (l.includes("eaddrinuse") || l.includes("port") && l.includes("already")) return "port";
  if (l.includes("docker") || l.includes("compose") || l.includes("cannot connect to the docker")) return "docker";
  if (l.includes("timeout") || l.includes("timed out")) return "timeout";
  if (l.includes("api key") || l.includes("unauthorized") || l.includes("authentication")) return "credential";
  if (l.includes("modulenotfound") || l.includes("cannot find module") || l.includes("no module named") || l.includes("not found:"))
    return "dependency";
  if (l.includes("syntaxerror") || l.includes("cannot find name") || l.includes("ts(") || l.includes("compilation"))
    return "compile";
  if (l.includes("assertionerror") || l.includes("failed") || l.includes("expected")) return "test_assertion";
  return "unknown";
}
