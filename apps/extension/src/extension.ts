import * as vscode from "vscode";
import { Persistence } from "./services/persistence.js";
import { CatalogService } from "./services/catalog.js";
import { Orchestrator } from "./services/orchestrator.js";
import { SidebarProvider } from "./providers/sidebarProvider.js";
import { Logger } from "./utils/logger.js";
import { DailyNotifier } from "./services/notifications.js";
import { TrendingService } from "./services/trending.js";
import { loadDevlyEnv } from "./services/env.js";
import { dockerManager, isDockerDaemonReady } from "@devly/execution";

let logger: Logger;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  logger = new Logger("Devly");
  logger.info("Activating Devly...");
  loadDevlyEnv(context.extensionPath);

  const persistence = new Persistence(context);
  const catalog = new CatalogService(context.extensionUri, context.globalState);

  try {
    await catalog.load();
    logger.info(`Loaded ${catalog.getSeedTopics().length} seed topics`);
  } catch (err) {
    logger.warn(`Catalog load failed (will use empty): ${String(err)}`);
  }

  const trending = new TrendingService(context.globalState);
  let provider!: SidebarProvider;
  const orchestrator = new Orchestrator(persistence, catalog, logger, (msg) => provider.post(msg));
  provider = new SidebarProvider(
    context.extensionUri,
    persistence,
    catalog,
    orchestrator,
    logger,
    trending,
  );
  const notifier = new DailyNotifier(persistence, orchestrator, provider, catalog, trending);

  // Discovery uses GitHub search. Trending reads the public today page after that.
  void catalog
    .refreshDiscovery()
    .then((mode) => {
      logger.info(
        `Discovery refresh mode=${mode}; live=${catalog.discovery.getLiveTopics().length}; total=${catalog.getTopics().length}`,
      );
    })
    .catch((err: unknown) => {
      logger.warn(`Discovery refresh failed: ${String(err)}`);
    })
    .then(async () => {
      const { repos, notice } = await trending.refresh();
      logger.info(`Trending repos loaded: ${repos.length}`);
      provider.post({ type: "trendingRepos", repos, notice });
    });

  context.subscriptions.push(
    trending.watch((result) => {
      provider.post({ type: "trendingRepos", repos: result.repos, notice: result.notice });
    }),
  );

  context.subscriptions.push(
    logger,
    { dispose: () => notifier.dispose() },
    vscode.window.registerWebviewViewProvider(SidebarProvider.viewType, provider),
    vscode.commands.registerCommand("devly.openDashboard", () => {
      void vscode.commands.executeCommand("devly.sidebar.focus");
    }),
    vscode.commands.registerCommand("devly.showTodayNudge", async () => {
      await notifier.showNow();
    }),
    vscode.commands.registerCommand("devly.startLab", async () => {
      const picks = orchestrator.getDailyPicks();
      const pick = picks[0];
      if (!pick) {
        void vscode.window.showInformationMessage("No topics available");
        return;
      }
      const agents = await orchestrator.detectAgents();
      const installed = agents.filter((a) => a.installed);
      const agent =
        installed.find((a) => a.id === persistence.getPreferences().defaultAgentId) ??
        installed.find((a) => a.id === "claude-code") ??
        installed.find((a) => a.id === "fake") ??
        installed[0];
      if (!agent) {
        void vscode.window.showErrorMessage("No coding agents detected");
        return;
      }
      await orchestrator.startLab({
        topicId: pick.id,
        agentId: agent.id,
        workspaceMode: persistence.getPreferences().workspacePreference,
        learningMode: persistence.getPreferences().learningMode,
      });
    }),
    vscode.commands.registerCommand("devly.customTopic", async () => {
      const text = await vscode.window.showInputBox({
        prompt: "What do you want to learn?",
        placeHolder: "Teach me how Kafka works",
      });
      if (!text) return;
      const prefs = persistence.getPreferences();
      await orchestrator.startLab({
        customTopic: text,
        agentId: prefs.defaultAgentId || "fake",
        workspaceMode: prefs.workspacePreference,
        learningMode: prefs.learningMode,
      });
    }),
    vscode.commands.registerCommand("devly.myLabs", () => {
      void vscode.commands.executeCommand("devly.sidebar.focus");
      provider.post({ type: "toast", message: "Open My Labs in the Shade sidebar", level: "info" });
    }),
    vscode.commands.registerCommand("devly.explainSelection", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const code = editor.document.getText(editor.selection);
      if (!code.trim()) {
        void vscode.window.showInformationMessage("Select some code first");
        return;
      }
      await orchestrator.askShade({
        question: "Explain this code",
        code,
        filePath: editor.document.uri.fsPath,
      });
      void vscode.commands.executeCommand("devly.sidebar.focus");
    }),
    vscode.commands.registerCommand("devly.stopServices", async () => {
      const labs = persistence.getLabs();
      if (!labs.length) return;
      const chosen = await vscode.window.showQuickPick(
        labs.map((l) => ({ label: l.topicTitle, description: l.id, labId: l.id })),
      );
      if (chosen) await orchestrator.stopServices(chosen.labId);
    }),
    vscode.commands.registerCommand("devly.deleteLab", async () => {
      const labs = persistence.getLabs();
      const chosen = await vscode.window.showQuickPick(
        labs.map((l) => ({ label: l.topicTitle, description: l.id, labId: l.id })),
      );
      if (chosen) await orchestrator.deleteLab(chosen.labId);
    }),
    vscode.commands.registerCommand("devly.resetOnboarding", async () => {
      await persistence.patchPreferences({ onboardingComplete: false });
      void vscode.window.showInformationMessage("Onboarding reset. Reopen the Shade sidebar.");
    }),
  );

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  status.show();
  notifier.attachStatusBar(status);
  context.subscriptions.push(status);

  // Daily toast nudges (up to 2/day) + status-bar tip — no need to open the left bar
  notifier.start();

  setTimeout(() => {
    void (async () => {
      const failed = persistence.getLabs().filter((lab) => lab.state === "CANCELLED" || lab.state === "FAILED");
      if (failed.length === 0) return;
      if (!(await isDockerDaemonReady())) return;
      for (const lab of failed) {
        try {
          await dockerManager.cleanupLabeled(lab.id);
        } catch {
          /* ignore */
        }
      }
    })();
  }, 20_000);

  logger.info("Devly activated");
}

export function deactivate(): void {
  logger?.info("Devly deactivated");
}
