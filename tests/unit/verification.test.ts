import { describe, expect, it } from "vitest";
import { classifyFailure, createDefaultChecks, summarizeVerification } from "@devly/core";

describe("verification", () => {
  it("READY when required checks pass", () => {
    const checks = createDefaultChecks({ hasDockerServices: false, hasHttpDemo: false, hasTests: true });
    for (const c of checks) {
      if (c.status === "pending") c.status = "pass";
    }
    expect(summarizeVerification(checks, []).status).toBe("READY");
  });

  it("FAILED when required check fails", () => {
    const checks = createDefaultChecks({ hasDockerServices: false, hasHttpDemo: true, hasTests: true });
    checks.find((c) => c.id === "unit")!.status = "fail";
    checks.find((c) => c.id === "code")!.status = "pass";
    checks.find((c) => c.id === "deps")!.status = "pass";
    checks.find((c) => c.id === "start")!.status = "pass";
    expect(summarizeVerification(checks, []).status).toBe("FAILED");
  });

  it("classifies failures", () => {
    expect(classifyFailure("ModuleNotFoundError: flask")).toBe("dependency");
    expect(classifyFailure("EADDRINUSE")).toBe("port");
    expect(classifyFailure("Cannot connect to the Docker daemon")).toBe("docker");
  });
});
