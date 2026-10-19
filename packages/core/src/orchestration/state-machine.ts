export type LabState =
  | "CREATED"
  | "PLANNING"
  | "WAITING_FOR_APPROVAL"
  | "GENERATING"
  | "SETTING_UP"
  | "TESTING"
  | "REPAIRING"
  | "STARTING"
  | "VERIFYING"
  | "READY"
  | "PARTIALLY_READY"
  | "FAILED"
  | "CANCELLED";

export type LabEvent =
  | { type: "START_PLANNING" }
  | { type: "PLAN_READY" }
  | { type: "APPROVE" }
  | { type: "REJECT" }
  | { type: "GENERATION_DONE" }
  | { type: "SETUP_DONE" }
  | { type: "TESTS_PASSED" }
  | { type: "TESTS_FAILED" }
  | { type: "REPAIR_DONE" }
  | { type: "REPAIR_EXHAUSTED" }
  | { type: "START_DONE" }
  | { type: "VERIFY_READY" }
  | { type: "VERIFY_PARTIAL" }
  | { type: "VERIFY_FAILED" }
  | { type: "CANCEL" }
  | { type: "FAIL"; reason?: string };

const TRANSITIONS: Record<LabState, Partial<Record<LabEvent["type"], LabState>>> = {
  CREATED: {
    START_PLANNING: "PLANNING",
    CANCEL: "CANCELLED",
    FAIL: "FAILED",
  },
  PLANNING: {
    PLAN_READY: "WAITING_FOR_APPROVAL",
    CANCEL: "CANCELLED",
    FAIL: "FAILED",
  },
  WAITING_FOR_APPROVAL: {
    APPROVE: "GENERATING",
    REJECT: "CANCELLED",
    CANCEL: "CANCELLED",
    FAIL: "FAILED",
  },
  GENERATING: {
    GENERATION_DONE: "SETTING_UP",
    CANCEL: "CANCELLED",
    FAIL: "FAILED",
  },
  SETTING_UP: {
    SETUP_DONE: "TESTING",
    CANCEL: "CANCELLED",
    FAIL: "FAILED",
  },
  TESTING: {
    TESTS_PASSED: "STARTING",
    TESTS_FAILED: "REPAIRING",
    CANCEL: "CANCELLED",
    FAIL: "FAILED",
  },
  REPAIRING: {
    REPAIR_DONE: "TESTING",
    REPAIR_EXHAUSTED: "FAILED",
    CANCEL: "CANCELLED",
    FAIL: "FAILED",
  },
  STARTING: {
    START_DONE: "VERIFYING",
    CANCEL: "CANCELLED",
    FAIL: "FAILED",
  },
  VERIFYING: {
    VERIFY_READY: "READY",
    VERIFY_PARTIAL: "PARTIALLY_READY",
    VERIFY_FAILED: "REPAIRING",
    CANCEL: "CANCELLED",
    FAIL: "FAILED",
  },
  READY: {
    CANCEL: "CANCELLED",
  },
  PARTIALLY_READY: {
    CANCEL: "CANCELLED",
  },
  FAILED: {},
  CANCELLED: {},
};

export function canTransition(state: LabState, event: LabEvent): boolean {
  return Boolean(TRANSITIONS[state][event.type]);
}

export function transition(state: LabState, event: LabEvent): LabState {
  const next = TRANSITIONS[state][event.type];
  if (!next) {
    throw new Error(`Illegal transition: ${state} + ${event.type}`);
  }
  return next;
}

export function isTerminal(state: LabState): boolean {
  return state === "READY" || state === "PARTIALLY_READY" || state === "FAILED" || state === "CANCELLED";
}

/** Map lab state → mascot animation key */
export function labStateToMascot(state: LabState): string {
  switch (state) {
    case "PLANNING":
    case "REPAIRING":
      return "THINKING";
    case "GENERATING":
      return "TYPING";
    case "SETTING_UP":
    case "TESTING":
    case "STARTING":
    case "VERIFYING":
      return "LOADING";
    case "WAITING_FOR_APPROVAL":
      return "POINTING";
    case "READY":
      return "CELEBRATING";
    case "PARTIALLY_READY":
      return "HAPPY";
    case "FAILED":
      return "ERROR";
    case "CANCELLED":
      return "CONFUSED";
    default:
      return "IDLE";
  }
}
