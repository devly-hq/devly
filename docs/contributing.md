# Contributing

1. Fork and branch
2. Add tests for core logic
3. Run `npx vitest run`
4. Open a PR

## Extension points

- Topic source: implement `TopicSource` in `packages/core/src/discovery`
- Agent adapter: implement `CodingAgent` in `packages/agents`
- Mascot theme/accessory: register in `packages/mascot/src/themes/registry.ts`
- Prompt template: edit `packages/core/src/prompts/templates.ts`
