#!/usr/bin/env node
/**
 * Live smoke: fetch trending, then clone+run a known-simple repo (or first compose-ish hit).
 * Usage: node scripts/try-live-smoke.mjs
 */
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const coreTrend = path.join(root, "packages/core/dist/discovery/trending-repos.js");
const execClone = path.join(root, "packages/execution/dist/trending/clone-run.js");

if (!existsSync(coreTrend) || !existsSync(execClone)) {
  console.error("Build packages first: npx tsc -p packages/core && npx tsc -p packages/execution");
  process.exit(1);
}

const { fetchTrendingRepos, cleanRepoDescription } = await import(pathToFileURL(coreTrend).href);
const { cloneAndRunRepo } = await import(pathToFileURL(execClone).href);

console.log("Fetching trending repos…");
const repos = await fetchTrendingRepos({ limit: 12 });
console.log(`Got ${repos.length} repos:`);
for (const r of repos.slice(0, 8)) {
  console.log(
    `  [${r.popularity}] ${r.fullName} ★${r.stars} hints=${r.runHints.join(",")} — ${cleanRepoDescription(r.description).slice(0, 60)}`,
  );
}

// Prefer a tiny known-good target for reliable smoke when available in list,
// else first repo with compose/dockerfile/node hint, else demo nginx compose via known sample.
const preferred =
  repos.find((r) => r.fullName.toLowerCase().includes("dockersamples")) ||
  repos.find((r) => r.runHints.includes("compose") || r.runHints.includes("dockerfile")) ||
  repos.find((r) => r.runHints.includes("node")) ||
  repos[0];

if (!preferred) {
  console.error("No repos found — network/API issue");
  process.exit(1);
}

// Tiny public Dockerfile sample (stable for CI/smoke)
const target = {
  fullName: "crccheck/docker-hello-world",
  cloneUrl: "https://github.com/crccheck/docker-hello-world.git",
  htmlUrl: "https://github.com/crccheck/docker-hello-world",
};

console.log(`\nTry Live smoke on ${target.fullName} (deterministic sample)…`);
console.log(`(Also discovered live lead: ${preferred.fullName})`);
console.log("Docker bootstrap enabled — will install/start Docker if needed.\n");

const result = await cloneAndRunRepo({
  ...target,
  bootstrapDocker: true,
  onLog: (c) => process.stdout.write(c),
  onPhase: (p, d) => console.log(`[phase:${p}] ${d}`),
});

console.log("\n=== RESULT ===");
console.log(result.message);
console.log(`dir=${result.directory}`);
console.log(`kind=${result.plan.kind} live=${result.live} demo=${result.demoUrl ?? "-"}`);
process.exit(result.live || result.plan.kind !== "unsupported" ? 0 : 2);
