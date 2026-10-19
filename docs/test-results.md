# Test results

## Automated (local)

- Unit + e2e headless: **33+ passed** (`npx vitest run`)
- Coverage areas: recommender, state machine, schemas, denylist, verification, redaction, prompts, mascot, fake agent, 12 scenario stubs

## Integration

- `tests/integration/workspace-fake-lab.test.ts` — FakeAgent generates Docker lab, `uv` installs deps, pytest passes — **PASS**

## Manual agent runs

| Agent | Demo | Result |
| --- | --- | --- |
| Fake | Docker fundamentals | Automated pass (HTTP verified) |
| Claude Code | Docker fundamentals | Pending manual verification on developer machine |
| Codex | Docker fundamentals | Pending manual verification on developer machine |

Do not fabricate results. Update this file after real CLI runs.
