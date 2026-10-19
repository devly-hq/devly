# Agent integrations

| Agent | Detection | Execution | Notes |
| --- | --- | --- | --- |
| Claude Code | `which claude` | `claude -p … --output-format text` | First-class |
| Codex | `which codex` | `codex exec --json --sandbox workspace-write -C <lab>` | First-class |
| Cursor | `cursor-agent` / `agent` | `cursor-agent -p …` | Built; may be missing |
| BYOK | SecretStorage key | OpenAI/Anthropic HTTP | Explanations + light generation |
| Ollama | `localhost:11434` | `/api/generate` | Explanations |
| VS Code LM | Injected bridge | Explain only | No file edits |
| Manual | Always | Writes `PROMPT.md` | Antigravity fallback |
| Fake | Always | Writes Docker fixture | CI / demos |

Never extract credentials from other apps. Never claim unsupported Antigravity APIs work.
