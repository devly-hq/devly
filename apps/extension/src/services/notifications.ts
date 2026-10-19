import * as vscode from "vscode";
import type { Persistence } from "./persistence.js";
import type { Orchestrator } from "./orchestrator.js";
import type { SidebarProvider } from "../providers/sidebarProvider.js";
import { showShadeNudge, type NudgeChoice } from "./nudgePanel.js";
import { pickNudgeOffers, type NudgeOffer } from "./nudgeOffers.js";
import type { CatalogService } from "./catalog.js";
import type { TrendingService } from "./trending.js";

/** Wait a few seconds after startup so we don't interrupt the first click. */
const STARTUP_DELAY_MS = 12_000;

type NudgeStyle = "modal" | "toast" | "branded";
type DaySlot = "morning" | "afternoon";

/**
 * Automatic nudges: up to **twice per calendar day**
 * - morning slot  (before 14:00 local)
 * - afternoon slot (14:00 and later)
 *
 * When you open Cursor, if that slot hasn't fired today, Shade nudges you.
 * You do NOT need to keep the IDE open for hours.
 */
export class DailyNotifier {
  private timers: ReturnType<typeof setTimeout>[] = [];
  private status?: vscode.StatusBarItem;

  constructor(
    private readonly persistence: Persistence,
    private readonly orchestrator: Orchestrator,
    private readonly provider: SidebarProvider,
    private readonly catalog: CatalogService,
    private readonly trending: TrendingService,
  ) {}

  attachStatusBar(item: vscode.StatusBarItem): void {
    this.status = item;
    this.refreshStatusBar();
  }

  start(): void {
    this.clearTimers();
    this.refreshStatusBar();
    this.timers.push(
      setTimeout(() => {
        void this.tryNotify("auto");
      }, STARTUP_DELAY_MS),
    );
  }

  dispose(): void {
    this.clearTimers();
  }

  async showNow(): Promise<void> {
    await this.tryNotify("force");
  }

  refreshStatusBar(): void {
    if (!this.status) return;
    const prefs = this.persistence.getPreferences();
    if (!prefs.dailySuggestions) {
      this.status.text = "$(sparkle) Shade";
      this.status.tooltip = "Devly — daily suggestions off";
      this.status.command = "devly.openDashboard";
      return;
    }
    const topic = this.headline();
    if (!topic) {
      this.status.text = "$(sparkle) Shade";
      this.status.tooltip = "Devly — open today's picks";
      this.status.command = "devly.openDashboard";
      return;
    }
    const short = topic.length > 28 ? `${topic.slice(0, 27)}…` : topic;
    this.status.text = `$(sparkle) Shade: ${short}`;
    this.status.tooltip = `Today: ${topic}\nAuto: up to 2×/day (morning + afternoon) when Cursor is open`;
    this.status.command = "devly.showTodayNudge";
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  private headline(): string | undefined {
    return this.currentOffers()[0]?.title;
  }

  private currentOffers(): NudgeOffer[] {
    const prefs = this.persistence.getPreferences();
    return pickNudgeOffers({
      liveTopics: this.catalog.discovery.getLiveTopics(),
      seedTopics: this.catalog.getSeedTopics(),
      repos: this.trending.getRepos(),
      dismissedTopicIds: prefs.dismissedTopicIds,
    });
  }

  private nudgeStyle(): NudgeStyle {
    const raw = vscode.workspace.getConfiguration("devly").get<string>("nudgeStyle", "branded");
    if (raw === "toast" || raw === "branded" || raw === "modal") return raw;
    return "branded";
  }

  private currentSlot(now = new Date()): DaySlot {
    // Morning until 2pm, afternoon after — two chances per day
    return now.getHours() < 14 ? "morning" : "afternoon";
  }

  private async tryNotify(mode: "auto" | "force"): Promise<void> {
    const prefs = this.persistence.getPreferences();
    const configEnabled = vscode.workspace.getConfiguration("devly").get<boolean>("dailySuggestions", true);
    if (!prefs.dailySuggestions || !configEnabled) return;

    if (mode === "auto" && vscode.debug.activeDebugSession) return;

    if (prefs.notificationSnoozeUntil && new Date(prefs.notificationSnoozeUntil) > new Date()) {
      if (mode === "auto") return;
    }

    if (prefs.quietHoursStart !== undefined && prefs.quietHoursEnd !== undefined) {
      const hour = new Date().getHours();
      const { quietHoursStart: start, quietHoursEnd: end } = prefs;
      const inQuiet = start <= end ? hour >= start && hour < end : hour >= start || hour < end;
      if (inQuiet && mode === "auto") return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const slot = this.currentSlot();
    const state = this.persistence.getNotifyState();

    if (mode === "auto") {
      // Reset slots on a new day
      const slots = state.date === today ? state.slots ?? [] : [];
      if (slots.includes(slot)) {
        // Already nudged for this half of the day
        return;
      }
    }

    await Promise.all([
      this.catalog.refreshDiscovery().catch(() => undefined),
      this.trending.refresh().catch(() => ({ repos: this.trending.getRepos() })),
    ]);
    const offers = this.currentOffers();
    if (offers.length === 0) return;

    this.refreshStatusBar();

    const summary = offers.map((offer) => offer.title).join(" · ");
    const message = `Shade: three things today — ${summary}`;

    const style = this.nudgeStyle();
    let choiceKey: NudgeChoice | undefined;

    if (style === "branded") {
      choiceKey = await showShadeNudge({
        offers,
        mascot: this.persistence.getMascot(),
      });
    } else {
      const buttons = ["Let's build", "Tell me more", "Later", "Not today"] as const;
      const picked =
        style === "modal"
          ? await vscode.window.showInformationMessage(message, { modal: true }, ...buttons)
          : await vscode.window.showInformationMessage(message, ...buttons);
      const live = offers.find((offer) => offer.kind === "live") ?? offers.find((offer) => offer.topicId);
      if (picked === "Let's build" && live?.topicId) choiceKey = { action: "build", topicId: live.topicId };
      else if (picked === "Tell me more") choiceKey = { action: "more" };
      else if (picked === "Later") choiceKey = { action: "later" };
      else if (picked === "Not today") choiceKey = { action: "dismiss" };
    }

    // Count this slot even if they dismiss / close without clicking
    if (mode === "auto" || choiceKey !== undefined) {
      const prevSlots = state.date === today ? state.slots ?? [] : [];
      const nextSlots = [...new Set([...prevSlots, slot])];
      await this.persistence.setNotifyState({
        date: today,
        count: nextSlots.length,
        slots: nextSlots,
      });
    }

    if (choiceKey?.action === "build") {
      if (!prefs.onboardingComplete) {
        void vscode.commands.executeCommand("devly.sidebar.focus");
        this.provider.post({
          type: "toast",
          message: "Finish a quick onboarding first, then we can build.",
          level: "info",
        });
        return;
      }
      await this.orchestrator.startLab({
        topicId: choiceKey.topicId,
        agentId: prefs.defaultAgentId || "fake",
        workspaceMode: prefs.workspacePreference,
        learningMode: prefs.learningMode,
      });
      void vscode.commands.executeCommand("devly.sidebar.focus");
    } else if (choiceKey?.action === "repo") {
      const repo = offers.find((offer) => offer.id === choiceKey.id)?.repo;
      if (!repo) return;
      await this.orchestrator.tryLiveRepo({
        fullName: repo.fullName,
        cloneUrl: repo.cloneUrl,
        htmlUrl: repo.htmlUrl,
        description: repo.description,
      });
    } else if (choiceKey?.action === "more") {
      void vscode.commands.executeCommand("devly.sidebar.focus");
      this.provider.post({ type: "shadeState", state: "HAPPY", line: `Today: ${summary}` });
    } else if (choiceKey?.action === "later") {
      await this.persistence.patchPreferences({
        notificationSnoozeUntil: new Date(Date.now() + 3 * 3600_000).toISOString(),
      });
    } else if (choiceKey?.action === "dismiss") {
      const topicIds = offers.map((offer) => offer.topicId).filter((id): id is string => Boolean(id));
      await this.persistence.patchPreferences({
        dismissedTopicIds: [...new Set([...prefs.dismissedTopicIds, ...topicIds])],
      });
      this.refreshStatusBar();
    }
  }
}
