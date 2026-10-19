import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";

const KEYS = ["FIRECRAWL_API_KEY", "GITHUB_TOKEN"] as const;

/** Load API keys into process.env. Never log values. .env wins over empty settings; an explicit setting overrides the file. */
export function loadDevlyEnv(extensionPath: string): void {
  const fromFile = readEnvFiles(envCandidates(extensionPath));
  const cfg = vscode.workspace.getConfiguration("devly");
  const fromSettings: Record<(typeof KEYS)[number], string> = {
    FIRECRAWL_API_KEY: (cfg.get<string>("firecrawlApiKey") ?? "").trim(),
    GITHUB_TOKEN: (cfg.get<string>("githubToken") ?? "").trim(),
  };
  for (const key of KEYS) {
    const value = fromSettings[key] || fromFile[key] || process.env[key] || "";
    if (value) process.env[key] = value;
  }
}

function envCandidates(extensionPath: string): string[] {
  const out: string[] = [];
  let dir = extensionPath;
  for (let i = 0; i < 6; i++) {
    out.push(path.join(dir, ".env"));
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    out.push(path.join(folder.uri.fsPath, ".env"));
  }
  return out;
}

function readEnvFiles(files: string[]): Partial<Record<(typeof KEYS)[number], string>> {
  const parsed: Partial<Record<(typeof KEYS)[number], string>> = {};
  for (const file of files) {
    let text: string;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const eq = line.indexOf("=");
      const key = line.slice(0, eq).trim();
      if (!KEYS.includes(key as (typeof KEYS)[number])) continue;
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (value && !parsed[key as (typeof KEYS)[number]]) {
        parsed[key as (typeof KEYS)[number]] = value;
      }
    }
  }
  return parsed;
}
