import { describe, expect, it } from "vitest";
import { canTransition, isTerminal, transition, labStateToMascot } from "@devly/core";

describe("lab state machine", () => {
  it("follows the happy path", () => {
    let s = transition("CREATED", { type: "START_PLANNING" });
    s = transition(s, { type: "PLAN_READY" });
    s = transition(s, { type: "APPROVE" });
    s = transition(s, { type: "GENERATION_DONE" });
    s = transition(s, { type: "SETUP_DONE" });
    s = transition(s, { type: "TESTS_PASSED" });
    s = transition(s, { type: "START_DONE" });
    s = transition(s, { type: "VERIFY_READY" });
    expect(s).toBe("READY");
    expect(isTerminal(s)).toBe(true);
  });

  it("supports repair loop", () => {
    let s = transition("TESTING", { type: "TESTS_FAILED" });
    expect(s).toBe("REPAIRING");
    s = transition(s, { type: "REPAIR_DONE" });
    expect(s).toBe("TESTING");
  });

  it("rejects illegal transitions", () => {
    expect(canTransition("READY", { type: "APPROVE" })).toBe(false);
    expect(() => transition("READY", { type: "APPROVE" })).toThrow();
  });

  it("maps to mascot states", () => {
    expect(labStateToMascot("GENERATING")).toBe("TYPING");
    expect(labStateToMascot("READY")).toBe("CELEBRATING");
    expect(labStateToMascot("FAILED")).toBe("ERROR");
  });
});
