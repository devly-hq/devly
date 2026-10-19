import { createHash } from "node:crypto";
import { isHttpsUrl, wrapUntrustedContent } from "../security/redact.js";
import type { DiscoveredTopic, TopicSource } from "./types.js";

export type { DiscoveredTopic, TopicSource } from "./types.js";

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function dedupeTopics(topics: DiscoveredTopic[]): DiscoveredTopic[] {
  const seen = new Set<string>();
  const out: DiscoveredTopic[] = [];
  for (const t of topics) {
    const key = `${normalizeTitle(t.title)}|${t.sourceUrl}`;
    if (seen.has(key)) continue;
    if (!isHttpsUrl(t.sourceUrl)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function inferCategory(text: string): string {
  const t = text.toLowerCase();
  if (/\b(rag|llm|agent|mcp|embedding|langchain|langgraph|crewai|ollama|prompt)\b/.test(t)) {
    return "ai-engineering";
  }
  if (/\b(docker|kubernetes|k8s|terraform|ci|github actions|serverless|observability)\b/.test(t)) {
    return "devops";
  }
  if (/\b(postgres|redis|kafka|qdrant|pinecone|sql|mongo)\b/.test(t)) return "databases";
  if (/\b(oauth|jwt|auth|security|secrets)\b/.test(t)) return "security";
  if (/\b(rust|typescript|python|golang|go\b|zig)\b/.test(t)) return "languages";
  return "open-source";
}

function inferDifficulty(text: string): DiscoveredTopic["suggestedDifficulty"] {
  const t = text.toLowerCase();
  if (/\b(intro|beginner|basics|getting started|101|fundamentals)\b/.test(t)) return "beginner";
  if (/\b(advanced|internals|from scratch|distributed|formal)\b/.test(t)) return "advanced";
  return "intermediate";
}

function inferTags(text: string): string[] {
  const tags: string[] = [];
  const map: Array<[RegExp, string]> = [
    [/\bmcp\b/i, "MCP"],
    [/\brag\b/i, "RAG"],
    [/\bdocker\b/i, "Docker"],
    [/\bkubernetes|k8s\b/i, "Kubernetes"],
    [/\bfastapi\b/i, "FastAPI"],
    [/\bpostgres/i, "PostgreSQL"],
    [/\bredis\b/i, "Redis"],
    [/\bkafka\b/i, "Kafka"],
    [/\btypescript\b/i, "TypeScript"],
    [/\brust\b/i, "Rust"],
    [/\bllm\b/i, "LLM"],
    [/\bagent/i, "Agents"],
    [/\boauth/i, "OAuth"],
    [/\bterraform\b/i, "Terraform"],
  ];
  for (const [re, tag] of map) {
    if (re.test(text) && !tags.includes(tag)) tags.push(tag);
  }
  return tags.slice(0, 5);
}

function defaultObjectives(title: string): string[] {
  return [
    `Explain what "${title.slice(0, 60)}" is and when to use it`,
    "Build a minimal working local demo",
    "Write one automated test that proves the core idea",
  ];
}

/** Hacker News Algolia API — learnable tech stories. */
export class HackerNewsSource implements TopicSource {
  id = "hackernews";

  async fetchTopics(): Promise<DiscoveredTopic[]> {
    const queries = [
      "MCP OR RAG OR LangGraph OR \"vector database\"",
      "Docker OR Kubernetes OR Terraform",
      "TypeScript OR Rust OR FastAPI tutorial",
    ];
    const batches = await Promise.all(
      queries.map(async (q) => {
        const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=8`;
        const res = await fetch(url);
        if (!res.ok) return [] as DiscoveredTopic[];
        const data = (await res.json()) as {
          hits?: Array<{
            objectID: string;
            title?: string;
            url?: string;
            points?: number;
            created_at?: string;
            story_text?: string;
          }>;
        };
        return (data.hits ?? [])
          .filter((h) => h.title && h.url && isHttpsUrl(h.url))
          .map((h) => {
            const title = h.title!;
            const hay = `${title} ${h.story_text ?? ""}`;
            return {
              id: `hn-${h.objectID}`,
              title,
              description: wrapUntrustedContent("hackernews", (h.story_text ?? title).slice(0, 500)),
              sourceUrl: h.url!,
              category: inferCategory(hay),
              tags: [...inferTags(hay), "hackernews"],
              discoveredAt: h.created_at ?? new Date().toISOString(),
              popularity: Math.min(100, h.points ?? 0),
              suggestedDifficulty: inferDifficulty(hay),
              learningObjectives: defaultObjectives(title),
              source: "hackernews",
              excerpt: h.story_text?.slice(0, 1200),
            } satisfies DiscoveredTopic;
          });
      }),
    );
    return batches.flat();
  }
}

/** GitHub search API — optional GITHUB_TOKEN for higher rate limits. */
export class GitHubTrendingSource implements TopicSource {
  id = "github";

  constructor(private token?: string) {}

  async fetchTopics(): Promise<DiscoveredTopic[]> {
    const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 21).toISOString().slice(0, 10);
    const queries = [
      `created:>${since} stars:>40 topic:mcp`,
      `created:>${since} stars:>50 topic:rag`,
      `created:>${since} stars:>40 topic:langchain`,
      `created:>${since} stars:>30 topic:docker tutorial in:readme`,
      `created:>${since} stars:>40 language:Python topic:agents`,
    ];
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "devly-discovery",
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
    };

    const batches: DiscoveredTopic[][] = [];
    for (const q of queries) {
      const res = await fetch(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=5`,
        { headers },
      );
      if (res.status === 403 || res.status === 429) break;
      if (!res.ok) continue;
      const data = (await res.json()) as {
          items?: Array<{
            id: number;
            full_name: string;
            description?: string | null;
            html_url: string;
            stargazers_count: number;
            language?: string | null;
            topics?: string[];
            created_at?: string;
            pushed_at?: string;
          }>;
        };
      const batch = (data.items ?? [])
          .filter((r) => (r.description ?? "").trim().length >= 20)
          .map((r) => {
            const repo = r.full_name.split("/")[1] ?? r.full_name;
            const desc = (r.description ?? "").trim();
            const hay = `${repo} ${desc} ${(r.topics ?? []).join(" ")}`;
            // Prefer the human description as title; never inject "tutorial/hands-on"
            // into the title or we game our own learnability scorer.
            const title =
              desc.length >= 28 && desc.length <= 100
                ? desc
                : `Learn ${repo}: ${desc.slice(0, 70)}`.trim();
            return {
              id: `gh-${r.id}`,
              title,
              description: wrapUntrustedContent("github", `${desc} (${r.full_name})`),
              sourceUrl: r.html_url,
              category: inferCategory(hay),
              tags: [...inferTags(hay), ...(r.topics ?? []).slice(0, 3), "github"],
              discoveredAt: r.pushed_at ?? r.created_at ?? new Date().toISOString(),
              popularity: Math.min(100, Math.round(Math.log10((r.stargazers_count || 1) + 1) * 40)),
              suggestedDifficulty: inferDifficulty(hay),
              learningObjectives: [
                `Explain what ${repo} is for in plain language`,
                "Clone and run a minimal local example",
                "Write one small extension or test on top of it",
              ],
              source: "github",
              excerpt: desc,
            } satisfies DiscoveredTopic;
          });
      batches.push(batch);
    }
    return batches.flat();
  }
}

/** arXiv API for recent AI / systems papers that can become labs. */
export class ArxivSource implements TopicSource {
  id = "arxiv";

  async fetchTopics(): Promise<DiscoveredTopic[]> {
    const queries = [
      "cat:cs.AI+AND+all:agent",
      "cat:cs.LG+AND+all:retrieval",
      "cat:cs.SE+AND+all:llm",
    ];
    const batches = await Promise.all(
      queries.map(async (q) => {
        const res = await fetch(
          `https://export.arxiv.org/api/query?search_query=${q}&start=0&max_results=4&sortBy=submittedDate&sortOrder=descending`,
        );
        if (!res.ok) return [] as DiscoveredTopic[];
        const xml = await res.text();
        const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, 4);
        return entries.map((m, i) => {
          const block = m[1] ?? "";
          const title = (block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? `arxiv-${i}`)
            .replace(/\s+/g, " ")
            .trim();
          const summary = (block.match(/<summary>([\s\S]*?)<\/summary>/)?.[1] ?? title)
            .replace(/\s+/g, " ")
            .trim();
          const id = block.match(/<id>([\s\S]*?)<\/id>/)?.[1]?.trim() ?? `https://arxiv.org/abs/unknown-${i}`;
          const httpsId = id.replace("http://", "https://");
          const published = block.match(/<published>([\s\S]*?)<\/published>/)?.[1]?.trim();
          const hay = `${title} ${summary}`;
          return {
            id: `arxiv-${createHash("sha256").update(title).digest("hex").slice(0, 12)}`,
            title: `Prototype idea from: ${title.slice(0, 80)}`,
            description: wrapUntrustedContent("arxiv", summary.slice(0, 600)),
            sourceUrl: isHttpsUrl(httpsId) ? httpsId : "https://arxiv.org/",
            category: inferCategory(hay),
            tags: [...inferTags(hay), "arxiv"],
            discoveredAt: published ?? new Date().toISOString(),
            popularity: 45,
            suggestedDifficulty: "advanced" as const,
            learningObjectives: [
              "Summarize the paper's core idea in 5 bullets",
              "Prototype a tiny related local demo",
              "List one limitation you observed while building",
            ],
            source: "arxiv",
            excerpt: summary.slice(0, 1500),
          } satisfies DiscoveredTopic;
        });
      }),
    );
    return batches.flat();
  }
}

/** Dev.to articles API — practical tutorials. */
export class DevToSource implements TopicSource {
  id = "devto";

  async fetchTopics(): Promise<DiscoveredTopic[]> {
    const tags = ["ai", "docker", "typescript", "python", "mcp"];
    const batches = await Promise.all(
      tags.map(async (tag) => {
        const res = await fetch(`https://dev.to/api/articles?tag=${tag}&top=7&per_page=5`);
        if (!res.ok) return [] as DiscoveredTopic[];
        const data = (await res.json()) as Array<{
          id: number;
          title: string;
          description?: string;
          url: string;
          positive_reactions_count?: number;
          published_at?: string;
          tag_list?: string[];
        }>;
        return data
          .filter((a) => a.url && isHttpsUrl(a.url))
          .map((a) => {
            const hay = `${a.title} ${a.description ?? ""} ${(a.tag_list ?? []).join(" ")}`;
            return {
              id: `devto-${a.id}`,
              title: a.title,
              description: wrapUntrustedContent("devto", a.description ?? a.title),
              sourceUrl: a.url,
              category: inferCategory(hay),
              tags: [...inferTags(hay), ...(a.tag_list ?? []).slice(0, 3), "devto"],
              discoveredAt: a.published_at ?? new Date().toISOString(),
              popularity: Math.min(100, Math.round((a.positive_reactions_count ?? 0) / 2)),
              suggestedDifficulty: inferDifficulty(hay),
              learningObjectives: defaultObjectives(a.title),
              source: "devto",
              excerpt: a.description,
            } satisfies DiscoveredTopic;
          });
      }),
    );
    return batches.flat();
  }
}

export function defaultSources(opts?: { githubToken?: string }): TopicSource[] {
  return [
    new HackerNewsSource(),
    new GitHubTrendingSource(opts?.githubToken ?? process.env.GITHUB_TOKEN),
    new ArxivSource(),
    new DevToSource(),
  ];
}
