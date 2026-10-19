# Devly

**A home for curious developers.**

Devly is an open-source VS Code / Cursor extension. Meet **Shade**, a mysterious shadow companion who helps you discover a topic, generate a working project with your existing coding agent, run it locally (with your approval), verify it independently, and learn how it works.

> Pick a topic. Build something real. Learn it in 10 minutes.

Ten minutes is a target for appropriately scoped lessons — not a guarantee for every technology.

## Features

- Daily learning picks from **live discovery** (HN / GitHub / arXiv / Dev.to) plus optional Firecrawl-enriched `daily.json` from your CI
- Curated seed catalog (40+ easy labs) as the offline / beginner backup
- Multi-parameter ranking: uniqueness, learnability, actionability, freshness, clarity, category fit
- Custom topics (“Teach me how Kafka works”)
- Coding agent adapters: Claude Code, Codex, Cursor CLI, BYOK, Ollama, VS Code LM, Manual handoff, Fake (tests)
- Workspace modes: current window (`.devly/labs`), new window (`~/DevlyLabs`), temporary
- Execution plan approval, denylist, Docker Compose labels, owned cleanup
- Independent verification + repair loop (max 3)
- Interactive lesson panel + Ask Shade
- Shade mascot with themes, outfits, and personalities

## Prerequisites

- Node.js 20+
- pnpm 11+
- VS Code 1.96+ or Cursor
- Optional: Docker, Claude Code CLI, Codex CLI, Cursor Agent CLI, Ollama

## Develop

```bash
cd devly
pnpm install
# If esbuild binaries were skipped by pnpm:
node node_modules/.pnpm/esbuild@*/node_modules/esbuild/install.js

# Build packages + webview + extension
node node_modules/typescript/bin/tsc -p packages/protocol/tsconfig.json
node node_modules/typescript/bin/tsc -p packages/core/tsconfig.json
node node_modules/typescript/bin/tsc -p packages/mascot/tsconfig.json
node node_modules/typescript/bin/tsc -p packages/execution/tsconfig.json
node node_modules/typescript/bin/tsc -p packages/agents/tsconfig.json
cd apps/webview && npx vite build && cd ../extension && node esbuild.mjs
```

Then open this repo in VS Code/Cursor and run the **Run Devly Extension** launch configuration (F5).

## Daily discovery

```bash
cp .env.example .env          # optional: FIRECRAWL_API_KEY=fc-...
pnpm discover                 # writes content/daily/daily.json
```

Put `FIRECRAWL_API_KEY` in GitHub Actions secrets for the `Discover daily topics` workflow. Never ship that key in the VSIX.

## Test

```bash
npx vitest run
```

## Package

```bash
cd apps/extension
npx vsce package --no-dependencies -o ../../devly.vsix
```

Install locally:

```bash
code --install-extension ../../devly.vsix
# or in Cursor: Extensions → … → Install from VSIX
```

## Security

Devly never silently executes arbitrary downloaded scripts. Labs require an approved execution plan, run inside a dedicated directory, and avoid mounting host credentials into containers. See [docs/security.md](docs/security.md).

## Privacy

- No account required for the core experience
- Preferences stored in VS Code `globalState`
- API keys stored in `SecretStorage`
- Telemetry is off by default; we do not upload your private source code

## License

MIT — see [LICENSE](LICENSE).
