#!/usr/bin/env node
/**
 * Server-side discovery job.
 * - Public APIs always (HN, GitHub, arXiv, Dev.to)
 * - Firecrawl when FIRECRAWL_API_KEY is set (never commit the key)
 *
 * Usage:
 *   pnpm discover
 *   FIRECRAWL_API_KEY=fc-... pnpm discover
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const coreEntry = path.join(root, "packages/core/dist/discovery/pipeline.js");

if (!existsSync(coreEntry)) {
  console.error("Build @devly/core first: npx tsc -p packages/core/tsconfig.json");
  process.exit(1);
}

const { runDiscoveryPipeline } = await import(pathToFileURL(coreEntry).href);

function loadSeed() {
  const indexPath = path.join(root, "content/topics/index.json");
  const raw = JSON.parse(readFileSync(indexPath, "utf8"));
  return {
    titles: raw.map((t) => t.title),
    tags: raw.flatMap((t) => t.tags ?? []),
  };
}

const seed = loadSeed();
console.log(`Seed catalog: ${seed.titles.length} topics`);
console.log(
  process.env.FIRECRAWL_API_KEY
    ? "Firecrawl: enabled (API key present)"
    : "Firecrawl: disabled (set FIRECRAWL_API_KEY for scraped enrichment)",
);

const { feed, candidates } = await runDiscoveryPipeline({
  seedTitles: seed.titles,
  seedTags: seed.tags,
  limit: 12,
  useFirecrawlEnv: true,
  githubToken: process.env.GITHUB_TOKEN,
});

const outDir = path.join(root, "content/daily");
mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "daily.json");
writeFileSync(outFile, JSON.stringify(feed, null, 2) + "\n");

const report = {
  generatedAt: feed.generatedAt,
  sourcesUsed: feed.sourcesUsed,
  firecrawlUsed: feed.firecrawlUsed,
  candidates: candidates.length,
  accepted: feed.topics.length,
  avgTotalScore: feed.quality.avgTotalScore,
  notes: feed.quality.notes,
  topics: feed.topics.map((t) => ({
    title: t.title,
    source: t.source,
    category: t.category,
    difficulty: t.difficulty,
    sourceUrl: t.sourceUrl,
    scores: t.scores,
  })),
};
const reportFile = path.join(outDir, "quality-report.json");
writeFileSync(reportFile, JSON.stringify(report, null, 2) + "\n");

console.log("\n=== Discovery quality ===");
console.log(`Candidates: ${candidates.length} → accepted: ${feed.topics.length}`);
console.log(`Avg score: ${feed.quality.avgTotalScore}`);
console.log(`Sources: ${feed.sourcesUsed.join(", ") || "(none)"}`);
for (const n of feed.quality.notes) console.log(`• ${n}`);
console.log("\nAccepted topics:");
for (const t of feed.topics) {
  console.log(
    `  [${t.scores.total}] u=${t.scores.uniqueness} learn=${t.scores.learnability} act=${t.scores.actionability} | ${t.source} | ${t.title}`,
  );
  console.log(`       ${t.sourceUrl}`);
}
console.log(`\nWrote ${outFile}`);
console.log(`Wrote ${reportFile}`);
