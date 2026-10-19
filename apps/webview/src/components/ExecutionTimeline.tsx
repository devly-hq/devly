import type { LabState, VerificationCheck } from "@devly/protocol";

const STAGES: LabState[] = [
  "PLANNING",
  "WAITING_FOR_APPROVAL",
  "GENERATING",
  "SETTING_UP",
  "TESTING",
  "REPAIRING",
  "STARTING",
  "VERIFYING",
  "READY",
];

const LABELS: Partial<Record<LabState, string>> = {
  PLANNING: "Planning architecture",
  WAITING_FOR_APPROVAL: "Waiting for approval",
  GENERATING: "Generating project files",
  SETTING_UP: "Installing dependencies",
  TESTING: "Running tests",
  REPAIRING: "Repairing failures",
  STARTING: "Starting application",
  VERIFYING: "Verifying application",
  READY: "Ready",
  PARTIALLY_READY: "Partially ready",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

interface Props {
  state: LabState;
  checks?: VerificationCheck[];
}

export function ExecutionTimeline({ state, checks }: Props) {
  if (checks && checks.length > 0 && (state === "READY" || state === "PARTIALLY_READY" || state === "FAILED" || state === "VERIFYING")) {
    return (
      <ul className="timeline">
        {checks.map((c) => (
          <li key={c.id} className={`timeline-item status-${c.status}`}>
            <span className="timeline-mark" aria-hidden>
              {c.status === "pass" ? "✓" : c.status === "fail" ? "✕" : c.status === "skipped" ? "–" : "◌"}
            </span>
            <span className="timeline-label">{c.label}</span>
          </li>
        ))}
      </ul>
    );
  }

  const cur = STAGES.indexOf(state === "PARTIALLY_READY" ? "READY" : state);
  return (
    <ul className="timeline">
      {STAGES.filter((s) => s !== "READY" || state === "READY" || state === "PARTIALLY_READY").map((s, i) => {
        const done = cur > i || state === "READY" || state === "PARTIALLY_READY";
        const running = STAGES[cur] === s;
        const cls = done && !running ? "pass" : running ? "run" : "pend";
        return (
          <li key={s} className={`timeline-item status-${cls}`}>
            <span className="timeline-mark" aria-hidden>
              {cls === "pass" ? "✓" : cls === "run" ? "◌" : "○"}
            </span>
            <span className="timeline-label">{LABELS[s] ?? s}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function VerificationChecklist({ checks }: { checks: VerificationCheck[] }) {
  return <ExecutionTimeline state="VERIFYING" checks={checks} />;
}
