import type { CodingAgent } from "./types.js";
import { ClaudeCodeAgent } from "./claude/index.js";
import { CodexAgent } from "./codex/index.js";
import { CursorAgent } from "./cursor/index.js";
import { FakeAgent } from "./fake/index.js";
import { ManualHandoffAgent } from "./manual/index.js";
import { OllamaAgent } from "./ollama/index.js";
import { ByokAgent, type ByokConfig } from "./byok/index.js";
import { VsCodeLmAgent } from "./vscode/index.js";

export interface AgentRegistryOptions {
  getByokConfig?: () => Promise<ByokConfig | undefined>;
  vscodeLmInvoke?: (prompt: string) => Promise<string>;
  vscodeLmAvailable?: () => Promise<boolean>;
  includeFake?: boolean;
}

export function createAgentRegistry(options: AgentRegistryOptions = {}): CodingAgent[] {
  const agents: CodingAgent[] = [
    new ClaudeCodeAgent(),
    new CodexAgent(),
    new CursorAgent(),
    new ByokAgent(options.getByokConfig ?? (async () => undefined)),
    new OllamaAgent(),
    new VsCodeLmAgent(options.vscodeLmInvoke, options.vscodeLmAvailable),
    new ManualHandoffAgent(),
  ];
  if (options.includeFake !== false) {
    agents.push(new FakeAgent());
  }
  return agents;
}

export async function detectAllAgents(agents: CodingAgent[]) {
  return Promise.all(
    agents.map(async (agent) => {
      const availability = await agent.detect();
      return {
        id: agent.id,
        displayName: agent.displayName,
        installed: availability.installed,
        authenticated: availability.authenticated,
        version: availability.version,
        capabilities: agent.capabilities,
      };
    }),
  );
}
