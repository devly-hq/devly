# Development

1. Install Node 20+, pnpm 11+
2. `pnpm install`
3. If esbuild postinstall was skipped: run its `install.js`
4. Build packages with `tsc`, webview with `vite`, extension with `esbuild.mjs`
5. Launch **Run Devly Extension** from `.vscode/launch.json`
6. Open the Shade activity bar icon

## Useful commands

- `npx vitest run` — unit + integration tests
- `cd apps/extension && npx vsce package --no-dependencies -o ../../devly.vsix`

## Content

Add a topic by appending an object to `content/topics/index.json`. No extension code change required if the schema validates.

## Daily discovery (real data)

Seed topics in `content/topics/` are the easy curated path. Live picks come from public APIs (and optional Firecrawl on the server):

```bash
cp .env.example .env   # add FIRECRAWL_API_KEY if you have one
pnpm discover          # writes content/daily/daily.json + quality-report.json
```

- Extension setting `devly.enableDiscoverySources` (default **on**) fetches live HN/GitHub/arXiv/Dev.to.
- Optional `devly.dailyFeedUrl` points at a published `daily.json` from your CI (Firecrawl-enriched).
- Store `FIRECRAWL_API_KEY` only in `.env` / GitHub Actions secrets — never in the VSIX.
