import * as vscode from "vscode";
import { readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  buildPromptVars,
  classifyFailure,
  createDefaultChecks,
  labStateToMascot,
  parseDevlyManifest,
  recommendTopics,
  renderAskShadePrompt,
  renderBuilderPrompt,
  renderExplainerPrompt,
  renderPlannerPrompt,
  renderRepairPrompt,
  summarizeVerification,
  topicToLabSpecSeed,
  transition,
  type DevlyManifest,
  type EvidenceEntry,
  type LabState,
  type TopicRecord,
  type VerificationCheck,
} from "@devly/core";
import {
  createAgentRegistry,
  detectAllAgents,
  type CodingAgent,
} from "@devly/agents";
import {
  WorkspaceManager,
  collectProjectLesson,
  detectEnvironment,
  formatAvailableTools,
  defaultRunner,
  isDeniedCommand,
  dockerManager,
  portFromUrl,
  relocateBusyPort,
  userPageUrl,
  type LabMeta,
  type RunPlan,
} from "@devly/execution";
import { showProjectLesson } from "./projectPanel.js";
import type {
  ExecutionPlan,
  HostToWebview,
  LabSummary,
  LearningMode,
  WorkspaceChoice,
} from "@devly/protocol";
import type { Logger } from "../utils/logger.js";
import type { Persistence } from "./persistence.js";
import type { CatalogService } from "./catalog.js";
import { TryLiveService } from "./tryLive.js";

export type PostMessage = (msg: HostToWebview) => void;

export class Orchestrator {
  private agents: CodingAgent[];
  private workspace = new WorkspaceManager();
  private active = new Map<string, { meta: LabMeta; abort: boolean; approved: boolean }>();
  private processes = new Map<string, string>(); // labId -> process command id for start
  private tryLive: TryLiveService;

  constructor(
    private readonly persistence: Persistence,
    private readonly catalog: CatalogService,
    private readonly logger: Logger,
    private readonly post: PostMessage,
  ) {
    this.agents = createAgentRegistry({
      includeFake: true,
      getByokConfig: async () => {
        const key = await this.persistence.getSecret("devly.byok.apiKey");
        if (!key) return undefined;
        const provider = vscode.workspace.getConfiguration("devly").get<"openai" | "anthropic">("byokProvider", "anthropic");
        return { provider, apiKey: key };
      },
    });
    this.tryLive = new TryLiveService(persistence, logger, post, this.agents, (summary) => {
      this.active.set(summary.id, {
        meta: { ...summary, repairAttempts: 0 },
        abort: false,
        approved: true,
      });
    });
  }

  async detectAgents() {
    return detectAllAgents(this.agents);
  }

  getDailyPicks(opts?: { rotate?: boolean }) {
    const prefs = this.persistence.getPreferences();
    const progress = this.persistence.getProgress();
    const day = new Date().toISOString().slice(0, 10);
    // Same calendar day was always identical — Refresh must change the seed.
    const dateSeed = opts?.rotate ? `${day}:r${Date.now()}` : day;
    const picks = recommendTopics({
      topics: this.catalog.getTopics(),
      interests: prefs.interests,
      experienceLevel: prefs.experienceLevel,
      preferredLanguages: prefs.preferredLanguages,
      completedTopicIds: progress.completedTopicIds,
      savedTopicIds: prefs.savedTopicIds,
      hiddenTopicIds: prefs.hiddenTopicIds,
      knownTopicIds: prefs.knownTopicIds,
      recentlyShownIds: this.persistence.getRecentlyShown(),
      dateSeed,
      count: 4,
      rotate: opts?.rotate === true,
    });
    void this.persistence.appendRecentlyShown(picks.map((p) => p.id));
    if (opts?.rotate) {
      void this.catalog.refreshDiscovery();
    }
    return picks;
  }

  async startLab(opts: {
    topicId?: string;
    customTopic?: string;
    agentId: string;
    workspaceMode: WorkspaceChoice;
    learningMode: LearningMode;
  }): Promise<void> {
    const topic = opts.topicId ? this.catalog.getTopic(opts.topicId) : undefined;
    const title = topic?.title ?? opts.customTopic ?? "Custom topic";
    if (!title) {
      this.post({ type: "error", message: "No topic provided" });
      return;
    }

    const trust = vscode.workspace.isTrusted;
    if (!trust) {
      this.post({ type: "error", message: "Workspace is untrusted. Open a trusted workspace to run labs." });
      return;
    }

    const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const homeOverride = vscode.workspace.getConfiguration("devly").get<string>("homeLabsRoot") || undefined;

    let meta: LabMeta;
    try {
      meta = await this.workspace.createLab({
        topicTitle: title,
        topicId: topic?.id,
        agentId: opts.agentId,
        workspaceMode: opts.workspaceMode,
        currentWorkspaceRoot: folder,
        homeLabsRoot: homeOverride || undefined,
      });
    } catch (err) {
      this.post({ type: "error", message: String(err) });
      return;
    }

    this.active.set(meta.id, { meta, abort: false, approved: false });
    await this.emitLab(meta);
    this.post({ type: "shadeState", state: labStateToMascot("PLANNING"), line: "Planning your lab..." });

    if (opts.workspaceMode === "new-window") {
      // Continue in current window orchestration; also offer open
      await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(meta.directory), true);
    }

    try {
      await this.runPipeline(meta.id, topic, opts.customTopic, opts.learningMode);
    } catch (err) {
      this.logger.error(`Lab ${meta.id} failed: ${String(err)}`);
      await this.setState(meta.id, "FAILED");
      this.post({ type: "error", message: `Lab failed: ${String(err)}` });
    }
  }

  /** Try Live: clone the exact GitHub repo and run it. See TryLiveService. */
  async tryLiveRepo(opts: {
    fullName: string;
    cloneUrl: string;
    htmlUrl: string;
    description?: string;
  }): Promise<void> {
    await this.tryLive.run(opts);
  }

  async approvePlan(labId: string): Promise<void> {
    const session = this.active.get(labId);
    if (!session) return;
    session.approved = true;
  }

  async rejectPlan(labId: string): Promise<void> {
    const session = this.active.get(labId);
    if (!session) return;
    session.abort = true;
    await this.setState(labId, "CANCELLED");
  }

  async cancelLab(labId: string): Promise<void> {
    const session = this.active.get(labId);
    if (session) session.abort = true;
    const agent = this.agents.find((a) => a.id === session?.meta.agentId);
    if (agent) await agent.cancel(`lab-${labId}`);
    defaultRunner.killAll();
    await this.setState(labId, "CANCELLED");
  }

  async stopServices(labId: string): Promise<void> {
    const meta = await this.getMeta(labId);
    if (!meta) return;
    try {
      // Try Live labs may have no devly.json — still tear down compose / labeled containers
      try {
        const manifest = await this.readManifest(meta.directory);
        for (const cmd of manifest.stop) {
          await defaultRunner.run({ executable: cmd.executable, args: cmd.args, cwd: meta.directory, timeoutMs: 60_000 });
        }
        if (manifest.services.length > 0) {
          await dockerManager.down({ labId, cwd: meta.directory });
        }
      } catch {
        await dockerManager.down({ labId, cwd: meta.directory }).catch(() => undefined);
      }
      await dockerManager.cleanupLabeled(labId);
      // Dockerfile try-live container name
      await defaultRunner
        .run({
          executable: "docker",
          args: ["rm", "-f", "devly-try-live"],
          cwd: meta.directory,
          timeoutMs: 30_000,
          description: "remove try-live container",
        })
        .catch(() => undefined);
      this.post({ type: "toast", message: "Services stopped", level: "info" });
    } catch (err) {
      this.post({ type: "error", message: `Stop failed: ${String(err)}` });
    }
  }

  async deleteLab(labId: string): Promise<void> {
    await this.stopServices(labId);
    const meta = await this.getMeta(labId);
    if (!meta) return;
    await this.workspace.deleteLab(meta.directory);
    const labs = this.persistence.getLabs().filter((l) => l.id !== labId);
    await this.persistence.setLabs(labs);
    this.post({ type: "labs", labs });
    this.post({ type: "toast", message: "Lab deleted", level: "info" });
  }

  async openFile(labId: string, relativePath: string, line?: number): Promise<void> {
    const meta = await this.getMeta(labId);
    if (!meta) return;
    const full = path.resolve(meta.directory, relativePath);
    if (!full.startsWith(path.resolve(meta.directory))) {
      this.post({ type: "error", message: "Path escapes lab directory" });
      return;
    }
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(full));
    const editor = await vscode.window.showTextDocument(doc, { preview: true });
    if (line && line > 0) {
      const pos = new vscode.Position(line - 1, 0);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos));
    }
  }

  async askShade(opts: { labId?: string; question: string; code?: string; filePath?: string }): Promise<void> {
    const prefs = this.persistence.getPreferences();
    const agentId = prefs.defaultAgentId ?? "fake";
    const agent = this.agents.find((a) => a.id === agentId) ?? this.agents.find((a) => a.id === "fake")!;
    const workspace = opts.labId ? (await this.getMeta(opts.labId))?.directory ?? process.cwd() : process.cwd();
    const prompt = renderAskShadePrompt(
      buildPromptVars({
        TOPIC: opts.question,
        WORKSPACE_PATH: opts.filePath ?? workspace,
        PROJECT_REQUIREMENTS: opts.code ?? "",
        DIFFICULTY: prefs.experienceLevel,
      }),
    );
    const result = await agent.execute({
      executionId: randomUUID(),
      prompt,
      workspace,
      timeoutMs: 120_000,
    });
    this.post({ type: "askShadeReply", answer: result.stdout || result.stderr || "No answer." });
  }

  async repairLab(labId: string): Promise<void> {
    const session = this.active.get(labId);
    const meta = session?.meta ?? (await this.getMeta(labId));
    if (!meta) return;
    this.active.set(labId, { meta, abort: false, approved: true });
    await this.setState(labId, "REPAIRING");
    await this.runRepairAndContinue(labId);
  }

  private async runPipeline(
    labId: string,
    topic: TopicRecord | undefined,
    customTopic: string | undefined,
    learningMode: LearningMode,
  ): Promise<void> {
    await this.setState(labId, "PLANNING");
    const meta = (await this.getMeta(labId))!;
    const env = await detectEnvironment();
    const tools = formatAvailableTools(env);
    const prefs = this.persistence.getPreferences();
    const language = prefs.preferredLanguages[0] ?? topic?.languages[0] ?? "python";

    const spec = topic
      ? topicToLabSpecSeed(topic, language)
      : {
          schemaVersion: 1 as const,
          id: labId,
          topic: customTopic ?? "Custom topic",
          difficulty: prefs.experienceLevel,
          language,
          targetDurationMinutes: 15,
          learningObjectives: [`Understand ${customTopic}`],
          projectRequirements: [
            `Build a working educational project for: ${customTopic}`,
            "Include automated tests",
            "Include README.md, LESSON.md, and devly.json",
          ],
          verificationCriteria: ["Project starts successfully", "Automated tests pass"],
          prerequisites: [],
          requiredServices: [],
          credentials: [],
          resourceEstimates: { networkRequired: true },
          osSupport: ["darwin", "linux", "win32"] as Array<"darwin" | "linux" | "win32">,
          testExpectations: [],
          demo: { kind: "none" as const },
          learningMilestones: [],
          expectedFiles: ["README.md", "LESSON.md", "devly.json"],
          securityConsiderations: [],
          environmentProfile: "python",
        };

    await writeFile(path.join(meta.directory, ".devly", "spec.json"), JSON.stringify(spec, null, 2), "utf8");

    const agent = this.agents.find((a) => a.id === meta.agentId);
    if (!agent) throw new Error(`Agent not found: ${meta.agentId}`);

    const promptVars = buildPromptVars({
      TOPIC: spec.topic,
      DIFFICULTY: spec.difficulty,
      LANGUAGE: spec.language,
      OPERATING_SYSTEM: `${env.platform}/${env.arch}`,
      AVAILABLE_TOOLS: tools,
      WORKSPACE_PATH: meta.directory,
      LEARNING_OBJECTIVES: spec.learningObjectives.map((x) => `- ${x}`).join("\n"),
      PROJECT_REQUIREMENTS: spec.projectRequirements.map((x) => `- ${x}`).join("\n"),
      VERIFICATION_CRITERIA: spec.verificationCriteria.map((x) => `- ${x}`).join("\n"),
      EXECUTION_MODE: "local+docker",
      LEARNING_MODE: learningMode,
    });

    // PLAN
    const planResult = await agent.execute({
      executionId: `lab-${labId}-plan`,
      prompt: renderPlannerPrompt(promptVars),
      workspace: meta.directory,
      timeoutMs: 5 * 60_000,
      onStdout: (c) => this.post({ type: "logChunk", labId, chunk: c }),
      onStderr: (c) => this.post({ type: "logChunk", labId, chunk: c }),
    });
    if (this.isAborted(labId)) return;

    const plan = this.parsePlan(planResult.stdout) ?? this.fallbackPlan(spec.topic);
    await this.setState(labId, "WAITING_FOR_APPROVAL");
    await this.emitLab(meta, plan);
    this.post({
      type: "shadeState",
      state: "POINTING",
      line: "Approve the execution plan to continue.",
    });

    // Wait for approval (poll)
    const approved = await this.waitForApproval(labId, 10 * 60_000);
    if (!approved) {
      await this.setState(labId, "CANCELLED");
      return;
    }

    await this.setState(labId, "GENERATING");
    this.post({ type: "shadeState", state: "TYPING", line: "Generating your project..." });

    const buildResult = await agent.execute({
      executionId: `lab-${labId}-build`,
      prompt: renderBuilderPrompt(promptVars),
      workspace: meta.directory,
      timeoutMs: 15 * 60_000,
      onStdout: (c) => this.post({ type: "logChunk", labId, chunk: c }),
      onStderr: (c) => this.post({ type: "logChunk", labId, chunk: c }),
    });
    if (this.isAborted(labId)) return;
    if (buildResult.exitCode !== 0 && meta.agentId !== "manual") {
      this.logger.warn(`Builder exited ${buildResult.exitCode}; continuing if files exist`);
    }

    // Ensure manifest exists (fake agent writes it; others might not)
    if (!(await this.fileExists(path.join(meta.directory, "devly.json")))) {
      if (meta.agentId === "fake") {
        /* should exist */
      } else {
        // create a minimal placeholder so user can fill via repair
        await writeFile(
          path.join(meta.directory, "devly.json"),
          JSON.stringify(
            {
              schemaVersion: 1,
              setup: [],
              test: [],
              start: [],
              stop: [],
              healthcheck: { kind: "none" },
              ports: [],
              services: [],
              entryFiles: [],
              lessonFile: "LESSON.md",
              concepts: [],
            },
            null,
            2,
          ),
          "utf8",
        );
      }
    }

    await this.setState(labId, "SETTING_UP");
    this.post({ type: "shadeState", state: "LOADING", line: "Installing dependencies..." });

    let manifest = await this.readManifest(meta.directory);
    const checks = createDefaultChecks({
      hasDockerServices: manifest.services.length > 0,
      hasHttpDemo: manifest.healthcheck.kind === "http",
      hasTests: manifest.test.length > 0,
    });

    // Approve & run setup commands
    for (const cmd of manifest.setup) {
      const denial = isDeniedCommand({ executable: cmd.executable, args: cmd.args, cwd: meta.directory }, meta.directory);
      if (denial) throw new Error(denial);
      const rec = await defaultRunner.run(
        { executable: cmd.executable, args: cmd.args, cwd: meta.directory, timeoutMs: 10 * 60_000, description: cmd.description },
        { onStdout: (c) => this.post({ type: "logChunk", labId, chunk: c }), onStderr: (c) => this.post({ type: "logChunk", labId, chunk: c }) },
      );
      this.setCheck(checks, "deps", rec.exitCode === 0 ? "pass" : "fail", `exit ${rec.exitCode}`);
      if (rec.exitCode !== 0) {
        await this.failWithChecks(labId, checks, [{ checkId: "deps", exitCode: rec.exitCode ?? undefined, logTail: rec.stderr.slice(-2000), timestamp: new Date().toISOString(), ok: false }]);
        return;
      }
    }
    if (manifest.setup.length === 0) this.setCheck(checks, "deps", "pass", "no setup required");
    this.setCheck(checks, "code", (await this.fileExists(path.join(meta.directory, "devly.json"))) ? "pass" : "fail");

    if (manifest.services.length > 0) {
      if (!env.dockerDaemonRunning) {
        this.setCheck(checks, "docker", "fail", "Docker daemon not running");
        await this.failWithChecks(labId, checks, []);
        return;
      }
      const up = await dockerManager.up({
        labId,
        cwd: meta.directory,
        onLog: (c) => this.post({ type: "logChunk", labId, chunk: c }),
      });
      this.setCheck(checks, "docker", up.exitCode === 0 ? "pass" : "fail", `exit ${up.exitCode}`);
    }

    await this.setState(labId, "TESTING");
    this.post({ type: "shadeState", state: "LOADING", line: "Running tests..." });

    let testOk = true;
    let testLog = "";
    for (const cmd of manifest.test) {
      const denial = isDeniedCommand({ executable: cmd.executable, args: cmd.args, cwd: meta.directory }, meta.directory);
      if (denial) throw new Error(denial);
      const rec = await defaultRunner.run(
        { executable: cmd.executable, args: cmd.args, cwd: meta.directory, timeoutMs: 10 * 60_000 },
        { onStdout: (c) => this.post({ type: "logChunk", labId, chunk: c }), onStderr: (c) => this.post({ type: "logChunk", labId, chunk: c }) },
      );
      testLog += rec.stdout + rec.stderr;
      if (rec.exitCode !== 0) testOk = false;
    }
    if (manifest.test.length === 0) {
      this.setCheck(checks, "unit", "skipped", "no tests");
    } else {
      this.setCheck(checks, "unit", testOk ? "pass" : "fail");
    }

    if (!testOk) {
      await this.setState(labId, "REPAIRING");
      const repaired = await this.attemptRepairs(labId, meta, agent, promptVars, testLog, checks);
      if (!repaired) {
        await this.failWithChecks(labId, checks, []);
        return;
      }
      manifest = await this.readManifest(meta.directory);
    }

    await this.setState(labId, "STARTING");
    this.post({ type: "shadeState", state: "LOADING", line: "Starting application..." });

    let startOk = true;
    let portBlocked: string | undefined;
    if (manifest.healthcheck.kind === "http") {
      const requested = portFromUrl(manifest.healthcheck.url);
      if (requested) {
        const relocated = await relocateBusyPort({
          port: requested,
          commands: manifest.start,
          healthUrl: manifest.healthcheck.url,
        });
        if (relocated.moved && relocated.healthUrl) {
          manifest.healthcheck.url = relocated.healthUrl;
          manifest.ports = manifest.ports.map((port) => (port === requested ? relocated.port : port));
          const line = `Port ${requested} is already in use. Starting on ${relocated.port}.`;
          this.post({ type: "logChunk", labId, chunk: `${line}\n` });
          this.post({ type: "shadeState", state: "LOADING", line });
        } else if (relocated.blocked) {
          portBlocked = `Port ${requested} is already in use, and this lab's start command has no port flag to move.`;
          this.post({ type: "logChunk", labId, chunk: `${portBlocked}\n` });
          startOk = false;
        }
      }
    }

    if (!portBlocked) for (const cmd of manifest.start) {
      const denial = isDeniedCommand({ executable: cmd.executable, args: cmd.args, cwd: meta.directory }, meta.directory);
      if (denial) throw new Error(denial);
      // Start as background-ish with timeout for readiness; keep process if http
      const rec = await defaultRunner.run(
        {
          executable: cmd.executable,
          args: cmd.args,
          cwd: meta.directory,
          timeoutMs: manifest.healthcheck.kind === "http" ? 3000 : 60_000,
        },
        { onStdout: (c) => this.post({ type: "logChunk", labId, chunk: c }), onStderr: (c) => this.post({ type: "logChunk", labId, chunk: c }) },
      );
      // For HTTP servers, timeout is expected while process may still be spawning — use detached start
      if (manifest.healthcheck.kind === "http") {
        // spawn without waiting via runner with long timeout in background fashion
        void this.spawnDetached(labId, cmd.executable, cmd.args, meta.directory);
        startOk = true;
      } else if (rec.exitCode !== 0 && !rec.timedOut) {
        startOk = false;
      }
    }
    if (manifest.start.length === 0) this.setCheck(checks, "start", "pass", "no start command");
    else this.setCheck(checks, "start", startOk ? "pass" : "fail");

    await this.setState(labId, "VERIFYING");
    const evidence: EvidenceEntry[] = [];

    if (portBlocked) {
      this.setCheck(checks, "start", "fail", portBlocked);
      this.setCheck(checks, "health", "fail", portBlocked);
      this.setCheck(checks, "demo", "fail", portBlocked);
      evidence.push({ checkId: "health", ok: false, detail: portBlocked, timestamp: new Date().toISOString() });
    } else if (manifest.healthcheck.kind === "http") {
      const url = manifest.healthcheck.url;
      const ok = await this.waitForHttp(url, manifest.healthcheck.expectedStatus ?? 200, 30_000, manifest.healthcheck.expectedBodyIncludes);
      this.setCheck(checks, "health", ok ? "pass" : "fail", url);
      this.setCheck(checks, "demo", ok ? "pass" : "fail", url);
      evidence.push({ checkId: "health", ok, detail: url, timestamp: new Date().toISOString() });
      if (ok) {
        meta.demoUrl = userPageUrl(url) ?? url;
        await this.workspace.writeMeta(meta);
      }
    } else {
      this.setCheck(checks, "health", "skipped");
      this.setCheck(checks, "demo", "skipped");
    }

    const summary = summarizeVerification(checks, evidence);
    await writeFile(path.join(meta.directory, ".devly", "evidence.json"), JSON.stringify({ checks, evidence }, null, 2), "utf8");

    let lesson = "";
    try {
      lesson = await readFile(path.join(meta.directory, manifest.lessonFile || "LESSON.md"), "utf8");
    } catch {
      // generate explainer
      const exp = await agent.execute({
        executionId: `lab-${labId}-explain`,
        prompt: renderExplainerPrompt(promptVars),
        workspace: meta.directory,
        timeoutMs: 120_000,
      });
      lesson = exp.stdout || "# Lesson\nSee the generated project files.";
      await writeFile(path.join(meta.directory, "LESSON.md"), lesson, "utf8");
    }

    if (summary.status === "READY") {
      await this.setState(labId, "READY");
      await this.persistence.markCompleted(meta.topicId);
      this.post({ type: "shadeState", state: "CELEBRATING", line: "Your project is ready!" });
    } else if (summary.status === "PARTIALLY_READY") {
      await this.setState(labId, "PARTIALLY_READY");
      this.post({ type: "shadeState", state: "HAPPY", line: "Mostly ready — some optional checks failed." });
    } else {
      await this.setState(labId, "FAILED");
      this.post({ type: "shadeState", state: "ERROR", line: "Verification failed." });
    }

    const fresh = (await this.getMeta(labId))!;
    await this.emitLab(fresh, undefined, checks, undefined, lesson);
    if (summary.status === "READY" || summary.status === "PARTIALLY_READY") {
      void this.openLessonPanel(fresh, manifest);
    }
  }

  private async attemptRepairs(
    labId: string,
    meta: LabMeta,
    agent: CodingAgent,
    promptVars: ReturnType<typeof buildPromptVars>,
    testLog: string,
    checks: VerificationCheck[],
  ): Promise<boolean> {
    const max = vscode.workspace.getConfiguration("devly").get<number>("maxRepairAttempts", 3);
    let attempts = meta.repairAttempts ?? 0;
    while (attempts < max) {
      if (this.isAborted(labId)) return false;
      attempts += 1;
      meta.repairAttempts = attempts;
      await this.workspace.writeMeta(meta);
      this.post({ type: "shadeState", state: "THINKING", line: `Repair attempt ${attempts}/${max}...` });
      const failureClass = classifyFailure(testLog);
      const repairPrompt = renderRepairPrompt({
        ...promptVars,
        VERIFICATION_CRITERIA: `Failure class: ${failureClass}\n\nLogs:\n${testLog.slice(-4000)}`,
      });
      await agent.execute({
        executionId: `lab-${labId}-repair-${attempts}`,
        prompt: repairPrompt,
        workspace: meta.directory,
        timeoutMs: 10 * 60_000,
        onStdout: (c) => this.post({ type: "logChunk", labId, chunk: c }),
      });
      const manifest = await this.readManifest(meta.directory);
      let ok = true;
      let log = "";
      for (const cmd of manifest.test) {
        const rec = await defaultRunner.run({
          executable: cmd.executable,
          args: cmd.args,
          cwd: meta.directory,
          timeoutMs: 10 * 60_000,
        });
        log += rec.stdout + rec.stderr;
        if (rec.exitCode !== 0) ok = false;
      }
      testLog = log;
      if (ok) {
        this.setCheck(checks, "unit", "pass", `repaired in ${attempts} attempt(s)`);
        await this.setState(labId, "TESTING");
        return true;
      }
    }
    this.setCheck(checks, "unit", "fail", `repair exhausted (${max})`);
    return false;
  }

  private async runRepairAndContinue(labId: string): Promise<void> {
    // Simplified: re-enter testing via full pipeline restart from SETTING_UP is heavy;
    // for MVP call attemptRepairs then verify.
    const meta = (await this.getMeta(labId))!;
    const agent = this.agents.find((a) => a.id === meta.agentId) ?? this.agents.find((a) => a.id === "fake")!;
    const prefs = this.persistence.getPreferences();
    const env = await detectEnvironment();
    const promptVars = buildPromptVars({
      TOPIC: meta.topicTitle,
      WORKSPACE_PATH: meta.directory,
      DIFFICULTY: prefs.experienceLevel,
      AVAILABLE_TOOLS: formatAvailableTools(env),
    });
    const checks = createDefaultChecks({ hasDockerServices: false, hasHttpDemo: true, hasTests: true });
    const ok = await this.attemptRepairs(labId, meta, agent, promptVars, "manual repair requested", checks);
    if (ok) {
      await this.setState(labId, "READY");
      this.post({ type: "shadeState", state: "CELEBRATING", line: "Repaired!" });
    } else {
      await this.setState(labId, "FAILED");
    }
    await this.emitLab((await this.getMeta(labId))!, undefined, checks);
  }

  private spawnDetached(labId: string, executable: string, args: string[], cwd: string): void {
    // Use ProcessRunner with long timeout; track loosely
    const id = `start-${labId}`;
    this.processes.set(labId, id);
    void defaultRunner.run(
      { executable, args, cwd, timeoutMs: 60 * 60_000, description: "long-running start" },
      {
        onStdout: (c) => this.post({ type: "logChunk", labId, chunk: c }),
        onStderr: (c) => this.post({ type: "logChunk", labId, chunk: c }),
      },
    );
  }

  private async waitForHttp(url: string, status: number, timeoutMs: number, includes?: string): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (this.isAborted("")) break;
      try {
        const res = await fetch(url);
        const text = await res.text();
        if (res.status === status && (!includes || text.includes(includes))) return true;
      } catch {
        /* retry */
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  }

  private async waitForApproval(labId: string, timeoutMs: number): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const session = this.active.get(labId);
      if (!session || session.abort) return false;
      if (session.approved) return true;
      await new Promise((r) => setTimeout(r, 300));
    }
    return false;
  }

  private parsePlan(stdout: string): ExecutionPlan | undefined {
    try {
      const start = stdout.indexOf("{");
      const end = stdout.lastIndexOf("}");
      if (start < 0 || end < 0) return undefined;
      const obj = JSON.parse(stdout.slice(start, end + 1)) as ExecutionPlan;
      if (!obj.commands || !obj.architecture) return undefined;
      return obj;
    } catch {
      return undefined;
    }
  }

  private fallbackPlan(topic: string): ExecutionPlan {
    return {
      architecture: `Minimal educational project for ${topic}`,
      files: ["README.md", "LESSON.md", "devly.json"],
      dependencies: [],
      services: [],
      commands: [
        { id: "setup", executable: "echo", args: ["setup"], description: "Placeholder setup" },
        { id: "test", executable: "echo", args: ["test"], description: "Placeholder test" },
      ],
      verificationPlan: ["Files exist", "Tests pass"],
    };
  }

  private async readManifest(dir: string) {
    const raw = await readFile(path.join(dir, "devly.json"), "utf8");
    return parseDevlyManifest(JSON.parse(raw));
  }

  private async fileExists(p: string): Promise<boolean> {
    try {
      await access(p);
      return true;
    } catch {
      return false;
    }
  }

  private setCheck(checks: VerificationCheck[], id: string, status: VerificationCheck["status"], detail?: string) {
    const c = checks.find((x) => x.id === id);
    if (c) {
      c.status = status;
      if (detail) c.detail = detail;
    }
  }

  private async failWithChecks(labId: string, checks: VerificationCheck[], evidence: EvidenceEntry[]) {
    await this.setState(labId, "FAILED");
    const meta = (await this.getMeta(labId))!;
    await writeFile(path.join(meta.directory, ".devly", "evidence.json"), JSON.stringify({ checks, evidence }, null, 2), "utf8");
    await this.emitLab(meta, undefined, checks);
    this.post({ type: "shadeState", state: "ERROR", line: "Lab failed verification." });
  }

  private isAborted(labId: string): boolean {
    return Boolean(this.active.get(labId)?.abort);
  }

  private async setState(labId: string, next: LabState): Promise<void> {
    const session = this.active.get(labId);
    const meta = session?.meta ?? (await this.getMeta(labId));
    if (!meta) return;
    try {
      meta.state = transition(meta.state as LabState, this.eventForState(meta.state as LabState, next));
    } catch {
      // Force-set for terminal / recovery paths
      meta.state = next;
    }
    // Always set intended next for clarity
    meta.state = next;
    await this.workspace.writeMeta(meta);
    if (session) session.meta = meta;
    await this.persistence.upsertLab(this.toSummary(meta));
    await this.emitLab(meta);
  }

  private eventForState(from: LabState, to: LabState): Parameters<typeof transition>[1] {
    const map: Record<string, Parameters<typeof transition>[1]> = {
      "CREATED->PLANNING": { type: "START_PLANNING" },
      "PLANNING->WAITING_FOR_APPROVAL": { type: "PLAN_READY" },
      "WAITING_FOR_APPROVAL->GENERATING": { type: "APPROVE" },
      "WAITING_FOR_APPROVAL->CANCELLED": { type: "CANCEL" },
      "GENERATING->SETTING_UP": { type: "GENERATION_DONE" },
      "SETTING_UP->TESTING": { type: "SETUP_DONE" },
      "TESTING->STARTING": { type: "TESTS_PASSED" },
      "TESTING->REPAIRING": { type: "TESTS_FAILED" },
      "REPAIRING->TESTING": { type: "REPAIR_DONE" },
      "REPAIRING->FAILED": { type: "REPAIR_EXHAUSTED" },
      "STARTING->VERIFYING": { type: "START_DONE" },
      "VERIFYING->READY": { type: "VERIFY_READY" },
      "VERIFYING->PARTIALLY_READY": { type: "VERIFY_PARTIAL" },
      "VERIFYING->FAILED": { type: "FAIL" },
    };
    return map[`${from}->${to}`] ?? { type: "FAIL" };
  }

  private async getMeta(labId: string): Promise<LabMeta | undefined> {
    const session = this.active.get(labId);
    if (session) return session.meta;
    const summary = this.persistence.getLabs().find((l) => l.id === labId);
    if (!summary) return undefined;
    return this.workspace.readMeta(summary.directory);
  }

  private toSummary(meta: LabMeta): LabSummary {
    return {
      id: meta.id,
      topicId: meta.topicId,
      topicTitle: meta.topicTitle,
      directory: meta.directory,
      workspaceMode: meta.workspaceMode,
      agentId: meta.agentId,
      state: meta.state as LabSummary["state"],
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
      demoUrl: meta.demoUrl,
    };
  }

  private async openLessonPanel(meta: LabMeta, manifest: DevlyManifest): Promise<void> {
    try {
      const usesDocker =
        manifest.services.length > 0 || manifest.start.some((cmd) => cmd.executable === "docker");
      const python = manifest.start.some((cmd) => /python|pip|uv/.test(cmd.executable));
      const plan: RunPlan = {
        kind: usesDocker ? "compose" : python ? "python" : "node",
        usesDocker,
        setup: manifest.setup.map((cmd) => ({
          executable: cmd.executable,
          args: cmd.args,
          description: cmd.description ?? cmd.executable,
        })),
        start: manifest.start.map((cmd) => ({
          executable: cmd.executable,
          args: cmd.args,
          description: cmd.description ?? `${cmd.executable} ${cmd.args.join(" ")}`.trim(),
        })),
        summary: manifest.start
          .map((cmd) => cmd.description || `${cmd.executable} ${cmd.args.join(" ")}`.trim())
          .filter(Boolean)
          .join(", "),
      };
      const lesson = await collectProjectLesson({
        title: meta.topicTitle,
        directory: meta.directory,
        mode: "learn",
        plan,
        demoUrl: meta.demoUrl,
        live: Boolean(meta.demoUrl) || manifest.start.length > 0,
        preferredFiles: manifest.entryFiles,
      });
      await showProjectLesson(lesson, this.persistence.getMascot());
    } catch (err) {
      this.logger.warn(`Could not open the project lesson: ${String(err)}`);
    }
  }

  private async emitLab(
    meta: LabMeta,
    plan?: ExecutionPlan,
    checks?: VerificationCheck[],
    logs?: string,
    lessonMarkdown?: string,
  ): Promise<void> {
    await this.persistence.upsertLab(this.toSummary(meta));
    this.post({
      type: "labUpdate",
      lab: this.toSummary(meta),
      plan,
      checks,
      logs,
      lessonMarkdown,
    });
    this.post({ type: "labs", labs: this.persistence.getLabs() });
  }
}

