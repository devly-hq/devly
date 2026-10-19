import { createHash } from "node:crypto";
import { isHttpsUrl, wrapUntrustedContent } from "../security/redact.js";
import type { DiscoveredTopic, TopicSource } from "./types.js";

export interface FirecrawlOptions {
  apiKey: string;
  /** Override API base (tests). */
  baseUrl?: string;
  queries?: string[];
  limitPerQuery?: number;
}

const DEFAULT_QUERIES = [
  "MCP server tutorial python hands-on",
  "build RAG pipeline locally 2026",
  "LangGraph agent tutorial beginner project",
  "Docker compose observability tutorial",
  "TypeScript generics practical guide",
];

function slugId(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 12);
}

function inferCategory(text: string): string {
  const t = text.toLowerCase();
  if (/\b(rag|llm|agent|mcp|embedding|langchain|langgraph)\b/.test(t)) return "ai-engineering";
  if (/\b(docker|kubernetes|terraform|ci)\b/.test(t)) return "devops";
  if (/\b(postgres|redis|kafka|vector)\b/.test(t)) return "databases";
  if (/\b(oauth|jwt|auth|security)\b/.test(t)) return "security";
  if (/\b(typescript|python|rust|go)\b/.test(t)) return "languages";
  return "open-source";
}

function inferDifficulty(text: string): DiscoveredTopic["suggestedDifficulty"] {
  const t = text.toLowerCase();
  if (/\b(intro|beginner|basics|getting started)\b/.test(t)) return "beginner";
  if (/\b(advanced|production|distributed)\b/.test(t)) return "advanced";
  return "intermediate";
}

interface FirecrawlWebHit {
  url?: string;
  title?: string;
  description?: string;
  markdown?: string;
}

/**
 * Firecrawl /v2/search — server-side only.
 * Requires FIRECRAWL_API_KEY. Never ship this key in the extension.
 */
export class FirecrawlSearchSource implements TopicSource {
  id = "firecrawl";

  constructor(private opts: FirecrawlOptions) {}

  async fetchTopics(): Promise<DiscoveredTopic[]> {
    const base = this.opts.baseUrl ?? "https://api.firecrawl.dev";
    const queries = this.opts.queries ?? DEFAULT_QUERIES;
    const limit = this.opts.limitPerQuery ?? 4;
    const out: DiscoveredTopic[] = [];

    for (const query of queries) {
      const res = await fetch(`${base}/v2/search`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.opts.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          limit,
          sources: ["web"],
          scrapeOptions: {
            formats: ["markdown"],
            onlyMainContent: true,
          },
        }),
      });

      if (res.status === 401 || res.status === 403) {
        throw new Error(`Firecrawl auth failed (${res.status}). Check FIRECRAWL_API_KEY.`);
      }
      if (res.status === 429) {
        throw new Error("Firecrawl rate limited");
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Firecrawl HTTP ${res.status}: ${body.slice(0, 200)}`);
      }

      const json = (await res.json()) as {
        success?: boolean;
        data?: { web?: FirecrawlWebHit[] } | FirecrawlWebHit[];
      };

      const hits: FirecrawlWebHit[] = Array.isArray(json.data)
        ? json.data
        : (json.data?.web ?? []);

      for (const hit of hits) {
        if (!hit.url || !hit.title || !isHttpsUrl(hit.url)) continue;
        const excerpt = (hit.markdown ?? hit.description ?? "").slice(0, 2000);
        const hay = `${hit.title} ${hit.description ?? ""} ${excerpt}`;
        out.push({
          id: `fc-${slugId(hit.url)}`,
          title: hit.title.trim(),
          description: wrapUntrustedContent(
            "firecrawl",
            (hit.description ?? (excerpt.slice(0, 400) || hit.title)).trim(),
          ),
          sourceUrl: hit.url,
          category: inferCategory(hay),
          tags: ["firecrawl"],
          discoveredAt: new Date().toISOString(),
          popularity: 55,
          suggestedDifficulty: inferDifficulty(hay),
          learningObjectives: [
            `Explain the core idea in: ${hit.title.slice(0, 50)}`,
            "Reproduce a minimal local version",
            "Add one automated check for the happy path",
          ],
          source: "firecrawl",
          excerpt,
        });
      }
    }

    return out;
  }
}

export function createFirecrawlSourceFromEnv(): FirecrawlSearchSource | undefined {
  const key = process.env.FIRECRAWL_API_KEY?.trim();
  if (!key) return undefined;
  return new FirecrawlSearchSource({ apiKey: key });
}

export interface WebSearchHit {
  title: string;
  description: string;
  url: string;
}

/** One Firecrawl /v2/search call. Returns [] when the key or query is empty. */
export async function firecrawlSearch(apiKey: string, query: string, limit = 5): Promise<WebSearchHit[]> {
  const key = apiKey.trim();
  const q = query.trim();
  if (!key || !q) return [];
  const res = await fetch("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: q,
      limit,
      sources: ["web"],
    }),
  });
  if (!res.ok) return [];
  const json = (await res.json()) as {
    data?: { web?: FirecrawlWebHit[] } | FirecrawlWebHit[];
  };
  const hits: FirecrawlWebHit[] = Array.isArray(json.data) ? json.data : (json.data?.web ?? []);
  return hits
    .filter((hit) => hit.url && hit.title && isHttpsUrl(hit.url))
    .map((hit) => ({
      title: hit.title!.trim(),
      description: wrapUntrustedContent(
        "firecrawl",
        (hit.description ?? hit.title ?? "").trim(),
      ).slice(0, 400),
      url: hit.url!,
    }));
}
