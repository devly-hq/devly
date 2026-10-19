import { describe, expect, it } from "vitest";
import { getTheme, pickLine, transitionMascot } from "@devly/mascot";

describe("mascot", () => {
  it("transitions states", () => {
    expect(transitionMascot("IDLE", "TYPING")).toBe("TYPING");
    expect(transitionMascot("TYPING", "CELEBRATING")).toBe("CELEBRATING");
  });

  it("resolves themes", () => {
    expect(getTheme("neon-blue").name).toBe("Neon Blue");
    expect(getTheme("missing").id).toBe("default-purple");
  });

  it("picks personality lines", () => {
    expect(pickLine("minimal", "success", 0)).toBe("Done.");
  });
});
