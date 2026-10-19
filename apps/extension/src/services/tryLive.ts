import * as vscode from "vscode";
import { buildPromptVars, renderTryLiveRepairPrompt } from "@devly/core";
import { detectAllAgents, type CodingAgent } from "@devly/agents";
import {
  cloneAndRunRepo,
  collectProjectLesson,
  detectEnvironment,
  formatAvailableTools,
  pruneTrendingClones,
  type CloneRunResult,
} from "@devly/execution";
import { showProjectLesson } from "./projectPanel.js";
import type { HostToWebview, LabSummary } from "@devly/protocol";
import type { Logger } from "../utils/logger.js";
import type { Persistence } from "./persistence.js";
import { holdHeavyJob, releaseHeavyJob } from "./heavyJob.js";

type PostMessage = (msg: HostToWebview) => void;

export interface TryLiveRequest {
  fullName: string;
  cloneUrl: string;
  htmlUrl: string;
  description?: string;
}

/**
 * Try Live is its own flow: clone a GitHub repo, run it, optionally ask an
 * installed agent to repair, then explain the result. Learn labs stay in Orchestrator.
 */
export class TryLiveService {
  private logAt = 0;
  private active = false;
  private tail = "";

  constructor(
    private readonly persistence: Persistence,
    private readonly logger: Logger,
    private readonly post: PostMessage,
    private readonly agents: CodingAgent[],
    private readonly rememberLab: (summary: LabSummary) => void,
  ) {}

  async run(opts: TryLiveRequest): Promise<void> {
    if (!vscode.workspace.isTrusted) {
      this.post({ type: "error", message: "Workspace is untrusted. Open a trusted workspace to Try Live." });
      return;
    }

    if (this.active) {
      this.post({
        type: "toast",
        message: "A repo is still building. Wait for that one to finish.",
        level: "info",
      });
      return;
    }
    if (!holdHeavyJob()) {
      this.post({ type: "toast", message: "A setup is already running. Wait for it to finish.", level: "info" });
      this.post({ type: "tryLiveStatus", labId: "cancelled", phase: "failed", message: "Try Live is waiting on another setup." });
      return;
    }

    const about = (opts.description ?? "").replace(/\s+/g, " ").trim().slice(0, 320);
    const confirm = await vscode.window.showWarningMessage(
      `Clone and run ${opts.fullName} on your machine?\n\n` +
        (about ? `What it is: ${about}\n\n` : "") +
        `Try Live downloads this exact GitHub repository and runs it locally.\n` +
        `If the build fails, your Claude, Cursor, or Codex login will fix it in that folder.\n` +
        `When it finishes, Shade opens a lesson beside the editor: what the project does, how it was started, and the important files.\n` +
        `If Docker is missing or stopped, Shade will install/start it for you (may ask for your Mac/Windows password once).`,
      { modal: true },
      "Clone & Run",
    );
    if (confirm !== "Clone & Run") {
      releaseHeavyJob();
      this.post({ type: "toast", message: "Try Live cancelled", level: "info" });
      this.post({
        type: "tryLiveStatus",
        labId: "cancelled",
        phase: "failed",
        message: "Try Live cancelled.",
      });
      return;
    }

    this.active = true;
    this.post({
      type: "shadeState",
      state: "LOADING",
      line: `Cloning ${opts.fullName}…`,
    });
    this.post({
      type: "tryLiveStatus",
      labId: "pending",
      phase: "cloning",
      message: `Cloning ${opts.fullName}…`,
    });

    this.tail = "";
    try {
      let result = await cloneAndRunRepo({
        fullName: opts.fullName,
        cloneUrl: opts.cloneUrl,
        htmlUrl: opts.htmlUrl,
        bootstrapDocker: true,
        onLog: (chunk) => this.captureChunk(chunk),
        onPhase: (phase, detail) => {
          this.post({
            type: "tryLiveStatus",
            labId: "pending",
            phase,
            message: detail,
          });
          this.post({ type: "shadeState", state: "LOADING", line: detail });
        },
      });

      const interrupted = /interrupted|stopped the Docker build/i.test(result.message);
      if (!result.live && !interrupted) {
        result = await this.repair(opts, result);
      }

      const lesson = await collectProjectLesson({
        title: opts.fullName,
        directory: result.directory,
        description: about,
        mode: "try-live",
        plan: result.plan,
        demoUrl: result.demoUrl,
        live: result.live,
        dockerBootstrapped: result.dockerBootstrapped,
      });
      const brief = result.live
        ? `${opts.fullName} is running. The lesson is open beside the editor.`
        : `${opts.fullName} did not stay running. The lesson explains the project and its files.`;
      result = { ...result, message: brief };
      void showProjectLesson(lesson, this.persistence.getMascot()).catch((err: unknown) => {
        this.logger.warn(`Could not open the project lesson: ${String(err)}`);
      });

      const summary: LabSummary = {
        id: result.labId,
        topicId: `trending:${opts.fullName}`,
        topicTitle: opts.fullName,
        directory: result.directory,
        workspaceMode: "new-window",
        agentId: "try-live",
        state: result.live ? "READY" : "PARTIALLY_READY",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        demoUrl: result.demoUrl,
      };
      await this.persistence.upsertLab(summary);
      await pruneTrendingClones(this.persistence.getLabs().map((lab) => lab.directory)).catch((err: unknown) => {
        this.logger.warn(`Could not prune old Try Live folders: ${String(err)}`);
      });
      this.rememberLab(summary);

      this.post({ type: "labs", labs: this.persistence.getLabs() });
      this.post({
        type: "labUpdate",
        lab: summary,
        logs: result.message,
      });
      this.post({
        type: "tryLiveStatus",
        labId: result.labId,
        phase: result.live ? "live" : "guide",
        message: result.message,
      });
      this.post({
        type: "shadeState",
        state: result.live ? "SUCCESS" : "THINKING",
        line: result.live
          ? `${opts.fullName} is running. The lesson is beside the editor.`
          : `${opts.fullName} did not stay running. The lesson explains the project.`,
      });
      this.post({
        type: "toast",
        message: result.live ? `${opts.fullName} is running.` : `${opts.fullName} needs another look. The lesson is open.`,
        level: result.live ? "info" : "warn",
      });
    } catch (err) {
      this.logger.error(String(err));
      const tail = this.tail
        .replace(/\r/g, "\n")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !/sha256:|\d+MB \/|^\d+\s+\d/.test(l))
        .slice(-3)
        .join("\n");
      const message = tail ? `${String(err)}\n${tail}` : String(err);
      this.post({ type: "error", message: `Try Live failed: ${message}` });
      this.post({ type: "shadeState", state: "ERROR", line: "Couldn’t get that repo running." });
      this.post({
        type: "tryLiveStatus",
        labId: "failed",
        phase: "failed",
        message,
      });
    } finally {
      releaseHeavyJob();
      this.active = false;
    }
  }

  private captureChunk(chunk: string): void {
    this.post({ type: "logChunk", labId: "try-live", chunk });
    this.tail = (this.tail + chunk).slice(-2000);
    const line = chunk.replace(/\r/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean).pop();
    const status = line ? readableBuildStatus(line) : null;
    if (!status) return;
    const now = Date.now();
    if (now - this.logAt < 1500) return;
    this.logAt = now;
    this.post({ type: "tryLiveStatus", labId: "pending", phase: "progress", message: status });
  }

  private async pickAgent(): Promise<CodingAgent | undefined> {
    const prefs = this.persistence.getPreferences();
    const found = await detectAllAgents(this.agents);
    const installed = new Set(found.filter((a) => a.installed).map((a) => a.id));
    const order = [prefs.defaultAgentId, "claude-code", "cursor", "codex"].filter(
      (id): id is string => Boolean(id),
    );
    for (const id of order) {
      if (!installed.has(id)) continue;
      const agent = this.agents.find((a) => a.id === id);
      if (agent) return agent;
    }
    return undefined;
  }

  private async repair(opts: TryLiveRequest, result: CloneRunResult): Promise<CloneRunResult> {
    const agent = await this.pickAgent();
    if (!agent) return result;
    let current = result;
    for (let attempt = 1; attempt <= 2 && !current.live; attempt++) {
      const line = `${agent.displayName} is fixing the build (${attempt} of 2)…`;
      this.post({ type: "tryLiveStatus", labId: current.labId, phase: "repair", message: line });
      this.post({ type: "shadeState", state: "LOADING", line });
      const env = await detectEnvironment();
      const prompt = renderTryLiveRepairPrompt(
        buildPromptVars({
          TOPIC: opts.fullName,
          WORKSPACE_PATH: current.directory,
          OPERATING_SYSTEM: `${env.platform}/${env.arch}`,
          AVAILABLE_TOOLS: formatAvailableTools(env),
          VERIFICATION_CRITERIA: `${current.message}\n${this.tail.slice(-1500)}`,
          EXECUTION_MODE: "local+docker",
        }),
      );
      await agent.execute({
        executionId: `try-live-repair-${current.labId}-${attempt}`,
        prompt,
        workspace: current.directory,
        timeoutMs: 10 * 60_000,
        onStdout: (c) => this.captureChunk(c),
        onStderr: (c) => this.captureChunk(c),
      });
      current = await cloneAndRunRepo({
        fullName: opts.fullName,
        cloneUrl: opts.cloneUrl,
        htmlUrl: opts.htmlUrl,
        directory: current.directory,
        labId: current.labId,
        bootstrapDocker: true,
        onLog: (c) => this.captureChunk(c),
        onPhase: (phase, detail) => {
          this.post({ type: "tryLiveStatus", labId: current.labId, phase, message: detail });
          this.post({ type: "shadeState", state: "LOADING", line: detail });
        },
      });
    }
    return current;
  }
}

/** Hide Docker progress noise. Keep a short step the sidebar can show. */
function readableBuildStatus(line: string): string | null {
  if (/sha256:|\d+(?:\.\d+)?MB \/|^\d+\s+\d|DONE\s+0\.0s/i.test(line)) return null;
  const step = line.match(/^#\d+\s+\[[^\]]+\]\s+(.+)$/);
  if (step) {
    const text = step[1]!.replace(/\s+/g, " ").slice(0, 110);
    return text ? `Building: ${text}` : null;
  }
  if (line.startsWith("#")) return null;
  return line.length > 140 ? `${line.slice(0, 137)}…` : line;
}
