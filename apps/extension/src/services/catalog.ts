import * as vscode from "vscode";
import { loadCategories, loadTopics, type Category, type TopicRecord } from "@devly/core";
import type { Topic } from "@devly/protocol";
import { DiscoveryFeedService } from "./discoveryFeed.js";

export class CatalogService {
  private seedTopics: TopicRecord[] = [];
  private liveTopics: TopicRecord[] = [];
  private categories: Category[] = [];
  readonly discovery: DiscoveryFeedService;

  constructor(
    private readonly extensionUri: vscode.Uri,
    globalState: vscode.Memento,
  ) {
    this.discovery = new DiscoveryFeedService(extensionUri, globalState);
  }

  async load(): Promise<void> {
    const catUri = vscode.Uri.joinPath(this.extensionUri, "content", "categories", "categories.json");
    const topicsUri = vscode.Uri.joinPath(this.extensionUri, "content", "topics", "index.json");
    try {
      const catBuf = await vscode.workspace.fs.readFile(catUri);
      const topicsBuf = await vscode.workspace.fs.readFile(topicsUri);
      this.categories = loadCategories(JSON.parse(Buffer.from(catBuf).toString("utf8")));
      this.seedTopics = loadTopics(JSON.parse(Buffer.from(topicsBuf).toString("utf8")));
    } catch (err) {
      this.categories = [];
      this.seedTopics = [];
      throw err;
    }

    this.discovery.restoreFromState();
    await this.discovery.loadBundled();
    this.liveTopics = this.discovery.getLiveTopics();
  }

  /** Refresh live/remote discovery and rebuild merged catalog. */
  async refreshDiscovery(opts?: { force?: boolean }): Promise<string> {
    const enabled = vscode.workspace
      .getConfiguration("devly")
      .get<boolean>("enableDiscoverySources", true);

    const result = await this.discovery.refresh({
      enabled,
      seedTitles: this.seedTopics.map((t) => t.title),
      seedTags: this.seedTopics.flatMap((t) => t.tags),
      force: opts?.force,
    });
    this.liveTopics = this.discovery.getLiveTopics();
    return result.mode;
  }

  getCategories(): Category[] {
    return this.categories;
  }

  /** Seed evergreen labs (easy curated path). */
  getSeedTopics(): TopicRecord[] {
    return this.seedTopics;
  }

  /**
   * Merged catalog: live/trending first, then seed.
   * Live ids win on collision.
   */
  getTopics(): TopicRecord[] {
    const byId = new Map<string, TopicRecord>();
    for (const t of this.seedTopics) byId.set(t.id, t);
    for (const t of this.liveTopics) byId.set(t.id, t);
    // Prefer showing live topics ahead in raw list for explore
    const liveIds = new Set(this.liveTopics.map((t) => t.id));
    const merged = [...byId.values()];
    merged.sort((a, b) => {
      const al = liveIds.has(a.id) ? 1 : 0;
      const bl = liveIds.has(b.id) ? 1 : 0;
      if (al !== bl) return bl - al;
      return b.popularity - a.popularity;
    });
    return merged;
  }

  getTopic(id: string): TopicRecord | undefined {
    return this.getTopics().find((t) => t.id === id);
  }

  asProtocolTopics(): Topic[] {
    return this.getTopics().map((t) => ({
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
    }));
  }
}
