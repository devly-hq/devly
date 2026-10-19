import * as vscode from "vscode";
import {
  estimateModelBytes,
  fetchModelInfo,
  formatBytes,
  huggingFaceRepoId,
  setupHuggingFaceModel,
  weightWaitEstimate,
} from "@devly/execution";
import { describeModel } from "@devly/core";
import type { HostToWebview, LabSummary } from "@devly/protocol";
import type { Logger } from "../utils/logger.js";
import type { Persistence } from "./persistence.js";
import { holdHeavyJob, releaseHeavyJob } from "./heavyJob.js";

type PostMessage = (msg: HostToWebview) => void;

/**
 * One-click local setup for a Hugging Face model.
 * Writes a small Python app, installs a CPU runtime, and opens a local page.
 * Weights stay inside the lab folder.
 */
export class ModelSetupService {
  private weightTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly persistence: Persistence,
    private readonly logger: Logger,
    private readonly post: PostMessage,
  ) {}

  async run(opts: { title: string; url: string }): Promise<void> {
    const modelId = huggingFaceRepoId(opts.title, opts.url);
    if (!modelId) {
      this.fail("That card is not a Hugging Face model.");
      return;
    }
    if (!vscode.workspace.isTrusted) {
      this.fail("Workspace is untrusted. Open a trusted workspace to set up a model.");
      return;
    }
    if (this.weightTimer) clearInterval(this.weightTimer);
    if (!holdHeavyJob()) {
      this.fail("A setup is already running. Wait for it to finish.");
      return;
    }

    try {
      this.status("checking", `Looking up ${modelId}: size, task, and what has to be installed.`, {
        title: modelId,
        estimate: "A few seconds.",
      });
      const info = await fetchModelInfo(modelId);
      const bytes = info ? estimateModelBytes(info) : undefined;
      const size = bytes ? formatBytes(bytes) : "an unknown amount";
      const large = bytes !== undefined && bytes > 8_000_000_000;
      const downloadEstimate = weightWaitEstimate(bytes);
      const explained = describeModel(info?.pipeline_tag, info?.library_name);
      const confirm = await vscode.window.showWarningMessage(
        `Set up ${modelId} on your machine?\n\n` +
          `What it is: ${explained.about}\n` +
          `${explained.afterRun}\n\n` +
          `Devly will install a CPU copy of PyTorch and start a local page for this model.\n` +
          `The weights are about ${size} and download into a Devly folder, not your whole disk.\n` +
          (large ? "This one is large and can make the computer busy while it downloads.\n" : "") +
          "The page says Ready when the download finishes.",
        { modal: true },
        "Set up",
      );
      if (confirm !== "Set up") {
        this.fail("Model setup cancelled.");
        return;
      }

      const result = await setupHuggingFaceModel({
        modelId,
        pipeline: info?.pipeline_tag,
        library: info?.library_name,
        onLog: () => undefined,
        pageHint: `${downloadEstimate} This page says Ready when you can type into it and press Run.`,
        readyHint: `${explained.about} ${explained.afterRun}`,
        onPhase: (phase, detail) => {
          if (phase === "installing") {
            this.status("installing", "Installing a CPU copy of PyTorch and the libraries this model needs. They stay in a Devly folder.", {
              title: modelId,
              estimate: "About 5–10 minutes the first time.",
            });
            return;
          }
          if (phase === "starting") {
            this.status("starting", `Starting the local page for ${modelId}.`, {
              title: modelId,
              estimate: "Under a minute.",
            });
            return;
          }
          this.status(phase, detail, { title: modelId });
        },
      });

      const summary: LabSummary = {
        id: result.labId,
        topicId: `hf:${modelId}`,
        topicTitle: modelId,
        directory: result.directory,
        workspaceMode: "new-window",
        agentId: "model-setup",
        state: result.live ? "READY" : "PARTIALLY_READY",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        demoUrl: result.demoUrl,
      };
      await this.persistence.upsertLab(summary);
      this.post({ type: "labs", labs: this.persistence.getLabs() });
      if (result.live && result.demoUrl) {
        this.status(
          "weights",
          `${modelId} has a local page. The weights are still downloading into the Devly folder. Open the page now; it says Ready when you can type into it.`,
          { title: modelId, url: result.demoUrl, estimate: downloadEstimate },
        );
        this.watchWeights(modelId, result.demoUrl, downloadEstimate);
      } else {
        this.status("failed", result.message, { title: modelId });
      }
      this.post({
        type: "toast",
        message: result.live ? `${modelId} page is up. Weights are still downloading.` : `${modelId} did not stay running.`,
        level: result.live ? "info" : "warn",
      });
    } catch (err) {
      this.logger.error(String(err));
      this.fail(err instanceof Error ? err.message : String(err));
    } finally {
      releaseHeavyJob();
    }
  }

  private watchWeights(modelId: string, url: string, estimate: string): void {
    if (this.weightTimer) clearInterval(this.weightTimer);
    const health = new URL("/health", url).toString();
    const started = Date.now();
    this.weightTimer = setInterval(() => {
      void (async () => {
        try {
          const res = await fetch(health, { signal: AbortSignal.timeout(2_000) });
          const data = (await res.json()) as { status?: string; detail?: string };
          if (data.status === "ready") {
            if (this.weightTimer) clearInterval(this.weightTimer);
            this.status("ready", `${modelId} is ready. Open the page, type a sentence, and press Run.`, {
              title: modelId,
              url,
              estimate: "Done.",
            });
            return;
          }
          if (data.status === "error") {
            if (this.weightTimer) clearInterval(this.weightTimer);
            this.fail(data.detail || `${modelId} failed while loading.`);
          }
        } catch {
          /* page is still starting */
        }
        if (Date.now() - started > 45 * 60_000 && this.weightTimer) {
          clearInterval(this.weightTimer);
          this.status(
            "weights",
            `${modelId} is still downloading. Open the page and wait until it says Ready.`,
            { title: modelId, url, estimate },
          );
        }
      })();
    }, 4_000);
  }

  private status(phase: string, message: string, extra?: { title?: string; url?: string; estimate?: string }): void {
    this.post({
      type: "tryLiveStatus",
      labId: "model",
      phase,
      message,
      title: extra?.title,
      url: extra?.url,
      estimate: extra?.estimate,
    });
    this.post({
      type: "shadeState",
      state: phase === "failed" ? "ERROR" : phase === "ready" ? "SUCCESS" : "LOADING",
      line: message,
    });
  }

  private fail(message: string): void {
    this.post({ type: "tryLiveStatus", labId: "model", phase: "failed", message });
    this.post({ type: "toast", message, level: "warn" });
  }
}
