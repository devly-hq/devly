import * as vscode from "vscode";
import { parseWebviewMessage, type HostToWebview, type LiveHit, type Topic } from "@devly/protocol";
import {
  fetchHuggingFaceModels,
  fetchRepoNews,
  firecrawlSearch,
  searchGitHubRepos,
  searchTopics,
} from "@devly/core";
import type { Logger } from "../utils/logger.js";
import type { Persistence } from "../services/persistence.js";
import type { CatalogService } from "../services/catalog.js";
import type { Orchestrator } from "../services/orchestrator.js";
import type { TrendingService } from "../services/trending.js";
import { ModelSetupService } from "../services/modelSetup.js";

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "devly.sidebar";
  private view?: vscode.WebviewView;

  private readonly models: ModelSetupService;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly persistence: Persistence,
    private readonly catalog: CatalogService,
    private readonly orchestrator: Orchestrator,
    private readonly logger: Logger,
    private readonly trending: TrendingService,
  ) {
    this.models = new ModelSetupService(persistence, logger, (msg) => this.post(msg));
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;
    const webview = webviewView.webview;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, "media", "webview"),
        vscode.Uri.joinPath(this.extensionUri, "resources"),
      ],
    };
    webview.html = this.getHtml(webview);

    webview.onDidReceiveMessage(async (raw) => {
      const msg = parseWebviewMessage(raw);
      if (!msg) {
        this.logger.warn(`Dropped unknown webview message: ${JSON.stringify(raw)}`);
        return;
      }
      try {
        await this.handle(msg);
      } catch (err) {
        this.logger.error(String(err));
        this.post({ type: "error", message: String(err) });
      }
    });
  }

  post(msg: HostToWebview): void {
    void this.view?.webview.postMessage(msg);
  }

  private async handle(msg: ReturnType<typeof parseWebviewMessage> & object): Promise<void> {
    if (!msg) return;
    switch (msg.type) {
      case "ready":
      case "getBootstrap":
        await this.sendBootstrap();
        break;
      case "completeOnboarding":
        await this.persistence.setPreferences({ ...msg.preferences, onboardingComplete: true });
        await this.sendBootstrap();
        break;
      case "updatePreferences":
        await this.persistence.patchPreferences(msg.preferences);
        break;
      case "updateMascot":
        await this.persistence.patchMascot(msg.preferences);
        break;
      case "refreshPicks": {
        await this.catalog.refreshDiscovery({ force: true });
        const { repos, notice } = await this.trending.refresh(true);
        this.post({ type: "trendingRepos", repos, notice });
        void this.postRepoNews(repos);
        this.post({ type: "picks", picks: this.orchestrator.getDailyPicks({ rotate: true }).map(toTopic) });
        this.post({ type: "liveTopics", topics: this.liveTopicList() });
        break;
      }
      case "saveTopic": {
        const prefs = this.persistence.getPreferences();
        const saved = new Set(prefs.savedTopicIds);
        saved.add(msg.topicId);
        await this.persistence.patchPreferences({ savedTopicIds: [...saved] });
        this.post({ type: "toast", message: "Saved for later", level: "info" });
        break;
      }
      case "hideTopic": {
        const prefs = this.persistence.getPreferences();
        await this.persistence.patchPreferences({
          hiddenTopicIds: [...new Set([...prefs.hiddenTopicIds, msg.topicId])],
        });
        break;
      }
      case "markKnown": {
        const prefs = this.persistence.getPreferences();
        await this.persistence.patchPreferences({
          knownTopicIds: [...new Set([...prefs.knownTopicIds, msg.topicId])],
        });
        break;
      }
      case "searchTopics": {
        const query = msg.query.trim();
        const results = searchTopics(this.catalog.getTopics(), query);
        this.post({ type: "searchResults", results: results.map(toTopic) });
        if (!query) {
          this.post({ type: "repoSearchResults", repos: [] });
          break;
        }
        const needle = query.toLowerCase();
        const local = this.trending.getRepos().filter((repo) =>
          `${repo.fullName} ${repo.description} ${repo.topics.join(" ")}`.toLowerCase().includes(needle),
        );
        if (local.length > 0) {
          this.post({ type: "repoSearchResults", repos: local.slice(0, 8) });
          break;
        }
        const found = await searchGitHubRepos(query, process.env.GITHUB_TOKEN);
        this.post({
          type: "repoSearchResults",
          repos: found.repos.slice(0, 8),
          notice: found.notice,
        });
        break;
      }
      case "searchLive": {
        const query = msg.query.trim();
        if (msg.scope === "github") {
          if (!query) {
            this.post({ type: "repoSearchResults", repos: this.trending.getRepos() });
            break;
          }
          const found = await searchGitHubRepos(query, process.env.GITHUB_TOKEN);
          this.post({ type: "repoSearchResults", repos: found.repos, notice: found.notice });
          break;
        }
        const hits = await this.liveSearchHits(query);
        this.post({ type: "liveHits", hits });
        break;
      }
      case "refreshLive": {
        await this.catalog.refreshDiscovery({ force: true });
        this.post({ type: "liveTopics", topics: this.liveTopicList() });
        const hits = await this.liveSearchHits("");
        this.post({ type: "liveHits", hits });
        break;
      }
      case "getTopic": {
        const topic = this.catalog.getTopic(msg.topicId);
        if (topic) {
          this.post({
            type: "topicDetail",
            topic: {
              id: topic.id,
              title: topic.title,
              description: topic.description,
              category: topic.category,
              tags: topic.tags,
              difficulty: topic.difficulty,
              estimatedMinutes: topic.estimatedMinutes,
              languages: topic.languages,
              requiredTechnologies: topic.requiredTechnologies,
              learningObjectives: topic.learningObjectives,
              evergreen: topic.evergreen,
              popularity: topic.popularity,
            },
          });
        }
        break;
      }
      case "customTopic":
        this.post({ type: "toast", message: "Starting custom topic lab...", level: "info" });
        await this.orchestrator.startLab({
          customTopic: msg.text,
          agentId: this.persistence.getPreferences().defaultAgentId || "fake",
          workspaceMode: this.persistence.getPreferences().workspacePreference,
          learningMode: this.persistence.getPreferences().learningMode,
        });
        break;
      case "startLab":
        await this.orchestrator.startLab({
          topicId: msg.topicId,
          customTopic: msg.customTopic,
          agentId: msg.agentId,
          workspaceMode: msg.workspaceMode,
          learningMode: msg.learningMode,
        });
        break;
      case "approvePlan":
        await this.orchestrator.approvePlan(msg.labId);
        break;
      case "rejectPlan":
        await this.orchestrator.rejectPlan(msg.labId);
        break;
      case "cancelLab":
        await this.orchestrator.cancelLab(msg.labId);
        break;
      case "repairLab":
        await this.orchestrator.repairLab(msg.labId);
        break;
      case "stopServices":
        await this.orchestrator.stopServices(msg.labId);
        break;
      case "deleteLab":
        await this.orchestrator.deleteLab(msg.labId);
        break;
      case "openLab": {
        const lab = this.persistence.getLabs().find((l) => l.id === msg.labId);
        if (lab) await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(lab.directory), true);
        break;
      }
      case "resumeLab":
        this.post({ type: "toast", message: "Open the lab folder and click Repair/Verify if needed.", level: "info" });
        break;
      case "openFile":
        await this.orchestrator.openFile(msg.labId, msg.relativePath, msg.line);
        break;
      case "askShade":
        await this.orchestrator.askShade(msg);
        break;
      case "detectAgents":
        this.post({ type: "agents", agents: await this.orchestrator.detectAgents() });
        break;
      case "openExternal":
        await vscode.env.openExternal(vscode.Uri.parse(msg.url));
        break;
      case "refreshTrending": {
        this.post({ type: "shadeState", state: "LOADING", line: "Fetching trending GitHub repos…" });
        const { repos, notice } = await this.trending.refresh(true);
        this.post({ type: "trendingRepos", repos, notice });
        await this.postRepoNews(repos);
        this.post({
          type: "shadeState",
          state: "IDLE",
          line: notice ?? (repos.length ? `Found ${repos.length} trending repos.` : "No trending repos right now."),
        });
        break;
      }
      case "tryLiveRepo":
        await this.orchestrator.tryLiveRepo({
          fullName: msg.fullName,
          cloneUrl: msg.cloneUrl,
          htmlUrl: msg.htmlUrl,
          description: msg.description,
        });
        break;
      case "setupModel":
        await this.models.run({ title: msg.title, url: msg.url });
        break;
      case "navigate":
        break;
      default:
        break;
    }
  }

  private async sendBootstrap(): Promise<void> {
    const picks = this.orchestrator.getDailyPicks();
    const agents = await this.orchestrator.detectAgents();
    if (this.trending.getRepos().length === 0) {
      void this.trending.refresh().then(({ repos, notice }) => {
        this.post({ type: "trendingRepos", repos, notice });
        void this.postRepoNews(repos);
      });
    } else {
      void this.postRepoNews(this.trending.getRepos());
    }
    this.post({
      type: "bootstrap",
      preferences: this.persistence.getPreferences(),
      mascot: this.persistence.getMascot(),
      picks: picks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        category: t.category,
        tags: t.tags,
        difficulty: t.difficulty,
        estimatedMinutes: t.estimatedMinutes,
        languages: t.languages,
        requiredTechnologies: t.requiredTechnologies,
        learningObjectives: t.learningObjectives,
        evergreen: t.evergreen,
        popularity: t.popularity,
      })),
      categories: this.catalog.getCategories(),
      agents,
      labs: this.persistence.getLabs(),
      trendingRepos: this.trending.getRepos(),
      progress: this.persistence.getProgress(),
    });
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const mediaRoot = vscode.Uri.joinPath(this.extensionUri, "media", "webview");
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, "assets", "index.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, "assets", "index.css"));
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
      `font-src ${webview.cspSource}`,
    ].join("; ");

    // Fallback inline app if webview bundle missing
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${styleUri}">
  <title>Devly</title>
  <style>
    body { margin:0; font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-sideBar-background); }
    #root:empty::before { content: "Loading Shade..."; opacity: 0.7; display:block; padding: 16px; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
  <script nonce="${nonce}">
    // Fallback bootstrap if bundle fails
    window.addEventListener('error', () => {
      const root = document.getElementById('root');
      if (root && !root.children.length) {
        root.innerHTML = '<div style="padding:12px"><h3>Devly</h3><p>Webview bundle missing. Run <code>pnpm build</code>.</p></div>';
      }
    });
  </script>
</body>
</html>`;
  }

  private liveTopicList(): Topic[] {
    return this.catalog
      .getTopics()
      .filter((topic) => !topic.evergreen)
      .map(toTopic);
  }

  private async postRepoNews(repos: { fullName: string }[]): Promise<void> {
    const key = process.env.FIRECRAWL_API_KEY?.trim();
    if (!key) {
      this.post({ type: "repoNews", items: [] });
      return;
    }
    try {
      const items = await fetchRepoNews(key, repos);
      this.post({
        type: "repoNews",
        items: items.map((item) => ({ ...item, kind: "news" as const })),
      });
    } catch (err) {
      this.logger.warn(`Repo news failed: ${String(err)}`);
      this.post({ type: "repoNews", items: [] });
    }
  }

  private async liveSearchHits(query: string): Promise<LiveHit[]> {
    const key = process.env.FIRECRAWL_API_KEY?.trim() ?? "";
    const newsQuery = query || "new developer tools and AI models this week";
    const [models, news] = await Promise.all([
      fetchHuggingFaceModels(query || undefined, String(Date.now())).catch(() => []),
      key ? firecrawlSearch(key, newsQuery, 6).catch(() => []) : Promise.resolve([]),
    ]);
    const modelHits: LiveHit[] = models.map((model) => ({
      id: model.id,
      title: model.title,
      description: model.description,
      url: model.url,
      kind: "model",
      meta: model.meta,
      tag: model.tag,
    }));
    const newsHits: LiveHit[] = news.map((hit) => ({
      id: `live-${hit.url}`,
      title: hit.title,
      description: hit.description,
      url: hit.url,
      kind: "topic" as const,
    }));
    return [...modelHits, ...newsHits];
  }
}

function toTopic(t: {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  difficulty: Topic["difficulty"];
  estimatedMinutes: number;
  languages: string[];
  requiredTechnologies: string[];
  learningObjectives: string[];
  evergreen: boolean;
  popularity: number;
}): Topic {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    category: t.category,
    tags: t.tags,
    difficulty: t.difficulty,
    estimatedMinutes: t.estimatedMinutes,
    languages: t.languages,
    requiredTechnologies: t.requiredTechnologies,
    learningObjectives: t.learningObjectives,
    evergreen: t.evergreen,
    popularity: t.popularity,
  };
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 32; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
