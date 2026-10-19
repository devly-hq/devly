# Security

## Threat model (summary)

| Threat | Mitigation |
| --- | --- |
| Malicious generated commands | Approval gate + denylist (`sudo`, `curl\|sh`, path escape) |
| Prompt injection from HN/GitHub/Firecrawl | `wrapUntrustedContent`, HTTPS-only URLs; Firecrawl key only on server/CI (never in VSIX) |
| Firecrawl API key leak | `.env` / GitHub `FIRECRAWL_API_KEY` secret only; extension uses public APIs or published `daily.json` |
| Untrusted repos (Try Live) | Explicit modal confirm; HTTPS github.com clone only; lab-root containment; denylist; prefer Compose/Docker; Stop/cleanup |
| Docker bootstrap (Try Live) | May run `brew`/`winget`/`get.docker.com` + start Desktop when repo needs Docker; user already confirmed Clone & Run; OS may still prompt for password |
| Supply chain | Pin tips in prompts; `pnpm audit` in CI |
| Secret exposure | `SecretStorage`, `redactSecrets` in logs |
| Path traversal | `isDeniedCommand` rejects a cwd or write path outside the lab |
| Unsafe shell | `spawn` with argv arrays, `shell: false` |
| Docker privilege | No docker.sock mount, no home/SSH mounts, labeled owned resources, cleanup |
| Destructive cleanup | Only delete dirs with `.devly/lab.json`; only containers labeled for the lab |
| Workspace trust | Refuse execution when untrusted |

## Residual risks

- Docker is isolation, not a perfect sandbox.
- Agent CLIs may still attempt actions outside prompts; Devly verifies paths afterward where practical.
- BYOK calls leave the machine — user-provided keys only.

Do not disable these controls to make tests pass.
