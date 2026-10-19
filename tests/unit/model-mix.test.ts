import { describe, expect, it } from "vitest";
import { describeModel, modelRunTag, pickModelMix, type ModelRunTag } from "@devly/core";

function card(id: string, tag: ModelRunTag, bytes: number) {
  return { id, tag, bytes };
}

describe("model run tags", () => {
  it("tags by download size when the size is known", () => {
    expect(modelRunTag({ id: "org/tiny", bytes: 80_000_000 })).toBe("Easy");
    expect(modelRunTag({ id: "org/mid", bytes: 1_200_000_000 })).toBe("Minutes");
    expect(modelRunTag({ id: "org/big", bytes: 8_000_000_000 })).toBe("Hard");
  });

  it("falls back to the pipeline when size is missing", () => {
    expect(modelRunTag({ id: "org/bert", pipeline: "fill-mask" })).toBe("Easy");
    expect(modelRunTag({ id: "org/llama-3b", pipeline: "text-generation" })).toBe("Minutes");
    expect(modelRunTag({ id: "org/flux-dev", pipeline: "text-to-image" })).toBe("Hard");
  });

  it("says what a model does before anyone runs it", () => {
    expect(describeModel("text-generation", "transformers").about).toContain("not a chatbot");
    expect(describeModel("feature-extraction", "sentence-transformers").about).toContain("numbers");
    expect(describeModel("text-to-image", "diffusers").afterRun).toContain("picture");
  });

  it("keeps two light models, two minute-scale models, and two large ones", () => {
    const mixed = pickModelMix(
      [
        card("e-heavy", "Easy", 300_000_000),
        card("e-light", "Easy", 40_000_000),
        card("e-mid", "Easy", 90_000_000),
        card("m1", "Minutes", 800_000_000),
        card("m2", "Minutes", 1_500_000_000),
        card("m3", "Minutes", 2_000_000_000),
        card("h-small", "Hard", 4_000_000_000),
        card("h-big", "Hard", 20_000_000_000),
        card("h-mid", "Hard", 9_000_000_000),
      ],
      "refresh-1",
    );
    expect(mixed).toHaveLength(6);
    expect(mixed.filter((model) => model.tag === "Easy").map((model) => model.id).sort()).toEqual(["e-light", "e-mid"]);
    expect(mixed.filter((model) => model.tag === "Minutes")).toHaveLength(2);
    expect(mixed.filter((model) => model.tag === "Hard").map((model) => model.id).sort()).toEqual(["h-big", "h-mid"]);
    const again = pickModelMix(
      [
        card("e-light", "Easy", 40_000_000),
        card("e-mid", "Easy", 90_000_000),
        card("m1", "Minutes", 800_000_000),
        card("m2", "Minutes", 1_500_000_000),
        card("h-big", "Hard", 20_000_000_000),
        card("h-mid", "Hard", 9_000_000_000),
      ],
      "refresh-2",
    );
    expect(again.map((model) => model.id).join(",")).not.toBe(
      pickModelMix(
        [
          card("e-light", "Easy", 40_000_000),
          card("e-mid", "Easy", 90_000_000),
          card("m1", "Minutes", 800_000_000),
          card("m2", "Minutes", 1_500_000_000),
          card("h-big", "Hard", 20_000_000_000),
          card("h-mid", "Hard", 9_000_000_000),
        ],
        "refresh-1",
      )
        .map((model) => model.id)
        .join(","),
    );
  });
});
