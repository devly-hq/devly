import { describe, expect, it } from "vitest";
import { findDockerDesktopApp, resolveDockerBin, isDockerDaemonReady } from "@devly/execution";

describe("docker bootstrap helpers", () => {
  it("resolves docker bin or returns undefined without throwing", async () => {
    const bin = await resolveDockerBin();
    expect(bin === undefined || typeof bin === "string").toBe(true);
  });

  it("findDockerDesktopApp does not throw", async () => {
    const app = await findDockerDesktopApp();
    expect(app === undefined || typeof app === "string").toBe(true);
  });

  it("isDockerDaemonReady returns boolean", async () => {
    const ready = await isDockerDaemonReady();
    expect(typeof ready).toBe("boolean");
  });
});
