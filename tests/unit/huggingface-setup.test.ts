import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { estimateModelBytes, formatBytes, huggingFaceRepoId, modelKind, renderModelServer, requirementLines, weightWaitEstimate } from "@devly/execution";

describe("hugging face setup", () => {
  it("reads a model id from the title or the page url", () => {
    expect(huggingFaceRepoId("google/embeddinggemma-2", "https://huggingface.co/google/embeddinggemma-2")).toBe(
      "google/embeddinggemma-2",
    );
    expect(huggingFaceRepoId("Embedding Gemma", "https://huggingface.co/google/embeddinggemma-2")).toBe(
      "google/embeddinggemma-2",
    );
    expect(huggingFaceRepoId("not a model", "https://example.com/google/embeddinggemma-2")).toBeUndefined();
  });

  it("estimates weight size from the model files", () => {
    expect(
      estimateModelBytes({
        safetensors: { total: 50 },
        siblings: [{ rfilename: "model.safetensors", size: 1200 }, { rfilename: "README.md", size: 99 }],
      }),
    ).toBe(1200);
    expect(formatBytes(1_500_000_000)).toBe("1.5 GB");
    expect(weightWaitEstimate(500_000_000)).toBe("500 MB · about 1–2 minutes.");
    expect(weightWaitEstimate(8_000_000_000)).toContain("minutes");
  });

  it("picks a runtime from the pipeline", () => {
    expect(modelKind("feature-extraction", "sentence-transformers")).toBe("embed");
    expect(modelKind("text-to-image", "diffusers")).toBe("image");
    expect(modelKind("text-generation", "transformers")).toBe("text");
    expect(requirementLines("embed").some((line) => line.startsWith("sentence-transformers"))).toBe(true);
  });

  it("generates a python page that compiles", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "devly-hf-"));
    const file = path.join(dir, "serve.py");
    writeFileSync(file, renderModelServer("google/embeddinggemma-2", "feature-extraction", "embed", 8765));
    execFileSync("python3", ["-m", "py_compile", file], { stdio: "pipe" });
  });
});
