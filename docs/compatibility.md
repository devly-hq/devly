# Compatibility matrix

| Editor | Extension APIs | Agent reuse | Notes |
| --- | --- | --- | --- |
| VS Code | Primary target | Copilot via LM API (explain), Claude/Codex CLIs | Fully supported |
| Cursor | Mostly compatible | Cursor CLI when installed; Claude/Codex CLIs | Test separately; LM API may differ |
| Antigravity | Unknown / separate marketplace | Manual handoff adapter | Publishing to VS Marketplace does **not** publish to Antigravity |

Open VSX publishing is prepared via `ovsx` docs in `docs/publishing.md`.
